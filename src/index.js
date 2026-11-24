
const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });

const COOKIE_NAME = "cinevault_admin";
const SESSION_SECONDS = 8 * 60 * 60;
const CLOUDINARY_CLOUD_NAME = "v9vl1rze";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

let schemaPromise = null;

const DEFAULT_SETTINGS = {
  siteName: "CINEVAULT",
  logoText: "C",
  heroEyebrow: "YOUR WORLD OF CINEMA",
  heroTitle: "Discover Stories.",
  heroHighlight: "Experience Cinema.",
  heroDescription: "Explore a curated world of movies, discover hidden gems and find your next unforgettable experience.",
  heroImage: "",
  heroButton1Text: "Explore Movies",
  heroButton1Url: "#movies",
  heroButton2Text: "Browse Collections",
  heroButton2Url: "#collections",
  footerDescription: "Discover cinema. Explore stories. Build your collection.",
  footerTagline: "Made for movie lovers.",
  copyrightText: "All rights reserved.",
  aboutEyebrow: "WELCOME TO CINEVAULT",
  aboutTitle: "More Than Movies.",
  aboutHighlight: "A Cinema Experience.",
  aboutDescription: "CineVault brings together movie discovery, curated collections and a personal watchlist in one elegant destination."
};

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);

async function ensureCustomizationSchema(env) {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS site_settings (
          setting_key TEXT PRIMARY KEY,
          setting_value TEXT NOT NULL DEFAULT '',
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS collections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT DEFAULT '',
          image TEXT DEFAULT '',
          icon TEXT DEFAULT '',
          genre TEXT DEFAULT '',
          sort_order INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await env.DB.prepare(`
          INSERT OR IGNORE INTO site_settings
          (setting_key, setting_value)
          VALUES (?, ?)
        `).bind(key, value).run();
      }

      const defaults = [
        ["Action", "Thrilling adventures", "⚔", "Action", 1],
        ["Drama", "Stories that move you", "◈", "Drama", 2],
        ["Sci-Fi", "Beyond imagination", "✧", "Sci-Fi", 3],
        ["Thriller", "Feel the suspense", "◉", "Thriller", 4],
        ["Romance", "Stories of love", "♡", "Romance", 5],
        ["Comedy", "Enjoy every moment", "☻", "Comedy", 6]
      ];

      for (const item of defaults) {
        await env.DB.prepare(`
          INSERT INTO collections
          (name, description, icon, genre, sort_order, is_active)
          SELECT ?, ?, ?, ?, ?, 1
          WHERE NOT EXISTS (
            SELECT 1 FROM collections WHERE name = ?
          )
        `).bind(
          item[0], item[1], item[2], item[3], item[4], item[0]
        ).run();
      }
    })().catch(error => {
      schemaPromise = null;
      throw error;
    });
  }

  return schemaPromise;
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
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
  const key = await hmacKey(password);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
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
    if (Number(expires) < Math.floor(Date.now() / 1000)) return false;

    const payload = `${expires}.${nonce}`;
    const key = await hmacKey(password);

    return await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(signature),
      new TextEncoder().encode(payload)
    );
  } catch {
    return false;
  }
}

function sessionCookie(token, maxAge) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
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

function validUrl(value) {
  if (!value) return "";

  const parsed = new URL(String(value).trim());

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are allowed");
  }

  return parsed.toString();
}

function cleanMovie(data) {
  const title = String(data.title || "").trim();
  const year = Number(data.year) || null;
  const rating = Number(data.rating) || 0;

  if (!title) throw new Error("Movie title is required");

  if (rating < 0 || rating > 10) {
    throw new Error("Rating must be between 0 and 10");
  }

  const rawAdCount = data.adCount ?? data.ad_count ?? 4;
  const adCount = Number(rawAdCount);

  if (!Number.isSafeInteger(adCount) || adCount < 4) {
    throw new Error("Advertisement count must be a whole number of at least 4");
  }

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return {
    title,
    slug: `${slug || "movie"}-${year || Date.now()}`,
    description: String(data.description || ""),
    poster: validUrl(data.poster),
    backdrop: validUrl(data.backdrop),
    year,
    genre: String(data.genre || ""),
    rating,
    duration: String(data.duration || ""),
    language: String(data.language || ""),
    country: String(data.country || ""),
    director: String(data.director || ""),
    quality: String(data.quality || ""),
    featured: 0,
    download_url: validUrl(data.downloadUrl),
    download_url_2: validUrl(data.downloadUrl2 ?? data.download_url_2 ?? ""),
    watch_url: validUrl(data.watchUrl),
    ad_url: validUrl(data.adUrl ?? data.ad_url ?? ""),
    ad_count: adCount
  };
}

