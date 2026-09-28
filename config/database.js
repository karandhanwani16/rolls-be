const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_USB_ROOT = path.join(REPO_ROOT, "usb-dev");

/**
 * Single place that decides how this process talks to the database.
 *
 * Phase 4: Prisma provider is sqlite. File location:
 *   {USB_ROOT}/data/database.sqlite
 *
 * Local development uses a project folder as USB_ROOT (not a physical drive):
 *   <repo>/usb-dev/data/database.sqlite
 *
 * Precedence:
 *   1. DATABASE_PATH (filesystem path or file: URL)
 *   2. USB_ROOT → {USB_ROOT}/data/database.sqlite
 *   3. file: DATABASE_URL
 *   4. Default USB_ROOT = <repo>/usb-dev
 *
 * Server URLs (mysql://, postgresql://) are ignored so a leftover .env
 * cannot point the sqlite client at MySQL.
 */
function trimEnv(value) {
  return typeof value === "string" ? value.trim() : "";
}

function looksLikeServerUrl(value) {
  return /^(mysql|postgresql|postgres|mongodb|sqlserver|prisma):\/\//i.test(value);
}

function resolveConfiguredPath(raw) {
  const trimmed = trimEnv(raw);
  if (!trimmed) {
    return "";
  }
  const withoutScheme = trimmed.startsWith("file:") ? trimmed.slice("file:".length) : trimmed;
  if (path.isAbsolute(withoutScheme)) {
    return path.normalize(withoutScheme);
  }
  return path.resolve(REPO_ROOT, withoutScheme);
}

function defaultDatabasePath(usbRoot) {
  return path.join(usbRoot, "data", "database.sqlite");
}

function resolveUsbRoot(env = process.env) {
  const configured = resolveConfiguredPath(env.USB_ROOT);
  return configured || DEFAULT_USB_ROOT;
}

function resolveDatabasePath(env = process.env) {
  const configured = trimEnv(env.DATABASE_PATH);
  if (configured && !looksLikeServerUrl(configured)) {
    return resolveConfiguredPath(configured);
  }
  return defaultDatabasePath(resolveUsbRoot(env));
}

function databaseUrlFromPath(databasePath) {
  return `file:${resolveConfiguredPath(databasePath)}`;
}

function resolveDatabaseUrl(env = process.env) {
  const databasePath = trimEnv(env.DATABASE_PATH);
  if (databasePath && !looksLikeServerUrl(databasePath)) {
    return databaseUrlFromPath(databasePath);
  }

  const usbRoot = trimEnv(env.USB_ROOT);
  if (usbRoot) {
    return databaseUrlFromPath(defaultDatabasePath(resolveUsbRoot(env)));
  }

  const databaseUrl = trimEnv(env.DATABASE_URL);
  if (databaseUrl && !looksLikeServerUrl(databaseUrl)) {
    return databaseUrl.startsWith("file:")
      ? databaseUrlFromPath(databaseUrl)
      : databaseUrlFromPath(databaseUrl);
  }

  return databaseUrlFromPath(defaultDatabasePath(DEFAULT_USB_ROOT));
}

function sqliteFilePathFromUrl(url) {
  if (!url || !url.startsWith("file:")) {
    return "";
  }
  return url.slice("file:".length);
}

function ensureDatabaseDir(env = process.env) {
  const filePath = sqliteFilePathFromUrl(resolveDatabaseUrl(env)) || resolveDatabasePath(env);
  if (filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  return filePath;
}

function applyDatabaseEnv(env = process.env) {
  const url = resolveDatabaseUrl(env);
  const filePath = sqliteFilePathFromUrl(url);

  env.DATABASE_URL = url;
  if (filePath) {
    env.DATABASE_PATH = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  env.USB_ROOT = resolveUsbRoot(env);

  return url;
}

function describeDatabaseTarget(url = resolveDatabaseUrl()) {
  if (!url) {
    return "unset";
  }
  if (url.startsWith("file:")) {
    return url;
  }
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return "custom";
  }
}

module.exports = {
  DEFAULT_USB_ROOT,
  applyDatabaseEnv,
  describeDatabaseTarget,
  ensureDatabaseDir,
  resolveDatabasePath,
  resolveDatabaseUrl,
  resolveUsbRoot,
};
