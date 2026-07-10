# VDO.Ninja Version Compatibility Audit

Audit date: 2026-07-10.

## Scope

The plugin command registry and transport were compared directly with:

- Current local VDO.Ninja source: v30.2.
- Last source immediately before v30.1: v29.4, commit `8a2ef7fdddb6b06a4572bc422e57385f310d0457`.
- The reference API relay in `Companion-Ninja/server/oscninja.js`.

No VDO.Ninja source or established API handler was changed during this plugin review.

## Result

Every command exposed by the plugin except `activateQueuedGuest` and the newer `muteAllGuests` convenience wrapper exists in the checked v29.4 API surface. The plugin no longer depends on the wrapper and does not use the current-month scene-force extension where a legacy-safe path exists.

| Plugin area | API commands sent | Pre-v30.1 behavior |
| --- | --- | --- |
| Connection/state | `getDetails`, `getGuestList` | Existing shapes retained. |
| Local controls | `mic`, `camera`, `speaker`, `record`, `togglescreenshare`, `togglehand`, `forceKeyframe`, `reload`, `hangup` | Existing shapes retained. Record uses explicit `true` or `false`; VDO.Ninja has no record toggle command. |
| Guest controls | `mic`, `camera`, `speaker`, `display`, `volume`, `group`, `forward`, `hangup`, solo/chat/refresh commands | Existing shapes retained. Commands whose `false` result means rejection now show an alert. |
| Guest keyframe | `forceKeyframe` | Sent without waiting for a callback because the legacy target handler performs the action but returns no result. |
| Guest scene toggle | `addScene` | Existing toggle shape retained. |
| Fixed scene force | `addScene`, `addScene2` through `addScene8` | Uses the historical boolean semantics. The legacy handler sets the current button value and then toggles, so the payload intentionally sends the inverse of the desired final state. |
| Named scene force | `addScene` | Uses live `getDetails.scenes` state. It skips an already-correct state or sends one legacy toggle. If state is unavailable, it alerts instead of risking the wrong result. |
| Layout/slot | `layout`, `setslot` | Existing shapes retained. |
| Mute all | One targeted `mic` command per non-director guest | Replaces the v30.2-only `muteAllGuests` wrapper with the long-standing guest mic path. Directors and screen-share pseudo-guests are excluded. |
| Transfer all | One `forward` command per non-director guest | Existing shape retained, with the existing two-press safety guard. |
| PTZ | Local `zoom`/`pan`/`tilt`/`focus`/`exposure`; guest `ptz*` commands | Existing v29.4 shapes retained. Unsupported local/guest combinations are normalized before a button can send them. |
| Value dials | `volume`, `panning`, `bitrate`, `setBufferDelay` | Existing shapes retained. All-stream buffer delay continues to use `value2: "*"`. |
| Activate held guest | `activateQueuedGuest` | Requires v30.2+. No equivalent native `&api` command exists in v29.4, so the inspector labels this limitation and an older page returns an alert. |

## Transport Compatibility

- Simple awaited commands use the established HTTP GET relay routes so the relay can own and resolve callback IDs.
- Commands with `value2` use raw WebSocket payloads, preserving secondary values on older pages that already support them.
- If an existing installation has HTTP routing disabled, the plugin now sends WebSocket commands without a callback ID. The reference relay consumes callback IDs for HTTP requests and does not forward those callbacks to peer WebSocket clients, so waiting for them caused false timeouts.
- `failed` and `timeout` relay responses remain errors.

## Automated Coverage

The test suite now checks:

- Every local and guest command exposed in the property inspector builds a registry payload.
- Property-inspector command choices match the runtime registry.
- Every inspector button has and executes a click handler in a configured-state harness.
- Scene and mute-all payloads use the legacy-compatible shapes above.
- Invalid PTZ target/control combinations normalize to supported controls.
- WebSocket-only commands omit callback IDs.
- Manifest, TypeScript, build output, and package layout validate with Elgato's CLI.

Physical Stream Deck key/dial and browser permission prompts still require a hardware or Stream Deck Mobile smoke test.