const MOVIE_SELECT = `
  SELECT
    id, title, slug, description, poster, backdrop,
    year, genre, rating, duration, language, country,
    director, quality, featured,
    download_url AS downloadUrl,
    download_url_2 AS downloadUrl2,
    watch_url AS watchUrl,
    ad_url AS adUrl,
    ad_count AS adCount,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM movies
`;

function cleanCollection(data) {
  const name = String(data.name || "").trim();

  if (!name) throw new Error("Collection name is required");

  return {
    name,
    description: String(data.description || "").trim(),
    image: validUrl(data.image),
    icon: String(data.icon || "").trim(),
    genre: String(data.genre || "").trim(),
    sort_order: Number.isFinite(Number(data.sortOrder))
      ? Math.trunc(Number(data.sortOrder))
      : 0,
    is_active: data.isActive === false || data.isActive === 0 ||
      data.isActive === "0" ? 0 : 1
  };
}

async function getSettings(env) {
  const result = await env.DB.prepare(`
    SELECT setting_key, setting_value FROM site_settings
  `).all();

  const settings = { ...DEFAULT_SETTINGS };

  for (const row of result.results || []) {
    settings[row.setting_key] = row.setting_value;
  }

  return settings;
}

async function saveSettings(env, data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid settings data");
  }

  for (const key of SETTING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const value = String(data[key] ?? "").trim();

      if (["heroImage"].includes(key)) validUrl(value);

      await env.DB.prepare(`
        INSERT INTO site_settings (setting_key, setting_value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(setting_key) DO UPDATE SET
          setting_value = excluded.setting_value,
          updated_at = CURRENT_TIMESTAMP
      `).bind(key, value).run();
    }
  }

  return getSettings(env);
}

