export class ErrorClass extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR") {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class BadRequestError extends ErrorClass {
  constructor(message = "The request is invalid.") {
    super(message, 400, "BAD_REQUEST");
  }
}

export class UnauthorizedError extends ErrorClass {
  constructor(message = "Authentication is required.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends ErrorClass {
  constructor(message = "You are not allowed to perform this action.") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends ErrorClass {
  constructor(message = "The requested resource was not found.") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends ErrorClass {
  constructor(message = "The request conflicts with the current resource state.") {
    super(message, 409, "CONFLICT");
  }
}

export class InternalServerError extends ErrorClass {
  constructor(message = "An unexpected server error occurred.") {
    super(message, 500, "INTERNAL_ERROR");
  }
}

export default ErrorClass;