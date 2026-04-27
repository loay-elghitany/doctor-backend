/**
 * 404 Not Found Handler
 */
const notFoundHandler = (req, res) => {
  // Set CORS headers so browser can read 404 response
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }

  res.status(404).json({
    success: false,
    message: "Resource not found",
  });
};

export default notFoundHandler;
