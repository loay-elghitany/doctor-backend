export const successResponse = (
  res,
  data,
  message = "Success",
  status = 200,
) => {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
};

export const errorResponse = (res, status, message, data = null) => {
  return res.status(status).json({
    success: false,
    message,
    data,
  });
};
