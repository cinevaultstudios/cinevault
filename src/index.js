export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/hello") {
      return Response.json({
        success: true,
        message: "CineVault Backend is running!"
      });
    }

    return env.ASSETS.fetch(request);
  }
};
