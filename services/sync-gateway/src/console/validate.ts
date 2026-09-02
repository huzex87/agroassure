import { BadRequestException } from "@nestjs/common";

// Small input guards for the console surface. The database enforces the same
// vocabularies with CHECK constraints, but a bad value should come back as a
// 400 naming the field rather than a 500 from a constraint violation.

export function oneOf<T extends string>(
  field: string,
  value: unknown,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new BadRequestException(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

export function requiredString(field: string, value: unknown, maxLength = 2000): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field} is required`);
  }
  if (value.length > maxLength) {
    throw new BadRequestException(`${field} exceeds ${maxLength} characters`);
  }
  return value.trim();
}

export function optionalString(
  field: string,
  value: unknown,
  maxLength = 2000,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredString(field, value, maxLength);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuid(field: string, value: unknown): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new BadRequestException(`${field} must be a uuid`);
  }
  return value;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isoDate(field: string, value: unknown): string {
  if (typeof value !== "string" || !DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new BadRequestException(`${field} must be a date as YYYY-MM-DD`);
  }
  return value;
}

export function optionalIsoDate(field: string, value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return isoDate(field, value);
}
