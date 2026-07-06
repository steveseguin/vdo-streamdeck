# Stream Deck Plugin Best Practices

Reusable checklist and rationale for building Elgato Stream Deck plugins. Written from the 2026-07-05 review of the VDO.Ninja plugin; each practice notes why it matters and, where relevant, where this repo applies it. Sizes and format rules below come from the official manifest schema (`@elgato/schemas/streamdeck/plugins/manifest.json`), not from memory.

## 1. Icons and image assets

### Every image slot has its own spec — don't reuse one tile everywhere

| Slot | Manifest field | Size (@1x / @2x) | Format | Style rule |
|---|---|---|---|---|
| Plugin icon (preferences/marketplace) | `Icon` (root) | 256×256 / 512×512 | **PNG only** | Full-color allowed |
| Category icon (action list header) | `CategoryIcon` | 28×28 / 56×56 | PNG or SVG | **Monochrome #FFFFFF on transparent** |
| Action list icon | `Actions[].Icon` | 20×20 / 40×40 | PNG or SVG | **Monochrome #FFFFFF on transparent** |
| Key state image | `States[].Image` | 72×72 / 144×144 | PNG, SVG, or GIF | Full-color; this is what shows on the key |
| Multi-action image | `States[].MultiActionImage` | 72×72 / 144×144 | PNG or SVG | Full-color |
| Encoder (dial) icon | `Encoder.Icon` | 72×72 / 144×144 | PNG or SVG | Shown in circular dial canvas |
| Touchscreen background | `Encoder.background` | 200×100 / 400×200 | PNG or SVG | Behind the touch layout |

Why it matters: a dark full-color key tile used as an action-list icon renders as a muddy square on the dark action-list background and fails marketplace review. The list wants small white glyphs; the key wants a rich tile. They are different assets with different jobs.

Practices:

- **Prefer SVG for list/category/state icons.** One SVG covers @1x and @2x with no scaling artifacts. The plugin icon is the exception — the schema requires PNG there.
- **Give each role its own path.** Don't point `Actions[].Icon`, `States[].Image`, and `Encoder.Icon` at the same extensionless path; you can't style one role without breaking another. This repo uses `imgs/actions/*.svg` for list glyphs and keeps `imgs/*.png` tiles for key states.
- **Never generate @2x by nearest-neighbor upscaling @1x.** It defeats the purpose of @2x (crisp rendering on high-DPI). Render at native resolution from the vector source, or at minimum render the largest size and downscale.
- **Make sure your build actually ships the icons.** This repo had spec-correct SVG glyphs sitting in source that never reached the `.sdPlugin` folder because the copy script filtered to `*.png` only. After any asset change, list the built `.sdPlugin/imgs/` folder and confirm.
- Keep glyphs simple: one concept per icon, 1.5–2px stroke weight at 20×20, consistent optical size across the set so the action list looks like one family.

## 2. Manifest checklist

- `Description`: mention every controller type you support ("keys and dials"), and the one-line value proposition — this is marketplace copy.
- `URL`: link to the product website. `SupportURL` exists too but only from Stream Deck 6.9 — check your `Software.MinimumVersion` before using it.
- `Tooltip` per action: one sentence, task-oriented; it's the only inline help users see while browsing actions.
- `UserTitleEnabled: false` on any action whose title the plugin renders via `setTitle`. Otherwise users type a title into the Stream Deck field and your plugin silently overwrites it — a confusing fight the user always loses. Offer a title/template setting in the property inspector instead (this plugin uses `{slot}`, `{label}`, `{state}` tokens).
- `DisableAutomaticStates: true` for feedback-driven keys. Without it, Stream Deck flips the state image on every press regardless of what actually happened; you want state to reflect reality reported by the controlled app.
- `Controllers` accurate per action (`Keypad` vs `Encoder`), with `TriggerDescription` filled in for encoders — it's what the UI shows for rotate/push/touch.
- Validate constantly: `npx @elgato/cli validate <sdPlugin>` and `pack --dry-run` are fast and catch manifest/layout errors without hardware.

## 3. Property inspector UX and onboarding

### Setup-first, then get out of the way

The property inspector is the only onboarding surface a Stream Deck plugin has. Two competing needs:

1. A first-time user who drops *any* action must be led through setup without reading docs.
2. A configured user who clicks an action wants that action's settings immediately — not two screens of setup to scroll past.

Resolution used here and recommended generally:

- Keep a compact **connection status bar always visible at the top** of every action's inspector (colored dot + short sentence).
- Put the full setup panel (key entry/generation, link builder, QR, test) in a **collapsible section that auto-expands only when setup is incomplete** (no API key yet) **or on the dedicated connection/setup action**. Everyone else sees it collapsed with their action's settings first.
- Initialize the expanded/collapsed choice **after real global settings arrive**, and only once — don't fight the user's manual toggle on every settings echo.

### Status language: report the state that matters to the user

"Connected to relay" and "the app you want to control answered" are different states, and users only care about the second. Enumerate explicit states with plain-language messages — e.g. missing key / connecting / waiting for page / connected / timeout / error — and phrase the waiting state as an instruction ("Open your generated link and keep that page open"), not a protocol report.

Use color + text together (a red dot alone is not accessible); keep `<label for=...>` on every field.

### Reduce manual URL/config editing

If setup involves the user constructing a URL or config string, build it for them: page-type dropdown, the two or three fields that matter, generated output with Copy / Open / QR buttons. Generate credentials (API keys) with one click using `crypto.getRandomValues`. Every manual editing step is a support ticket.

