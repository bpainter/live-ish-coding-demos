import assert from "node:assert/strict";
import { test } from "node:test";
import { actionForKey, keyHelpFor } from "../src/lib/keys";
import { otherWindow } from "../src/lib/presenter/open-window";

const press = (key: string) => ({ key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false });

test("s reaches the other window from each presenter window", () => {
  assert.deepEqual(actionForKey(press("s"), "audience"), { type: "open-other-window" });
  assert.deepEqual(actionForKey(press("s"), "speaker-preview"), { type: "open-other-window" });
  assert.equal(otherWindow("speaker").path, "/present");
  assert.equal(otherWindow("audience").path, "/speaker");
});

test("a reader has no s key, and its help does not list one", () => {
  assert.equal(actionForKey(press("s"), "reader"), null);
  assert.ok(!keyHelpFor("reader").some((row) => row.keys.includes("s")));
});
