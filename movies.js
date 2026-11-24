
/* =========================================================
   CINEVAULT — D1 MOVIE API MODULE
   CLOUDFLARE WORKERS + D1 DATABASE

   PURPOSE:
   - Dynamic movie loading
   - Server-side pagination
   - Search and filtering
   - Movie details by ID or slug
   - Similar movies
   - Consistent API response normalization

   IMPORTANT:
   Cloudflare D1 is the single source of truth.
   This file does not contain static movie records.
   ========================================================= */

(function (global) {
  "use strict";

  /* =======================================================
     CONFIGURATION
  ======================================================= */

  const API_BASE = "/api/movies";

  const DEFAULT_PAGE_SIZE = 40;
  const MAX_PAGE_SIZE = 100;

  const ALLOWED_SORTS = [
    "newest",
    "oldest",
    "rating",
    "az",
    "za",
    "year"
  ];

  /* =======================================================
     HELPERS
  ======================================================= */

  function cleanText(value, fallback = "") {
    const result = String(value ?? "").trim();

    return result || fallback;
  }

  function safeNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number)
      ? number
      : fallback;
  }

  function safeInteger(value, fallback, min, max) {
    const number = Number(value);

    if (!Number.isSafeInteger(number)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, number));
  }

  function normalizeMovie(movie) {
    if (!movie || typeof movie !== "object") {
      throw new Error("Invalid movie data.");
    }

    return {
      ...movie,

      id: safeNumber(movie.id),

      title: cleanText(
        movie.title,
        "Untitled"
      ),

      slug: cleanText(movie.slug),

      description: cleanText(movie.description),

      poster: cleanText(movie.poster),

      backdrop: cleanText(movie.backdrop),

      year: safeNumber(movie.year, 0) || "",

      genre: cleanText(movie.genre),

      language: cleanText(movie.language),

      country: cleanText(movie.country),

      rating: safeNumber(movie.rating),

      duration: cleanText(movie.duration),

      director: cleanText(movie.director),

      quality: cleanText(movie.quality),

      featured: Boolean(
        Number(movie.featured) ||
        movie.featured === true
      ),

      watchUrl: cleanText(
        movie.watchUrl ?? movie.watch_url
      ),

      downloadUrl: cleanText(
        movie.downloadUrl ?? movie.download_url
      ),

      downloadUrl2: cleanText(
        movie.downloadUrl2 ?? movie.download_url_2
      ),

      adUrl: cleanText(
        movie.adUrl ?? movie.ad_url
      ),

      adCount: Math.max(
        4,
        safeInteger(
          movie.adCount ?? movie.ad_count,
          4,
          4,
          1000
        )
      )
    };
  }

  function normalizeResponse(data) {
    if (!data || data.success !== true) {
      throw new Error(
        data?.message || "Movie API request failed."
      );
    }

    return data;
  }

  /* =======================================================
     API REQUEST
  ======================================================= */

  async function request(url) {
    let response;

    try {
      response = await fetch(url, {
        method: "GET",

        headers: {
          Accept: "application/json"
        },

        cache: "no-store",

        credentials: "same-origin"
      });
    } catch {
      throw new Error(
        "Unable to connect to CineVault. Check your internet connection."
      );
    }

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error(
        "The server returned an invalid response."
      );
    }

    if (!response.ok) {
      throw new Error(
        data?.message ||
        `Movie request failed (${response.status}).`
      );
    }

    return normalizeResponse(data);
  }

  /* =======================================================
     BUILD QUERY PARAMETERS
  ======================================================= */

  function buildQuery(options = {}) {
    const params = new URLSearchParams();

    const page = safeInteger(
      options.page,
      1,
      1,
      1000000
    );

    const limit = safeInteger(
      options.limit,
      DEFAULT_PAGE_SIZE,
      1,
      MAX_PAGE_SIZE
    );

    params.set("page", String(page));
    params.set("limit", String(limit));

    const search = cleanText(
      options.q ?? options.search
    );

    if (search) {
      params.set("q", search.slice(0, 200));
    }

    const genre = cleanText(options.genre);

    if (genre) {
      params.set("genre", genre.slice(0, 100));
    }

    const language = cleanText(options.language);

    if (language) {
      params.set("language", language.slice(0, 100));
    }

    const year = Number(options.year);

    if (
      Number.isInteger(year) &&
      year >= 1800 &&
      year <= 3000
    ) {
      params.set("year", String(year));
    }

    if (
      options.minRating !== undefined &&
      options.minRating !== null &&
      options.minRating !== ""
    ) {
      const rating = Number(options.minRating);

      if (
        Number.isFinite(rating) &&
        rating >= 0 &&
        rating <= 10
      ) {
        params.set("minRating", String(rating));
      }
    }

    const sort = cleanText(options.sort);

    if (ALLOWED_SORTS.includes(sort)) {
      params.set("sort", sort);
    }

    return params;
  }

  /* =======================================================
     GET MOVIES
  ======================================================= */

  async function getMovies(options = {}) {
    const params = buildQuery(options);

    const data = await request(
      `${API_BASE}?${params.toString()}`
    );

    const movies = Array.isArray(data.movies)
      ? data.movies.map(normalizeMovie)
      : [];

    return {
      success: true,

      total: safeNumber(data.total),

      page: safeNumber(data.page, 1),

      limit: safeNumber(
        data.limit,
        DEFAULT_PAGE_SIZE
      ),

      totalPages: safeNumber(data.totalPages),

      movies
    };
  }

  /* =======================================================
     GET ALL MOVIES

     Fetches all matching records through pagination.
     Useful for integrations that need the full catalogue.
  ======================================================= */

  async function getAllMovies(options = {}) {
    const pageSize = safeInteger(
      options.limit,
      MAX_PAGE_SIZE,
      1,
      MAX_PAGE_SIZE
    );

    let page = 1;
    let totalPages = 1;

    const allMovies = [];

    do {
      const result = await getMovies({
        ...options,
        page,
        limit: pageSize
      });

      allMovies.push(...result.movies);

      totalPages = result.totalPages;

      page += 1;

    } while (page <= totalPages);

    return {
      success: true,
      total: allMovies.length,
      movies: allMovies
    };
  }

  /* =======================================================
     GET SINGLE MOVIE
     Supports numeric ID and alphanumeric slug.
  ======================================================= */

  async function getMovie(identifier) {
    const value = cleanText(identifier);

    if (
      !value ||
      !/^[a-zA-Z0-9-]+$/.test(value)
    ) {
      throw new Error("Invalid movie identifier.");
    }

    const data = await request(
      `${API_BASE}/${encodeURIComponent(value)}`
    );

    if (!data.movie) {
      throw new Error("Movie not found.");
    }

    return {
      success: true,

      movie: normalizeMovie(data.movie),

      similarMovies: Array.isArray(data.similarMovies)
        ? data.similarMovies.map(normalizeMovie)
        : []
    };
  }

  /* =======================================================
     PUBLIC API
  ======================================================= */

  const CineVaultMovies = Object.freeze({

    getMovies,

    getAllMovies,

    getMovie,

    getById: getMovie,

    getBySlug: getMovie,

    version: "2.0.0",

    source: "Cloudflare D1"

  });

  /* =======================================================
     GLOBAL EXPORT
  ======================================================= */

  global.CineVaultMovies = CineVaultMovies;

})(window);
