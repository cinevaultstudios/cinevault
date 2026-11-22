
/* CINEVAULT — POSTERS, SEARCH, FILTERS, DETAILS AND WATCHLIST */
document.addEventListener("DOMContentLoaded", () => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const grid = $("#movieGrid");
  const watchGrid = $("#watchlistGrid");
  const searchPanel = $("#searchPanel");
  const searchInput = $("#movieSearch");
  const filterButtons = $$(".filter-button");
  const modal = $("#movieModal");

  let activeFilter = "all";
  let query = "";
  let sortMode = "featured";
  let selectedMovie = null;
  let saved = readSaved();

  // Poster image sources for the sample catalogue.
  const posterImages = {
    "Inception": "https://image.tmdb.org/t/p/w500/pIkRyD18kl4FhoCNQuWxWu5cBLM.jpg",
    "Interstellar": "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MXLH0R9Z.jpg",
    "The Dark Knight": "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
    "Parasite": "https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
    "3 Idiots": "https://image.tmdb.org/t/p/w500/66A9MqXOyVFCssoloscw79z8Tew.jpg",
    "Your Name": "https://image.tmdb.org/t/p/w500/q719jXXEzOoYaps6cabZ9ykb3Xw.jpg",
    "Spirited Away": "https://image.tmdb.org/t/p/w500/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg",
    "The Shawshank Redemption": "https://image.tmdb.org/t/p/w500/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg",
    "Mad Max: Fury Road": "https://image.tmdb.org/t/p/w500/8tZYtuWezp8JbcsvHYO0O46tFbo.jpg",
    "Arrival": "https://image.tmdb.org/t/p/w500/x2FJsf1Elauf2ckkqCIGMck7Zq3.jpg",
    "Whiplash": "https://image.tmdb.org/t/p/w500/7fn624j5lj3xTme2SgiLCeuedmO.jpg",
    "The Grand Budapest Hotel": "https://image.tmdb.org/t/p/w500/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg",
    "Coco": "https://image.tmdb.org/t/p/w500/gGEsBPAijhVUFoiNpgZXqRVWJt2.jpg",
    "The Prestige": "https://image.tmdb.org/t/p/w500/5MXyQfz8xUP3dIFPT16grhT5n0.jpg",
    "Dune: Part Two": "https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg",
    "La La Land": "https://image.tmdb.org/t/p/w500/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg",
    "Train to Busan": "https://image.tmdb.org/t/p/w500/vNVFt6dtcqnI7hqa6LFBUibuFiw.jpg",
    "The Social Network": "https://image.tmdb.org/t/p/w500/n0ybibhJtQ5icDqTp8eRytcIHJx.jpg",
    "Everything Everywhere All at Once": "https://image.tmdb.org/t/p/w500/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg",
    "The Lion King": "https://image.tmdb.org/t/p/w500/2bXbqYdUdNVa8VIWXVfclP2ICtT.jpg"
  };

  function readSaved() {
    try {
      return JSON.parse(localStorage.getItem("cinevault-watchlist") || "[]");
    } catch {
      return [];
    }
  }

  function saveSaved() {
    localStorage.setItem("cinevault-watchlist", JSON.stringify(saved));
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function slug(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 1900);
  }

  function posterMarkup(movie, className = "poster-image") {
    const src = posterImages[movie.title];

    if (!src) return "";

    return `<img
      class="${className}"
      src="${src}"
      alt="${escapeHTML(movie.title)} poster"
      loading="lazy"
      onerror="this.remove()"
    >`;
  }

  function movieCard(movie) {
    const isSaved = saved.includes(movie.id);
    const genres = movie.genres.join(" · ");

    return `
      <article class="movie-card" data-id="${movie.id}">
        <div class="poster-art" style="--poster-bg:${movie.palette}">
          ${posterMarkup(movie)}
          <span class="poster-ornament">CINEVAULT / ${String(movie.id).padStart(2, "0")}</span>
          <div class="poster-fallback-title">
            <div class="poster-title">${escapeHTML(movie.title)}</div>
            <div class="poster-year">${movie.year} · ${escapeHTML(movie.language)}</div>
          </div>
          <button class="save-button ${isSaved ? "saved" : ""}"
            data-save="${movie.id}"
            aria-label="${isSaved ? "Remove from" : "Add to"} watchlist">
            ${isSaved ? "♥" : "＋"}
          </button>
          <div class="card-overlay">
            <span class="quick-view">VIEW DETAILS ↗</span>
          </div>
        </div>
        <div class="card-info">
          <div class="card-title-row">
            <h3 class="card-title">${escapeHTML(movie.title)}</h3>
            <span class="card-rating">★ ${movie.rating.toFixed(1)}</span>
          </div>
          <div class="card-sub">${movie.year} &nbsp;·&nbsp; ${escapeHTML(genres)}</div>
        </div>
      </article>`;
  }

  function filteredMovies() {
    let list = movies.filter(m => {
      const genreMatch =
        activeFilter === "all" ||
        m.genres.some(g => slug(g) === activeFilter);

      const text = [
        m.title, m.language, m.description, m.tag, ...m.genres
      ].join(" ").toLowerCase();

      return genreMatch && text.includes(query);
    });

    if (sortMode === "rating") list.sort((a, b) => b.rating - a.rating);
    else if (sortMode === "newest") list.sort((a, b) => b.year - a.year);
    else if (sortMode === "oldest") list.sort((a, b) => a.year - b.year);
    else if (sortMode === "title") list.sort((a, b) => a.title.localeCompare(b.title));
    else list.sort((a, b) =>
      (b.featured === true) - (a.featured === true) || b.rating - a.rating
    );

    return list;
  }

  function renderMovies() {
    const list = filteredMovies();
    grid.innerHTML = list.map(movieCard).join("");

    $("#movieCount").textContent = String(list.length).padStart(2, "0");
    $("#resultsLabel").textContent =
      `Showing ${list.length} ${list.length === 1 ? "film" : "films"}`;

    $("#noResults").hidden = list.length !== 0;
    $("#clearFilters").hidden = activeFilter === "all" && !query;
  }

  function renderWatchlist() {
    const list = movies.filter(m => saved.includes(m.id));

    watchGrid.innerHTML = list.map(movieCard).join("");
    $("#watchlistCount").textContent = `${list.length} SAVED`;
    $("#watchlistEmpty").hidden = list.length > 0;
  }

  function setFilter(filter) {
    activeFilter = filter;

    filterButtons.forEach(btn => {
      const on = btn.dataset.filter === filter;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", String(on));
    });

    renderMovies();
    $("#discover").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toggleSaved(id) {
    if (saved.includes(id)) {
      saved = saved.filter(x => x !== id);
      toast("Removed from your list");
    } else {
      saved.push(id);
      toast("Added to your list");
    }

    saveSaved();
    renderMovies();
    renderWatchlist();

    if (selectedMovie && selectedMovie.id === id) {
      updateModalSaveButton();
    }
  }

  function openMovie(id) {
    const movie = movies.find(m => m.id === Number(id));
    if (!movie) return;

    selectedMovie = movie;

    const poster = $("#modalPoster");
    poster.style.setProperty("--poster-bg", movie.palette);
    poster.innerHTML = `
      ${posterMarkup(movie, "modal-poster-image")}
      <span class="modal-poster-fallback">${escapeHTML(movie.title)}</span>
    `;

    $("#modalTitle").textContent = movie.title;
    $("#modalEyebrow").textContent = movie.tag.toUpperCase();
    $("#modalMeta").textContent =
      `★ ${movie.rating.toFixed(1)}   ·   ${movie.year}   ·   ${movie.duration}   ·   ${movie.language}`;

    $("#modalDescription").textContent = movie.description;

    $("#modalGenres").innerHTML = movie.genres
      .map(g => `<span>${escapeHTML(g)}</span>`)
      .join("");

    $("#officialInfoLink").href =
      `https://www.imdb.com/find/?q=${encodeURIComponent(movie.title)}`;

    updateModalSaveButton();

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    $("#modalClose").focus();
  }

  function updateModalSaveButton() {
    const btn = $("#modalWatchlist");
    const on = saved.includes(selectedMovie.id);
    btn.textContent = on ? "♥ Remove from my list" : "＋ Add to my list";
  }

  function closeModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  grid.addEventListener("click", e => {
    const save = e.target.closest("[data-save]");

    if (save) {
      e.stopPropagation();
      toggleSaved(Number(save.dataset.save));
      return;
    }

    const card = e.target.closest(".movie-card");
    if (card) openMovie(card.dataset.id);
  });

  watchGrid.addEventListener("click", e => {
    const save = e.target.closest("[data-save]");

    if (save) {
      e.stopPropagation();
      toggleSaved(Number(save.dataset.save));
      return;
    }

    const card = e.target.closest(".movie-card");
    if (card) openMovie(card.dataset.id);
  });

  filterButtons.forEach(btn =>
    btn.addEventListener("click", () => setFilter(btn.dataset.filter))
  );

  $$(".genre-tile").forEach(tile =>
    tile.addEventListener("click", () => setFilter(tile.dataset.genreLink))
  );

  $("#sortSelect").addEventListener("change", e => {
    sortMode = e.target.value;
    renderMovies();
  });

  $("#searchToggle").addEventListener("click", () => {
    searchPanel.classList.toggle("open");
    searchPanel.setAttribute(
      "aria-hidden",
      String(!searchPanel.classList.contains("open"))
    );

    if (searchPanel.classList.contains("open")) searchInput.focus();
  });

  $("#closeSearch").addEventListener("click", () => {
    searchPanel.classList.remove("open");
    searchPanel.setAttribute("aria-hidden", "true");
    searchInput.value = "";
    query = "";
    renderMovies();
  });

  searchInput.addEventListener("input", e => {
    query = e.target.value.trim().toLowerCase();
    renderMovies();
  });

  searchInput.addEventListener("keydown", e => {
    if (e.key === "Escape") $("#closeSearch").click();
  });

  $("#clearFilters").addEventListener("click", () => {
    activeFilter = "all";
    query = "";
    searchInput.value = "";

    filterButtons.forEach(b => {
      const on = b.dataset.filter === "all";
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });

    renderMovies();
  });

  $("#resetSearch").addEventListener("click", () => $("#clearFilters").click());

  $("#trendingExplore").addEventListener("click", () => {
    activeFilter = "all";
    query = "";
    searchInput.value = "";
    renderMovies();
  });

  $("#modalClose").addEventListener("click", closeModal);

  modal.addEventListener("click", e => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && modal.classList.contains("open")) closeModal();
  });

  $("#modalWatchlist").addEventListener("click", () => {
    if (selectedMovie) toggleSaved(selectedMovie.id);
  });

  const menu = $("#menuToggle");
  const nav = $("#mainNav");

  menu.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menu.setAttribute("aria-expanded", String(open));
  });

  $$(".nav-link").forEach(link => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      menu.setAttribute("aria-expanded", "false");

      $$(".nav-link").forEach(a =>
        a.classList.toggle("active", a === link)
      );
    });
  });

  $("#currentYear").textContent = new Date().getFullYear();

  renderMovies();
  renderWatchlist();
});
