// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 avtc <tarasenkov@gmail.com>

/**
 * Agent lifecycle handler for Z.ai quota auto-continue.
 *
 * Listens on agent_end to detect quota errors and schedules
 * a "continue" message after the quota resets.
 *
 * NOTE: We cannot prevent pi's built-in retry (2 attempts) for the initial
 * 500 error from the upstream proxy, because the proxy returns a generic
 * "500 An error occurred while requesting upstream server:" before the Z.ai
 * JSON error body is available. The |quota_exceeded| marker can only be
 * appended on the second assistant message, after pi has already retried.
 * This is a limitation of the extension API — extensions cannot modify
 * the error before pi's retry decision (_handlePostAgentRun checks
 * _lastAssistantMessage which may not be updated by message_end handlers
 * in time when the first message lacks quota-specific details).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatDuration, isZaiQuotaError, parseQuotaResetTime, randomQuotaBuffer } from "./zai-quota.js";

/** Timeout ID for the quota auto-continue timer.
 *  Used as the authoritative guard to prevent stacking timers. */
let quotaTimer: ReturnType<typeof setTimeout> | null = null;

/** Interval ID for periodic status bar countdown updates. */
let statusInterval: ReturnType<typeof setInterval> | null = null;

/** Target time (epoch ms) when auto-continue should fire. Used for countdown display. */
let continueTime: number | null = null;

/** Stashed UI reference for status bar updates from timer callbacks.
 *  Refreshed on each agent_end, cleared on agent_start. */
let uiRef: {
  notify: (msg: string, type?: "error" | "info" | "warning") => void;
  setStatus: (slot: string, text: string | undefined) => void;
} | null = null;

/** Marker appended to quota error messages to prevent pi's built-in retry.
 *  pi's _isNonRetryableProviderLimitError matches "quota exceeded" (with SPACE,
 *  not underscore), so appending this marker causes the error to be classified as non-retryable. */
const NON_RETRYABLE_MARKER = "|quota exceeded|";

/** Sentinel: clear a UI status indicator */
const CLEAR_STATUS: undefined = undefined;

/**
 * Register handlers for Z.ai quota auto-continue.
 */
export function registerZaiQuotaHandler(pi: ExtensionAPI): void {
  // --- message_end: attempt to prevent pi's built-in retry for quota errors ---
  //     Appends "quota_exceeded" marker so pi classifies the error as non-retryable.
  //     NOTE: This only works when the Z.ai JSON error body is present in the
  //     errorMessage. The first 500 error from the proxy is usually generic
  //     ("500 An error occurred...") without JSON, so the first retry is unavoidable.
  //     When the JSON body is available (second message), this prevents further retries.
  pi.on("message_end", async (event) => {
    if (event.message.role !== "assistant") return;
    const msg = event.message as { errorMessage?: string };
    if (!msg.errorMessage) return;
    if (!isZaiQuotaError(msg.errorMessage)) return;

    // Append non-retryable marker — pi's _isNonRetryableProviderLimitError
    // matches "quota exceeded" and will skip the built-in retry loop.
    return {
      message: {
        ...event.message,
        errorMessage: msg.errorMessage + NON_RETRYABLE_MARKER,
      },
    };
  });

  // --- agent_start: cleanup ---
  pi.on("agent_start", async () => {
    if (quotaTimer !== null) {
      clearTimeout(quotaTimer);
      quotaTimer = null;
    }
    if (statusInterval !== null) {
      clearInterval(statusInterval);
      statusInterval = null;
    }
    continueTime = null;
    // Clear the status slot before dropping uiRef, otherwise the widget
    // freezes at its last value (e.g. when the user sends a message while
    // a countdown is still pending — the timer callback that normally clears
    // the slot never fires because we cleared quotaTimer above).
    if (uiRef?.setStatus) {
      uiRef.setStatus("zai-continue", CLEAR_STATUS);
    }
    uiRef = null;
  });

  // --- agent_end: detect quota error and schedule auto-continue ---
  pi.on("agent_end", async (event, ctx) => {
    // Guard: skip if a timer is already pending (prevents stacking across rapid agent_end events)
    if (quotaTimer !== null) {
      if (ctx.hasUI) {
        ctx.ui.notify("⏳ Z.ai quota exhausted. Auto-continue already scheduled.", "info");
      }
      return;
    }

    // Find the last assistant message with an error
    const lastAssistant = event.messages
      ?.slice()
      .reverse()
      .find((m): m is Extract<typeof m, { role: "assistant" }> => m.role === "assistant");

    if (!lastAssistant?.errorMessage) return;
    // isZaiQuotaError checks for the original markers (rate_limit_error + 1308 + Usage limit reached)
    // The appended NON_RETRYABLE_MARKER doesn't affect this check.
    if (!isZaiQuotaError(lastAssistant.errorMessage)) return;

    const resetTime = parseQuotaResetTime(lastAssistant.errorMessage);
    if (!resetTime) {
      return;
    }

    // Calculate delay: reset time + random buffer (30-120s) to avoid hitting exactly at boundary
    const buffer = randomQuotaBuffer(30_000, 120_000);
    continueTime = resetTime + buffer;
    const delay = Math.max(0, continueTime - Date.now());

    // Stash UI reference for timer callbacks
    if (ctx.hasUI) {
      uiRef = {
        notify: ctx.ui.notify.bind(ctx.ui),
        setStatus: ctx.ui.setStatus.bind(ctx.ui),
      };
    }

    // Start status bar countdown (1s interval)
    if (uiRef?.setStatus) {
      const setStatus = uiRef.setStatus;
      const updateStatus = () => {
        if (continueTime == null) {
          setStatus("zai-continue", CLEAR_STATUS);
          return;
        }
        const remaining = Math.max(0, Math.floor((continueTime - Date.now()) / 1000));
        if (remaining > 0) {
          const timeStr = formatDuration(remaining * 1000);
          setStatus("zai-continue", `⏳ ${timeStr}`);
        } else {
          setStatus("zai-continue", "⏳ resuming...");
        }
      };
      updateStatus();
      statusInterval = setInterval(updateStatus, 1000);
    }

    // Schedule auto-continue
    quotaTimer = setTimeout(() => {
      quotaTimer = null;
      continueTime = null;
      if (statusInterval !== null) {
        clearInterval(statusInterval);
        statusInterval = null;
      }
      if (uiRef?.setStatus) {
        uiRef.setStatus("zai-continue", CLEAR_STATUS);
      }
      try {
        pi.sendUserMessage("continue", { deliverAs: "followUp" });
      } catch {
        // If sending fails (e.g., session ended), silently ignore
      }
    }, delay);

    // Notify user
    if (ctx.hasUI) {
      ctx.ui.notify(`⏳ Z.ai quota exhausted. Auto-continue in ${formatDuration(delay)}`, "info");
    }
  });
}
