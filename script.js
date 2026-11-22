/* ========================================
   CINEVAULT — INTERACTIVE FEATURES
======================================== */

document.addEventListener("DOMContentLoaded", () => {

  const movieGrid = document.getElementById("movie-grid");
  const searchButton = document.querySelector(".search-toggle");
  const menuButton = document.querySelector(".menu-toggle");
  const navigation = document.querySelector(".main-nav");

  // 1. MOBILE NAVIGATION MENU
  if (menuButton && navigation) {
    menuButton.addEventListener("click", () => {
      const isOpen = menuButton.getAttribute("aria-expanded") === "true";

      menuButton.setAttribute("aria-expanded", String(!isOpen));

      if (!isOpen) {
        navigation.style.display = "flex";
        navigation.style.flexDirection = "column";
        navigation.style.position = "absolute";
        navigation.style.top = "68px";
        navigation.style.left = "0";
        navigation.style.right = "0";
        navigation.style.padding = "22px 5%";
        navigation.style.background = "#111";
        navigation.style.borderBottom = "1px solid rgba(214,180,106,.3)";
        navigation.style.alignItems = "flex-start";
        navigation.style.zIndex = "200";
      } else {
        navigation.removeAttribute("style");
      }
    });
  }

  // 2. MOVIE SEARCH PANEL
  if (searchButton && movieGrid) {

    const searchPanel = document.createElement("div");

    searchPanel.className = "search-panel";

    searchPanel.innerHTML = `
      <div class="container search-inner">
        <input
          type="search"
          id="movie-search"
          placeholder="Search for a movie..."
          aria-label="Search movies"
        >
        <button type="button" id="close-search" aria-label="Close search">
          ✕
        </button>
      </div>
    `;

    searchPanel.style.display = "none";
    searchPanel.style.padding = "20px 0";
    searchPanel.style.background = "#151515";
    searchPanel.style.borderBottom = "1px solid rgba(214,180,106,.2)";

    document.querySelector(".site-header").after(searchPanel);

    const searchInput = searchPanel.querySelector("#movie-search");
    const closeButton = searchPanel.querySelector("#close-search");

    function filterMovies() {
      const query = searchInput.value.trim().toLowerCase();
      const cards = movieGrid.querySelectorAll(".movie-card");

      cards.forEach((card) => {
        const movieName = card.textContent.toLowerCase();

        card.style.display = movieName.includes(query) ? "" : "none";
      });
    }

    searchButton.addEventListener("click", () => {
      const isVisible = searchPanel.style.display !== "none";

      searchPanel.style.display = isVisible ? "none" : "block";

      if (!isVisible) {
        searchInput.focus();
      } else {
        searchInput.value = "";
        filterMovies();
      }
    });

    searchInput.addEventListener("input", filterMovies);

    closeButton.addEventListener("click", () => {
      searchPanel.style.display = "none";
      searchInput.value = "";
      filterMovies();
    });

    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeButton.click();
      }
    });
  }

  // 3. CLOSE MOBILE MENU AFTER NAVIGATION
  if (navigation && menuButton) {
    navigation.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        if (window.innerWidth <= 600) {
          navigation.removeAttribute("style");
          menuButton.setAttribute("aria-expanded", "false");
        }
      });
    });
  }

  // 4. CURRENT YEAR IN FOOTER
  const footerText = document.querySelector(".footer-inner p");

  if (footerText) {
    footerText.textContent =
      `© ${new Date().getFullYear()} CineVault. All rights reserved.`;
  }

  console.log("CineVault is ready!");

});