Group buttons by what they operate on: key actions (Generate / Copy / Show / Test) next to the key field, URL actions (Copy / Open / QR) next to the generated URL. A misplaced button (Show Key living in the URL row) reads as belonging to the wrong object.

### Settings persistence pitfalls

- **Save-on-input is fine, but guard the side effects.** If a global-settings write triggers a reconnect in the plugin, typing an API key character-by-character causes a reconnect per keystroke. In the plugin, only reconnect when connection-relevant fields actually changed; in the inspector, only reset the visible status when connection-relevant fields changed (otherwise editing an unrelated field stomps a "Connected" status with "please test again").
- **Dropdown + manual-entry pairs need an explicit precedence rule.** If a saved manual ID always wins, picking from the dropdown silently does nothing. Rule: the control the user touched last wins — clear the manual field when a dropdown choice is made.
- Populate dropdowns from live data with a Refresh button and a meaningful empty state ("No guests detected"), and keep a manual escape hatch for values that aren't currently live.

### Native look

Elgato's `sdpi-components` web components give the property inspector the native Stream Deck look (correct fonts, spacing, dark theme) for free and handle the settings plumbing. Hand-rolled CSS is acceptable (this plugin's is close), but budget for matching future Stream Deck theme changes yourself.

## 4. Runtime behavior

### Never let the plugin process die

The Stream Deck runtime does not resurrect your plugin gracefully mid-session; an uncaught exception kills every key. Real example from this plugin's logs: `ws.close()` on a socket still in CONNECTING state throws, and a global-settings change mid-connect crashed the whole process. Rules:

- Guard socket teardown: `terminate()` a CONNECTING socket, `close()` an OPEN one, wrap in try/catch, and swallow the error event of a discarded socket after `removeAllListeners()`.
- Check the `.sdPlugin/logs/` directory after every manual test session — crashes you never saw in the UI are recorded there.
- Reconnect with capped backoff; reset the backoff on successful connect.

### State feedback discipline

- With `DisableAutomaticStates: true`, set state explicitly from reported app state, never from "I sent the command".
- Subscribe actions to a shared session store and re-render all visible instances on change, rather than each action polling.
- **Any transient title/state you set must have a path back.** The "Press again" arming title here originally persisted forever if the user walked away; fix was a timer that re-renders when the arm window lapses. Grep your code for every `setTitle` that isn't part of the normal render path and ask "what clears this?".

### Dangerous actions

Two-press confirmation (arm on first press, execute within a window) is a good pattern for destructive commands (hangup, transfer-all). Requirements: visible armed feedback, a short expiry (~2s), automatic visual reset on expiry, and a per-action settings toggle so power users can disable it.

### Continuous controls (dials/encoders)

- Send relative deltas, accumulate fast ticks, and rate-limit sends to a configured interval (this plugin: 80–100ms default) — otherwise a fast spin floods the transport.
- Add a backpressure guard: skip *incremental* realtime commands when messages/sec or socket bufferedAmount is high, but never skip discrete commands (scene toggles, mutes) — a dropped nudge is invisible, a dropped mute is a bug.
- Give push/touch a useful default (reset value / cycle control) and describe it in `TriggerDescription`.
- Support invert and optional acceleration; different users mount dials differently.

### Momentary keys (push-to-talk)

Send explicit on/off for key-down/key-up rather than toggle twice, and use per-key sequence counters so a stale async completion can't repaint the key after a newer release event.

## 5. Testing and release workflow

Runnable without hardware, in order:

```bash
npm test                                   # pure-logic units: payload builders, parsers, state normalization
npm run check                              # tsc --noEmit
npm run build                              # emit + copy into .sdPlugin
npx @elgato/cli validate <sdPlugin> --no-update-check
npx @elgato/cli pack <sdPlugin> --dry-run --no-update-check
```

- Keep command payload construction, settings normalization, and state merging in pure modules so they're unit-testable without the Stream Deck runtime (this repo's `command-registry` / `settings` / `session-store` split).
- After building, spot-check the `.sdPlugin` folder: stale build output is a classic source of "fixed it but the bug persists" (line numbers in crash logs here pointed at an older build than src).
- Manual test matrix: at least one keypad action with feedback, one encoder, the setup flow from a clean profile, and kill/restart of the controlled app while keys are visible.

## 6. Marketplace/distribution checklist

- [ ] Plugin icon 256/512 PNG; category + action list icons monochrome white SVG/PNG at spec sizes.
- [ ] `URL` set; `SupportURL` if `MinimumVersion` ≥ 6.9.
- [ ] Description mentions all supported hardware (keys, dials, touch strip).
- [ ] Tooltips on every action.
- [ ] Bundled profiles per device class (Mini / MK.2 / XL / Plus / Pedal) once the action set stabilizes — first-time users should not build a layout from scratch.
- [ ] No secrets (API keys) in screenshots, docs, or logged output.
- [ ] Version bumped in manifest (four-part `x.y.z.build`).

## 7. Things done well in this plugin worth repeating elsewhere

- Command registry pattern: all VDO.Ninja API commands defined declaratively in one module; actions stay thin.
- Explicit connection-state machine with distinct `no-page` vs `disconnected` vs `timeout` — most plugins conflate these.
- Sequence guards on momentary sends; backpressure guard on realtime dial traffic.
- Capability hints in the inspector ("this action needs a director page…") driven by what the controlled page actually reports — contextual help at the moment of misconfiguration beats documentation.
- QR code generated locally in the inspector (no external service, works offline, no key leakage).
