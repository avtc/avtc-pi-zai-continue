// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 avtc <tarasenkov@gmail.com>

import { describe, expect, it } from "vitest";
import { formatDuration, isZaiQuotaError, parseQuotaResetTime, randomQuotaBuffer } from "../src/zai-quota.js";

describe("isZaiQuotaError", () => {
  it("detects Z.ai quota error from JSON response", () => {
    const msg =
      '{"type":"error","error":{"type":"rate_limit_error","code":"1308","message":"[1308][Usage limit reached for 5 hour. Your limit will reset at 2026-06-16 19:56:23]"}}';
    expect(isZaiQuotaError(msg)).toBe(true);
  });

  it("returns false for generic rate limit errors", () => {
    expect(isZaiQuotaError('{"type":"error","error":{"type":"rate_limit_error","code":"429"}}')).toBe(false);
  });

  it("returns false for non-quota errors", () => {
    expect(isZaiQuotaError("Internal server error")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isZaiQuotaError("")).toBe(false);
  });

  it("still detects quota error when non-retryable marker is appended", () => {
    const originalMsg =
      '{"type":"error","error":{"type":"rate_limit_error","code":"1308","message":"[1308][Usage limit reached for 5 hour. Your limit will reset at 2026-06-16 19:56:23]"}}';
    const withMarker = `${originalMsg}|quota exceeded|`;
    expect(isZaiQuotaError(withMarker)).toBe(true);
  });

  it("marker matches pi's _isNonRetryableProviderLimitError regex", () => {
    // pi's regex: /GoUsageLimitError|FreeUsageLimitError|Monthly usage limit reached|available balance|insufficient_quota|out of budget|quota exceeded|billing/i
    const nonRetryableRe =
      /GoUsageLimitError|FreeUsageLimitError|Monthly usage limit reached|available balance|insufficient_quota|out of budget|quota exceeded|billing/i;
    expect(nonRetryableRe.test("|quota exceeded|")).toBe(true);
  });
});

describe("parseQuotaResetTime", () => {
  it("parses reset timestamp from error message", () => {
    const msg = "Your limit will reset at 2026-06-16 19:56:23";
    const result = parseQuotaResetTime(msg);
    // 2026-06-16 19:56:23 UTC+8 = 2026-06-16 11:56:23 UTC
    expect(result).toBe(new Date("2026-06-16T19:56:23+08:00").getTime());
  });

  it("returns null when no timestamp found", () => {
    expect(parseQuotaResetTime("Usage limit reached")).toBe(null);
  });

  it("handles full JSON error message", () => {
    const msg =
      '{"type":"error","error":{"type":"rate_limit_error","code":"1308","message":"[1308][Usage limit reached for 5 hour. Your limit will reset at 2026-06-16 19:56:23][202606161748034d4ea4fb65994b1b]}}';
    const result = parseQuotaResetTime(msg);
    expect(result).toBe(new Date("2026-06-16T19:56:23+08:00").getTime());
  });
});

describe("formatDuration", () => {
  it("formats hours, minutes, seconds", () => {
    expect(formatDuration(7200 * 1000)).toBe("2h 0m 0s");
    expect(formatDuration(3661 * 1000)).toBe("1h 1m 1s");
  });

  it("formats minutes and seconds when no hours", () => {
    expect(formatDuration(120 * 1000)).toBe("2m 0s");
    expect(formatDuration(90 * 1000)).toBe("1m 30s");
  });

  it("formats seconds only when under a minute", () => {
    expect(formatDuration(45 * 1000)).toBe("45s");
    expect(formatDuration(0)).toBe("0s");
  });

  it("clamps negative values to 0s", () => {
    expect(formatDuration(-1000)).toBe("0s");
  });
});

describe("randomQuotaBuffer", () => {
  it("returns value in range [min, max)", () => {
    for (let i = 0; i < 100; i++) {
      const val = randomQuotaBuffer(30_000, 120_000);
      expect(val).toBeGreaterThanOrEqual(30_000);
      expect(val).toBeLessThan(120_000);
    }
  });
});
