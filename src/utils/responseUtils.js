export const successResponse = (
  data,
  message = "Success",
  statusCode = 200,
) => {
  return {
    success: true,
    message,
    statusCode,
    data,
  };
};

export const errorResponse = (
  message = "Error",
  statusCode = 500,
  error = null,
) => {
  return {
    success: false,
    message,
    statusCode,
    error,
  };
};