async function uploadToCloudinary(request, env) {
  if (!env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    return json({
      success: false,
      message: "Cloudinary credentials are not configured"
    }, 500);
  }

  let form;

  try {
    form = await request.formData();
  } catch {
    return json({ success: false, message: "Invalid upload form" }, 400);
  }

  const file = form.get("file");
  const type = String(form.get("type") || "poster");

  if (!file || typeof file.arrayBuffer !== "function") {
    return json({ success: false, message: "Please select an image" }, 400);
  }

  if (!["poster", "backdrop", "hero", "collection", "logo"].includes(type)) {
    return json({ success: false, message: "Invalid image type" }, 400);
  }

  const allowedTypes = [
    "image/jpeg", "image/png", "image/webp", "image/avif"
  ];

  if (!allowedTypes.includes(file.type)) {
    return json({
      success: false,
      message: "Only JPG, PNG, WEBP and AVIF images are allowed"
    }, 400);
  }

  if (file.size <= 0 || file.size > MAX_IMAGE_SIZE) {
    return json({
      success: false,
      message: "Image size must be between 1 byte and 5 MB"
    }, 400);
  }

  const cloudForm = new FormData();
  cloudForm.set("file", file, file.name || "image");
  cloudForm.set("folder", `cinevault/${type}`);

  const credentials = btoa(
    `${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`
  );

  const cloudResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}` },
      body: cloudForm
    }
  );

  let result;

  try {
    result = await cloudResponse.json();
  } catch {
    return json({
      success: false,
      message: "Invalid response from Cloudinary"
    }, 502);
  }

  if (!cloudResponse.ok || !result.secure_url) {
    return json({
      success: false,
      message: result.error?.message || "Cloudinary upload failed"
    }, 502);
  }

  return json({
    success: true,
    message: "Image uploaded successfully",
    url: result.secure_url,
    publicId: result.public_id,
    type
  });
}

async function handleAdmin(request, env, url) {
  const password = env.ADMIN_PASSWORD;

  if (!password) {
    return json({
      success: false,
      message: "Admin password is not configured"
    }, 500);
  }

  const path = url.pathname;

  if (path === "/api/admin/login" && request.method === "POST") {
    if (!validOrigin(request, url)) {
      return json({ success: false, message: "Invalid origin" }, 403);
    }

    let data;

    try {
      data = await request.json();
    } catch {
      return json({ success: false, message: "Invalid JSON" }, 400);
    }

    const supplied = String(data.password || "");
    const encoder = new TextEncoder();

    const expectedHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(password))
    );

    const suppliedHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(supplied))
    );

    let difference = 0;

    for (let i = 0; i < expectedHash.length; i++) {
      difference |= expectedHash[i] ^ suppliedHash[i];
    }

    if (difference !== 0) {
      return json({ success: false, message: "Incorrect password" }, 401);
    }

    const token = await createSession(password);

    return json(
      { success: true, message: "Login successful" },
      200,
      { "Set-Cookie": sessionCookie(token, SESSION_SECONDS) }
    );
  }

  if (path === "/api/admin/logout" && request.method === "POST") {
    if (!validOrigin(request, url)) {
      return json({ success: false, message: "Invalid origin" }, 403);
    }

    return json(
      { success: true, message: "Logged out" },
      200,
      { "Set-Cookie": clearSessionCookie() }
    );
  }

  const authorized = await verifySession(request, password);

  if (path === "/api/admin/session" && request.method === "GET") {
    return json({ success: true, authenticated: authorized });
  }

  if (!authorized) {
    return json({ success: false, message: "Please login first" }, 401);
  }

  if (request.method !== "GET" && !validOrigin(request, url)) {
    return json({ success: false, message: "Invalid origin" }, 403);
  }

  if (path === "/api/admin/upload" && request.method === "POST") {
    return uploadToCloudinary(request, env);
  }

  // Website settings
  if (path === "/api/admin/settings" && request.method === "GET") {
    return json({ success: true, settings: await getSettings(env) });
  }

  if (path === "/api/admin/settings" && request.method === "PUT") {
    try {
      const settings = await saveSettings(env, await request.json());
      return json({
        success: true,
        message: "Website settings saved successfully",
        settings
      });
    } catch (error) {
      return json({ success: false, message: error.message }, 400);
    }
  }

  // Collection management
  if (path === "/api/admin/collections" && request.method === "GET") {
    const result = await env.DB.prepare(`
      SELECT * FROM collections ORDER BY sort_order ASC, id ASC
    `).all();

    return json({
      success: true,
      total: result.results.length,
      collections: result.results
    });
  }

  if (path === "/api/admin/collections" && request.method === "POST") {
    try {
      const item = cleanCollection(await request.json());

      const result = await env.DB.prepare(`
        INSERT INTO collections
        (name, description, image, icon, genre, sort_order, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        item.name,
        item.description,
        item.image,
        item.icon,
        item.genre,
        item.sort_order,
        item.is_active
      ).run();

      return json({
        success: true,
        message: "Collection added successfully",
        id: result.meta.last_row_id
      }, 201);
    } catch (error) {
      return json({ success: false, message: error.message }, 400);
    }
  }

  const collectionMatch = path.match(/^\/api\/admin\/collections\/(\d+)$/);

  if (collectionMatch) {
    const id = Number(collectionMatch[1]);

    if (request.method === "PUT") {
      try {
        const item = cleanCollection(await request.json());

        const result = await env.DB.prepare(`
          UPDATE collections SET
            name = ?, description = ?, image = ?, icon = ?,
            genre = ?, sort_order = ?, is_active = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          item.name,
          item.description,
          item.image,
          item.icon,
          item.genre,
          item.sort_order,
          item.is_active,
          id
        ).run();

        if (!result.meta.changes) {
          return json({ success: false, message: "Collection not found" }, 404);
        }

        return json({ success: true, message: "Collection updated successfully" });
      } catch (error) {
        return json({ success: false, message: error.message }, 400);
      }
    }

    if (request.method === "DELETE") {
      const result = await env.DB.prepare(
        "DELETE FROM collections WHERE id = ?"
      ).bind(id).run();

      if (!result.meta.changes) {
        return json({ success: false, message: "Collection not found" }, 404);
      }

      return json({ success: true, message: "Collection deleted successfully" });
    }
  }

  // Admin movie list
  if (path === "/api/admin/movies" && request.method === "GET") {
    const result = await env.DB.prepare(
      MOVIE_SELECT + " ORDER BY id DESC"
    ).all();

    return json({
      success: true,
      total: result.results.length,
      movies: result.results
    });
  }

  // Add movie
  if (path === "/api/admin/movies" && request.method === "POST") {
    let movie;

    try {
      movie = cleanMovie(await request.json());
    } catch (error) {
      return json({ success: false, message: error.message }, 400);
    }

    await env.DB.prepare(`
      INSERT INTO movies (
        title, slug, description, poster, backdrop,
        year, genre, rating, duration, language,
        country, director, quality, featured,
        download_url, download_url_2, watch_url,
        ad_url, ad_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      movie.title, movie.slug, movie.description,
      movie.poster, movie.backdrop, movie.year,
      movie.genre, movie.rating, movie.duration,
      movie.language, movie.country, movie.director,
      movie.quality, 0, movie.download_url,
      movie.download_url_2, movie.watch_url,
      movie.ad_url, movie.ad_count
    ).run();

    return json({ success: true, message: "Movie added successfully" }, 201);
  }

  // Edit or delete movie
  const match = path.match(/^\/api\/admin\/movies\/(\d+)$/);

  if (match) {
    const id = Number(match[1]);

    if (request.method === "PUT") {
      let movie;

      try {
        movie = cleanMovie(await request.json());
      } catch (error) {
        return json({ success: false, message: error.message }, 400);
      }

      const result = await env.DB.prepare(`
        UPDATE movies SET
          title = ?, slug = ?, description = ?,
          poster = ?, backdrop = ?, year = ?,
          genre = ?, rating = ?, duration = ?,
          language = ?, country = ?, director = ?,
          quality = ?, featured = 0,
          download_url = ?, download_url_2 = ?, watch_url = ?,
          ad_url = ?, ad_count = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        movie.title, movie.slug, movie.description,
        movie.poster, movie.backdrop, movie.year,
        movie.genre, movie.rating, movie.duration,
        movie.language, movie.country, movie.director,
        movie.quality, movie.download_url,
        movie.download_url_2, movie.watch_url,
        movie.ad_url, movie.ad_count, id
      ).run();

      if (!result.meta.changes) {
        return json({ success: false, message: "Movie not found" }, 404);
      }

      return json({ success: true, message: "Movie updated successfully" });
    }

    if (request.method === "DELETE") {
      const result = await env.DB.prepare(
        "DELETE FROM movies WHERE id = ?"
      ).bind(id).run();

      if (!result.meta.changes) {
        return json({ success: false, message: "Movie not found" }, 404);
      }

      return json({ success: true, message: "Movie deleted successfully" });
    }
  }

  return json({ success: false, message: "Admin API route not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (!env.DB) {
        return json({
          success: false,
          message: "Database binding DB is missing"
        }, 500);
      }

      await ensureCustomizationSchema(env);

      if (url.pathname === "/api/hello") {
        return json({
          success: true,
          message: "CineVault API is running"
        });
      }

      // Public website settings
      if (url.pathname === "/api/settings" && request.method === "GET") {
        return json({
          success: true,
          settings: await getSettings(env)
        });
      }

      // Public active collections
      if (url.pathname === "/api/collections" && request.method === "GET") {
        const result = await env.DB.prepare(`
          SELECT id, name, description, image, icon, genre, sort_order AS sortOrder
          FROM collections
          WHERE is_active = 1
          ORDER BY sort_order ASC, id ASC
        `).all();

        return json({
          success: true,
          total: result.results.length,
          collections: result.results
        });
      }

      // Public movie list
      if (url.pathname === "/api/movies" && request.method === "GET") {
        const result = await env.DB.prepare(
          MOVIE_SELECT + " ORDER BY id DESC"
        ).all();

        return json({
          success: true,
          total: result.results.length,
          movies: result.results
        });
      }

      if (url.pathname.startsWith("/api/admin/")) {
        return await handleAdmin(request, env, url);
      }

      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }

      return new Response("CineVault", { status: 200 });

    } catch (error) {
      return json({
        success: false,
        message: "Server error",
        error: error.message
      }, 500);
    }
  }
};
