import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const requireThat = (condition, message, status = 400) => {
  if (!condition) throw new ApiError(status, message);
};

export const text = (value, name, max = 500, optional = false) => {
  requireThat(
    typeof value === "string" &&
      value.length <= max &&
      (optional || value.trim().length > 0),
    `Invalid ${name}.`,
  );
  return value.trim();
};

export const number = (value, name, zero = false) => {
  requireThat(
    typeof value === "number" &&
      Number.isFinite(value) &&
      value >= (zero ? 0 : 0.1) &&
      value <= 1000000,
    `Invalid ${name}.`,
  );
  return value;
};

export const choice = (value, choices, name) => {
  requireThat(choices.includes(value), `Invalid ${name}.`);
  return value;
};

export const date = (value) => {
  requireThat(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Invalid date.",
  );
  return value;
};

export const geo = (value) => {
  if (value === undefined) return undefined;
  requireThat(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof value.lat === "number" &&
      Number.isFinite(value.lat) &&
      value.lat >= -90 &&
      value.lat <= 90 &&
      typeof value.lng === "number" &&
      Number.isFinite(value.lng) &&
      value.lng >= -180 &&
      value.lng <= 180,
    "Invalid location coordinates.",
  );
  return { lat: value.lat, lng: value.lng };
};

export const emailAddress = (value) => {
  const email = text(value, "email", 254).toLowerCase();
  requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "Enter a valid email address.");
  return email;
};

export const passwordHash = (password) => {
  text(password, "password", 256);
  requireThat(password.length >= 8, "Use a password of at least 8 characters.");
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
};

export const passwordMatches = (password, stored) => {
  if (typeof password !== "string" || password.length > 256 || !stored) return false;
  const [salt, key] = stored.split(":");
  return timingSafeEqual(Buffer.from(key, "hex"), scryptSync(password, salt, 64));
};
