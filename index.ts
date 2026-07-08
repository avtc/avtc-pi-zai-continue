// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 avtc <tarasenkov@gmail.com>

/**
 * pi-zai-continue — Auto-continue after Z.ai usage limit resets.
 *
 * Detects Z.ai rate-limit errors (code 1308) and schedules an automatic
 * "continue" message after the quota resets, with a random buffer.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerZaiQuotaHandler } from "./src/agent-lifecycle.js";

// Idempotent wiring guard. zai-continue can be bundled into the avtc-pi umbrella
// AND installed standalone — whichever copy loads first wires, the rest no-op.
// globalThis persists across jiti re-imports and pi reloads.
const WIRED_KEY = "__avtcPiZaiContinueWired";
type GlobalWithWired = typeof globalThis & { [WIRED_KEY]?: boolean };

export default function (pi: ExtensionAPI) {
  const g = globalThis as GlobalWithWired;
  if (g[WIRED_KEY]) return;
  g[WIRED_KEY] = true;

  registerZaiQuotaHandler(pi);

  // pi re-evaluates this module fresh on /reload, but globalThis persists across
  // the reload. Without resetting the wired flag on shutdown, the guard would
  // short-circuit re-wiring and leave the extension dead after a reload.
  pi.on("session_shutdown", () => {
    (globalThis as GlobalWithWired)[WIRED_KEY] = false;
  });
}
