# avtc-pi-zai-continue

Auto-continue after Z.ai usage limit resets, with a live countdown and retry suppression.

## What it does

When Z.ai hits a 5-hour usage limit (error code 1308), this extension:

1. **Detects** the quota error and marks it non-retryable so pi stops its built-in retry loop
2. **Parses** when the quota resets from the error message
3. **Schedules** an automatic "continue" for shortly after the reset (with a small buffer, so it doesn't fire exactly on the boundary)
4. **Shows** a live countdown in the status bar, plus a one-shot notification with the wait time

## Installation

```bash
pi install npm:avtc-pi-zai-continue
```

## Usage

No configuration needed. The extension activates automatically when installed. When a quota error is detected, you'll see a notification like:

```
⏳ Z.ai quota exhausted. Auto-continue in 2h 9m 32s
```

## Full suite

Check out the full suite of related extensions, [avtc-pi](https://github.com/avtc/avtc-pi) — deterministic feature development, subagent delegation, working-memory, behavioral learning, parallel-work guardrails, durable decisions, notifications, and more.

Developed with [Z.ai](https://z.ai/subscribe?ic=N5IV4LLOOV) — get 10% off your subscription via this referral link.

## License

MIT
