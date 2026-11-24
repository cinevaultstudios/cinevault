
/* =========================================
   CINEVAULT — MAIN APPLICATION
   CLOUDFLARE D1 DATABASE
   DYNAMIC HERO • COLLECTIONS • SETTINGS
   SECTION LINKS • COLLECTION LINKS
   SEARCH • FILTER • SORT • WATCHLIST
   PAGINATION • MOBILE RESPONSIVE
   ========================================= */

document.addEventListener("DOMContentLoaded", () => {

  /* =========================================
     DOM ELEMENTS
  ========================================= */

  const $ = id => document.getElementById(id);

  const movieGrid = $("movieGrid");
  const watchlistGrid = $("watchlistGrid");
  const watchlistEmpty = $("watchlistEmpty");

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
  const emptyState = $("emptyState");
  const pagination = $("pagination");

  const watchlistCount = $("watchlistCount");
  const collectionGrid = $("collectionGrid");

  const PAGE_SIZE = 40;

  /* =========================================
     APPLICATION DATA
  ========================================= */

  let movies = [];
  let collections = [];

  let currentPage = 1;
  let currentMovies = [];

  let watchlist = loadWatchlist();

  /* =========================================
     SAFE HTML
  ========================================= */

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  /* =========================================
     SAFE URL VALIDATION
  ========================================= */

  function safeLink(value, fallback = "") {

    const link = String(value ?? "").trim();

    if (!link) return fallback;

    if (/[\u0000-\u001F]/.test(link)) {
      return fallback;
    }

    if (
      link.startsWith("#") ||
      link.startsWith("/") ||
      link.startsWith("./") ||
      link.startsWith("../")
    ) {
      return link;
    }

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

    const url = String(value || "").trim();

    if (!url) return "";

    try {

      const parsed = new URL(url, window.location.origin);

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

  /* =========================================
     API HELPER
  ========================================= */

  async function apiRequest(url) {

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data || data.success !== true) {
      throw new Error(data?.message || "Invalid API response");
    }

    return data;
  }

  /* =========================================
     LINK HELPERS
  ========================================= */

  function makeLink(content, url, className = "") {

    const link = safeLink(url);

    if (!link) {
      return content;
    }

    return `
      <a
        href="${escapeHTML(link)}"
        ${className ? `class="${escapeHTML(className)}"` : ""}
      >${content}</a>
    `;
  }

  function setLinkedText(element, text, url) {

    if (!element) return;

    const safeText = String(text ?? "");
    const link = safeLink(url);

    element.replaceChildren();

    if (!link) {
      element.textContent = safeText;
      return;
    }

    const anchor = document.createElement("a");

    anchor.href = link;
    anchor.textContent = safeText;
    anchor.className = "content-link";

    element.appendChild(anchor);
  }

  function setLinkedNodes(element, nodes, url) {

    if (!element) return;

    const link = safeLink(url);

    element.replaceChildren();

    if (link) {

      const anchor = document.createElement("a");

      anchor.href = link;
      anchor.className = "content-link";

      nodes.forEach(node => anchor.appendChild(node));

      element.appendChild(anchor);

    } else {

      nodes.forEach(node => element.appendChild(node));

    }
  }

  /* =========================================
     POSTER FALLBACK
  ========================================= */

  function fallbackPoster(title) {

    const safeTitle = escapeHTML(title);

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="500" height="750">
        <rect width="100%" height="100%" fill="#111722"/>
        <circle cx="250" cy="290" r="110"
          fill="#d6b36a" opacity=".10"/>
        <text x="50%" y="45%" fill="#d6b36a"
          font-size="34" font-family="Arial"
          text-anchor="middle">CINEVAULT</text>
        <text x="50%" y="55%" fill="#ffffff"
          font-size="24" font-family="Arial"
          text-anchor="middle">${safeTitle}</text>
        <text x="50%" y="92%" fill="#9ba3b1"
          font-size="18" font-family="Arial"
          text-anchor="middle">MOVIE POSTER</text>
      </svg>
    `;

    return "data:image/svg+xml;charset=UTF-8," +
      encodeURIComponent(svg);
  }

  function posterURL(movie) {

    const url = safeImageURL(movie.poster);

    if (url && !url.includes("placeholder.jpg")) {
      return url;
    }

    return fallbackPoster(movie.title);
  }

  /* =========================================
     WATCHLIST STORAGE
  ========================================= */

  function loadWatchlist() {

    try {

      const saved = JSON.parse(
        localStorage.getItem("cinevault_watchlist") || "[]"
      );

      return Array.isArray(saved)
        ? saved.map(Number).filter(Number.isFinite)
        : [];

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
      console.error("Watchlist storage error:", error);
    }
  }

  function isInWatchlist(id) {
    return watchlist.includes(Number(id));
  }

  /* =========================================
     NORMALIZE MOVIE DATA
  ========================================= */

  function normalizeMovie(movie) {

    return {
      ...movie,

      id: Number(movie.id),
      title: movie.title || "Untitled",
      year: Number(movie.year) || "",
      genre: movie.genre || "",
      language: movie.language || "",
      country: movie.country || "",
      rating: Number(movie.rating) || 0,
      duration: movie.duration || "",
      director: movie.director || "",
      poster: movie.poster || "",
      backdrop: movie.backdrop || "",
      description: movie.description || "",

      watchUrl: movie.watchUrl || movie.watch_url || "",

      downloadUrl:
        movie.downloadUrl || movie.download_url || "",

      downloadUrl2:
        movie.downloadUrl2 || movie.download_url_2 || ""
    };
  }

  /* =========================================
     DYNAMIC LOGO
  ========================================= */

  function updateLogo(settings) {

    const logoText = settings.logoText || "C";
    const siteName = settings.siteName || "CINEVAULT";

    const iconElements = [
      $("headerLogoIcon"),
      $("footerLogoIcon")
    ];

    const textElements = [
      $("headerLogoText"),
      $("footerLogoText")
    ];

    iconElements.forEach(element => {

      if (element) {
        element.textContent = logoText;
      }

    });

    textElements.forEach(element => {

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

        const gold = document.createElement("span");

        gold.className = "gold-text";
        gold.textContent = secondPart;

        element.appendChild(gold);
      }

    });

    document.title =
      `${siteName} — Discover Movies & Entertainment`;

  }

  /* =========================================
     DYNAMIC HERO
  ========================================= */

  function updateHero(settings) {

    const eyebrow = $("heroEyebrow");
    const title = $("heroTitle");
    const description = $("heroDescription");

    const button1 = $("heroButton1");
    const button1Text = $("heroButton1Text");
    const button2 = $("heroButton2");

    /* Eyebrow */

    setLinkedText(
      eyebrow,
      settings.heroEyebrow || "YOUR WORLD OF CINEMA",
      settings.heroEyebrowUrl
    );

    /* Main title */

    if (title) {

      const mainTitle = document.createElement("span");

      mainTitle.textContent =
        settings.heroTitle || "Discover Stories.";

      const highlight = document.createElement("span");

      highlight.className = "gold-text";
      highlight.textContent =
        settings.heroHighlight || "Experience Cinema.";

      const breakElement = document.createElement("br");

      const mainLink = safeLink(settings.heroTitleUrl);
      const highlightLink = safeLink(settings.heroHighlightUrl);

      const nodes = [];

      if (mainLink) {

        const anchor = document.createElement("a");

        anchor.href = mainLink;
        anchor.className = "content-link";
        anchor.appendChild(mainTitle);

        nodes.push(anchor);

      } else {

        nodes.push(mainTitle);

      }

      nodes.push(breakElement);

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

    /* Description */

    setLinkedText(
      description,
      settings.heroDescription || "",
      settings.heroDescriptionUrl
    );

    /* Button 1 */

    if (button1Text) {

      button1Text.textContent =
        settings.heroButton1Text || "Explore Movies";

    }

    if (button1) {

      button1.href = safeLink(
        settings.heroButton1Url,
        "#movies"
      );

    }

    /* Button 2 */

    if (button2) {

      button2.textContent =
        settings.heroButton2Text || "Browse Collections";

      button2.href = safeLink(
        settings.heroButton2Url,
        "#collections"
      );

    }

    /* Background image */

    const heroImage = safeImageURL(settings.heroImage);

    const heroSection =
      document.querySelector(".hero-section");

    if (heroSection && heroImage) {

      heroSection.style.backgroundImage = `
        linear-gradient(
          110deg,
          rgba(8,10,15,.94) 10%,
          rgba(17,23,34,.78) 65%,
          rgba(8,10,15,.88)
        ),
        url("${heroImage.replace(/["\\]/g, "")}")
      `;

      heroSection.style.backgroundSize = "cover";
      heroSection.style.backgroundPosition = "center";

    }

  }

  /* =========================================
     DYNAMIC SECTION HEADINGS
  ========================================= */

  function updateSectionHeadings(settings) {

    /* COLLECTIONS EYEBROW */

    setLinkedText(
      $("collectionsEyebrow"),
      settings.collectionsEyebrow || "EXPLORE BY CATEGORY",
      settings.collectionsEyebrowUrl
    );

    /* COLLECTIONS HEADING */

    const collectionsHeading = $("collectionsHeading");

    if (collectionsHeading) {

      const main = document.createElement("span");

      main.id = "collectionsHeadingText";
      main.textContent =
        settings.collectionsHeading || "Movie";

      const highlight = document.createElement("span");

      highlight.id = "collectionsHeadingHighlight";
      highlight.className = "gold-text";
      highlight.textContent =
        settings.collectionsHeadingHighlight || "Collections";

      setLinkedNodes(
        collectionsHeading,
        [main, document.createTextNode(" "), highlight],
        settings.collectionsHeadingUrl
      );

    }

    /* COLLECTIONS DESCRIPTION */

    setLinkedText(
      $("collectionsDescription"),
      settings.collectionsDescription ||
        "Discover movies from your favourite genres.",
      settings.collectionsDescriptionUrl
    );

    /* MOVIES EYEBROW */

    setLinkedText(
      $("moviesEyebrow"),
      settings.moviesEyebrow || "YOUR NEXT WATCH",
      settings.moviesEyebrowUrl
    );

    /* MOVIES HEADING */

    const moviesHeading = $("moviesHeading");

    if (moviesHeading) {

      const main = document.createElement("span");

      main.id = "moviesHeadingText";
      main.textContent =
        settings.moviesHeading || "Explore";

      const highlight = document.createElement("span");

      highlight.id = "moviesHeadingHighlight";
      highlight.className = "gold-text";
      highlight.textContent =
        settings.moviesHeadingHighlight || "Movies";

      setLinkedNodes(
        moviesHeading,
        [main, document.createTextNode(" "), highlight],
        settings.moviesHeadingUrl
      );

    }

    /* MOVIES DESCRIPTION */

    setLinkedText(
      $("moviesDescription"),
      settings.moviesDescription ||
        "Browse the latest additions and discover your next favourite movie.",
      settings.moviesDescriptionUrl
    );

  }

  /* =========================================
     DYNAMIC ABOUT SECTION
  ========================================= */

  function updateAbout(settings) {

    setLinkedText(
      $("aboutEyebrow"),
      settings.aboutEyebrow || "WELCOME TO CINEVAULT",
      settings.aboutEyebrowUrl
    );

    const title = $("aboutTitle");

    if (title) {

      const main = document.createElement("span");

      main.textContent =
        settings.aboutTitle || "More Than Movies.";

      const highlight = document.createElement("span");

      highlight.className = "gold-text";
      highlight.textContent =
        settings.aboutHighlight || "A Cinema Experience.";

      const nodes = [
        main,
        document.createElement("br"),
        highlight
      ];

      const mainLink = safeLink(settings.aboutTitleUrl);
      const highlightLink = safeLink(settings.aboutHighlightUrl);

      if (mainLink) {

        const anchor = document.createElement("a");

        anchor.href = mainLink;
        anchor.className = "content-link";
        anchor.appendChild(main);

        nodes[0] = anchor;

      }

      if (highlightLink) {

        const anchor = document.createElement("a");

        anchor.href = highlightLink;
        anchor.className = "content-link";
        anchor.appendChild(highlight);

        nodes[2] = anchor;

      }

      title.replaceChildren(...nodes);

    }

    setLinkedText(
      $("aboutDescription"),
      settings.aboutDescription || "",
      settings.aboutDescriptionUrl
    );

    const aboutButton = $("aboutButton");

    if (aboutButton) {

      const buttonText =
        settings.aboutButtonText || "Discover Movies";

      const buttonLink = safeLink(
        settings.aboutButtonUrl,
        "#movies"
      );

      aboutButton.href = buttonLink;

      const textElement = $("aboutButtonText");

      if (textElement) {
        textElement.textContent = buttonText;
      } else {
        aboutButton.textContent = buttonText;
      }

    }

  }

  /* =========================================
     DYNAMIC FOOTER
  ========================================= */

  function updateFooter(settings) {

    setLinkedText(
      $("footerDescription"),
      settings.footerDescription ||
        "Discover cinema. Explore stories. Build your collection.",
      settings.footerDescriptionUrl
    );

    setLinkedText(
      $("footerTagline"),
      settings.footerTagline || "Made for movie lovers.",
      settings.footerTaglineUrl
    );

    const copyright = $("copyrightText");

    if (copyright) {

      const year = new Date().getFullYear();

      const siteName =
        settings.siteName || "CINEVAULT";

      const copyrightText =
        settings.copyrightText || "All rights reserved.";

      const copyrightLink = safeLink(
        settings.copyrightUrl
      );

      copyright.replaceChildren();

      copyright.appendChild(
        document.createTextNode(`© ${year} `)
      );

      if (copyrightLink) {

        const anchor = document.createElement("a");

        anchor.href = copyrightLink;
        anchor.textContent = `${siteName}. ${copyrightText}`;

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
      currentYear.textContent = new Date().getFullYear();
    }

  }

  /* =========================================
     LOAD WEBSITE SETTINGS
  ========================================= */

  async function loadSettings() {

    try {

      const data = await apiRequest("/api/settings");

      if (!data.settings) {
        throw new Error("Website settings not found");
      }

      const settings = data.settings;

      updateLogo(settings);
      updateHero(settings);
      updateSectionHeadings(settings);
      updateAbout(settings);
      updateFooter(settings);

    } catch (error) {

      console.error(
        "CineVault Settings Loading Error:",
        error
      );

    }

  }

  /* =========================================
     NORMALIZE COLLECTION DATA
  ========================================= */

  function normalizeCollection(collection) {

    return {

      ...collection,

      id: Number(collection.id),

      name: collection.name || "Collection",

      description: collection.description || "",

      image: collection.image || "",

      icon: collection.icon || "✧",

      genre: collection.genre || collection.name || "",

      linkUrl:
        collection.linkUrl || collection.link_url || "",

      sortOrder: Number(
        collection.sortOrder ??
        collection.sort_order ??
        0
      )

    };

  }

  /* =========================================
     RENDER COLLECTIONS
  ========================================= */

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

    collectionGrid.innerHTML = collections
      .map(collection => {

        const image = safeImageURL(collection.image);

        const visual = image
          ? `
            <span class="collection-icon">
              <img
                src="${escapeHTML(image)}"
                alt=""
                loading="lazy"
                style="width:42px;height:42px;object-fit:cover;border-radius:8px;"
              >
            </span>
          `
          : `
            <span class="collection-icon">
              ${escapeHTML(collection.icon)}
            </span>
          `;

        const link = safeLink(collection.linkUrl);

        const tag = link ? "a" : "button";

        const attributes = link
          ? `href="${escapeHTML(link)}"`
          : `type="button" data-genre="${escapeHTML(collection.genre)}"`;

        return `
          <${tag}
            class="collection-card"
            ${attributes}
            data-collection-id="${collection.id}"
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

      })
      .join("");

  }

  /* =========================================
     LOAD COLLECTIONS FROM D1
  ========================================= */

  async function loadCollections() {

    if (collectionGrid) {

      collectionGrid.innerHTML = `
        <p class="loading-message">
          Loading collections...
        </p>
      `;

    }

    try {

      const data = await apiRequest("/api/collections");

      if (!Array.isArray(data.collections)) {
        throw new Error("Invalid collections response");
      }

      collections = data.collections
        .map(normalizeCollection)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      renderCollections();

    } catch (error) {

      console.error(
        "CineVault Collections Loading Error:",
        error
      );

      if (collectionGrid) {

        collectionGrid.innerHTML = `
          <p class="loading-message">
            Unable to load collections.
          </p>
        `;

      }

    }

  }

  /* =========================================
     MOVIE CARD
  ========================================= */

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
            onerror="this.onerror=null;this.src='${escapeHTML(fallbackPoster(movie.title))}'"
          >

          <span class="movie-rating">
            ★ ${escapeHTML(movie.rating)}
          </span>

          <button
            class="watchlist-btn ${active ? "active" : ""}"
            data-watchlist-id="${Number(movie.id)}"
            aria-label="Toggle watchlist"
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

  /* =========================================
     FILTER OPTIONS
  ========================================= */

  function populateYears() {

    if (!yearFilter) return;

    const selectedYear = yearFilter.value;

    const years = [
      ...new Set(
        movies
          .map(movie => Number(movie.year))
          .filter(Boolean)
      )
    ].sort((a, b) => b - a);

    yearFilter.innerHTML =
      '<option value="">All Years</option>' +
      years.map(year =>
        `<option value="${year}">${year}</option>`
      ).join("");

    if (years.includes(Number(selectedYear))) {
      yearFilter.value = selectedYear;
    }

  }

  /* =========================================
     SEARCH + FILTER + SORT
  ========================================= */

  function getFilteredMovies() {

    let result = [...movies];

    const search =
      searchInput?.value.trim().toLowerCase() || "";

    if (search) {

      result = result.filter(movie => {

        const searchable = [
          movie.title,
          movie.genre,
          movie.language,
          movie.country,
          movie.director,
          movie.description,
          movie.year
        ].join(" ").toLowerCase();

        return searchable.includes(search);

      });

    }

    if (genreFilter?.value) {

      result = result.filter(movie =>
        movie.genre.toLowerCase() ===
        genreFilter.value.toLowerCase()
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
        Number(movie.rating) >=
        Number(ratingFilter.value)
      );

    }

    switch (sortSelect?.value) {

      case "newest":
        result.sort((a, b) => b.year - a.year);
        break;

      case "oldest":
        result.sort((a, b) => a.year - b.year);
        break;

      case "rating":
        result.sort((a, b) => b.rating - a.rating);
        break;

      case "az":
        result.sort((a, b) =>
          a.title.localeCompare(b.title)
        );
        break;

      default:
        result.sort((a, b) => b.id - a.id);

    }

    return result;

  }

  /* =========================================
     PAGINATION
  ========================================= */

  function renderPagination(totalPages) {

    if (!pagination) return;

    pagination.innerHTML = "";

    if (totalPages <= 1) return;

    const createPageButton = (label, page, active = false) => {

      const button = document.createElement("button");

      button.type = "button";
      button.textContent = label;

      if (active) {
        button.classList.add("active");
      }

      button.addEventListener("click", () => {

        currentPage = page;

        renderMovies();

        $("movies")?.scrollIntoView({
          behavior: "smooth"
        });

      });

      pagination.appendChild(button);

    };

    if (currentPage > 1) {
      createPageButton("‹", currentPage - 1);
    }

    for (let page = 1; page <= totalPages; page++) {

      createPageButton(
        String(page),
        page,
        page === currentPage
      );

    }

    if (currentPage < totalPages) {
      createPageButton("›", currentPage + 1);
    }

  }

  /* =========================================
     MAIN MOVIE RENDER
  ========================================= */

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

    if (resultsCount) {

      resultsCount.textContent =
        `Showing ${visibleMovies.length} of ${total} movies`;

    }

    const resultsLabel = $("resultsLabel");

    if (resultsLabel) {
      resultsLabel.textContent = `${PAGE_SIZE} MOVIES PER PAGE`;
    }

    if (emptyState) {
      emptyState.hidden = total !== 0;
    }

    renderPagination(totalPages);

  }

  /* =========================================
     WATCHLIST RENDER
  ========================================= */

  function renderWatchlist() {

    if (!watchlistGrid) return;

    const savedMovies = movies.filter(movie =>
      watchlist.includes(Number(movie.id))
    );

    watchlistGrid.innerHTML = savedMovies
      .map(movieCard)
      .join("");

    if (watchlistEmpty) {
      watchlistEmpty.hidden = savedMovies.length > 0;
    }

    if (watchlistCount) {
      watchlistCount.textContent = savedMovies.length;
    }

  }

  /* =========================================
     WATCHLIST TOGGLE
  ========================================= */

  function toggleWatchlist(id) {

    id = Number(id);

    if (!Number.isFinite(id)) return;

    if (isInWatchlist(id)) {

      watchlist = watchlist.filter(item => item !== id);

    } else {

      watchlist.push(id);

    }

    saveWatchlist();

    renderMovies();
    renderWatchlist();

  }

  /* =========================================
     LOAD MOVIES FROM D1
  ========================================= */

  async function loadMovies() {

    if (movieGrid) {

      movieGrid.innerHTML = `
        <p class="loading-message">
          Loading movies...
        </p>
      `;

    }

    try {

      const data = await apiRequest("/api/movies");

      if (!Array.isArray(data.movies)) {
        throw new Error("Invalid movie database response");
      }

      /* D1 IS THE ONLY MOVIE SOURCE */

      movies = data.movies
        .map(normalizeMovie)
        .filter(movie =>
          Number.isFinite(movie.id) && movie.id > 0
        );

      populateYears();

      currentPage = 1;

      renderMovies();
      renderWatchlist();

      const totalMoviesElement = $("totalMovies");

      if (totalMoviesElement) {
        totalMoviesElement.textContent = movies.length;
      }

    } catch (error) {

      console.error(
        "CineVault Movie Loading Error:",
        error
      );

      movies = [];

      populateYears();

      renderMovies();
      renderWatchlist();

      if (resultsCount) {
        resultsCount.textContent = "Unable to load movies";
      }

      if (movieGrid) {
        movieGrid.innerHTML = "";
      }

      if (emptyState) {
        emptyState.hidden = false;
      }

      const totalMoviesElement = $("totalMovies");

      if (totalMoviesElement) {
        totalMoviesElement.textContent = "0";
      }

    }

  }

  /* =========================================
     SEARCH EVENTS
  ========================================= */

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

  /* =========================================
     FILTER EVENTS
  ========================================= */

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

    filterPanel?.classList.toggle("open");

  });

  /* =========================================
     RESET FILTERS
  ========================================= */

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

  $("resetFilters")?.addEventListener("click", resetFilters);

  $("emptyReset")?.addEventListener("click", resetFilters);

  /* =========================================
     COLLECTION CLICK
  ========================================= */

  collectionGrid?.addEventListener("click", event => {

    const card = event.target.closest(".collection-card");

    if (!card) return;

    // A collection with its own URL follows that URL.
    if (card.tagName === "A") {
      return;
    }

    const genre = card.dataset.genre || "";

    if (genreFilter) {

      const matchingOption = [
        ...genreFilter.options
      ].find(option =>
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
      behavior: "smooth"
    });

  });

  /* =========================================
     MOVIE CARD CLICK
  ========================================= */

  document.addEventListener("click", event => {

    const watchButton = event.target.closest(
      "[data-watchlist-id]"
    );

    if (watchButton) {

      event.preventDefault();
      event.stopPropagation();

      toggleWatchlist(
        watchButton.dataset.watchlistId
      );

      return;

    }

    const movieCardElement = event.target.closest(
      "[data-movie-id]"
    );

    if (movieCardElement) {

      const movieId =
        movieCardElement.dataset.movieId;

      if (!movieId) return;

      window.location.href =
        `movie.html?id=${encodeURIComponent(movieId)}`;

    }

  });

  /* Keyboard access for movie cards */

  document.addEventListener("keydown", event => {

    if (
      event.key !== "Enter" &&
      event.key !== " "
    ) {
      return;
    }

    const card = event.target.closest("[data-movie-id]");

    if (!card || event.target.closest("button")) return;

    event.preventDefault();

    const movieId = card.dataset.movieId;

    if (movieId) {
      window.location.href =
        `movie.html?id=${encodeURIComponent(movieId)}`;
    }

  });

  /* =========================================
     MOBILE MENU
  ========================================= */

  const menuToggle = $("menuToggle");
  const mainNav = $("mainNav");

  menuToggle?.addEventListener("click", () => {

    mainNav?.classList.toggle("open");

  });

  mainNav?.querySelectorAll("a").forEach(link => {

    link.addEventListener("click", () => {

      mainNav.classList.remove("open");

    });

  });

  /* =========================================
     SEARCH ICON
  ========================================= */

  $("searchToggle")?.addEventListener("click", () => {

    searchInput?.focus();

    $("movies")?.scrollIntoView({
      behavior: "smooth"
    });

  });

  /* =========================================
     CURRENT YEAR
  ========================================= */

  const currentYearElement = $("currentYear");

  if (currentYearElement) {

    currentYearElement.textContent =
      new Date().getFullYear();

  }

  /* =========================================
     INITIALIZE APPLICATION
  ========================================= */

  loadSettings();
  loadCollections();
  loadMovies();

});
