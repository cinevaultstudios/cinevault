
/* =========================================================
   CINEVAULT — CLOUDFLARE WORKER
   D1 DATABASE • ADMIN AUTH • MOVIE CRUD
   COLLECTION CRUD • WEBSITE SETTINGS • CLOUDINARY UPLOAD
   SAFE DATABASE MIGRATIONS • SEARCH • FILTER • PAGINATION
   INDIVIDUAL MOVIE API
   ========================================================= */

const COOKIE_NAME = "cinevault_admin";
const SESSION_SECONDS = 8 * 60 * 60;
const CLOUDINARY_CLOUD_NAME = "v9vl1rze";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_PAGE_SIZE = 100;

let schemaPromise = null;

/* =========================================================
   RESPONSE HELPERS
========================================================= */

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    }
  });
}

function errorResponse(message, status = 400) {
  return json({
    success: false,
    message
  }, status);
}

async function readJson(request) {
  try {
    const data = await request.json();

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      throw new Error("Invalid JSON data");
    }

    return data;
  } catch {
    throw new Error("Invalid JSON request");
  }
}

function textValue(value, maxLength = 10000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);

  if (!Number.isSafeInteger(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}

/* =========================================================
   DEFAULT WEBSITE SETTINGS
========================================================= */

const DEFAULT_SETTINGS = {
  siteName: "CINEVAULT",
  logoText: "C",

  heroEyebrow: "YOUR WORLD OF CINEMA",
  heroEyebrowUrl: "",
  heroTitle: "Discover Stories.",
  heroTitleUrl: "",
  heroHighlight: "Experience Cinema.",
  heroHighlightUrl: "",
  heroDescription: "Explore a curated world of movies, discover hidden gems and find your next unforgettable experience.",
  heroDescriptionUrl: "",
  heroImage: "",
  heroButton1Text: "Explore Movies",
  heroButton1Url: "#movies",
  heroButton2Text: "Browse Collections",
  heroButton2Url: "#collections",

  collectionsEyebrow: "EXPLORE BY CATEGORY",
  collectionsEyebrowUrl: "",
  collectionsHeading: "Movie",
  collectionsHeadingHighlight: "Collections",
  collectionsHeadingUrl: "",
  collectionsDescription: "Discover movies from your favourite genres.",
  collectionsDescriptionUrl: "",

  moviesEyebrow: "YOUR NEXT WATCH",
  moviesEyebrowUrl: "",
  moviesHeading: "Explore",
  moviesHeadingHighlight: "Movies",
  moviesHeadingUrl: "",
  moviesDescription: "Browse the latest additions and discover your next favourite movie.",
  moviesDescriptionUrl: "",

  footerDescription: "Discover cinema. Explore stories. Build your collection.",
  footerDescriptionUrl: "",
  footerTagline: "Made for movie lovers.",
  footerTaglineUrl: "",
  copyrightText: "All rights reserved.",
  copyrightUrl: "",

  aboutEyebrow: "WELCOME TO CINEVAULT",
  aboutEyebrowUrl: "",
  aboutTitle: "More Than Movies.",
  aboutTitleUrl: "",
  aboutHighlight: "A Cinema Experience.",
  aboutHighlightUrl: "",
  aboutDescription: "CineVault brings together movie discovery, curated collections and a personal watchlist in one elegant destination.",
  aboutDescriptionUrl: "",
  aboutButtonText: "Discover Movies",
  aboutButtonUrl: "#movies"
};

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);

const URL_SETTING_KEYS = [
  "heroEyebrowUrl",
  "heroTitleUrl",
  "heroHighlightUrl",
  "heroDescriptionUrl",
  "heroButton1Url",
  "heroButton2Url",
  "collectionsEyebrowUrl",
  "collectionsHeadingUrl",
  "collectionsDescriptionUrl",
  "moviesEyebrowUrl",
  "moviesHeadingUrl",
  "moviesDescriptionUrl",
  "footerDescriptionUrl",
  "footerTaglineUrl",
  "copyrightUrl",
  "aboutEyebrowUrl",
  "aboutTitleUrl",
  "aboutHighlightUrl",
  "aboutDescriptionUrl",
  "aboutButtonUrl"
];

/* =========================================================
   DATABASE HELPERS
========================================================= */

async function getTableColumns(db, tableName) {
  const allowed = ["movies", "collections"];

  if (!allowed.includes(tableName)) {
    throw new Error("Invalid database table");
  }

  const result = await db.prepare(
    `PRAGMA table_info(${tableName})`
  ).all();

  return new Set(
    (result.results || []).map(column => column.name)
  );
}

