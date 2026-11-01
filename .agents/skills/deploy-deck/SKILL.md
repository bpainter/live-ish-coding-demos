---
name: deploy-deck
description: Deploy a Live-ish deck to the user's host. Use only when the user explicitly runs this skill or asks to deploy. Do not use to run a deck locally (use the dev server or live-ish present), or as a step in any other task, because it publishes the deck.
license: MIT
compatibility: Requires a Live-ish deck with schemaVersion 1.
metadata:
  live-ish-schema: "1"
---

# Deploy a deck

Run `live-ish` through the deck's package manager, such as `pnpm live-ish check`.

1. Ask which host, if the user has not said. Never assume an account or a project.
2. Run `live-ish check --strict --json`. Fix or report every finding. Stop if it fails.
3. Confirm the settings in `deck.config.ts`. `hosts.site` must name the public address, unless the host supplies it. Say out loud if `presenter.onHost` or `reader.notes` is on, since either one makes speaker notes public.
4. Run `live-ish build`. It reads the finished build back and fails if a speaker note is in it. Stop if it fails.
5. Deploy with the host's own command line tool, using the user's existing login. Show the command first, and run it only after the user agrees. Never print or store a token.
6. Open the address, and tell the user what you deployed and where.

## Hosts

- Vercel works with the normal Next.js project setup. It runs the deck's `build` script, which is `live-ish build`.
- Any host that runs Next.js with a Node server can work. A proxy must forward `host` and `x-forwarded-proto`.
- Static hosts are not supported: frames come from server routes.
- A server-backed demo does not deploy with the deck. Its page shows a poster unless `hosts.external` names a deployed server.

`/present` and `/speaker` answer 404 on a host by default. To present, run `live-ish present` on the laptop.

## Rules

- Use the public CLI and schema. Never write engine internals by hand.
- Run `live-ish check` before saying a task is done.
- Never state browser support without `live-ish support`.
- If `check` fails twice on the same issue, stop and report it.
