
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

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

function makeSlug(title, year) {
  const slug = String(title)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${slug || "movie"}-${year || Date.now()}`;
}

function cleanMovie(data) {
  const title = String(data.title || "").trim();
  const year = Number(data.year) || null;
  const rating = Number(data.rating) || 0;

  if (!title) throw new Error("Movie title is required");
  if (rating < 0 || rating > 10) {
    throw new Error("Rating must be between 0 and 10");
  }

  const validUrl = (value) => {
    if (!value) return "";
    const url = new URL(String(value));
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Only HTTP/HTTPS URLs are allowed");
    }
    return url.toString();
  };

  return {
    title,
    slug: makeSlug(title, year),
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

async function adminAuthorized(request, env) {
  // Cloudflare Access must protect /admin.html
  // and /api/admin/* before requests reach this Worker.
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return false;

  const token = request.headers.get("CF-Access-JWT-Assertion");
  if (!token) return false;

  // Access validates the JWT at its edge.
  // The application must be protected by an Access policy.
  return true;
}

async function handleAdmin(request, env, url) {
  if (!await adminAuthorized(request, env)) {
    return json({ success: false, message: "Unauthorized" }, 401);
  }

  const origin = request.headers.get("Origin");
  if (request.method !== "GET" && origin !== url.origin) {
    return json({ success: false, message: "Invalid origin" }, 403);
  }

  const db = env.DB;
  const path = url.pathname;

  if (path === "/api/admin/movies" && request.method === "GET") {
    const result = await db.prepare(
      MOVIE_SELECT + " ORDER BY id DESC"
    ).all();

    return json({
      success: true,
      total: result.results.length,
      movies: result.results
    });
  }

  if (path === "/api/admin/movies" && request.method === "POST") {
    const data = await request.json();
    const movie = cleanMovie(data);

    await db.prepare(`
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

    return json({ success: true, message: "Movie added successfully" }, 201);
  }

  const match = path.match(/^\/api\/admin\/movies\/(\d+)$/);

  if (match) {
    const id = Number(match[1]);

    if (request.method === "PUT") {
      const data = await request.json();
      const movie = cleanMovie(data);

      const result = await db.prepare(`
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

      return json({ success: true, message: "Movie updated successfully" });
    }

    if (request.method === "DELETE") {
      const result = await db.prepare(
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

      if (url.pathname === "/api/hello") {
        return json({ success: true, message: "CineVault API is running" });
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

      if (
        url.pathname === "/api/admin/movies" ||
        url.pathname.startsWith("/api/admin/movies/")
      ) {
        if (!["GET", "POST", "PUT", "DELETE"].includes(request.method)) {
          return json({ success: false, message: "Method not allowed" }, 405);
        }

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
