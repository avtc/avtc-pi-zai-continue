# avtc-pi-zai-continue

Auto-continue after Z.ai usage limit resets.

## What it does

When Z.ai hits a 5-hour usage limit (error code 1308), this extension:

1. **Detects** the quota error
2. **Works out** when the quota resets
3. **Schedules** an automatic "continue" for shortly after the reset (with a small buffer, so it doesn't fire exactly on the boundary)
4. **Shows** a live countdown in the status bar, plus a one-shot notification with the wait time

## Why

Z.ai's rate-limit errors cause repeated failed API calls before the quota is caught. This extension ensures a single, well-timed auto-continue after the quota resets, rather than multiple wasted retries.

## Installation

```bash
pi install git:github.com/avtc/avtc-pi-zai-continue
```

## Usage

No configuration needed. The extension activates automatically when installed. When a quota error is detected, you'll see a notification like:

```
⏳ Z.ai quota exhausted. Auto-continue in 2h 9m 32s
```

## Known Limitations

- **Cannot prevent pi's built-in retries** — pi may still attempt a few retries before the quota error surfaces. This is pi's internal retry behavior and cannot be controlled from an extension.
- **Requires parseable reset timestamp** — the extension needs the `will reset at YYYY-MM-DD HH:MM:SS` pattern in the error message.

> Developed with [Z.ai](https://z.ai/subscribe?ic=N5IV4LLOOV) — get 10% off your subscription via this referral link.

## License

MIT
