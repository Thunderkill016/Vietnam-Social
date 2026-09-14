import { describe, expect, it } from "vitest";
import {
  logError,
  sanitizeContext,
  setLoggerSink,
  type LogEntry,
  type LoggerSink,
} from "../src/lib/logger";

describe("structured logger & redaction invariants", () => {
  it("sanitizes auth tokens, passwords, secrets, and raw coordinates", () => {
    const context = {
      authorization: "Bearer secret-token-xyz",
      token: "eyJhbGciOiJIUzI1NiJ9.test",
      password: "SuperSecretPassword123",
      secret: "sb_secret_987",
      latitude: 10.776,
      longitude: 106.695,
      nested: {
        access_token: "token-abc",
        coords: [106.6, 10.7],
        safe_field: "Public Venue Name",
      },
    };

    const sanitized = sanitizeContext(context) as Record<string, unknown>;
    expect(sanitized.authorization).toBe("[REDACTED]");
    expect(sanitized.token).toBe("[REDACTED]");
    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.secret).toBe("[REDACTED]");
    expect(sanitized.latitude).toBe("[REDACTED]");
    expect(sanitized.longitude).toBe("[REDACTED]");

    const nested = sanitized.nested as Record<string, unknown>;
    expect(nested.access_token).toBe("[REDACTED]");
    expect(nested.coords).toBe("[REDACTED]");
    expect(nested.safe_field).toBe("Public Venue Name");
  });

  it("captures structured error entries with context", () => {
    const entries: LogEntry[] = [];
    const testSink: LoggerSink = {
      log: (entry) => entries.push(entry),
    };
    setLoggerSink(testSink);

    logError("Database connection failed", new Error("Timeout"), {
      city_id: "hcm",
      authorization: "Bearer secret",
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("error");
    expect(entries[0].message).toBe("Database connection failed");
    expect(entries[0].error?.message).toBe("Timeout");
    expect(entries[0].context?.city_id).toBe("hcm");
    expect(entries[0].context?.authorization).toBe("[REDACTED]");
  });
});
