import { ErrorClass } from "../errors/ErrorClass.js";

function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error);
  console.error("Request failed:", error);

  const isApplicationError = error instanceof ErrorClass;
  response.status(isApplicationError ? error.statusCode : 500).json({
    error: isApplicationError ? error.code : "INTERNAL_ERROR",
    message: isApplicationError ? error.message : "An unexpected server error occurred.",
  });
}

export default errorHandler