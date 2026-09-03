import "server-only";

/**
 * Typed application errors. The API / server-action boundary maps these to
 * safe client responses — internal messages and stack traces are never sent
 * to the browser.
 */
export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly httpStatus: number;
  /** Safe to show to the end user. */
  readonly publicMessage: string;

  constructor(
    code: AppErrorCode,
    publicMessage: string,
    options?: { httpStatus?: number; cause?: unknown },
  ) {
    super(publicMessage, { cause: options?.cause });
    this.name = "AppError";
    this.code = code;
    this.publicMessage = publicMessage;
    this.httpStatus =
      options?.httpStatus ??
      {
        UNAUTHENTICATED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        VALIDATION: 422,
        CONFLICT: 409,
        RATE_LIMITED: 429,
        INTERNAL: 500,
      }[code];
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "You need to sign in to continue.") {
    super("UNAUTHENTICATED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super("FORBIDDEN", message);
  }
}

export class ValidationError extends AppError {
  constructor(message = "The submitted data is invalid.") {
    super("VALIDATION", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested item was not found.") {
    super("NOT_FOUND", message);
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
