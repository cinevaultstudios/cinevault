/* =========================================
   CINEVAULT — INTERACTIVE FEATURES
========================================= */

document.addEventListener("DOMContentLoaded", () => {

  // ELEMENTS
  const menuToggle = document.getElementById("menuToggle");
  const mainNav = document.getElementById("mainNav");

  const searchToggle = document.getElementById("searchToggle");
  const searchPanel = document.getElementById("searchPanel");
  const closeSearch = document.getElementById("closeSearch");
  const movieSearch = document.getElementById("movieSearch");

  const filterBar = document.getElementById("filterBar");
  const movieGrid = document.getElementById("movieGrid");
  const noResults = document.getElementById("noResults");

  const movieCards = [...document.querySelectorAll(".movie-card")];
  const filterButtons = [...document.querySelectorAll(".filter-button")];
  const genreLinks = [...document.querySelectorAll("[data-genre-link]")];

  let activeFilter = "all";
  let searchQuery = "";


  // MOBILE NAVIGATION
  if (menuToggle && mainNav) {

    menuToggle.addEventListener("click", () => {

      const isOpen = mainNav.classList.toggle("open");

      menuToggle.setAttribute("aria-expanded", String(isOpen));

    });

    mainNav.querySelectorAll("a").forEach(link => {

      link.addEventListener("click", () => {

        mainNav.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");

      });

    });

    document.addEventListener("click", event => {

      if (
        !mainNav.contains(event.target) &&
        !menuToggle.contains(event.target)
      ) {

        mainNav.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");

      }

    });

  }


  // SEARCH PANEL
  if (searchToggle && searchPanel) {

    searchToggle.addEventListener("click", () => {

      const isOpen = searchPanel.classList.toggle("open");

      if (isOpen && movieSearch) {
        movieSearch.focus();
      }

    });

  }

  if (closeSearch && searchPanel) {

    closeSearch.addEventListener("click", () => {

      searchPanel.classList.remove("open");

      if (movieSearch) {
        movieSearch.value = "";
        searchQuery = "";
        updateMovies();
      }

    });

  }


  // MOVIE SEARCH AND FILTER
  function updateMovies() {

    let visibleCount = 0;

    movieCards.forEach(card => {

      const title = (card.dataset.title || "").toLowerCase();
      const genre = (card.dataset.genre || "").toLowerCase();

      const matchesSearch =
        title.includes(searchQuery) ||
        genre.includes(searchQuery);

      const matchesFilter =
        activeFilter === "all" ||
        genre.split(/\s+/).includes(activeFilter);

      const visible = matchesSearch && matchesFilter;

      card.hidden = !visible;

      if (visible) {
        visibleCount++;
      }

    });

    if (noResults) {
      noResults.hidden = visibleCount !== 0;
    }

  }


  // SEARCH INPUT
  if (movieSearch) {

    movieSearch.addEventListener("input", event => {

      searchQuery = event.target.value.trim().toLowerCase();

      updateMovies();

    });

    movieSearch.addEventListener("keydown", event => {

      if (event.key === "Escape") {

        movieSearch.value = "";
        searchQuery = "";

        updateMovies();

        searchPanel.classList.remove("open");

      }

    });

  }


  // FILTER BUTTONS
  function setActiveFilter(filter) {

    activeFilter = filter;

    filterButtons.forEach(button => {

      const isActive = button.dataset.filter === filter;

      button.classList.toggle("active", isActive);

      button.setAttribute("aria-pressed", String(isActive));

    });

    updateMovies();

  }

  if (filterBar) {

    filterButtons.forEach(button => {

      button.addEventListener("click", () => {

        setActiveFilter(button.dataset.filter);

      });

    });

  }


  // GENRE CARDS
  genreLinks.forEach(link => {

    link.addEventListener("click", () => {

      const genre = link.dataset.genreLink;

      setActiveFilter(genre);

    });

  });


  // NAVIGATION ACTIVE STATE
  const navLinks = document.querySelectorAll(".nav-link");

  navLinks.forEach(link => {

    link.addEventListener("click", () => {

      navLinks.forEach(item => item.classList.remove("active"));

      link.classList.add("active");

    });

  });


  // CURRENT YEAR
  const currentYear = document.getElementById("currentYear");

  if (currentYear) {

    currentYear.textContent = new Date().getFullYear();

  }


  // INITIALIZE
  updateMovies();

});
