# Security policy

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/bpainter/live-ish-coding-demos/security/advisories/new). Do not open a public issue, and do not send a report to any person's own inbox.

Include the version, the steps to reproduce and what an attacker gains.

## What to expect

This is a best-effort project with one maintainer. The target for a first response is 7 days. There is no promise on the time to a fix. A confirmed issue gets an advisory and a changelog entry, with credit if you want it.

## Supported versions

Only the latest minor gets fixes. During `0.x`, that means the latest `0.y` release.

## Threat model

A deck runs its author's code. Anything in `demos/` and `routes.ts` has the same trust as the rest of the deck, and Live-ish does not sandbox an author from themselves.

| Boundary               | What it protects                                                                                                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The frame sandbox      | Frames run with `allow-scripts allow-same-origin`. On two origins, a frame cannot read the presenter. This is the boundary between a demo and the windows that drive it.                                                                                  |
| Two-host mode          | `hosts.frames` puts frames on their own origin in production. Use it for a demo that runs code you did not write. On one host, a frame can reach `parent.document`, so one-host mode is for your own code. `live-ish check` warns on third-party scripts. |
| Notes on a public host | `/present` and `/speaker` are left out of a deployed build by default, and notes reach no payload. `live-ish build` reads the finished build back and fails if a note is in it.                                                                           |
| Recordings             | `live-ish record` stops on a token-like line, and the `terminal-token` rule fails on one.                                                                                                                                                                 |

A report is in scope when it crosses one of these boundaries, or when an engine feature does something the docs say it will not.

Out of scope: a demo's own bugs, and a deck author who turns a boundary off.

## Supply chain

- Publishing uses npm trusted publishing with staged releases, in one protected workflow. There is no npm token anywhere.
- Installs hold new versions for three days and deny build scripts by default. See `pnpm-workspace.yaml` and [the exception path](CONTRIBUTING.md#urgent-dependency-fixes).
- Every GitHub Action is pinned to a full commit SHA.
