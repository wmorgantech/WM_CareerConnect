

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function validationError(
  issues: readonly { field: string; message: string }[],
  message = "Validation failed",
): HttpError {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of issues) {
    (fieldErrors[issue.field] ??= []).push(issue.message);
  }

  return new HttpError(400, "VALIDATION_ERROR", message, { fieldErrors });
}

function prismaCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  const code = prismaCode(error);

  return code === "P2002" || code === "23505";
}

export function isForeignKeyError(error: unknown): boolean {
  const code = prismaCode(error);

  return code === "P2003" || code === "23503" || code === "23001";
}

export function isMissingSchemaError(error: unknown): boolean {
  const code = prismaCode(error);

  return (
    code === "P2021" ||
    code === "P2022" ||
    code === "42P01" ||
    code === "42703"
  );
}
