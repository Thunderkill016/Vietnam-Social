/**
 * Task 002: Observability & Structured Error Logger.
 *
 * Requirements:
 * - Application errors have useful structured context.
 * - Never log auth tokens, passwords, JWTs, or Supabase service secrets.
 * - Never log raw device coordinates (lat/lng).
 * - Distinguish development vs production outputs.
 */

export interface LogContext {
  [key: string]: unknown;
}

const REDACTED_KEYS = new Set([
  "authorization",
  "token",
  "access_token",
  "refresh_token",
  "password",
  "secret",
  "key",
  "service_role",
  "cookie",
  "latitude",
  "longitude",
  "lat",
  "lng",
  "coords",
]);

/**
 * Recursively sanitize context to remove credentials and raw location.
 */
export function sanitizeContext(context: unknown): unknown {
  if (context === null || typeof context !== "object") {
    if (typeof context === "string") {
      // Redact Bearer tokens or Supabase JWTs if in string
      if (context.startsWith("Bearer ") || context.startsWith("eyJ")) {
        return "[REDACTED_AUTH_TOKEN]";
      }
      if (
        context.startsWith("sb_secret_") ||
        context.startsWith("sb_publishable_")
      ) {
        return "[REDACTED_KEY]";
      }
    }
    return context;
  }

  if (Array.isArray(context)) {
    return context.map(sanitizeContext);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(
    context as Record<string, unknown>,
  )) {
    const lowerKey = key.toLowerCase();
    if (REDACTED_KEYS.has(lowerKey)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = sanitizeContext(value);
    }
  }
  return result;
}

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: LogContext;
  timestamp: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerSink {
  log(entry: LogEntry): void;
}

class DefaultConsoleSink implements LoggerSink {
  log(entry: LogEntry): void {
    const isDev = process.env.NODE_ENV === "development";
    if (isDev) {
      const prefix = `[${entry.level.toUpperCase()} ${entry.timestamp}]`;
      if (entry.level === "error") {
        console.error(
          prefix,
          entry.message,
          entry.context ?? "",
          entry.error ?? "",
        );
      } else if (entry.level === "warn") {
        console.warn(prefix, entry.message, entry.context ?? "");
      } else {
        console.info(prefix, entry.message, entry.context ?? "");
      }
    } else {
      // Production: structured single-line JSON log for standard collectors
      const serialized = JSON.stringify(entry);
      if (entry.level === "error") {
        console.error(serialized);
      } else if (entry.level === "warn") {
        console.warn(serialized);
      } else {
        console.info(serialized);
      }
    }
  }
}

let activeSink: LoggerSink = new DefaultConsoleSink();

export function setLoggerSink(sink: LoggerSink): void {
  activeSink = sink;
}

export function logError(
  message: string,
  error?: unknown,
  context?: LogContext,
): void {
  const sanitizedContext = context
    ? (sanitizeContext(context) as LogContext)
    : undefined;
  const entry: LogEntry = {
    level: "error",
    message,
    context: sanitizedContext,
    timestamp: new Date().toISOString(),
  };

  if (error instanceof Error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    };
  } else if (error && typeof error === "object") {
    entry.error = {
      name: "Error",
      message: JSON.stringify(sanitizeContext(error)),
    };
  }

  activeSink.log(entry);
}

export function logWarn(message: string, context?: LogContext): void {
  activeSink.log({
    level: "warn",
    message,
    context: context ? (sanitizeContext(context) as LogContext) : undefined,
    timestamp: new Date().toISOString(),
  });
}

export function logInfo(message: string, context?: LogContext): void {
  activeSink.log({
    level: "info",
    message,
    context: context ? (sanitizeContext(context) as LogContext) : undefined,
    timestamp: new Date().toISOString(),
  });
}
