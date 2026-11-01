// `live-ish build` for the docs. A deployed deck needs a site, and the docs have one unless the host
// says otherwise, such as a preview or the link check's local port.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { DOCS, REPO, SITE } from "../lib/source";

const env = { ...process.env, LIVE_ISH_SITE_ORIGIN: process.env.LIVE_ISH_SITE_ORIGIN || SITE };
const cli = path.join(REPO, "packages", "engine", "bin", "live-ish.mjs");
const { status } = spawnSync(process.execPath, [cli, "build"], { cwd: DOCS, env, stdio: "inherit" });
process.exit(status ?? 1);
