
/* =========================================================
   CINEVAULT — MAIN APPLICATION
   CLOUDFLARE WORKERS + D1 DATABASE
   DYNAMIC SETTINGS • 4 SLIDE BANNERS
   FIXED 2-SECOND AUTOPLAY • NO LEGACY HERO FALLBACK
   COLLECTIONS • MOVIES • SEARCH • FILTER • SORT
   WATCHLIST • PAGINATION • RESPONSIVE NAVIGATION
   ACCESSIBLE HERO SLIDER • SAFE EXTERNAL LINKS
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  /* =======================================================
     1. DOM HELPERS
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
  const MAX_HERO_BANNERS = 4;
  const HERO_AUTOPLAY_INTERVAL = 2000;

  /* =======================================================
     2. APPLICATION STATE
  ======================================================= */

  let movies = [];
  let collections = [];

  let currentPage = 1;
  let currentMovies = [];

  let settings = {};

  let watchlist = loadWatchlist();

  /* =======================================================
     3. HERO SLIDER STATE
  ======================================================= */

  let heroBanners = [];
  let currentHeroIndex = 0;
  let heroTimer = null;

  let heroHoverPaused = false;
  let heroFocusPaused = false;

  const heroSlider = $("heroSlider");
  const heroSliderTrack = $("heroSliderTrack");
  const heroSliderPrev = $("heroSliderPrev");
  const heroSliderNext = $("heroSliderNext");
  const heroSliderDots = $("heroSliderDots");
  const heroSliderNavigation = $("heroSliderNavigation");

  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function isHeroPaused() {
    return heroHoverPaused || heroFocusPaused;
  }

  /* =======================================================
     4. SAFE TEXT / HTML
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
     5. SAFE URL VALIDATION
  ======================================================= */

  function safeLink(value, fallback = "") {
    const link = String(value ?? "").trim();

    if (!link || /[\u0000-\u001F\u007F]/.test(link)) {
      return fallback;
    }

    if (link.startsWith("#")) {
      return link;
    }

    if (link.startsWith("/") && !link.startsWith("//")) {
      return link;
    }

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
     6. SAFE COLOR / SLIDER VALUE VALIDATION
  ======================================================= */

  function safeColor(value, fallback) {
    const color = String(value ?? "").trim();

    return /^#[0-9a-fA-F]{6}$/.test(color)
      ? color
      : fallback;
  }

  function safeOverlay(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) return 45;

    return Math.min(90, Math.max(0, number));
  }

  function safeTextPosition(value) {
    const position = String(value ?? "").toLowerCase();

    return ["left", "center", "right"].includes(position)
      ? position
      : "left";
  }

  /* =======================================================
     7. CONFIGURABLE LINKS — OPEN IN NEW TAB
  ======================================================= */

  function configureNewTab(anchor) {
    if (!anchor) return;

    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  }

  /* =======================================================
     8. API HELPER
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
     9. WATCHLIST STORAGE
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
     10. NORMALIZE MOVIE DATA
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
     11. NORMALIZE COLLECTION DATA
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
     12. LINKED TEXT HELPERS
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

    configureNewTab(anchor);

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

    configureNewTab(anchor);

    nodes.forEach(node => anchor.appendChild(node));

    element.appendChild(anchor);
  }

  /* =======================================================
     13. DYNAMIC LOGO
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
     14. MULTIPLE HERO BANNER — NORMALIZE
  ======================================================= */

  function normalizeHeroBanner(banner, index) {
    const item = banner || {};

    const enabled =
      item.enabled !== false &&
      item.enabled !== 0 &&
      item.enabled !== "0" &&
      item.enabled !== "false";

    return {
      id: textValue(item.id, `hero-${index + 1}`),

      enabled,

      image: safeImageURL(item.image),

      clickUrl: safeLink(item.clickUrl),

      eyebrow: textValue(item.eyebrow),
      title: textValue(item.title),
      highlight: textValue(item.highlight),
      description: textValue(item.description),

      button1Text: textValue(item.button1Text),
      button1Url: safeLink(item.button1Url),

      button2Text: textValue(item.button2Text),
      button2Url: safeLink(item.button2Url),

      textColor: safeColor(item.textColor, "#FFFFFF"),

      highlightColor: safeColor(
        item.highlightColor,
        "#D6B36A"
      ),

      overlay: safeOverlay(item.overlay),

      textPosition: safeTextPosition(item.textPosition)
    };
  }

  /* =======================================================
     15. MULTIPLE HERO BANNER — PARSE SETTINGS
     MAXIMUM 4 ACTIVE BANNERS
  ======================================================= */

  function getHeroBannersFromSettings(data) {
    let raw = data.heroBanners;

    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw || "[]");
      } catch (error) {
        console.warn("Invalid heroBanners setting:", error);
        raw = [];
      }
    }

    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .map((banner, index) =>
        normalizeHeroBanner(banner, index)
      )
      .filter(banner =>
        banner.enabled && banner.image
      )
      .slice(0, MAX_HERO_BANNERS);
  }

  /* =======================================================
     16. MULTIPLE HERO BANNER — BUTTON HTML
  ======================================================= */

  function createHeroButton(
    text,
    url,
    styleClass,
    fallbackUrl
  ) {
    const label = textValue(text);

    if (!label) return "";

    const link = safeLink(url);

    if (!link && !fallbackUrl) {
      return "";
    }

    const finalUrl = link || fallbackUrl;

    return `
      <a
        href="${escapeHTML(finalUrl)}"
        class="btn ${escapeHTML(styleClass)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        ${escapeHTML(label)}
        <span aria-hidden="true">→</span>
      </a>
    `;
  }

  /* =======================================================
     17. MULTIPLE HERO BANNER — RENDER SLIDE
  ======================================================= */

  function renderHeroSlide(banner, index) {
    const overlay = banner.overlay / 100;
    const positionClass = `hero-text-${banner.textPosition}`;

    const backgroundImage = `
      linear-gradient(
        110deg,
        rgba(8,10,15,${Math.min(0.98, overlay + 0.18)}) 0%,
        rgba(8,10,15,${overlay}) 55%,
        rgba(8,10,15,${Math.max(0, overlay - 0.12)}) 100%
      ),
      url("${banner.image.replace(/["\\]/g, "")}")
    `;

    const button1 = createHeroButton(
      banner.button1Text,
      banner.button1Url,
      "btn-primary",
      "#movies"
    );

    const button2 = createHeroButton(
      banner.button2Text,
      banner.button2Url,
      "btn-outline",
      "#collections"
    );

    const hasBackgroundLink = Boolean(banner.clickUrl);

    return `
      <article
        class="hero-slide ${index === 0 ? "hero-slide-active" : ""} ${positionClass}"
        data-hero-index="${index}"
        role="group"
        aria-roledescription="slide"
        aria-label="${index + 1} of ${heroBanners.length}"
        ${hasBackgroundLink ? 'tabindex="0"' : ""}
        ${hasBackgroundLink ? 'aria-label="Open banner link in a new tab"' : ""}
        style="
          background-image:${backgroundImage};
          background-size:cover;
          background-position:center;
          color:${banner.textColor};
          --hero-text-color:${banner.textColor};
          --hero-highlight-color:${banner.highlightColor};
          --hero-overlay:${overlay};
        "
      >

        <div class="hero-overlay"></div>

        <div class="hero-content">

          ${
            banner.eyebrow
              ? `<span class="hero-eyebrow">${escapeHTML(banner.eyebrow)}</span>`
              : ""
          }

          <h1 class="hero-slide-title">

            ${escapeHTML(banner.title)}

            ${
              banner.highlight
                ? `<span class="gold-text hero-slide-highlight">${escapeHTML(banner.highlight)}</span>`
                : ""
            }

          </h1>

          ${
            banner.description
              ? `<p>${escapeHTML(banner.description)}</p>`
              : ""
          }

          ${
            button1 || button2
              ? `<div class="hero-buttons">${button1}${button2}</div>`
              : ""
          }

        </div>

        ${
          index === 0
            ? `<div class="hero-decoration" aria-hidden="true"><span>C</span></div>`
            : ""
        }

      </article>
    `;
  }

  /* =======================================================
     18. MULTIPLE HERO BANNER — DOTS
  ======================================================= */

  function renderHeroDots() {
    if (!heroSliderDots) return;

    if (heroBanners.length <= 1) {
      heroSliderDots.hidden = true;
      heroSliderDots.replaceChildren();
      return;
    }

    heroSliderDots.hidden = false;

    heroSliderDots.innerHTML = heroBanners.map((banner, index) => `
      <button
        type="button"
        class="hero-slider-dot ${index === currentHeroIndex ? "active" : ""}"
        data-hero-dot="${index}"
        aria-label="Go to banner ${index + 1}"
        aria-current="${index === currentHeroIndex ? "true" : "false"}"
      ></button>
    `).join("");
  }

  /* =======================================================
     19. MULTIPLE HERO BANNER — AUTOPLAY
     FIXED 2000 MILLISECONDS
  ======================================================= */

  function stopHeroAutoplay() {
    if (heroTimer !== null) {
      clearTimeout(heroTimer);
      heroTimer = null;
    }
  }

  function startHeroAutoplay() {
    stopHeroAutoplay();

    if (
      heroBanners.length <= 1 ||
      isHeroPaused() ||
      prefersReducedMotion ||
      document.hidden
    ) {
      return;
    }

    heroTimer = setTimeout(() => {
      showHeroSlide(currentHeroIndex + 1);
    }, HERO_AUTOPLAY_INTERVAL);
  }

  /* =======================================================
     20. MULTIPLE HERO BANNER — SLIDE CHANGE
  ======================================================= */

  function showHeroSlide(index, resetTimer = true) {
    if (!heroSliderTrack || !heroBanners.length) {
      return;
    }

    currentHeroIndex =
      (index + heroBanners.length) % heroBanners.length;

    const slides =
      heroSliderTrack.querySelectorAll(".hero-slide");

    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === currentHeroIndex;

      slide.classList.toggle(
        "hero-slide-active",
        active
      );

      slide.setAttribute(
        "aria-hidden",
        active ? "false" : "true"
      );

      if (active) {
        slide.removeAttribute("inert");
      } else {
        slide.setAttribute("inert", "");
      }
    });

    renderHeroDots();

    if (resetTimer) {
      startHeroAutoplay();
    }
  }

  /* =======================================================
     21. MULTIPLE HERO BANNER — NAVIGATION
  ======================================================= */

  function initializeHeroControls() {
    const hasMultiple = heroBanners.length > 1;

    if (heroSliderNavigation) {
      heroSliderNavigation.hidden = !hasMultiple;
    }

    if (heroSliderPrev) {
      heroSliderPrev.hidden = !hasMultiple;
    }

    if (heroSliderNext) {
      heroSliderNext.hidden = !hasMultiple;
    }

    if (heroSliderDots) {
      heroSliderDots.hidden = !hasMultiple;
    }

    if (hasMultiple) {
      renderHeroDots();
      startHeroAutoplay();
    } else {
      stopHeroAutoplay();
    }
  }

  heroSliderPrev?.addEventListener("click", () => {
    showHeroSlide(currentHeroIndex - 1);
  });

  heroSliderNext?.addEventListener("click", () => {
    showHeroSlide(currentHeroIndex + 1);
  });

  heroSliderDots?.addEventListener("click", event => {
    const button = event.target.closest("[data-hero-dot]");

    if (!button) return;

    const index = Number(button.dataset.heroDot);

    if (Number.isInteger(index)) {
      showHeroSlide(index);
    }
  });

  /* =======================================================
     22. HERO SLIDER — PAUSE ON HOVER / FOCUS
  ======================================================= */

  heroSlider?.addEventListener("mouseenter", () => {
    heroHoverPaused = true;
    stopHeroAutoplay();
  });

  heroSlider?.addEventListener("mouseleave", () => {
    heroHoverPaused = false;
    startHeroAutoplay();
  });

  heroSlider?.addEventListener("focusin", () => {
    heroFocusPaused = true;
    stopHeroAutoplay();
  });

  heroSlider?.addEventListener("focusout", event => {
    if (heroSlider.contains(event.relatedTarget)) {
      return;
    }

    heroFocusPaused = false;
    startHeroAutoplay();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopHeroAutoplay();
    } else {
      startHeroAutoplay();
    }
  });

  /* =======================================================
     23. HERO SLIDER — BACKGROUND CLICK / KEYBOARD
  ======================================================= */

  function openHeroBackgroundLink(slide) {
    if (!slide) return;

    const indexValue = slide.dataset.heroIndex;

    if (indexValue === undefined || indexValue === "") {
      return;
    }

    const index = Number(indexValue);

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= heroBanners.length
    ) {
      return;
    }

    const banner = heroBanners[index];

    if (!banner?.clickUrl) return;

    const link = safeLink(banner.clickUrl);

    if (!link) return;

    window.open(
      link,
      "_blank",
      "noopener,noreferrer"
    );
  }

  heroSliderTrack?.addEventListener("click", event => {
    const slide = event.target.closest(".hero-slide");

    if (!slide) return;

    if (event.target.closest("a, button")) {
      return;
    }

    openHeroBackgroundLink(slide);
  });

  heroSliderTrack?.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const slide = event.target.closest(".hero-slide");

    if (!slide) return;

    if (event.target.closest("a, button")) {
      return;
    }

    if (!slide.hasAttribute("tabindex")) {
      return;
    }

    event.preventDefault();

    openHeroBackgroundLink(slide);
  });

  /* =======================================================
     24. MULTIPLE HERO BANNER — RENDER
     NO LEGACY STATIC HERO FALLBACK
  ======================================================= */

  function renderHeroBanners(data) {
    if (!heroSliderTrack) return;

    heroBanners = getHeroBannersFromSettings(data);

    currentHeroIndex = 0;

    stopHeroAutoplay();

    heroHoverPaused = false;
    heroFocusPaused = false;

    // No active banners: keep the slider empty.
    // Never restore the old static hero banner.
    if (!heroBanners.length) {
      heroSliderTrack.replaceChildren();

      initializeHeroControls();

      if (heroSlider) {
        heroSlider.hidden = true;
      }

      return;
    }

    if (heroSlider) {
      heroSlider.hidden = false;
    }

    heroSliderTrack.innerHTML = heroBanners
      .map((banner, index) =>
        renderHeroSlide(banner, index)
      )
      .join("");

    showHeroSlide(0, false);

    initializeHeroControls();
  }

  /* =======================================================
     25. DYNAMIC SECTION HEADINGS
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
      main.textContent =
        data.collectionsHeading || "Movie";

      const highlight = document.createElement("span");

      highlight.id = "collectionsHeadingHighlight";
      highlight.className = "gold-text";
      highlight.textContent =
        data.collectionsHeadingHighlight || "Collections";

      setLinkedNodes(
        collectionsHeading,
        [
          main,
          document.createTextNode(" "),
          highlight
        ],
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
      data.moviesEyebrow || "THE CINEVAULT LIBRARY",
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
        [
          main,
          document.createTextNode(" "),
          highlight
        ],
        data.moviesHeadingUrl
      );
    }

    setLinkedText(
      $("moviesDescription"),
      data.moviesDescription ||
        "Discover your next favourite movie from our collection.",
      data.moviesDescriptionUrl
    );
  }

  /* =======================================================
     26. DYNAMIC ABOUT SECTION
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

        configureNewTab(anchor);

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

        configureNewTab(anchor);

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
      const aboutButtonUrl = safeLink(
        data.aboutButtonUrl,
        "#movies"
      );

      aboutButton.href = aboutButtonUrl;

      if (data.aboutButtonUrl && aboutButtonUrl) {
        configureNewTab(aboutButton);
      } else {
        aboutButton.removeAttribute("target");
        aboutButton.removeAttribute("rel");
      }

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
     27. DYNAMIC FOOTER
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
      const siteName = textValue(
        data.siteName,
        "CINEVAULT"
      );

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

        configureNewTab(anchor);

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
     28. LOAD SETTINGS FROM D1
  ======================================================= */

  async function loadSettings() {
    try {
      const response = await apiRequest("/api/settings");

      if (!response.settings) {
        throw new Error("Website settings not found.");
      }

      settings = response.settings;

      updateLogo(settings);

      // Only the 4-slide banner system is used.
      // Legacy updateHero() has been removed.
      renderHeroBanners(settings);

      updateSectionHeadings(settings);
      updateAbout(settings);
      updateFooter(settings);

    } catch (error) {
      console.error(
        "CineVault Settings Error:",
        error
      );

      // Do not display a static fallback banner.
      if (heroSliderTrack) {
        heroSliderTrack.replaceChildren();
      }

      if (heroSlider) {
        heroSlider.hidden = true;
      }

      stopHeroAutoplay();
    }
  }

  /* =======================================================
     29. FILTER OPTION HELPERS
  ======================================================= */

  function populateSelect(
    select,
    values,
    firstLabel,
    selectedValue
  ) {
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
     30. COLLECTION RENDERING
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
        ? `href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer"`
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
     31. LOAD COLLECTIONS FROM D1
  ======================================================= */

  async function loadCollections() {
    if (collectionGrid) {
      collectionGrid.setAttribute("aria-busy", "true");

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
      console.error(
        "CineVault Collections Error:",
        error
      );

      if (collectionGrid) {
        collectionGrid.innerHTML = `
          <p class="loading-message">
            Unable to load collections.
          </p>
        `;
      }
    } finally {
      collectionGrid?.setAttribute("aria-busy", "false");
    }
  }

  /* =======================================================
     32. POSTER FALLBACK
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
     33. MOVIE CARD
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
     34. MOVIE POSTER ERROR HANDLING
  ======================================================= */

  function handlePosterErrors(container) {
    if (!container) return;

    container.querySelectorAll("img[data-poster-fallback]")
      .forEach(image => {
        image.addEventListener("error", () => {
          const movie = movies.find(
            item =>
              item.id === Number(image.dataset.posterFallback)
          );

          image.onerror = null;

          if (movie) {
            image.src = fallbackPoster(movie.title);
          }
        }, { once: true });
      });
  }

  /* =======================================================
     35. SEARCH + FILTER + SORT
  ======================================================= */

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
          .some(value =>
            value.trim().toLowerCase() === selected
          )
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
     36. PAGINATION
  ======================================================= */

  function renderPagination(totalPages) {
    if (!pagination) return;

    pagination.replaceChildren();

    if (totalPages <= 1) return;

    function addButton(
      label,
      page,
      active = false,
      disabled = false
    ) {
      const button = document.createElement("button");

      button.type = "button";
      button.textContent = label;
      button.disabled = disabled;

      if (active) {
        button.classList.add("active");
        button.setAttribute("aria-current", "page");
      }

      button.addEventListener("click", () => {
        if (
          page === currentPage ||
          page < 1 ||
          page > totalPages
        ) {
          return;
        }

        currentPage = page;

        renderMovies();

        $("movies")?.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start"
        });
      });

      pagination.appendChild(button);
    }

    addButton(
      "‹",
      currentPage - 1,
      false,
      currentPage === 1
    );

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

    addButton(
      "›",
      currentPage + 1,
      false,
      currentPage === totalPages
    );
  }

  /* =======================================================
     37. MAIN MOVIE RENDER
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

    movieGrid.setAttribute("aria-busy", "false");
  }

  /* =======================================================
     38. WATCHLIST RENDER
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
     39. WATCHLIST TOGGLE
  ======================================================= */

  function toggleWatchlist(id) {
    const movieId = Number(id);

    if (
      !Number.isSafeInteger(movieId) ||
      movieId <= 0
    ) {
      return;
    }

    if (isInWatchlist(movieId)) {
      watchlist = watchlist.filter(
        item => item !== movieId
      );
    } else {
      watchlist.push(movieId);
    }

    saveWatchlist();

    renderMovies();
    renderWatchlist();
  }

  /* =======================================================
     40. LOAD MOVIES FROM D1
  ======================================================= */

  async function loadMovies() {
    if (movieGrid) {
      movieGrid.setAttribute("aria-busy", "true");

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
          Number.isSafeInteger(movie.id) &&
          movie.id > 0
        );

      populateFilters();

      currentPage = 1;

      renderMovies();
      renderWatchlist();

      const totalMoviesElement = $("totalMovies");

      if (totalMoviesElement) {
        totalMoviesElement.textContent =
          Number(
            response.total ?? movies.length
          ).toLocaleString();
      }

    } catch (error) {
      console.error(
        "CineVault Movie Loading Error:",
        error
      );

      movies = [];

      populateFilters();

      if (resultsCount) {
        resultsCount.textContent =
          "Unable to load movies";
      }

      if (movieGrid) {
        movieGrid.replaceChildren();
        movieGrid.setAttribute("aria-busy", "false");
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
     41. RESET FILTERS
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
     42. SEARCH EVENTS
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
     43. FILTER EVENTS
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
    const isOpen =
      filterPanel?.classList.toggle("open");

    filterToggle.setAttribute(
      "aria-expanded",
      isOpen ? "true" : "false"
    );
  });

  $("resetFilters")?.addEventListener(
    "click",
    resetFilters
  );

  $("emptyReset")?.addEventListener(
    "click",
    resetFilters
  );

  /* =======================================================
     44. COLLECTION CLICK
  ======================================================= */

  collectionGrid?.addEventListener("click", event => {
    const card = event.target.closest(".collection-card");

    if (!card) return;

    if (card.tagName === "A") return;

    const genre = card.dataset.genre || "";

    if (genreFilter) {
      const matchingOption = [
        ...genreFilter.options
      ].find(option =>
        option.value.toLowerCase() ===
        genre.toLowerCase()
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
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start"
    });
  });

  /* =======================================================
     45. MOVIE CARD + WATCHLIST CLICK HANDLING
  ======================================================= */

  document.addEventListener("click", event => {
    const watchButton =
      event.target.closest("[data-watchlist-id]");

    if (watchButton) {
      event.preventDefault();
      event.stopPropagation();

      toggleWatchlist(
        watchButton.dataset.watchlistId
      );

      return;
    }

    const card = event.target.closest("[data-movie-id]");

    if (!card) return;

    if (
      event.target.closest(
        "a, button, input, select, textarea"
      )
    ) {
      return;
    }

    const movieId = card.dataset.movieId;

    if (!movieId) return;

    window.open(
      `movie.html?id=${encodeURIComponent(movieId)}`,
      "_blank",
      "noopener,noreferrer"
    );
  });

  /* =======================================================
     46. KEYBOARD ACCESSIBILITY — MOVIE CARDS
  ======================================================= */

  document.addEventListener("keydown", event => {
    if (
      event.key !== "Enter" &&
      event.key !== " "
    ) {
      return;
    }

    const card = event.target.closest("[data-movie-id]");

    if (!card) return;

    if (
      event.target.closest(
        "button, a, input, select, textarea"
      )
    ) {
      return;
    }

    event.preventDefault();

    const movieId = card.dataset.movieId;

    if (movieId) {
      window.open(
        `movie.html?id=${encodeURIComponent(movieId)}`,
        "_blank",
        "noopener,noreferrer"
      );
    }
  });

  /* =======================================================
     47. MOBILE NAVIGATION
  ======================================================= */

  function closeMobileMenu() {
    mainNav?.classList.remove("open");

    menuToggle?.setAttribute(
      "aria-expanded",
      "false"
    );
  }

  menuToggle?.addEventListener("click", () => {
    const isOpen =
      mainNav?.classList.toggle("open");

    menuToggle.setAttribute(
      "aria-expanded",
      isOpen ? "true" : "false"
    );
  });

  mainNav?.querySelectorAll("a").forEach(link => {
    link.addEventListener(
      "click",
      closeMobileMenu
    );
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
     48. SEARCH ICON
  ======================================================= */

  $("searchToggle")?.addEventListener("click", () => {
    searchInput?.focus();

    $("movies")?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start"
    });
  });

  /* =======================================================
     49. CURRENT YEAR
  ======================================================= */

  const currentYearElement = $("currentYear");

  if (currentYearElement) {
    currentYearElement.textContent =
      new Date().getFullYear();
  }

  /* =======================================================
     50. INITIALIZE APPLICATION
  ======================================================= */

  loadSettings();
  loadCollections();
  loadMovies();

});
