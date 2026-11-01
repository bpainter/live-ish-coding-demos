/**
 * Takes the README's screenshot from a production build of the starter: the `faq` demo's after page
 * at its key step, with the spotlight and the code highlight showing. Run `pnpm build` first.
 *
 *   node --import tsx scripts/readme-shot.mts
 */
import path from "node:path";
import { chromium } from "@playwright/test";
import { REPO, serve, stop, waitForUrl } from "./ci/lib.mts";

const PORT = process.env.SHOT_PORT ?? "3219";
const deck = path.join(REPO, "examples", "starter");
const base = `http://localhost:${PORT}`;
const server = serve(path.join(deck, "node_modules", ".bin", "next"), ["start", "-p", PORT], deck);
const browser = await chromium.launch();
try {
  await waitForUrl(`${base}/_health`, 60_000);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${base}/present?s=faq-after`);
  await page.waitForSelector('iframe.page-frame__iframe[data-visible="true"]');
  await page.waitForTimeout(1200);
  for (const _ of [1, 2]) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: path.join(REPO, "docs", "assets", "demo-slide.png") });
  console.log("wrote docs/assets/demo-slide.png");
} finally {
  await browser.close();
  stop(server);
}
