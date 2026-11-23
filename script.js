
/* =========================================
   CINEVAULT — MAIN APPLICATION
   SEARCH • FILTER • SORT • WATCHLIST
   MOVIE DETAILS PAGE
   ========================================= */

document.addEventListener("DOMContentLoaded", () => {

  const movieGrid = document.getElementById("movieGrid");
  const featuredGrid = document.getElementById("featuredMovies");
  const watchlistGrid = document.getElementById("watchlistGrid");
  const watchlistEmpty = document.getElementById("watchlistEmpty");

  const searchInput = document.getElementById("movieSearch");
  const clearSearch = document.getElementById("clearSearch");
  const sortSelect = document.getElementById("sortMovies");

  const genreFilter = document.getElementById("genreFilter");
  const languageFilter = document.getElementById("languageFilter");
  const yearFilter = document.getElementById("yearFilter");
  const ratingFilter = document.getElementById("ratingFilter");

  const filterPanel = document.getElementById("filterPanel");
  const filterToggle = document.getElementById("filterToggle");

  const resultsCount = document.getElementById("resultsCount");
  const emptyState = document.getElementById("emptyState");
  const pagination = document.getElementById("pagination");

  const watchlistCount = document.getElementById("watchlistCount");

  const PAGE_SIZE = 40;

  let currentPage = 1;
  let currentMovies = [];
  let watchlist = loadWatchlist();


  /* SAFE HTML */

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }


  /* IMAGE FALLBACK */

  function posterURL(movie) {
    const url = movie.poster || "";

    if (
      !/^https:\/\/image\.tmdb\.org\/t\/p\/w\d+\//.test(url) ||
      url.includes("placeholder.jpg")
    ) {
      return fallbackPoster(movie.title);
    }

    return url;
  }

  function fallbackPoster(title) {
    const safeTitle = escapeHTML(title);

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="500" height="750">
        <rect width="100%" height="100%" fill="#111722"/>
        <circle cx="250" cy="290" r="110" fill="#d6b36a" opacity=".10"/>
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

    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  }


  /* WATCHLIST STORAGE */

  function loadWatchlist() {
    try {
      const saved = JSON.parse(
        localStorage.getItem("cinevault_watchlist") || "[]"
      );

      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }

  function saveWatchlist() {
    localStorage.setItem(
      "cinevault_watchlist",
      JSON.stringify(watchlist)
    );
  }

  function isInWatchlist(id) {
    return watchlist.includes(Number(id));
  }


  /* MOVIE CARD */

  function movieCard(movie) {

    const active = isInWatchlist(movie.id);

    return `
      <article class="movie-card" data-movie-id="${Number(movie.id)}">

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
            title="Add to watchlist"
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


  /* FEATURED MOVIES */

  function renderFeatured() {

    if (!featuredGrid) return;

    const featured = movies.filter(movie => movie.featured);

    featuredGrid.innerHTML = featured
      .slice(0, 4)
      .map(movieCard)
      .join("");
  }


  /* FILTER OPTIONS */

  function populateYears() {

    const years = [...new Set(
      movies.map(movie => Number(movie.year))
    )].sort((a, b) => b - a);

    yearFilter.innerHTML =
      '<option value="">All Years</option>' +
      years.map(year =>
        `<option value="${year}">${year}</option>`
      ).join("");
  }


  /* SEARCH + FILTER */

  function getFilteredMovies() {

    let result = [...movies];

    const search = searchInput.value.trim().toLowerCase();

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

    if (genreFilter.value) {
      result = result.filter(movie =>
        movie.genre.toLowerCase() ===
        genreFilter.value.toLowerCase()
      );
    }

    if (languageFilter.value) {
      result = result.filter(movie =>
        movie.language.toLowerCase() ===
        languageFilter.value.toLowerCase()
      );
    }

    if (yearFilter.value) {
      result = result.filter(movie =>
        String(movie.year) === yearFilter.value
      );
    }

    if (ratingFilter.value) {
      result = result.filter(movie =>
        Number(movie.rating) >= Number(ratingFilter.value)
      );
    }

    switch (sortSelect.value) {

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
        result.sort((a, b) => a.id - b.id);
    }

    return result;
  }


  /* MAIN MOVIE RENDER */

  function renderMovies() {

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

    resultsCount.textContent =
      `Showing ${visibleMovies.length} of ${total} movies`;

    emptyState.hidden = total !== 0;

    pagination.innerHTML = "";

    if (totalPages > 1) {

      for (let page = 1; page <= totalPages; page++) {

        const button = document.createElement("button");

        button.textContent = page;

        if (page === currentPage) {
          button.classList.add("active");
        }

        button.addEventListener("click", () => {

          currentPage = page;

          renderMovies();

          document.getElementById("movies").scrollIntoView({
            behavior: "smooth"
          });

        });

        pagination.appendChild(button);
      }
    }
  }


  /* WATCHLIST RENDER */

  function renderWatchlist() {

    const savedMovies = movies.filter(movie =>
      watchlist.includes(Number(movie.id))
    );

    watchlistGrid.innerHTML = savedMovies
      .map(movieCard)
      .join("");

    watchlistEmpty.hidden = savedMovies.length > 0;

    watchlistCount.textContent = savedMovies.length;
  }


  /* WATCHLIST TOGGLE */

  function toggleWatchlist(id) {

    id = Number(id);

    if (isInWatchlist(id)) {

      watchlist = watchlist.filter(item => item !== id);

    } else {

      watchlist.push(id);

    }

    saveWatchlist();

    renderMovies();
    renderFeatured();
    renderWatchlist();
  }


  /* EVENTS */

  searchInput.addEventListener("input", () => {
    currentPage = 1;
    renderMovies();
  });

  clearSearch.addEventListener("click", () => {
    searchInput.value = "";
    currentPage = 1;
    renderMovies();
  });

  [
    sortSelect,
    genreFilter,
    languageFilter,
    yearFilter,
    ratingFilter
  ].forEach(element => {

    element.addEventListener("change", () => {
      currentPage = 1;
      renderMovies();
    });

  });


  filterToggle.addEventListener("click", () => {
    filterPanel.classList.toggle("open");
  });


  function resetFilters() {

    searchInput.value = "";
    genreFilter.value = "";
    languageFilter.value = "";
    yearFilter.value = "";
    ratingFilter.value = "";
    sortSelect.value = "featured";

    currentPage = 1;

    renderMovies();
  }


  document.getElementById("resetFilters")
    .addEventListener("click", resetFilters);

  document.getElementById("emptyReset")
    .addEventListener("click", resetFilters);


  /* COLLECTION CATEGORY */

  document.querySelectorAll(".collection-card")
    .forEach(button => {

      button.addEventListener("click", () => {

        genreFilter.value = button.dataset.genre;

        currentPage = 1;

        renderMovies();

        document.getElementById("movies").scrollIntoView({
          behavior: "smooth"
        });

      });

    });


  /* MOVIE CARD CLICK — OPEN DETAILS PAGE */

  document.addEventListener("click", event => {

    const watchButton = event.target.closest(
      "[data-watchlist-id]"
    );

    if (watchButton) {

      event.preventDefault();
      event.stopPropagation();

      toggleWatchlist(watchButton.dataset.watchlistId);

      return;
    }

    const movieCardElement = event.target.closest(
      "[data-movie-id]"
    );

    if (movieCardElement) {

      const movieId = movieCardElement.dataset.movieId;

      window.location.href =
        `movie.html?id=${encodeURIComponent(movieId)}`;

    }

  });


  /* MOBILE MENU */

  const menuToggle = document.getElementById("menuToggle");
  const mainNav = document.getElementById("mainNav");

  menuToggle.addEventListener("click", () => {
    mainNav.classList.toggle("open");
  });

  mainNav.querySelectorAll("a").forEach(link => {

    link.addEventListener("click", () => {
      mainNav.classList.remove("open");
    });

  });


  /* SEARCH ICON */

  document.getElementById("searchToggle")
    .addEventListener("click", () => {

      searchInput.focus();

      document.getElementById("movies").scrollIntoView({
        behavior: "smooth"
      });

    });


  /* CURRENT YEAR */

  document.getElementById("currentYear").textContent =
    new Date().getFullYear();

  document.getElementById("totalMovies").textContent =
    `${movies.length}+`;


  /* INITIALIZE */

  populateYears();

  renderFeatured();

  renderMovies();

  renderWatchlist();

});
