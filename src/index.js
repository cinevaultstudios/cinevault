export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/hello") {
      return Response.json({
        success: true,
        message: "CineVault Backend is running!"
      });
    }

    if (url.pathname === "/api/movies" && request.method === "GET") {
      try {
        const result = await env.DB
          .prepare("SELECT * FROM movies ORDER BY id DESC")
          .all();

        return Response.json({
          success: true,
          total: result.results.length,
          movies: result.results
        });
      } catch (error) {
        return Response.json({
          success: false,
          message: "Database error",
          error: error.message
        }, { status: 500 });
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json({
        success: false,
        message: "API route not found"
      }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  }
};
