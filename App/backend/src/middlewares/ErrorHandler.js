import { ErrorClass } from "../errors/ErrorClass.js";

function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error);
  console.error("Request failed:", error);

  const isApplicationError = error instanceof ErrorClass;
  const isMalformedJson = error.type === "entity.parse.failed";
  const statusCode = isMalformedJson ? 400 : isApplicationError ? error.statusCode : 500;
  const code = isMalformedJson ? "INVALID_INPUT" : isApplicationError ? error.code : "INTERNAL_ERROR";
  const message = isMalformedJson ? "The request body contains malformed JSON." : isApplicationError ? error.message : "An unexpected server error occurred.";

  response.status(statusCode).json({error: code, message});
}

export default errorHandler