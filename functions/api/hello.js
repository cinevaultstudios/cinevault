
export async function onRequest() {
  return Response.json({
    success: true,
    message: "CineVault Backend is running!"
  });
}
