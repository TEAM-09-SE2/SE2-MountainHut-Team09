import { ErrorClass } from "../errors/ErrorClass.js";

const unsupportedBodyEncoding = {
  statusCode: 415,
  code: "UNSUPPORTED_MEDIA_TYPE",
  message: "The request body uses an unsupported charset or content encoding.",
};

const bodyErrors = new Map([
  ["entity.parse.failed", {
    statusCode: 400,
    code: "INVALID_INPUT",
    message: "The request body contains malformed JSON.",
  }],
  ["entity.too.large", {
    statusCode: 413,
    code: "PAYLOAD_TOO_LARGE",
    message: "The request body exceeds the allowed size.",
  }],
  ["charset.unsupported", unsupportedBodyEncoding],
  ["encoding.unsupported", unsupportedBodyEncoding],
]);

function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error);
  console.error("Request failed:", error);

  if (error instanceof ErrorClass) {
    return response.status(error.statusCode).json({ error: error.code, message: error.message });
  }

  // Express marks URL parameter decoding failures with status 400.
  if (error instanceof URIError && error.status === 400) {
    return response.status(400).json({
      error: "INVALID_INPUT",
      message: "A URL path parameter contains invalid encoding.",
    });
  }

  const bodyError = bodyErrors.get(error.type);
  if (bodyError) {
    return response.status(bodyError.statusCode).json({ error: bodyError.code, message: bodyError.message });
  }

  // A body read failure such as a truncated gzip can have a status but no parser error type.
  if (error.status === 400) {
    return response.status(400).json({
      error: "INVALID_INPUT",
      message: "The request body could not be read.",
    });
  }

  return response.status(500).json({
    error: "INTERNAL_ERROR",
    message: "An unexpected server error occurred.",
  });
}

export default errorHandler;
