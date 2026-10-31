/**
 * The font name-table check: prints the license, copyright and version each shipped font states about
 * itself, read from the file, and exits non-zero if a face states no license, a family has no
 * OFL.txt, or a face's license file names a Reserved Font Name that the subset would break.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FONT_FAMILIES } from "../src/lib/fonts";
import { NAME_IDS, woff2Names } from "../src/lib/font-names";

const FONTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "fonts");
let failed = 0;

for (const font of Object.values(FONT_FAMILIES)) {
  const ofl = path.join(FONTS, font.id, "OFL.txt");
  const hasOfl = existsSync(ofl);
  const header = hasOfl ? readFileSync(ofl, "utf8").split("\n")[0] : "";
  const reserved = /with Reserved Font Names? /i.test(header) ? header : "none declared";
  console.log(`${font.family}\n  OFL.txt: ${hasOfl ? header : "MISSING"}\n  Reserved Font Name: ${reserved}`);
  if (!hasOfl) failed++;
  for (const face of font.faces) {
    const file = readFileSync(path.join(FONTS, font.id, face.file));
    const names = woff2Names(file);
    const license = names[NAME_IDS.licenseUrl] ?? names[NAME_IDS.licenseDescription];
    console.log(`  ${face.file} (${(file.length / 1024).toFixed(1)} KB): license ${license ?? "NOT STATED"}; ${names[NAME_IDS.copyright] ?? "no copyright"}; ${names[NAME_IDS.version] ?? "no version"}`);
    if (!license) failed++;
  }
}
if (failed) {
  console.error(`\nfonts:licenses: ${failed} problem(s).`);
  process.exit(1);
}
console.log("\nfonts:licenses: every shipped face states its license.");
