# Documentation Index

Start here to find the right document. The [repo README](../README.md) covers install and supported actions; the [plugin README](../plugin/README.md) covers the implementation workspace.

## Using the plugin

| Document | What it covers |
| --- | --- |
| [Set Up VDO.Ninja on Stream Deck](getting-started.md) | Plain-language setup, key colours, and troubleshooting. No programming knowledge assumed. |
| [VDO.Ninja Version Compatibility Audit](vdo-version-compatibility.md) | Which controls work on older VDO.Ninja builds, and what `Activate Guest` needs. |

## Building on the plugin

| Document | What it covers |
| --- | --- |
| [Plugin Architecture and Roadmap](plugin-architecture.md) | The high-level architecture and where the project is heading. |
| [VDO.Ninja Stream Deck Plugin Build Plan](streamdeck-plugin-build-plan.md) | The concrete product/build plan: action classes, default profiles, state model, acceptance checks. |
| [Stream Deck Plugin Best Practices](streamdeck-plugin-best-practices.md) | Reusable checklist for any Stream Deck plugin, including the icon and manifest rules this repo follows. |
| [Stream Deck Hardware and SDK Notes](hardware-and-sdk-notes.md) | Hardware surfaces, key/dial differences, and SDK constraints. |

## VDO.Ninja API reference

| Document | What it covers |
| --- | --- |
| [Verified API Commands, Values, and Callback Payloads](verified-api-command-and-callback-reference.md) | The working reference for the command registry and state parser, checked against runtime source. |
| [VDO.Ninja API Action Map](vdo-api-action-map.md) | How the API surface maps onto Stream Deck actions. |
| [VDO.Ninja API Surfaces and State](api-surfaces-and-state.md) | `&api` WebSocket/HTTP/SSE, iframe `postMessage`, and WebRTC data-channel routing. |

## Reviews and audits

| Document | What it covers |
| --- | --- |
| [Runtime Comparison Audit](runtime-comparison-audit.md) | The implementation compared against the current VDO.Ninja runtime. |
| [Professional Parity and No-Regression Review](professional-parity-and-no-regression-review.md) | Whether the plugin would be a regression for Companion users, and what Marketplace-ready requires. |
| [Onboarding and Configuration Review](onboarding-and-configuration-review.md) | How Stream Deck plugins usually guide setup, and what that implies here. |
| [Bitfocus Companion VDO.Ninja Module Research](companion-module-research.md) | What the existing Companion module does, as the parity baseline. |

Research and audit documents carry their own dates. Treat anything dated as a snapshot of that day's source, not a live description of the plugin.
