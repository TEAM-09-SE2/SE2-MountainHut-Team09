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

  const { statusCode, code, message } = bodyErrors.get(error.type) ?? {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: "An unexpected server error occurred.",
  };
  return response.status(statusCode).json({ error: code, message });
}

export default errorHandler;
