import { defineShell } from "@live-ish/engine/config";

/** The page around a shown block: a bar with the deck's mark, and a quiet sheet. Never shown as code. */
export default defineShell({
  id: "harbor",
  before: '<div class="wrap"><div class="wrap-sheet"><div class="wrap-bar"><span class="wrap-brand"><span class="wrap-brand__mark" aria-hidden="true">T</span><span class="wrap-brand__name">Tideline</span></span><span class="wrap-harbor__tag">Gauges</span></div><div class="wrap-body">',
  after: "</div></div></div>",
  styles: ["/shells/harbor.css"],
});
