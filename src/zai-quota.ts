// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 avtc <tarasenkov@gmail.com>

/**
 * ZAI API quota error detection and handling.
 *
 * Z.ai returns rate_limit_error with a reset timestamp in Beijing time (UTC+8).
 */

/** Check if an error message is a ZAI quota error */
export function isZaiQuotaError(errorMessage: string): boolean {
  return (
    errorMessage.includes("rate_limit_error") &&
    errorMessage.includes("1308") &&
    errorMessage.includes("Usage limit reached")
  );
}

/** Parse reset timestamp from Z.ai quota error message.
 *  Z.ai returns timestamps in Beijing time (UTC+8) without timezone info,
 *  so we explicitly append +08:00 to get correct epoch ms.
 *  Returns epoch ms or null if no timestamp found. */
export function parseQuotaResetTime(errorMessage: string): number | null {
  const match = errorMessage.match(/will reset at (\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
  if (!match) return null;
  // Z.ai timestamps are Beijing time (UTC+8) — append offset for correct Date parsing
  const result = new Date(`${match[1]}T${match[2]}+08:00`).getTime();
  return Number.isNaN(result) ? null : result;
}

/** Format milliseconds into human-readable duration string. Clamps negative to 0s. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Random integer in [min, max). */
export function randomQuotaBuffer(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}
