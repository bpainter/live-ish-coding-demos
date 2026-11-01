/*
  The browser half of the bridge. A classic script at the top of the app's <head>, so
  `window.demoHooks` exists before the document finishes parsing and before the frame runtime
  reports ready. Opened on its own, the app gets a working `window.liveIsh` and no runtime.

  Embedded, the frame's first address names the deck in `?presenter=`. That is remembered in
  sessionStorage, because a `navigate` step loads a document with no such parameter. This script then
  adds the `presenter-origin` meta and loads the runtime from the deck, so the runtime always matches
  the deck that drives it.

  A hook that changes server state should end in a full document load: `liveIsh.load()`. The runtime
  resumes the step in the fresh document, and what the page shows is what the server rendered. The
  promise it returns never settles, because the document unloads first, and it uses
  location.replace so history.length, part of the runtime's digest, stays constant.

  Sessions: the deck can mount a hidden second frame beside the shown one on some moves and replay
  it, and the shown panel must not pick up that frame's rows. `liveIsh.startSession()` starts a
  session for this frame, kept in window.name, which survives reloads and belongs to one frame.
  Requests the frame makes itself carry it as `?s=`, and others, such as a form post or a `navigate`,
  carry the cookie. On load the parameter leaves the address bar again before the runtime reads it,
  so the runtime's digest, which includes the URL, is the same forward and back.
*/
(function () {
  "use strict";

  var PROTOCOL_VERSION = 2;
  var COOKIE = "live-ish-session";
  var REMEMBERED = "live-ish:presenter";
  var script = document.currentScript;
  var runtimePath = (script && script.getAttribute("data-runtime")) || "/live-ish/demo-runtime.js";
  var embedded = window.parent !== window;
  var root = document.documentElement;
  var shown = new URL(location.href);

  function remembered(value) {
    try {
      if (value) sessionStorage.setItem(REMEMBERED, value);
      return value || sessionStorage.getItem(REMEMBERED);
    } catch (e) {
      return value;
    }
  }

  var presenter = embedded ? remembered(shown.searchParams.get("presenter")) : null;

  // Flags reach a server frame on the address, and the runtime reads them from <html>.
  if (shown.searchParams.has("flags")) root.setAttribute("data-flags", shown.searchParams.get("flags"));
  root.setAttribute("data-kind", "server");
  // A server app's pages are real documents. The runtime then waits out a load before it navigates,
  // so a replay's navigate adds a history entry, as the forward run's did.
  if (embedded) root.setAttribute("data-pages", "");

  // The address bar never shows the session or the mount marker (see the header comment).
  ["s", "mount", "presenter"].forEach(function (name) {
    shown.searchParams.delete(name);
  });
  if (shown.href !== location.href) history.replaceState(history.state, "", shown.href);

  // The runtime may keep its history count in window.name, as a JSON object. That is not a session.
  function session() {
    return window.name && window.name.charAt(0) !== "{" ? window.name : "";
  }

  function newSession() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /** Marks the next request from this frame as this frame's. */
  function stamp() {
    if (session()) document.cookie = COOKIE + "=" + encodeURIComponent(session()) + "; Path=/; SameSite=Lax";
  }

  function startSession() {
    window.name = newSession();
    stamp();
    return window.name;
  }

  function withSession(href) {
    var url = new URL(href, location.href);
    if (session()) url.searchParams.set("s", session());
    return url.href;
  }

  function load(href) {
    root.setAttribute("data-unloading", "");
    stamp();
    location.replace(withSession(href || location.href));
    return new Promise(function () {});
  }

  window.demoHooks = window.demoHooks || {};
  window.liveIsh = {
    protocol: PROTOCOL_VERSION,
    embedded: embedded,
    hooks: function (fns) {
      Object.keys(fns).forEach(function (name) {
        window.demoHooks[name] = fns[name];
      });
    },
    session: session,
    startSession: startSession,
    withSession: withSession,
    stamp: stamp,
    load: load,
  };

  // Anything else this frame loads or posts lands in its session too.
  document.addEventListener("submit", stamp, true);
  window.addEventListener("beforeunload", stamp);

  if (!presenter) return;

  // The deck rejects any other version. Saying so here names the fix in the frame's own console.
  var warned = false;
  window.addEventListener("message", function (e) {
    if (warned || e.source !== window.parent || e.origin !== presenter) return;
    var v = e.data && e.data.v;
    if (typeof v !== "number" || v === PROTOCOL_VERSION) return;
    warned = true;
    console.error("This deck speaks frame protocol v" + v + ", and @live-ish/bridge speaks v" + PROTOCOL_VERSION + ". Update @live-ish/bridge to the deck's engine version.");
  });

  var meta = document.createElement("meta");
  meta.name = "presenter-origin";
  meta.content = presenter;
  document.head.appendChild(meta);
  var runtime = document.createElement("script");
  runtime.src = presenter + runtimePath;
  runtime.async = false;
  document.head.appendChild(runtime);
})();
