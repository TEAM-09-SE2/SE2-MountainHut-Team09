export class ErrorClass extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR") {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class BadRequestError extends ErrorClass {
  constructor(message = "The request is invalid.", code = "BAD_REQUEST") {
    super(message, 400, code);
  }
}

export class UnauthorizedError extends ErrorClass {
  constructor(message = "Authentication is required.", code = "UNAUTHORIZED") {
    super(message, 401, code);
  }
}

export class ForbiddenError extends ErrorClass {
  constructor(message = "You are not allowed to perform this action.", code = "FORBIDDEN") {
    super(message, 403, code);
  }
}

export class NotFoundError extends ErrorClass {
  constructor(message = "The requested resource was not found.", code = "NOT_FOUND") {
    super(message, 404, code);
  }
}

export class ConflictError extends ErrorClass {
  constructor(message = "The request conflicts with the current resource state.", code = "CONFLICT") {
    super(message, 409, code);
  }
}

export class InternalServerError extends ErrorClass {
  constructor(message = "An unexpected server error occurred.", code = "INTERNAL_ERROR") {
    super(message, 500, code);
  }
}

export default ErrorClass;