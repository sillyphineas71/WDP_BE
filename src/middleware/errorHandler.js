import { AppError } from "../errors/AppError.js";
import { errorResponse } from "../utils/responseUtils.js";

export const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;

  // Validation errors from Joi
  if (err.details && Array.isArray(err.details)) {
    const validationErrors = err.details.map((detail) => ({
      field: detail.path.join("."),
      message: detail.message,
    }));

    return res.status(400).json(
      errorResponse("Validation failed", 400, {
        validationErrors,
      }),
    );
  }

  // Operational errors or errors with explicit status
  if (err.isOperational === true || err.status || err.statusCode) {
    const status = err.status || err.statusCode || 500;
    const response = errorResponse(err.message, status);

    if (err.code) response.code = err.code;

    return res.status(status).json(response);
  }

  // Programming or unknown errors
  console.error("Unhandled Error:", err);
  return res.status(500).json(errorResponse("Internal Server Error", 500));
};