
/* =========================================================
   CINEVAULT — MAIN APPLICATION
   CLOUDFLARE WORKERS + D1 DATABASE
   DYNAMIC SETTINGS • HERO • COLLECTIONS
   MOVIES • SEARCH • FILTER • SORT
   WATCHLIST • PAGINATION • RESPONSIVE NAVIGATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  /* =======================================================
     DOM HELPERS
  ======================================================= */

  const $ = id => document.getElementById(id);

  const movieGrid = $("movieGrid");
  const collectionGrid = $("collectionGrid");

  const watchlistGrid = $("watchlistGrid");
  const watchlistEmpty = $("watchlistEmpty");
  const watchlistCount = $("watchlistCount");

  const searchInput = $("movieSearch");
  const clearSearch = $("clearSearch");
  const sortSelect = $("sortMovies");

  const genreFilter = $("genreFilter");
  const languageFilter = $("languageFilter");
  const yearFilter = $("yearFilter");
  const ratingFilter = $("ratingFilter");

  const filterPanel = $("filterPanel");
  const filterToggle = $("filterToggle");

  const resultsCount = $("resultsCount");
  const resultsLabel = $("resultsLabel");
  const emptyState = $("emptyState");
  const pagination = $("pagination");

  const menuToggle = $("menuToggle");
  const mainNav = $("mainNav");

  const PAGE_SIZE = 40;

  /* =======================================================
     APPLICATION STATE
  ======================================================= */

  let movies = [];
  let collections = [];

  let currentPage = 1;
  let currentMovies = [];

  let settings = {};

  let watchlist = loadWatchlist();

  /* =======================================================
     SAFE TEXT / HTML
  ======================================================= */

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function textValue(value, fallback = "") {
    const result = String(value ?? "").trim();
    return result || fallback;
  }

  /* =======================================================
     SAFE URL VALIDATION
  ======================================================= */

  function safeLink(value, fallback = "") {
    const link = String(value ?? "").trim();

    if (!link || /[\u0000-\u001F\u007F]/.test(link)) {
      return fallback;
    }

    // Allow page anchors.
    if (link.startsWith("#")) {
      return link;
    }

    // Allow root-relative paths, but reject protocol-relative URLs.
    if (link.startsWith("/") && !link.startsWith("//")) {
      return link;
    }

    // Allow normal relative paths such as about.html.
    if (
      link.startsWith("./") ||
      link.startsWith("../") ||
      /^[a-zA-Z0-9._~%-]+(?:\/[a-zA-Z0-9._~%-]*)*(?:[?#].*)?$/.test(link)
    ) {
      try {
        const parsed = new URL(link, window.location.href);

        if (parsed.origin === window.location.origin) {
          return link;
        }
      } catch {
        return fallback;
      }
    }

    // Allow only HTTP and HTTPS absolute URLs.
    try {
      const parsed = new URL(link);

      if (
        parsed.protocol === "https:" ||
        parsed.protocol === "http:"
      ) {
        return parsed.href;
      }
    } catch {
      return fallback;
    }

    return fallback;
  }

  function safeImageURL(value) {
    const image = String(value ?? "").trim();

    if (!image || /[\u0000-\u001F\u007F]/.test(image)) {
      return "";
    }

    try {
      const parsed = new URL(image, window.location.origin);

      if (
        parsed.protocol === "https:" ||
        parsed.protocol === "http:"
      ) {
        return parsed.href;
      }
    } catch {
      return "";
    }

    return "";
  }

  /* =======================================================
     API HELPER
  ======================================================= */

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        ...(options.headers || {})
      },
      cache: "no-store",
      credentials: "same-origin",
      ...options
    });

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error("Server returned an invalid response.");
    }

    if (!response.ok || data?.success !== true) {
      throw new Error(
        data?.message || `Request failed (${response.status})`
      );
    }

    return data;
  }

  /* =======================================================
     WATCHLIST STORAGE
  ======================================================= */

  function loadWatchlist() {
    try {
      const saved = JSON.parse(
        localStorage.getItem("cinevault_watchlist") || "[]"
      );

      if (!Array.isArray(saved)) return [];

      return [...new Set(
        saved
          .map(Number)
          .filter(id => Number.isSafeInteger(id) && id > 0)
      )];
    } catch {
      return [];
    }
  }

  function saveWatchlist() {
    try {
      localStorage.setItem(
        "cinevault_watchlist",
        JSON.stringify(watchlist)
      );
    } catch (error) {
      console.warn("Watchlist storage unavailable:", error);
    }
  }

  function isInWatchlist(id) {
    return watchlist.includes(Number(id));
  }

  /* =======================================================
     NORMALIZE MOVIE DATA
  ======================================================= */

  function normalizeMovie(movie) {
    const item = movie || {};

    return {
      ...item,

      id: Number(item.id),

      title: textValue(item.title, "Untitled"),
      slug: textValue(item.slug),

      description: textValue(item.description),

      poster: textValue(item.poster),
      backdrop: textValue(item.backdrop),

      year: Number(item.year) || "",
      genre: textValue(item.genre),
      language: textValue(item.language),
      country: textValue(item.country),

      rating: Number(item.rating) || 0,

      duration: textValue(item.duration),
      director: textValue(item.director),
      quality: textValue(item.quality),

      watchUrl: textValue(
        item.watchUrl || item.watch_url
      ),

      downloadUrl: textValue(
        item.downloadUrl || item.download_url
      ),

      downloadUrl2: textValue(
        item.downloadUrl2 || item.download_url_2
      ),

      adUrl: textValue(
        item.adUrl || item.ad_url
      ),

      adCount: Math.max(
        4,
        Number(item.adCount || item.ad_count) || 4
      )
    };
  }

  /* =======================================================
     NORMALIZE COLLECTION DATA
  ======================================================= */

  function normalizeCollection(collection) {
    const item = collection || {};

    return {
      ...item,

      id: Number(item.id),

      name: textValue(item.name, "Collection"),
      description: textValue(item.description),

      image: textValue(item.image),
      icon: textValue(item.icon, "✧"),

      genre: textValue(
        item.genre || item.name
      ),

      linkUrl: textValue(
        item.linkUrl || item.link_url
      ),

      sortOrder: Number(
        item.sortOrder ?? item.sort_order ?? 0
      )
    };
  }

  /* =======================================================
     LINKED TEXT HELPERS
  ======================================================= */

  function setLinkedText(element, value, url) {
    if (!element) return;

    const content = String(value ?? "");
    const link = safeLink(url);

    element.replaceChildren();

    if (!link) {
      element.textContent = content;
      return;
    }

    const anchor = document.createElement("a");

    anchor.href = link;
    anchor.textContent = content;
    anchor.className = "content-link";

    element.appendChild(anchor);
  }

  function setLinkedNodes(element, nodes, url) {
    if (!element) return;

    const link = safeLink(url);

    element.replaceChildren();

    if (!link) {
      nodes.forEach(node => element.appendChild(node));
      return;
    }

    const anchor = document.createElement("a");

    anchor.href = link;
    anchor.className = "content-link";

    nodes.forEach(node => anchor.appendChild(node));

    element.appendChild(anchor);
  }

  /* =======================================================
     DYNAMIC LOGO
  ======================================================= */

  function updateLogo(data) {
    const siteName = textValue(data.siteName, "CINEVAULT");
    const logoText = textValue(data.logoText, "C");

    [
      $("headerLogoIcon"),
      $("footerLogoIcon")
    ].forEach(element => {
      if (element) element.textContent = logoText;
    });

    [
      $("headerLogoText"),
      $("footerLogoText")
    ].forEach(element => {
      if (!element) return;

      const splitAt = Math.max(
        1,
        Math.ceil(siteName.length / 2)
      );

      const firstPart = siteName.slice(0, splitAt);
      const secondPart = siteName.slice(splitAt);

      element.replaceChildren();

      element.appendChild(
        document.createTextNode(firstPart)
      );

      if (secondPart) {
        const span = document.createElement("span");

        span.className = "gold-text";
        span.textContent = secondPart;

        element.appendChild(span);
      }
    });

    document.title =
      `${siteName} — Discover Movies & Entertainment`;
  }

  /* =======================================================
     DYNAMIC HERO
  ======================================================= */

  function updateHero(data) {
    setLinkedText(
      $("heroEyebrow"),
      data.heroEyebrow || "YOUR WORLD OF CINEMA",
      data.heroEyebrowUrl
    );

    const heroTitle = $("heroTitle");

    if (heroTitle) {
      const main = document.createElement("span");
      main.textContent =
        data.heroTitle || "Discover Stories.";

      const highlight = document.createElement("span");
      highlight.className = "gold-text";
      highlight.textContent =
        data.heroHighlight || "Experience Cinema.";

      const nodes = [];

      const mainLink = safeLink(data.heroTitleUrl);
      const highlightLink = safeLink(data.heroHighlightUrl);

      if (mainLink) {
        const anchor = document.createElement("a");
        anchor.href = mainLink;
        anchor.className = "content-link";
        anchor.appendChild(main);
        nodes.push(anchor);
      } else {
        nodes.push(main);
      }

      nodes.push(document.createElement("br"));

      if (highlightLink) {
        const anchor = document.createElement("a");
        anchor.href = highlightLink;
        anchor.className = "content-link";
        anchor.appendChild(highlight);
        nodes.push(anchor);
      } else {
        nodes.push(highlight);
      }

      heroTitle.replaceChildren(...nodes);
    }

    setLinkedText(
      $("heroDescription"),
      data.heroDescription || "",
      data.heroDescriptionUrl
    );

    const button1 = $("heroButton1");
    const button1Text = $("heroButton1Text");

    if (button1) {
      button1.href = safeLink(
        data.heroButton1Url,
        "#movies"
      );
    }

    if (button1Text) {
      button1Text.textContent =
        data.heroButton1Text || "Explore Movies";
    }

    const button2 = $("heroButton2");

    if (button2) {
      button2.textContent =
        data.heroButton2Text || "Browse Collections";

      button2.href = safeLink(
        data.heroButton2Url,
        "#collections"
      );
    }

    const heroImage = safeImageURL(data.heroImage);
    const heroSection = document.querySelector(".hero-section");

    if (heroSection && heroImage) {
      heroSection.style.backgroundImage = [
        "linear-gradient(110deg, rgba(8,10,15,.94) 10%, rgba(17,23,34,.78) 65%, rgba(8,10,15,.88))",
        `url(${JSON.stringify(heroImage)})`
      ].join(", ");

      heroSection.style.backgroundSize = "cover";
      heroSection.style.backgroundPosition = "center";
    }
  }

  /* =======================================================
     DYNAMIC SECTION HEADINGS
  ======================================================= */

  function updateSectionHeadings(data) {
    setLinkedText(
      $("collectionsEyebrow"),
      data.collectionsEyebrow || "EXPLORE BY CATEGORY",
      data.collectionsEyebrowUrl
    );

    const collectionsHeading = $("collectionsHeading");

    if (collectionsHeading) {
      const main = document.createElement("span");
      main.id = "collectionsHeadingText";
      main.textContent = data.collectionsHeading || "Movie";

      const highlight = document.createElement("span");
      highlight.id = "collectionsHeadingHighlight";
      highlight.className = "gold-text";
      highlight.textContent =
        data.collectionsHeadingHighlight || "Collections";

      setLinkedNodes(
        collectionsHeading,
        [main, document.createTextNode(" "), highlight],
        data.collectionsHeadingUrl
      );
    }

    setLinkedText(
      $("collectionsDescription"),
      data.collectionsDescription ||
        "Discover movies from your favourite genres.",
      data.collectionsDescriptionUrl
    );

    setLinkedText(
      $("moviesEyebrow"),
      data.moviesEyebrow || "YOUR NEXT WATCH",
      data.moviesEyebrowUrl
    );

    const moviesHeading = $("moviesHeading");

    if (moviesHeading) {
      const main = document.createElement("span");
      main.id = "moviesHeadingText";
      main.textContent = data.moviesHeading || "Explore";

      const highlight = document.createElement("span");
      highlight.id = "moviesHeadingHighlight";
      highlight.className = "gold-text";
      highlight.textContent =
        data.moviesHeadingHighlight || "Movies";

      setLinkedNodes(
        moviesHeading,
        [main, document.createTextNode(" "), highlight],
        data.moviesHeadingUrl
      );
    }

    setLinkedText(
      $("moviesDescription"),
      data.moviesDescription ||
        "Browse the latest additions and discover your next favourite movie.",
      data.moviesDescriptionUrl
    );
  }

  /* =======================================================
     DYNAMIC ABOUT SECTION
  ======================================================= */

  function updateAbout(data) {
    setLinkedText(
      $("aboutEyebrow"),
      data.aboutEyebrow || "WELCOME TO CINEVAULT",
      data.aboutEyebrowUrl
    );

    const title = $("aboutTitle");

    if (title) {
      const main = document.createElement("span");
      main.textContent =
        data.aboutTitle || "More Than Movies.";

      const highlight = document.createElement("span");
      highlight.className = "gold-text";
      highlight.textContent =
        data.aboutHighlight || "A Cinema Experience.";

      const mainLink = safeLink(data.aboutTitleUrl);
      const highlightLink = safeLink(data.aboutHighlightUrl);

      const nodes = [];

      if (mainLink) {
        const anchor = document.createElement("a");
        anchor.href = mainLink;
        anchor.className = "content-link";
        anchor.appendChild(main);
        nodes.push(anchor);
      } else {
        nodes.push(main);
      }

      nodes.push(document.createElement("br"));

      if (highlightLink) {
        const anchor = document.createElement("a");
        anchor.href = highlightLink;
        anchor.className = "content-link";
        anchor.appendChild(highlight);
        nodes.push(anchor);
      } else {
        nodes.push(highlight);
      }

      title.replaceChildren(...nodes);
    }

    setLinkedText(
      $("aboutDescription"),
      data.aboutDescription || "",
      data.aboutDescriptionUrl
    );

    const aboutButton = $("aboutButton");

    if (aboutButton) {
      aboutButton.href = safeLink(
        data.aboutButtonUrl,
        "#movies"
      );

      const buttonText = $("aboutButtonText");

      if (buttonText) {
        buttonText.textContent =
          data.aboutButtonText || "Discover Movies";
      } else {
        aboutButton.textContent =
          data.aboutButtonText || "Discover Movies";
      }
    }
  }

  /* =======================================================
     DYNAMIC FOOTER
  ======================================================= */

  function updateFooter(data) {
    setLinkedText(
      $("footerDescription"),
      data.footerDescription ||
        "Discover cinema. Explore stories. Build your collection.",
      data.footerDescriptionUrl
    );

    setLinkedText(
      $("footerTagline"),
      data.footerTagline || "Made for movie lovers.",
      data.footerTaglineUrl
    );

    const year = new Date().getFullYear();

    const copyright = $("copyrightText");

    if (copyright) {
      const siteName = textValue(data.siteName, "CINEVAULT");
      const copyrightText = textValue(
        data.copyrightText,
        "All rights reserved."
      );

      const link = safeLink(data.copyrightUrl);

      copyright.replaceChildren();

      copyright.appendChild(
        document.createTextNode(`© ${year} `)
      );

      if (link) {
        const anchor = document.createElement("a");
        anchor.href = link;
        anchor.textContent =
          `${siteName}. ${copyrightText}`;
        copyright.appendChild(anchor);
      } else {
        copyright.appendChild(
          document.createTextNode(
            `${siteName}. ${copyrightText}`
          )
        );
      }
    }

    const currentYear = $("currentYear");

    if (currentYear) {
      currentYear.textContent = year;
    }
  }

  /* =======================================================
     LOAD SETTINGS FROM D1
  ======================================================= */

  async function loadSettings() {
    try {
      const response = await apiRequest("/api/settings");

      if (!response.settings) {
        throw new Error("Website settings not found.");
      }

      settings = response.settings;

      updateLogo(settings);
      updateHero(settings);
      updateSectionHeadings(settings);
      updateAbout(settings);
      updateFooter(settings);

    } catch (error) {
      console.error("CineVault Settings Error:", error);
    }
  }

  /* =======================================================
     FILTER OPTION HELPERS
  ======================================================= */

  function populateSelect(select, values, firstLabel, selectedValue) {
    if (!select) return;

    const uniqueValues = [...new Set(
      values
        .map(value => String(value ?? "").trim())
        .filter(Boolean)
    )];

    const options = [
      `<option value="">${escapeHTML(firstLabel)}</option>`,
      ...uniqueValues.map(value =>
        `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`
      )
    ];

    select.innerHTML = options.join("");

    if (uniqueValues.includes(selectedValue)) {
      select.value = selectedValue;
    }
  }

  function populateFilters() {
    const selectedGenre = genreFilter?.value || "";
    const selectedLanguage = languageFilter?.value || "";
    const selectedYear = yearFilter?.value || "";

    const genres = movies.flatMap(movie =>
      movie.genre.split(",").map(value => value.trim())
    );

    const languages = movies.map(movie => movie.language);
    const years = movies.map(movie => movie.year).filter(Boolean);

    populateSelect(
      genreFilter,
      genres,
      "All Genres",
      selectedGenre
    );

    populateSelect(
      languageFilter,
      languages,
      "All Languages",
      selectedLanguage
    );

    const sortedYears = [...new Set(years)]
      .sort((a, b) => b - a)
      .map(String);

    populateSelect(
      yearFilter,
      sortedYears,
      "All Years",
      selectedYear
    );
  }

  /* =======================================================
     COLLECTION RENDERING
  ======================================================= */

  function renderCollections() {
    if (!collectionGrid) return;

    if (!collections.length) {
      collectionGrid.innerHTML = `
        <p class="loading-message">
          No collections available.
        </p>
      `;
      return;
    }

    collectionGrid.innerHTML = collections.map(collection => {
      const image = safeImageURL(collection.image);
      const link = safeLink(collection.linkUrl);

      const visual = image
        ? `
          <span class="collection-icon">
            <img
              src="${escapeHTML(image)}"
              alt=""
              loading="lazy"
              width="42"
              height="42"
            >
          </span>
        `
        : `
          <span class="collection-icon">
            ${escapeHTML(collection.icon)}
          </span>
        `;

      const tag = link ? "a" : "button";

      const attributes = link
        ? `href="${escapeHTML(link)}"`
        : `type="button" data-genre="${escapeHTML(collection.genre)}"`;

      return `
        <${tag}
          class="collection-card"
          ${attributes}
          data-collection-id="${Number(collection.id)}"
        >
          ${visual}

          <strong>
            ${escapeHTML(collection.name)}
          </strong>

          <span>
            ${escapeHTML(collection.description)}
          </span>
        </${tag}>
      `;
    }).join("");
  }

  /* =======================================================
     LOAD COLLECTIONS FROM D1
  ======================================================= */

  async function loadCollections() {
    if (collectionGrid) {
      collectionGrid.innerHTML = `
        <p class="loading-message">
          Loading collections...
        </p>
      `;
    }

    try {
      const response = await apiRequest("/api/collections");

      if (!Array.isArray(response.collections)) {
        throw new Error("Invalid collections response.");
      }

      collections = response.collections
        .map(normalizeCollection)
        .filter(item => Number.isFinite(item.id))
        .sort((a, b) => a.sortOrder - b.sortOrder);

      renderCollections();

    } catch (error) {
      console.error("CineVault Collections Error:", error);

      if (collectionGrid) {
        collectionGrid.innerHTML = `
          <p class="loading-message">
            Unable to load collections.
          </p>
        `;
      }
    }
  }

  /* =======================================================
     POSTER FALLBACK
  ======================================================= */

  function fallbackPoster(title) {
    const safeTitle = escapeHTML(title).slice(0, 45);

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg"
           width="500" height="750" viewBox="0 0 500 750">
        <rect width="500" height="750" fill="#111722"/>
        <circle cx="250" cy="290" r="110"
                fill="#d6b36a" opacity=".10"/>
        <text x="250" y="340"
              fill="#d6b36a"
              font-size="34"
              font-family="Arial"
              text-anchor="middle">CINEVAULT</text>
        <text x="250" y="415"
              fill="#ffffff"
              font-size="22"
              font-family="Arial"
              text-anchor="middle">${safeTitle}</text>
        <text x="250" y="690"
              fill="#9ba3b1"
              font-size="18"
              font-family="Arial"
              text-anchor="middle">MOVIE POSTER</text>
      </svg>
    `;

    return "data:image/svg+xml;charset=UTF-8," +
      encodeURIComponent(svg);
  }

  function posterURL(movie) {
    const image = safeImageURL(movie.poster);

    if (image && !image.includes("placeholder.jpg")) {
      return image;
    }

    return fallbackPoster(movie.title);
  }

  /* =======================================================
     MOVIE CARD
  ======================================================= */

  function movieCard(movie) {
    const active = isInWatchlist(movie.id);

    return `
      <article
        class="movie-card"
        data-movie-id="${Number(movie.id)}"
        tabindex="0"
        role="link"
        aria-label="View ${escapeHTML(movie.title)}"
      >
        <div class="movie-poster">

          <img
            src="${escapeHTML(posterURL(movie))}"
            alt="${escapeHTML(movie.title)} poster"
            loading="lazy"
            data-poster-fallback="${Number(movie.id)}"
          >

          <span class="movie-rating">
            ★ ${escapeHTML(movie.rating.toFixed(1))}
          </span>

          <button
            type="button"
            class="watchlist-btn ${active ? "active" : ""}"
            data-watchlist-id="${Number(movie.id)}"
            aria-label="${active ? "Remove from watchlist" : "Add to watchlist"}"
            aria-pressed="${active ? "true" : "false"}"
            title="${active ? "Remove from watchlist" : "Add to watchlist"}"
          >
            ${active ? "♥" : "♡"}
          </button>

        </div>

        <div class="movie-info">

          <h3>${escapeHTML(movie.title)}</h3>

          <div class="movie-meta">
            <span>${escapeHTML(movie.year)}</span>
            <span>${escapeHTML(movie.language)}</span>
          </div>

          <span class="movie-genre">
            ${escapeHTML(movie.genre)}
          </span>

        </div>
      </article>
    `;
  }

  /* =======================================================
     MOVIE POSTER ERROR HANDLING
  ======================================================= */

  function handlePosterErrors(container) {
    if (!container) return;

    container.querySelectorAll("img[data-poster-fallback]")
      .forEach(image => {
        image.addEventListener("error", () => {
          const movie = movies.find(
            item => item.id === Number(image.dataset.posterFallback)
          );

          image.onerror = null;

          if (movie) {
            image.src = fallbackPoster(movie.title);
          }
        }, { once: true });
      });
  }

  /* =======================================================
     SEARCH + FILTER + SORT
  ======================================================= */

  function getFilteredMovies() {
    let result = [...movies];

    const search = searchInput?.value.trim().toLowerCase() || "";

    if (search) {
      result = result.filter(movie => {
        const searchable = [
          movie.title,
          movie.genre,
          movie.language,
          movie.country,
          movie.director,
          movie.description,
          movie.year,
          movie.quality
        ].join(" ").toLowerCase();

        return searchable.includes(search);
      });
    }

    if (genreFilter?.value) {
      const selected = genreFilter.value.toLowerCase();

      result = result.filter(movie =>
        movie.genre
          .split(",")
          .some(value => value.trim().toLowerCase() === selected)
      );
    }

    if (languageFilter?.value) {
      result = result.filter(movie =>
        movie.language.toLowerCase() ===
        languageFilter.value.toLowerCase()
      );
    }

    if (yearFilter?.value) {
      result = result.filter(movie =>
        String(movie.year) === yearFilter.value
      );
    }

    if (ratingFilter?.value) {
      result = result.filter(movie =>
        movie.rating >= Number(ratingFilter.value)
      );
    }

    switch (sortSelect?.value) {
      case "newest":
        result.sort((a, b) => b.id - a.id);
        break;

      case "oldest":
        result.sort((a, b) => a.id - b.id);
        break;

      case "rating":
        result.sort((a, b) => b.rating - a.rating);
        break;

      case "az":
        result.sort((a, b) =>
          a.title.localeCompare(b.title)
        );
        break;

      case "za":
        result.sort((a, b) =>
          b.title.localeCompare(a.title)
        );
        break;

      case "year":
        result.sort((a, b) => b.year - a.year);
        break;

      default:
        result.sort((a, b) => b.id - a.id);
    }

    return result;
  }

  /* =======================================================
     PAGINATION
  ======================================================= */

  function renderPagination(totalPages) {
    if (!pagination) return;

    pagination.replaceChildren();

    if (totalPages <= 1) return;

    function addButton(label, page, active = false, disabled = false) {
      const button = document.createElement("button");

      button.type = "button";
      button.textContent = label;
      button.disabled = disabled;

      if (active) {
        button.classList.add("active");
        button.setAttribute("aria-current", "page");
      }

      button.addEventListener("click", () => {
        if (page === currentPage || page < 1 || page > totalPages) {
          return;
        }

        currentPage = page;
        renderMovies();

        $("movies")?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      });

      pagination.appendChild(button);
    }

    addButton("‹", currentPage - 1, false, currentPage === 1);

    const pages = new Set([1, totalPages]);

    for (
      let page = Math.max(1, currentPage - 2);
      page <= Math.min(totalPages, currentPage + 2);
      page++
    ) {
      pages.add(page);
    }

    const sortedPages = [...pages].sort((a, b) => a - b);

    let previous = 0;

    sortedPages.forEach(page => {
      if (previous && page - previous > 1) {
        const dots = document.createElement("span");
        dots.className = "pagination-dots";
        dots.textContent = "…";
        pagination.appendChild(dots);
      }

      addButton(
        String(page),
        page,
        page === currentPage
      );

      previous = page;
    });

    addButton("›", currentPage + 1, false, currentPage === totalPages);
  }

  /* =======================================================
     MAIN MOVIE RENDER
  ======================================================= */

  function renderMovies() {
    if (!movieGrid) return;

    currentMovies = getFilteredMovies();

    const total = currentMovies.length;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    if (currentPage > totalPages) {
      currentPage = Math.max(1, totalPages);
    }

    const start = (currentPage - 1) * PAGE_SIZE;

    const visibleMovies = currentMovies.slice(
      start,
      start + PAGE_SIZE
    );

    movieGrid.innerHTML = visibleMovies
      .map(movieCard)
      .join("");

    handlePosterErrors(movieGrid);

    if (resultsCount) {
      resultsCount.textContent =
        `Showing ${visibleMovies.length} of ${total} movies`;
    }

    if (resultsLabel) {
      resultsLabel.textContent =
        `${PAGE_SIZE} MOVIES PER PAGE`;
    }

    if (emptyState) {
      emptyState.hidden = total !== 0;
    }

    renderPagination(totalPages);

    if (clearSearch) {
      clearSearch.hidden = !searchInput?.value;
    }
  }

  /* =======================================================
     WATCHLIST RENDER
  ======================================================= */

  function renderWatchlist() {
    const savedMovies = movies.filter(movie =>
      isInWatchlist(movie.id)
    );

    if (watchlistGrid) {
      watchlistGrid.innerHTML = savedMovies
        .map(movieCard)
        .join("");

      handlePosterErrors(watchlistGrid);
    }

    if (watchlistEmpty) {
      watchlistEmpty.hidden = savedMovies.length > 0;
    }

    if (watchlistCount) {
      watchlistCount.textContent = savedMovies.length;
    }
  }

  /* =======================================================
     WATCHLIST TOGGLE
  ======================================================= */

  function toggleWatchlist(id) {
    const movieId = Number(id);

    if (!Number.isSafeInteger(movieId) || movieId <= 0) {
      return;
    }

    if (isInWatchlist(movieId)) {
      watchlist = watchlist.filter(item => item !== movieId);
    } else {
      watchlist.push(movieId);
    }

    saveWatchlist();

    renderMovies();
    renderWatchlist();
  }

  /* =======================================================
     LOAD MOVIES FROM D1
  ======================================================= */

  async function loadMovies() {
    if (movieGrid) {
      movieGrid.innerHTML = `
        <p class="loading-message">
          Loading movies...
        </p>
      `;
    }

    try {
      // D1 is the only movie source.
      const response = await apiRequest("/api/movies");

      if (!Array.isArray(response.movies)) {
        throw new Error("Invalid movie database response.");
      }

      movies = response.movies
        .map(normalizeMovie)
        .filter(movie =>
          Number.isSafeInteger(movie.id) && movie.id > 0
        );

      populateFilters();

      currentPage = 1;

      renderMovies();
      renderWatchlist();

      const totalMoviesElement = $("totalMovies");

      if (totalMoviesElement) {
        totalMoviesElement.textContent =
          Number(response.total ?? movies.length).toLocaleString();
      }

    } catch (error) {
      console.error("CineVault Movie Loading Error:", error);

      movies = [];

      populateFilters();

      if (resultsCount) {
        resultsCount.textContent = "Unable to load movies";
      }

      if (movieGrid) {
        movieGrid.replaceChildren();
      }

      if (emptyState) {
        emptyState.hidden = false;
      }

      if (watchlistGrid) {
        watchlistGrid.replaceChildren();
      }

      if (watchlistEmpty) {
        watchlistEmpty.hidden = false;
      }

      if (watchlistCount) {
        watchlistCount.textContent = "0";
      }

      const totalMoviesElement = $("totalMovies");

      if (totalMoviesElement) {
        totalMoviesElement.textContent = "0";
      }
    }
  }

  /* =======================================================
     RESET FILTERS
  ======================================================= */

  function resetFilters() {
    if (searchInput) searchInput.value = "";
    if (genreFilter) genreFilter.value = "";
    if (languageFilter) languageFilter.value = "";
    if (yearFilter) yearFilter.value = "";
    if (ratingFilter) ratingFilter.value = "";

    if (sortSelect) {
      sortSelect.value = "newest";
    }

    currentPage = 1;

    renderMovies();
  }

  /* =======================================================
     SEARCH EVENTS
  ======================================================= */

  searchInput?.addEventListener("input", () => {
    currentPage = 1;
    renderMovies();
  });

  clearSearch?.addEventListener("click", () => {
    if (searchInput) {
      searchInput.value = "";
    }

    currentPage = 1;
    renderMovies();

    searchInput?.focus();
  });

  /* =======================================================
     FILTER EVENTS
  ======================================================= */

  [
    sortSelect,
    genreFilter,
    languageFilter,
    yearFilter,
    ratingFilter
  ].filter(Boolean).forEach(element => {
    element.addEventListener("change", () => {
      currentPage = 1;
      renderMovies();
    });
  });

  filterToggle?.addEventListener("click", () => {
    const isOpen = filterPanel?.classList.toggle("open");

    filterToggle.setAttribute(
      "aria-expanded",
      isOpen ? "true" : "false"
    );
  });

  $("resetFilters")?.addEventListener("click", resetFilters);
  $("emptyReset")?.addEventListener("click", resetFilters);

  /* =======================================================
     COLLECTION CLICK
  ======================================================= */

  collectionGrid?.addEventListener("click", event => {
    const card = event.target.closest(".collection-card");

    if (!card) return;

    // Links with their own destination are handled normally.
    if (card.tagName === "A") return;

    const genre = card.dataset.genre || "";

    if (genreFilter) {
      const matchingOption = [...genreFilter.options].find(option =>
        option.value.toLowerCase() === genre.toLowerCase()
      );

      genreFilter.value = matchingOption
        ? matchingOption.value
        : "";
    }

    if (searchInput) {
      searchInput.value = "";
    }

    currentPage = 1;
    renderMovies();

    $("movies")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  /* =======================================================
     MOVIE CARD + WATCHLIST CLICK HANDLING
  ======================================================= */

  document.addEventListener("click", event => {
    const watchButton = event.target.closest("[data-watchlist-id]");

    if (watchButton) {
      event.preventDefault();
      event.stopPropagation();

      toggleWatchlist(watchButton.dataset.watchlistId);
      return;
    }

    const card = event.target.closest("[data-movie-id]");

    if (!card) return;

    // Do not hijack clicks on actual interactive elements.
    if (event.target.closest("a, button, input, select, textarea")) {
      return;
    }

    const movieId = card.dataset.movieId;

    if (!movieId) return;

    window.location.href =
      `movie.html?id=${encodeURIComponent(movieId)}`;
  });

  /* =======================================================
     KEYBOARD ACCESSIBILITY
  ======================================================= */

  document.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const card = event.target.closest("[data-movie-id]");

    if (!card) return;

    if (event.target.closest("button, a, input, select, textarea")) {
      return;
    }

    event.preventDefault();

    const movieId = card.dataset.movieId;

    if (movieId) {
      window.location.href =
        `movie.html?id=${encodeURIComponent(movieId)}`;
    }
  });

  /* =======================================================
     MOBILE NAVIGATION
  ======================================================= */

  function closeMobileMenu() {
    mainNav?.classList.remove("open");
    menuToggle?.setAttribute("aria-expanded", "false");
  }

  menuToggle?.addEventListener("click", () => {
    const isOpen = mainNav?.classList.toggle("open");

    menuToggle.setAttribute(
      "aria-expanded",
      isOpen ? "true" : "false"
    );
  });

  mainNav?.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", closeMobileMenu);
  });

  document.addEventListener("click", event => {
    if (!mainNav || !menuToggle) return;

    if (
      !mainNav.contains(event.target) &&
      !menuToggle.contains(event.target)
    ) {
      closeMobileMenu();
    }
  });

  /* =======================================================
     SEARCH ICON
  ======================================================= */

  $("searchToggle")?.addEventListener("click", () => {
    searchInput?.focus();

    $("movies")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  /* =======================================================
     CURRENT YEAR
  ======================================================= */

  const currentYearElement = $("currentYear");

  if (currentYearElement) {
    currentYearElement.textContent =
      new Date().getFullYear();
  }

  /* =======================================================
     INITIALIZE APPLICATION
  ======================================================= */

  loadSettings();
  loadCollections();
  loadMovies();

});
