/**
 * 404 Not Found Handler
 * Note: CORS headers are already set by the cors middleware which runs first.
 * No manual CORS injection needed here - maintaining single source of truth.
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: "Resource not found",
  });
};

export default notFoundHandler;
