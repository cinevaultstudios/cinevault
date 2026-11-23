
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

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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

  const parsed = new URL(String(value));

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
    featured: data.featured ? 1 : 0,
    download_url: validUrl(data.downloadUrl),
    watch_url: validUrl(data.watchUrl)
  };
}

const MOVIE_SELECT = `
  SELECT
    id, title, slug, description, poster, backdrop,
    year, genre, rating, duration, language, country,
    director, quality, featured,
    download_url AS downloadUrl,
    watch_url AS watchUrl,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM movies
`;

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
    return json({
      success: false,
      message: "Invalid upload form"
    }, 400);
  }

  const file = form.get("file");
  const type = String(form.get("type") || "poster");

  if (!file || typeof file.arrayBuffer !== "function") {
    return json({
      success: false,
      message: "Please select an image"
    }, 400);
  }

  if (!["poster", "backdrop"].includes(type)) {
    return json({
      success: false,
      message: "Invalid image type"
    }, 400);
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif"
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
      headers: {
        Authorization: `Basic ${credentials}`
      },
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

  // Cloudinary image upload
  if (path === "/api/admin/upload" && request.method === "POST") {
    return await uploadToCloudinary(request, env);
  }

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
        download_url, watch_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      movie.title, movie.slug, movie.description,
      movie.poster, movie.backdrop, movie.year,
      movie.genre, movie.rating, movie.duration,
      movie.language, movie.country, movie.director,
      movie.quality, movie.featured,
      movie.download_url, movie.watch_url
    ).run();

    return json({
      success: true,
      message: "Movie added successfully"
    }, 201);
  }

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
          quality = ?, featured = ?,
          download_url = ?, watch_url = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        movie.title, movie.slug, movie.description,
        movie.poster, movie.backdrop, movie.year,
        movie.genre, movie.rating, movie.duration,
        movie.language, movie.country, movie.director,
        movie.quality, movie.featured,
        movie.download_url, movie.watch_url, id
      ).run();

      if (!result.meta.changes) {
        return json({ success: false, message: "Movie not found" }, 404);
      }

      return json({
        success: true,
        message: "Movie updated successfully"
      });
    }

    if (request.method === "DELETE") {
      const result = await env.DB.prepare(
        "DELETE FROM movies WHERE id = ?"
      ).bind(id).run();

      if (!result.meta.changes) {
        return json({ success: false, message: "Movie not found" }, 404);
      }

      return json({
        success: true,
        message: "Movie deleted successfully"
      });
    }
  }

  return json({
    success: false,
    message: "Admin API route not found"
  }, 404);
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

      if (url.pathname === "/api/hello") {
        return json({
          success: true,
          message: "CineVault API is running"
        });
      }

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
