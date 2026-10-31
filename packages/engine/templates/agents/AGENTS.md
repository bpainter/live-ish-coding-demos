# Deck instructions

This folder is a Live-ish deck: scripted demos of code and UI, driven by a clicker. The engine is the `@live-ish/engine` package. This folder holds the content.

## Commands

- `pnpm dev` serves the deck at <http://localhost:3000/present>.
- `pnpm live-ish check --json` runs the validators. Exit 0 passes, 1 means findings, 2 misuse, 3 environment.
- `pnpm live-ish new copy "Title"`, `new web-demo <id>` and `new terminal-demo <id>` add content.
- `pnpm live-ish record <id>` records a terminal demo from its `session.txt`.
- `pnpm live-ish actions --json` lists the step actions and the assert grammar.
- `pnpm live-ish explain <rule>` explains a finding.

## Rules

- Use `live-ish new` to create slides. Do not hand-write engine internals.
- Edit only `slides/`, `demos/`, `themes/`, `public/` and `deck.config.ts`.
- Never edit `app/`, `next.config.ts`, `.live-ish/` or `node_modules/`.
- Run `live-ish check --json` after each change, and fix what it reports.
- Take browser support from `live-ish support`. Never state it from memory.
- Do not deploy unless the user asks.
- Speaker notes are the author's words. Ask before rewriting them.
