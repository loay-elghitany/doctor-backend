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

export const errorResponse = (
  res,
  status,
  message,
  data = null,
  fieldErrors = null,
) => {
  const payload = {
    success: false,
    message,
    data,
  };
  if (fieldErrors) {
    payload.fieldErrors = fieldErrors;
  }
  return res.status(status).json(payload);
};
