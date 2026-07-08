// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 avtc <tarasenkov@gmail.com>

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for the Z.ai quota auto-continue lifecycle.
 *
 * The handlers close over module-level state (timer/interval/UI refs), so each
 * test resets the module registry and re-imports the handler for isolation, and
 * uses fake timers so the scheduled setTimeout (reset time + random buffer) never
 * actually fires during the test.
 */

interface FakePi {
  events: Map<string, ((event: unknown, ctx?: unknown) => Promise<unknown> | unknown)[]>;
  sentUserMessages: { content: string; deliverAs: string }[];
}

function makeFakePi(): FakePi & ExtensionAPI {
  const events: FakePi["events"] = new Map();
  const sentUserMessages: FakePi["sentUserMessages"] = [];
  const pi = {
    on: (event: string, handler: (event: unknown, ctx?: unknown) => Promise<unknown> | unknown) => {
      const list = events.get(event);
      if (list) {
        list.push(handler);
      } else {
        events.set(event, [handler]);
      }
    },
    sendUserMessage: (content: string, options?: { deliverAs?: string }) => {
      sentUserMessages.push({ content, deliverAs: options?.deliverAs ?? "followUp" });
    },
  };
  return { ...pi, events, sentUserMessages } as unknown as FakePi & ExtensionAPI;
}

/** Format an epoch ms as a Z.ai "will reset at YYYY-MM-DD HH:MM:SS" string in Beijing time (UTC+8). */
function beijingResetString(epoch: number): string {
  const d = new Date(epoch + 8 * 3600_000); // shift epoch forward, then read UTC parts = Beijing wall clock
  const pad = (n: number) => String(n).padStart(2, "0");
  return `will reset at ${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** Build a Z.ai quota error message with a reset time `offsetMs` in the future. */
function quotaErrorMessage(offsetMs: number): string {
  const reset = beijingResetString(Date.now() + offsetMs);
  return `{"type":"error","error":{"type":"rate_limit_error","code":"1308","message":"[1308][Usage limit reached for 5 hour. Your limit ${reset}]"}}`;
}

describe("registerZaiQuotaHandler — status slot lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears the status slot when a new agent run starts while a countdown is pending", async () => {
    const { registerZaiQuotaHandler } = await import("../src/agent-lifecycle.js");
    const pi = makeFakePi();
    registerZaiQuotaHandler(pi);

    const statusUpdates: { slot: string; text: string | undefined }[] = [];
    const ctx = {
      hasUI: true,
      ui: {
        notify: () => {},
        setStatus: (slot: string, text: string | undefined) => {
          statusUpdates.push({ slot, text });
        },
      },
    };

    // Simulate agent_end with a quota error: schedules the countdown timer + interval
    // and paints the status slot (e.g. "⏳ 35s"). Reset time is 1h in the future.
    const endHandlers = pi.events.get("agent_end");
    expect(endHandlers).toBeDefined();
    const onAgentEnd = endHandlers?.[0];
    await onAgentEnd?.(
      { type: "agent_end", messages: [{ role: "assistant", errorMessage: quotaErrorMessage(3600_000) }] },
      ctx,
    );

    // The slot was painted with a countdown string.
    expect(
      statusUpdates.some((u) => u.slot === "zai-continue" && typeof u.text === "string" && u.text.startsWith("⏳")),
    ).toBe(true);

    // User sends a message → a new agent run starts → agent_start fires.
    const startHandlers = pi.events.get("agent_start");
    expect(startHandlers).toBeDefined();
    const onAgentStart = startHandlers?.[0];
    await onAgentStart?.(undefined);

    // BUG BEING FIXED: the slot must be cleared when the run starts; otherwise the
    // widget freezes at its last value because the timer callback (which clears it)
    // was cancelled by agent_start.
    expect(statusUpdates.some((u) => u.slot === "zai-continue" && u.text === undefined)).toBe(true);

    // The scheduled auto-continue timer was cancelled by agent_start, so no message was sent.
    expect(pi.sentUserMessages.some((m) => m.content === "continue")).toBe(false);
  });

  it("fires auto-continue and clears the slot when the timer elapses uninterrupted", async () => {
    const { registerZaiQuotaHandler } = await import("../src/agent-lifecycle.js");
    const pi = makeFakePi();
    registerZaiQuotaHandler(pi);

    const statusUpdates: { slot: string; text: string | undefined }[] = [];
    const ctx = {
      hasUI: true,
      ui: {
        notify: () => {},
        setStatus: (slot: string, text: string | undefined) => {
          statusUpdates.push({ slot, text });
        },
      },
    };

    // Reset time ~1h in the future → timer scheduled for reset + up to ~120s buffer.
    const endHandlers = pi.events.get("agent_end");
    expect(endHandlers).toBeDefined();
    await endHandlers?.[0]?.(
      { type: "agent_end", messages: [{ role: "assistant", errorMessage: quotaErrorMessage(3600_000) }] },
      ctx,
    );

    // Advance past the maximum possible delay (1h reset + 120s buffer) and flush.
    await vi.advanceTimersByTimeAsync(3600_000 + 120_000 + 1000);

    // Auto-continue message was sent and the slot was cleared.
    expect(pi.sentUserMessages.some((m) => m.content === "continue")).toBe(true);
    expect(statusUpdates.some((u) => u.slot === "zai-continue" && u.text === undefined)).toBe(true);
  });
});
