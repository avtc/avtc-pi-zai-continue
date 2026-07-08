// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 avtc <tarasenkov@gmail.com>

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the quota handler so we can assert the entry function re-invokes it on
// re-wire (after a reload) without coupling to its internal pi.on registrations.
vi.mock("../src/agent-lifecycle.js", () => ({
  registerZaiQuotaHandler: vi.fn(),
}));

import entry from "../index.js";
import { registerZaiQuotaHandler } from "../src/agent-lifecycle.js";

const WIRED_FLAG = globalThis as unknown as { __avtcPiZaiContinueWired?: boolean };

/**
 * The entry guards against double-registration via a globalThis flag so the
 * package can be safely bundled into the avtc-pi umbrella AND installed
 * standalone — whichever loads first wires, the rest no-op.
 */
describe("zai-continue entry (idempotent wiring)", () => {
  beforeEach(() => {
    delete WIRED_FLAG.__avtcPiZaiContinueWired;
    vi.mocked(registerZaiQuotaHandler).mockClear();
  });
  afterEach(() => {
    delete WIRED_FLAG.__avtcPiZaiContinueWired;
    vi.restoreAllMocks();
  });

  /** Build a mock pi whose `.on` records every handler, keyed by event name. */
  function createMockPi() {
    const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
    const on = vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      const list = handlers.get(event);
      if (list) list.push(handler);
      else handlers.set(event, [handler]);
    });
    return {
      pi: { on } as unknown as ExtensionAPI,
      handlers,
    };
  }

  it("wires on first call (registers the quota handler)", () => {
    const { pi } = createMockPi();
    expect(() => entry(pi)).not.toThrow();
    expect(registerZaiQuotaHandler).toHaveBeenCalledTimes(1);
  });

  it("is idempotent — second call no-ops (handler not re-registered)", () => {
    const { pi } = createMockPi();
    entry(pi); // first call wires
    // Second call must return early without throwing or re-wiring.
    expect(() => entry(pi)).not.toThrow();
    expect(registerZaiQuotaHandler).toHaveBeenCalledTimes(1);
  });

  it("sets the globalThis wired flag after first call", () => {
    expect(WIRED_FLAG.__avtcPiZaiContinueWired).toBeUndefined();
    entry(createMockPi().pi);
    expect(WIRED_FLAG.__avtcPiZaiContinueWired).toBe(true);
  });

  it("re-wires after session_shutdown so /reload restores the extension", () => {
    const { pi, handlers } = createMockPi();

    // 1st call wires: quota handler registered + flag set.
    entry(pi);
    expect(registerZaiQuotaHandler).toHaveBeenCalledTimes(1);
    expect(WIRED_FLAG.__avtcPiZaiContinueWired).toBe(true);

    // 2nd call is a no-op (still wired).
    entry(pi);
    expect(registerZaiQuotaHandler).toHaveBeenCalledTimes(1);

    // A session_shutdown handler must be registered so the flag can be reset
    // before a reload. (This is the fix under test.)
    const shutdownHandlers = handlers.get("session_shutdown");
    expect(shutdownHandlers).toBeDefined();
    expect(shutdownHandlers?.length).toBeGreaterThan(0);

    // Fire the shutdown handler(s) — simulates the session ending before /reload.
    for (const h of shutdownHandlers ?? []) h();

    // globalThis persists across the reload; the flag must be cleared so the
    // re-evaluated module re-wires instead of short-circuiting.
    expect(WIRED_FLAG.__avtcPiZaiContinueWired).toBe(false);

    // 3rd call (post-reload): re-wires because the flag was reset.
    entry(pi);
    expect(registerZaiQuotaHandler).toHaveBeenCalledTimes(2);
    expect(WIRED_FLAG.__avtcPiZaiContinueWired).toBe(true);
  });
});