async function addMissingColumns(db, tableName, definitions) {
  const existing = await getTableColumns(db, tableName);

  for (const [column, definition] of Object.entries(definitions)) {
    if (existing.has(column)) continue;

    await db.prepare(
      `ALTER TABLE ${tableName} ADD COLUMN ${column} ${definition}`
    ).run();
  }
}

/* =========================================================
   SAFE DATABASE SCHEMA & MIGRATIONS
========================================================= */

async function ensureCustomizationSchema(env) {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const db = env.DB;

      /* MOVIES TABLE */

      await db.prepare(`
        CREATE TABLE IF NOT EXISTS movies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          slug TEXT,
          description TEXT DEFAULT '',
          poster TEXT DEFAULT '',
          backdrop TEXT DEFAULT '',
          year INTEGER,
          genre TEXT DEFAULT '',
          rating REAL DEFAULT 0,
          duration TEXT DEFAULT '',
          language TEXT DEFAULT '',
          country TEXT DEFAULT '',
          director TEXT DEFAULT '',
          quality TEXT DEFAULT '',
          featured INTEGER DEFAULT 0,
          download_url TEXT DEFAULT '',
          download_url_2 TEXT DEFAULT '',
          watch_url TEXT DEFAULT '',
          ad_url TEXT DEFAULT '',
          ad_count INTEGER DEFAULT 4,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      /* Add missing fields without deleting old data. */

      await addMissingColumns(db, "movies", {
        slug: "TEXT",
        description: "TEXT DEFAULT ''",
        poster: "TEXT DEFAULT ''",
        backdrop: "TEXT DEFAULT ''",
        year: "INTEGER",
        genre: "TEXT DEFAULT ''",
        rating: "REAL DEFAULT 0",
        duration: "TEXT DEFAULT ''",
        language: "TEXT DEFAULT ''",
        country: "TEXT DEFAULT ''",
        director: "TEXT DEFAULT ''",
        quality: "TEXT DEFAULT ''",
        featured: "INTEGER DEFAULT 0",
        download_url: "TEXT DEFAULT ''",
        download_url_2: "TEXT DEFAULT ''",
        watch_url: "TEXT DEFAULT ''",
        ad_url: "TEXT DEFAULT ''",
        ad_count: "INTEGER DEFAULT 4",
        created_at: "TEXT DEFAULT CURRENT_TIMESTAMP",
        updated_at: "TEXT DEFAULT CURRENT_TIMESTAMP"
      });

      /* Existing NULL values are normalized safely. */

      await db.prepare(`
        UPDATE movies
        SET
          description = COALESCE(description, ''),
          poster = COALESCE(poster, ''),
          backdrop = COALESCE(backdrop, ''),
          genre = COALESCE(genre, ''),
          rating = COALESCE(rating, 0),
          duration = COALESCE(duration, ''),
          language = COALESCE(language, ''),
          country = COALESCE(country, ''),
          director = COALESCE(director, ''),
          quality = COALESCE(quality, ''),
          featured = COALESCE(featured, 0),
          download_url = COALESCE(download_url, ''),
          download_url_2 = COALESCE(download_url_2, ''),
          watch_url = COALESCE(watch_url, ''),
          ad_url = COALESCE(ad_url, ''),
          ad_count = CASE
            WHEN ad_count IS NULL OR ad_count < 4 THEN 4
            ELSE ad_count
          END
      `).run();

      /* COLLECTIONS TABLE */

      await db.prepare(`
        CREATE TABLE IF NOT EXISTS collections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT DEFAULT '',
          image TEXT DEFAULT '',
          icon TEXT DEFAULT '',
          genre TEXT DEFAULT '',
          link_url TEXT DEFAULT '',
          sort_order INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      await addMissingColumns(db, "collections", {
        description: "TEXT DEFAULT ''",
        image: "TEXT DEFAULT ''",
        icon: "TEXT DEFAULT ''",
        genre: "TEXT DEFAULT ''",
        link_url: "TEXT DEFAULT ''",
        sort_order: "INTEGER DEFAULT 0",
        is_active: "INTEGER DEFAULT 1",
        created_at: "TEXT DEFAULT CURRENT_TIMESTAMP",
        updated_at: "TEXT DEFAULT CURRENT_TIMESTAMP"
      });

      /* WEBSITE SETTINGS TABLE */

      await db.prepare(`
        CREATE TABLE IF NOT EXISTS site_settings (
          setting_key TEXT PRIMARY KEY,
          setting_value TEXT NOT NULL DEFAULT '',
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      /* INDEXES */

      const indexes = [
        "CREATE INDEX IF NOT EXISTS idx_movies_title ON movies(title)",
        "CREATE INDEX IF NOT EXISTS idx_movies_year ON movies(year)",
        "CREATE INDEX IF NOT EXISTS idx_movies_genre ON movies(genre)",
        "CREATE INDEX IF NOT EXISTS idx_movies_language ON movies(language)",
        "CREATE INDEX IF NOT EXISTS idx_movies_rating ON movies(rating)",
        "CREATE INDEX IF NOT EXISTS idx_movies_featured ON movies(featured)",
        "CREATE INDEX IF NOT EXISTS idx_movies_slug ON movies(slug)",
        "CREATE INDEX IF NOT EXISTS idx_movies_created ON movies(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_collections_sort ON collections(sort_order)",
        "CREATE INDEX IF NOT EXISTS idx_collections_active ON collections(is_active)"
      ];

      for (const sql of indexes) {
        await db.prepare(sql).run();
      }

      /* Seed only missing settings. */

      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await db.prepare(`
          INSERT OR IGNORE INTO site_settings
          (setting_key, setting_value)
          VALUES (?, ?)
        `).bind(key, value).run();
      }

      /* Seed default collections only when absent. */

      const defaults = [
        ["Action", "Thrilling adventures", "⚔", "Action", 1],
        ["Drama", "Stories that move you", "◈", "Drama", 2],
        ["Sci-Fi", "Beyond imagination", "✧", "Sci-Fi", 3],
        ["Thriller", "Feel the suspense", "◉", "Thriller", 4],
        ["Romance", "Stories of love", "♡", "Romance", 5],
        ["Comedy", "Enjoy every moment", "☻", "Comedy", 6]
      ];

      for (const item of defaults) {
        await db.prepare(`
          INSERT INTO collections
          (name, description, icon, genre, sort_order, is_active)
          SELECT ?, ?, ?, ?, ?, 1
          WHERE NOT EXISTS (
            SELECT 1 FROM collections WHERE LOWER(name) = LOWER(?)
          )
        `).bind(
          item[0],
          item[1],
          item[2],
          item[3],
          item[4],
          item[0]
        ).run();
      }
    })().catch(error => {
      schemaPromise = null;
      throw error;
    });
  }

  return schemaPromise;
}

/* =========================================================
   SESSION & AUTHENTICATION
========================================================= */

function toBase64Url(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value) {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);

  return Uint8Array.from(
    binary,
    character => character.charCodeAt(0)
  );
}

async function hmacKey(password) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signSession(password, payload) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(password),
    new TextEncoder().encode(payload)
  );

  return toBase64Url(new Uint8Array(signature));
}

async function verifySession(request, password) {
  const cookieHeader = request.headers.get("Cookie") || "";

  const cookie = cookieHeader
    .split(";")
    .map(item => item.trim())
    .find(item => item.startsWith(COOKIE_NAME + "="));

  if (!cookie) return false;

  try {
    const token = cookie.slice(COOKIE_NAME.length + 1);
    const parts = token.split(".");

    if (parts.length !== 3) return false;

    const [expires, nonce, signature] = parts;

    if (!/^\d+$/.test(expires)) return false;

    if (Number(expires) <= Math.floor(Date.now() / 1000)) {
      return false;
    }

    const payload = `${expires}.${nonce}`;

    return await crypto.subtle.verify(
      "HMAC",
      await hmacKey(password),
      fromBase64Url(signature),
      new TextEncoder().encode(payload)
    );
  } catch {
    return false;
  }
}

function sessionCookie(token, maxAge) {
  return [
    `${COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${maxAge}`
  ].join("; ");
}

function clearSessionCookie() {
  return [
    `${COOKIE_NAME}=`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Path=/",
    "Max-Age=0"
  ].join("; ");
}

async function createSession(password) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const random = crypto.getRandomValues(new Uint8Array(16));
  const nonce = toBase64Url(random);
  const payload = `${expires}.${nonce}`;
  const signature = await signSession(password, payload);

  return `${payload}.${signature}`;
}

function validOrigin(request, url) {
  return request.headers.get("Origin") === url.origin;
}

/* =========================================================
   URL VALIDATION
========================================================= */

function validUrl(value) {
  const input = String(value ?? "").trim();

  if (!input) return "";

  if (/[\u0000-\u001F\u007F]/.test(input)) {
    throw new Error("Invalid URL");
  }

  let parsed;

  try {
    parsed = new URL(input);
  } catch {
    throw new Error("Please provide a valid HTTP or HTTPS URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are allowed");
  }

  return parsed.toString();
}

function validLink(value) {
  const input = String(value ?? "").trim();

  if (!input) return "";

  if (/[\u0000-\u001F\u007F]/.test(input)) {
    throw new Error("Invalid link");
  }

  if (/^javascript:/i.test(input) || /^data:/i.test(input)) {
    throw new Error("Unsafe link is not allowed");
  }

  if (input.startsWith("#")) {
    return input;
  }

  if (input.startsWith("//") || input.startsWith("\\\\")) {
    throw new Error("Protocol-relative links are not allowed");
  }

  if (input.startsWith("/")) {
    return input;
  }

  if (input.startsWith("./") || input.startsWith("../")) {
    return input;
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input)) {
    return validUrl(input);
  }

  if (input.includes("\\")) {
    throw new Error("Invalid link");
  }

  return input;
}

/* =========================================================
   MOVIE DATA
========================================================= */

function cleanMovie(data) {
  const title = textValue(data.title, 200);

  if (!title) {
    throw new Error("Movie title is required");
  }

  const yearInput = data.year;

  let year = null;

  if (yearInput !== "" && yearInput !== null && yearInput !== undefined) {
    year = Number(yearInput);

    if (!Number.isInteger(year) || year < 1888 || year > 2100) {
      throw new Error("Please provide a valid release year");
    }
  }

  const ratingInput = data.rating ?? 0;
  const rating = Number(ratingInput);

  if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
    throw new Error("Rating must be between 0 and 10");
  }

  const rawAdCount = data.adCount ?? data.ad_count ?? 4;
  const adCount = Number(rawAdCount);

  if (!Number.isSafeInteger(adCount) || adCount < 4 || adCount > 1000) {
    throw new Error("Advertisement count must be a whole number from 4 to 1000");
  }

  return {
    title,
    description: textValue(data.description, 20000),
    poster: validUrl(data.poster),
    backdrop: validUrl(data.backdrop),
    year,
    genre: textValue(data.genre, 500),
    rating,
    duration: textValue(data.duration, 100),
    language: textValue(data.language, 200),
    country: textValue(data.country, 200),
    director: textValue(data.director, 300),
    quality: textValue(data.quality, 100),
    featured: 0,
    download_url: validUrl(data.downloadUrl ?? data.download_url ?? ""),
    download_url_2: validUrl(data.downloadUrl2 ?? data.download_url_2 ?? ""),
    watch_url: validUrl(data.watchUrl ?? data.watch_url ?? ""),
    ad_url: validUrl(data.adUrl ?? data.ad_url ?? ""),
    ad_count: adCount
  };
}

function makeSlug(title) {
  const slug = String(title)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 150);

  return slug || "movie";
}

async function uniqueMovieSlug(db, title, excludeId = null) {
  const base = makeSlug(title);
  let candidate = base;
  let counter = 2;

  while (true) {
    let query = "SELECT id FROM movies WHERE slug = ?";
    const bindings = [candidate];

    if (excludeId !== null) {
      query += " AND id != ?";
      bindings.push(excludeId);
    }

    const existing = await db.prepare(query)
      .bind(...bindings)
      .first();

    if (!existing) return candidate;

    candidate = `${base}-${counter}`;
    counter++;
  }
}

const MOVIE_SELECT = `
  SELECT
    id,
    title,
    slug,
    description,
    poster,
    backdrop,
    year,
    genre,
    rating,
    duration,
    language,
    country,
    director,
    quality,
    featured,
    download_url AS downloadUrl,
    download_url_2 AS downloadUrl2,
    watch_url AS watchUrl,
    ad_url AS adUrl,
    ad_count AS adCount,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM movies
`;

/* =========================================================
   COLLECTION DATA
========================================================= */

function cleanCollection(data) {
  const name = textValue(data.name, 150);

  if (!name) {
    throw new Error("Collection name is required");
  }

  const rawSortOrder = data.sortOrder ?? data.sort_order ?? 0;
  const sortOrder = Number(rawSortOrder);

  if (!Number.isFinite(sortOrder)) {
    throw new Error("Invalid collection sort order");
  }

  const rawActive = data.isActive ?? data.is_active;

  return {
    name,
    description: textValue(data.description, 3000),
    image: validUrl(data.image),
    icon: textValue(data.icon, 100),
    genre: textValue(data.genre, 200),
    link_url: validLink(data.linkUrl ?? data.link_url ?? ""),
    sort_order: Math.trunc(sortOrder),
    is_active:
      rawActive === false ||
      rawActive === 0 ||
      rawActive === "0"
        ? 0
        : 1
  };
}

/* =========================================================
   WEBSITE SETTINGS
========================================================= */

async function getSettings(env) {
  const result = await env.DB.prepare(`
    SELECT setting_key, setting_value
    FROM site_settings
  `).all();

  const settings = { ...DEFAULT_SETTINGS };

  for (const row of result.results || []) {
    settings[row.setting_key] = row.setting_value;
  }

  return settings;
}

async function saveSettings(env, data) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error("Invalid settings data");
  }

  for (const key of SETTING_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      continue;
    }

    let value = textValue(data[key], 10000);

    if (key === "heroImage") {
      value = validUrl(value);
    }

    if (URL_SETTING_KEYS.includes(key)) {
      value = validLink(value);
    }

    await env.DB.prepare(`
      INSERT INTO site_settings
      (setting_key, setting_value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        updated_at = CURRENT_TIMESTAMP
    `).bind(key, value).run();
  }

  return getSettings(env);
}

/* =========================================================
   CLOUDINARY IMAGE UPLOAD
========================================================= */

async function uploadToCloudinary(request, env) {
  if (!env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    return errorResponse(
      "Cloudinary credentials are not configured",
      500
    );
  }

  let form;

  try {
    form = await request.formData();
  } catch {
    return errorResponse("Invalid upload form", 400);
  }

  const file = form.get("file");
  const type = textValue(form.get("type") || "poster", 30);

  if (!file || typeof file.arrayBuffer !== "function") {
    return errorResponse("Please select an image", 400);
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif"
  ];

  const allowedCategories = [
    "poster",
    "backdrop",
    "hero",
    "collection",
    "logo"
  ];

  if (!allowedCategories.includes(type)) {
    return errorResponse("Invalid image type", 400);
  }

  if (!allowedTypes.includes(file.type)) {
    return errorResponse(
      "Only JPG, PNG, WEBP and AVIF images are allowed",
      400
    );
  }

  if (file.size <= 0 || file.size > MAX_IMAGE_SIZE) {
    return errorResponse(
      "Image size must be between 1 byte and 5 MB",
      400
    );
  }

  const cloudForm = new FormData();

  cloudForm.set("file", file, file.name || "image");
  cloudForm.set("folder", `cinevault/${type}`);

  const credentials = btoa(
    `${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`
  );

  let cloudResponse;

  try {
    cloudResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`
        },
        body: cloudForm
      }
    );
  } catch {
    return errorResponse("Could not connect to Cloudinary", 502);
  }

  let result;

  try {
    result = await cloudResponse.json();
  } catch {
    return errorResponse("Invalid response from Cloudinary", 502);
  }

  if (!cloudResponse.ok || !result.secure_url) {
    return errorResponse(
      result.error?.message || "Cloudinary upload failed",
      502
    );
  }

  return json({
    success: true,
    message: "Image uploaded successfully",
    url: result.secure_url,
    publicId: result.public_id,
    type
  });
}

/* =========================================================
   MOVIE QUERY BUILDER
========================================================= */

function buildMovieFilters(url) {
  const conditions = [];
  const values = [];

  const search = textValue(url.searchParams.get("q"), 200);

  if (search) {
    conditions.push(`
      (
        title LIKE ?
        OR genre LIKE ?
        OR language LIKE ?
        OR country LIKE ?
        OR director LIKE ?
        OR description LIKE ?
      )
    `);

    const term = `%${search}%`;

    values.push(term, term, term, term, term, term);
  }

  const genre = textValue(url.searchParams.get("genre"), 100);

  if (genre) {
    conditions.push("genre LIKE ?");
    values.push(`%${genre}%`);
  }

  const language = textValue(url.searchParams.get("language"), 100);

  if (language) {
    conditions.push("language = ?");
    values.push(language);
  }

  const year = url.searchParams.get("year");

  if (year && /^\d{4}$/.test(year)) {
    conditions.push("year = ?");
    values.push(Number(year));
  }

  const minRating = url.searchParams.get("minRating");

  if (minRating !== null && minRating !== "") {
    const rating = Number(minRating);

    if (Number.isFinite(rating) && rating >= 0 && rating <= 10) {
      conditions.push("rating >= ?");
      values.push(rating);
    }
  }

  return {
    where: conditions.length
      ? ` WHERE ${conditions.join(" AND ")}`
      : "",
    values
  };
}

function getMovieOrder(url) {
  const sort = url.searchParams.get("sort");

  const allowed = {
    newest: "id DESC",
    oldest: "id ASC",
    rating: "rating DESC, id DESC",
    az: "title COLLATE NOCASE ASC",
    za: "title COLLATE NOCASE DESC",
    year: "year DESC, id DESC"
  };

  return allowed[sort] || "id DESC";
}

async function getMovies(env, url) {
  const { where, values } = buildMovieFilters(url);
  const order = getMovieOrder(url);

  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM movies${where}`
  ).bind(...values).first();

  const total = Number(countResult?.total || 0);

  const pageParam = url.searchParams.get("page");
  const limitParam = url.searchParams.get("limit");

  /*
    Backward compatibility:
    No page/limit query means return all movies,
    matching the current Homepage and Admin scripts.
  */

  if (pageParam === null && limitParam === null) {
    const result = await env.DB.prepare(
      MOVIE_SELECT + where + ` ORDER BY ${order}`
    ).bind(...values).all();

    return {
      success: true,
      total,
      page: 1,
      limit: total,
      totalPages: total > 0 ? 1 : 0,
      movies: result.results || []
    };
  }

  const page = clampInteger(pageParam, 1, 1, 1000000);
  const limit = clampInteger(limitParam, 40, 1, MAX_PAGE_SIZE);
  const offset = (page - 1) * limit;

  const result = await env.DB.prepare(
    MOVIE_SELECT + where + ` ORDER BY ${order} LIMIT ? OFFSET ?`
  ).bind(...values, limit, offset).all();

  return {
    success: true,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    movies: result.results || []
  };
}

/* =========================================================
   SINGLE MOVIE API
========================================================= */

async function getSingleMovie(env, identifier) {
  const numericId = /^\d+$/.test(identifier)
    ? Number(identifier)
    : null;

  let movie = null;

  if (numericId !== null) {
    movie = await env.DB.prepare(
      MOVIE_SELECT + " WHERE id = ? LIMIT 1"
    ).bind(numericId).first();
  } else {
    movie = await env.DB.prepare(
      MOVIE_SELECT + " WHERE slug = ? LIMIT 1"
    ).bind(identifier).first();
  }

  if (!movie) return null;

  let similarMovies = [];

  if (movie.genre) {
    const firstGenre = String(movie.genre)
      .split(",")[0]
      .trim();

    if (firstGenre) {
      const result = await env.DB.prepare(`
        ${MOVIE_SELECT}
        WHERE id != ?
          AND genre LIKE ?
        ORDER BY rating DESC, id DESC
        LIMIT 8
      `).bind(
        movie.id,
        `%${firstGenre}%`
      ).all();

      similarMovies = result.results || [];
    }
  }

  return {
    movie,
    similarMovies
  };
}

/* =========================================================
   ADMIN API
========================================================= */

async function handleAdmin(request, env, url) {
  const password = env.ADMIN_PASSWORD;

  if (!password) {
    return errorResponse(
      "Admin password is not configured",
      500
    );
  }

  const path = url.pathname;
  const method = request.method;

  /* LOGIN */

  if (path === "/api/admin/login" && method === "POST") {
    if (!validOrigin(request, url)) {
      return errorResponse("Invalid origin", 403);
    }

    let data;

    try {
      data = await readJson(request);
    } catch {
      return errorResponse("Invalid login request", 400);
    }

    const supplied = String(data.password || "");
    const encoder = new TextEncoder();

    const expectedHash = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(password)
      )
    );

    const suppliedHash = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(supplied)
      )
    );

    let difference = 0;

    for (let i = 0; i < expectedHash.length; i++) {
      difference |= expectedHash[i] ^ suppliedHash[i];
    }

    if (difference !== 0) {
      return errorResponse("Incorrect password", 401);
    }

    const token = await createSession(password);

    return json({
      success: true,
      message: "Login successful"
    }, 200, {
      "Set-Cookie": sessionCookie(token, SESSION_SECONDS)
    });
  }

  /* LOGOUT */

  if (path === "/api/admin/logout" && method === "POST") {
    if (!validOrigin(request, url)) {
      return errorResponse("Invalid origin", 403);
    }

    return json({
      success: true,
      message: "Logged out"
    }, 200, {
      "Set-Cookie": clearSessionCookie()
    });
  }

  const authorized = await verifySession(request, password);

  if (path === "/api/admin/session" && method === "GET") {
    return json({
      success: true,
      authenticated: authorized
    });
  }

  if (!authorized) {
    return errorResponse("Please login first", 401);
  }

  if (method !== "GET" && !validOrigin(request, url)) {
    return errorResponse("Invalid origin", 403);
  }

  /* IMAGE UPLOAD */

  if (path === "/api/admin/upload" && method === "POST") {
    return uploadToCloudinary(request, env);
  }

  /* WEBSITE SETTINGS */

  if (path === "/api/admin/settings" && method === "GET") {
    return json({
      success: true,
      settings: await getSettings(env)
    });
  }

  if (path === "/api/admin/settings" && method === "PUT") {
    try {
      const settings = await saveSettings(
        env,
        await readJson(request)
      );

      return json({
        success: true,
        message: "Website settings saved successfully",
        settings
      });
    } catch (error) {
      return errorResponse(error.message, 400);
    }
  }

  /* COLLECTION LIST */

  if (path === "/api/admin/collections" && method === "GET") {
    const result = await env.DB.prepare(`
      SELECT
        id,
        name,
        description,
        image,
        icon,
        genre,
        link_url AS linkUrl,
        sort_order AS sortOrder,
        is_active AS isActive,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM collections
      ORDER BY sort_order ASC, id ASC
    `).all();

    return json({
      success: true,
      total: result.results.length,
      collections: result.results
    });
  }

  /* ADD COLLECTION */

  if (path === "/api/admin/collections" && method === "POST") {
    try {
      const item = cleanCollection(await readJson(request));

      const result = await env.DB.prepare(`
        INSERT INTO collections (
          name,
          description,
          image,
          icon,
          genre,
          link_url,
          sort_order,
          is_active
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        item.name,
        item.description,
        item.image,
        item.icon,
        item.genre,
        item.link_url,
        item.sort_order,
        item.is_active
      ).run();

      return json({
        success: true,
        message: "Collection added successfully",
        id: result.meta.last_row_id
      }, 201);
    } catch (error) {
      return errorResponse(error.message, 400);
    }
  }

  /* EDIT / DELETE COLLECTION */

  const collectionMatch = path.match(
    /^\/api\/admin\/collections\/(\d+)$/
  );

  if (collectionMatch) {
    const id = Number(collectionMatch[1]);

    if (method === "PUT") {
      try {
        const item = cleanCollection(await readJson(request));

        const result = await env.DB.prepare(`
          UPDATE collections SET
            name = ?,
            description = ?,
            image = ?,
            icon = ?,
            genre = ?,
            link_url = ?,
            sort_order = ?,
            is_active = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          item.name,
          item.description,
          item.image,
          item.icon,
          item.genre,
          item.link_url,
          item.sort_order,
          item.is_active,
          id
        ).run();

        if (!result.meta.changes) {
          return errorResponse("Collection not found", 404);
        }

        return json({
          success: true,
          message: "Collection updated successfully"
        });
      } catch (error) {
        return errorResponse(error.message, 400);
      }
    }

    if (method === "DELETE") {
      const result = await env.DB.prepare(
        "DELETE FROM collections WHERE id = ?"
      ).bind(id).run();

      if (!result.meta.changes) {
        return errorResponse("Collection not found", 404);
      }

      return json({
        success: true,
        message: "Collection deleted successfully"
      });
    }
  }

  /* ADMIN MOVIE LIST */

  if (path === "/api/admin/movies" && method === "GET") {
    const result = await env.DB.prepare(
      MOVIE_SELECT + " ORDER BY id DESC"
    ).all();

    return json({
      success: true,
      total: result.results.length,
      movies: result.results || []
    });
  }

  /* ADD MOVIE */

  if (path === "/api/admin/movies" && method === "POST") {
    try {
      const data = await readJson(request);
      const movie = cleanMovie(data);
      movie.slug = await uniqueMovieSlug(
        env.DB,
        movie.title
      );

      const result = await env.DB.prepare(`
        INSERT INTO movies (
          title,
          slug,
          description,
          poster,
          backdrop,
          year,
          genre,
          rating,
          duration,
          language,
          country,
          director,
          quality,
          featured,
          download_url,
          download_url_2,
          watch_url,
          ad_url,
          ad_count
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        movie.title,
        movie.slug,
        movie.description,
        movie.poster,
        movie.backdrop,
        movie.year,
        movie.genre,
        movie.rating,
        movie.duration,
        movie.language,
        movie.country,
        movie.director,
        movie.quality,
        0,
        movie.download_url,
        movie.download_url_2,
        movie.watch_url,
        movie.ad_url,
        movie.ad_count
      ).run();

      return json({
        success: true,
        message: "Movie added successfully",
        id: result.meta.last_row_id,
        slug: movie.slug
      }, 201);
    } catch (error) {
      return errorResponse(error.message, 400);
    }
  }

  /* EDIT / DELETE MOVIE */

  const movieMatch = path.match(
    /^\/api\/admin\/movies\/(\d+)$/
  );

  if (movieMatch) {
    const id = Number(movieMatch[1]);

    if (method === "PUT") {
      try {
        const movie = cleanMovie(await readJson(request));

        movie.slug = await uniqueMovieSlug(
          env.DB,
          movie.title,
          id
        );

        const result = await env.DB.prepare(`
          UPDATE movies SET
            title = ?,
            slug = ?,
            description = ?,
            poster = ?,
            backdrop = ?,
            year = ?,
            genre = ?,
            rating = ?,
            duration = ?,
            language = ?,
            country = ?,
            director = ?,
            quality = ?,
            featured = 0,
            download_url = ?,
            download_url_2 = ?,
            watch_url = ?,
            ad_url = ?,
            ad_count = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          movie.title,
          movie.slug,
          movie.description,
          movie.poster,
          movie.backdrop,
          movie.year,
          movie.genre,
          movie.rating,
          movie.duration,
          movie.language,
          movie.country,
          movie.director,
          movie.quality,
          movie.download_url,
          movie.download_url_2,
          movie.watch_url,
          movie.ad_url,
          movie.ad_count,
          id
        ).run();

        if (!result.meta.changes) {
          return errorResponse("Movie not found", 404);
        }

        return json({
          success: true,
          message: "Movie updated successfully",
          slug: movie.slug
        });
      } catch (error) {
        return errorResponse(error.message, 400);
      }
    }

    if (method === "DELETE") {
      const result = await env.DB.prepare(
        "DELETE FROM movies WHERE id = ?"
      ).bind(id).run();

      if (!result.meta.changes) {
        return errorResponse("Movie not found", 404);
      }

      return json({
        success: true,
        message: "Movie deleted successfully"
      });
    }
  }

  return errorResponse("Admin API route not found", 404);
}

/* =========================================================
   MAIN WORKER
========================================================= */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (!env.DB) {
        return errorResponse(
          "Database binding DB is missing",
          500
        );
      }

      await ensureCustomizationSchema(env);

      const path = url.pathname;
      const method = request.method;

      /* API HEALTH CHECK */

      if (path === "/api/hello" && method === "GET") {
        return json({
          success: true,
          message: "CineVault API is running"
        });
      }

      /* PUBLIC WEBSITE SETTINGS */

      if (path === "/api/settings" && method === "GET") {
        return json({
          success: true,
          settings: await getSettings(env)
        });
      }

      /* PUBLIC ACTIVE COLLECTIONS */

      if (path === "/api/collections" && method === "GET") {
        const result = await env.DB.prepare(`
          SELECT
            id,
            name,
            description,
            image,
            icon,
            genre,
            link_url AS linkUrl,
            sort_order AS sortOrder
          FROM collections
          WHERE is_active = 1
          ORDER BY sort_order ASC, id ASC
        `).all();

        return json({
          success: true,
          total: result.results.length,
          collections: result.results || []
        });
      }

      /* PUBLIC MOVIE LIST */

      if (path === "/api/movies" && method === "GET") {
        return json(await getMovies(env, url));
      }

      /* SINGLE MOVIE BY ID OR SLUG */

      const publicMovieMatch = path.match(
        /^\/api\/movies\/([a-zA-Z0-9-]+)$/
      );

      if (publicMovieMatch && method === "GET") {
        const result = await getSingleMovie(
          env,
          publicMovieMatch[1]
        );

        if (!result) {
          return errorResponse("Movie not found", 404);
        }

        return json({
          success: true,
          ...result
        });
      }

      /* ADMIN API */

      if (path.startsWith("/api/admin/")) {
        return await handleAdmin(request, env, url);
      }

      /* STATIC WEBSITE ASSETS */

      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }

      return new Response("CineVault", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8"
        }
      });

    } catch (error) {
      /*
        Do not expose database details, credentials,
        SQL statements or internal stack traces publicly.
      */

      console.error("CineVault Worker Error:", error);

      return errorResponse(
        "An internal server error occurred. Please try again later.",
        500
      );
    }
  }
};
