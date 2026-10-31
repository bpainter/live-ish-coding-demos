/*
  Demo frame runtime. Injected into every frame document on the demo
  origin. It does nothing until a valid `init` arrives from the presenter origin, so a document
  opened standalone behaves as a plain page.

  Trusted Types safe: no innerHTML, outerHTML, insertAdjacentHTML, document.write, DOMParser, eval,
  new Function, string timers, on* attribute writes or script src writes.

  Parent -> runtime: init, run-step, replay-to, finish, reset, set-flag, set-mode, watch, focus-grant.
  Runtime -> parent: ready, rects, cue, unloading, step-done, error, key, resize-viewport (extension:
  the `:viewport` resize target asks the parent to resize the iframe), focus-request (a focus()
  the engine refused during a run; see "focus regain").
*/
(function () {
  "use strict";

  var metaEl = document.querySelector('meta[name="presenter-origin"]');
  var PRESENTER = metaEl ? metaEl.getAttribute("content") : null;
  // On one origin the composer names no host: the presenter is this document's own origin.
  if (PRESENTER === "self") PRESENTER = location.origin;
  var embedded = window.parent && window.parent !== window;
  // A warm-up document (FrameWarm, `warm=1`) only loads, so its files and the theme are cached: it
  // posts nothing, probes nothing and calls no focus(). In Chromium a focus() in a frame moves the
  // presenter window's focus into it, and the clicker's keys followed.
  var warm = /[?&]warm=1(&|$)/.test(location.search);
  // The engine's own focus(), kept before watchFocus() wraps it: the probe must not count as a
  // refused focus during a run.
  var nativeFocus = window.HTMLElement && HTMLElement.prototype.focus;
  if (warm && embedded) {
    // Nothing in a warm-up document may take focus, the page's own scripts included.
    [window.HTMLElement, window.SVGElement].forEach(function (C) {
      if (C && C.prototype && typeof C.prototype.focus === "function") C.prototype.focus = function () {};
    });
    try {
      window.focus = function () {};
    } catch (e) {
      /* none */
    }
  }

  var frameId = null;
  var handsOn = false;
  var reducedMotion = false;
  var pace = { glideMs: 420, rippleMs: 260, charMs: 45, resizeMs: 700, revealMs: 250 };
  var flags = {};
  var watched = [];
  var liveRects = false;
  var lastRectsJson = "";
  var rectsSeq = 0;
  var activeUntil = 0;
  var netProfile = "fast";
  var pendingFetches = 0;
  var asserts = [];
  var revealed = [];
  var resized = {};
  var terminalLines = 0;
  var run = null; // { runId, stepId, cancelled, finish, instant, cursor }
  var hooks = function () {
    return window.demoHooks || {};
  };

  function post(msg) {
    if (warm || !embedded || !PRESENTER) return;
    msg.v = 2;
    msg.frameId = frameId;
    window.parent.postMessage(msg, PRESENTER);
  }

  // ---------------------------------------------------------------- features

  function features() {
    function supports(q) {
      try {
        return CSS.supports(q);
      } catch (e) {
        return false;
      }
    }
    return {
      popover: "showPopover" in HTMLElement.prototype,
      "dialog-request-close": "requestClose" in HTMLDialogElement.prototype,
      "invoker-commands": "commandForElement" in HTMLButtonElement.prototype,
      "open-pseudo": supports("selector(:open)"),
      "container-queries": supports("container-type: inline-size"),
      scope: typeof CSSScopeRule !== "undefined",
      has: supports("selector(:has(a))"),
      "field-sizing": supports("field-sizing: content"),
      "navigation-api": "navigation" in window,
      "trusted-types": "trustedTypes" in window,
      "customizable-select": supports("appearance: base-select"),
      "anchor-positioning": supports("anchor-name: --a"),
      // Not probed at `ready`: see probeFocusVisibleOption.
      "focus-visible-option": focusVisibleNative,
    };
  }

  // Whether `focus({ focusVisible: true })` shows the native ring. Null until probed, which the
  // rects message reads as false. The probe focuses a button, and in Chromium a focus() in a frame
  // moves the presenter window's focus into the frame: probing at `ready` took the audience
  // window's keyboard on every warmed intro slide. So it runs at most once, lazily,
  // the first time a run starts or this window gets a focus event, and only while this document
  // already has focus and nothing in it is focused.
  var focusVisibleNative = null;
  var focusProbed = false;
  function probeFocusVisibleOption() {
    if (focusProbed || warm || !nativeFocus) return;
    if (!document.hasFocus() || !document.body) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    focusProbed = true;
    try {
      var b = document.createElement("button");
      b.style.position = "fixed";
      b.style.opacity = "0";
      b.style.pointerEvents = "none";
      document.body.appendChild(b);
      nativeFocus.call(b, { focusVisible: true, preventScroll: true });
      focusVisibleNative = b.matches(":focus-visible");
      b.blur();
      b.remove();
    } catch (e) {
      focusVisibleNative = false;
    }
  }
  window.addEventListener("focus", probeFocusVisibleOption);

  // ---------------------------------------------------------------- helpers

  function q(sel) {
    var el = document.querySelector(sel);
    if (!el) throw errorOf("selector-not-found", "No element matches " + sel, sel);
    return el;
  }
  // The ids in the document, so a selector that matched nothing can name what is there.
  function documentIds() {
    return Array.prototype.map.call(document.querySelectorAll("[id]"), function (el) {
      return el.id;
    });
  }
  function errorOf(code, message, selector) {
    var e = new Error(message);
    e.code = code;
    e.selector = selector;
    return e;
  }
  // The four corner radii in frame px: a percentage resolves against the box
  // (horizontal against the width, vertical against the height), each corner takes the smaller of
  // its two values, and corners that overrun a side scale down together, as CSS does.
  function cornerOf(value, w, h) {
    var parts = String(value || "0").trim().split(/\s+/);
    function len(p, base) {
      var n = parseFloat(p);
      if (!isFinite(n)) return 0;
      return p.indexOf("%") === p.length - 1 ? (n * base) / 100 : n;
    }
    var hr = len(parts[0], w);
    var vr = len(parts.length > 1 ? parts[1] : parts[0], h);
    return Math.max(0, Math.min(hr, vr));
  }
  function radiiOf(el, w, h) {
    var cs = getComputedStyle(el);
    var c = [cornerOf(cs.borderTopLeftRadius, w, h), cornerOf(cs.borderTopRightRadius, w, h), cornerOf(cs.borderBottomRightRadius, w, h), cornerOf(cs.borderBottomLeftRadius, w, h)];
    var f = 1;
    function fit(sum, side) {
      if (sum > side && sum > 0) f = Math.min(f, side / sum);
    }
    fit(c[0] + c[1], w);
    fit(c[3] + c[2], w);
    fit(c[0] + c[3], h);
    fit(c[1] + c[2], h);
    return c.map(function (v) {
      return Math.round(v * f * 100) / 100;
    });
  }
  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, radii: radiiOf(el, r.width, r.height) };
  }
  // Animations on the document timeline: transitions, keyframe animations and view transitions.
  // Scroll-driven animations (a ScrollTimeline or ViewTimeline) report as running for as long as
  // they exist and follow the scroll position, so they never count as motion to wait for, and
  // finishing one would pin it to its end.
  function timeAnimations() {
    try {
      return document.getAnimations().filter(function (a) {
        return a.timeline === document.timeline;
      });
    } catch (e) {
      return [];
    }
  }
  // A finite animation or transition is running (infinite ones, such as a blinking caret, do not
  // count): the presenter keeps spotlights hidden meanwhile.
  function isAnimating() {
    try {
      var list = timeAnimations();
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        if (a.playState !== "running" || !a.effect) continue;
        var t = a.effect.getComputedTiming();
        if (isFinite(t.endTime) && isFinite(t.activeDuration)) return true;
      }
    } catch (e) {
      /* no WAAPI */
    }
    return false;
  }
  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }
  // One animation frame, or 50 ms, whichever comes first: a hidden or occluded window runs no
  // animation frames, and a run must still report done there.
  function raf() {
    return new Promise(function (r) {
      var done = false;
      var finish = function () {
        if (done) return;
        done = true;
        r();
      };
      requestAnimationFrame(finish);
      setTimeout(finish, 50);
    });
  }
  function focusable(el) {
    if (!el || typeof el.focus !== "function") return false;
    if (el.matches("a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]")) return !el.disabled;
    return false;
  }
  // ---------------------------------------------------------------- focus regain
  // WebKit (Safari 26) ignores element.focus() in a cross-origin frame unless the frame is handling
  // a press: the real key in the frame on a forward run, or the presenter's press carried by the
  // message that starts a replay (lib/engine/input-relay.ts). Focus a page moves later, after a
  // fetch, has neither in a fresh document: a page's navigate handler focuses #content once the partial
  // arrives, so a Back replay left focus on the link. During a run the runtime notes
  // a focus() that did not take, and after the action asks the presenter for a `focus-grant`. The
  // presenter posts it from a task that still carries the press, and the same focus() is made in
  // its handler. Engines that never refuse never ask; without a press the second try fails as the
  // first did. One try per refusal.
  var crossOrigin = (function () {
    try {
      void window.top.location.href;
      return false;
    } catch (e) {
      return true;
    }
  })();
  var refusedFocus = null; // { el, native, options }
  var focusGranted = null; // resolves the pending focus-request
  var focusWatched = false;
  function watchFocus() {
    if (focusWatched) return;
    focusWatched = true;
    [window.HTMLElement, window.SVGElement].forEach(function (C) {
      if (!C || !C.prototype || typeof C.prototype.focus !== "function") return;
      var native = C.prototype.focus;
      C.prototype.focus = function () {
        var result = native.apply(this, arguments);
        if (run && run.playing && crossOrigin && embedded && this.isConnected) {
          refusedFocus = document.activeElement === this ? null : { el: this, native: native, options: arguments[0] };
        }
        return result;
      };
    });
  }
  async function regainFocus() {
    var pending = refusedFocus;
    if (!pending || !frameId) return;
    await new Promise(function (resolve) {
      var t = setTimeout(done, 300);
      function done() {
        clearTimeout(t);
        if (focusGranted === done) focusGranted = null;
        resolve();
      }
      focusGranted = done;
      post({ type: "focus-request", runId: run ? run.runId : undefined });
    });
    if (refusedFocus === pending) refusedFocus = null;
  }
  function grantFocus() {
    var f = refusedFocus;
    refusedFocus = null;
    if (f && f.el.isConnected && document.activeElement !== f.el) {
      try {
        f.native.call(f.el, f.options);
      } catch (e) {
        /* not focusable now */
      }
    }
    if (focusGranted) focusGranted();
  }

  function isTextControl(el) {
    return !!el && (el.matches("input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]), textarea, select") || el.isContentEditable);
  }

  // ---------------------------------------------------------------- instant sheet

  var instantSheet = null;
  function enableInstant() {
    try {
      if (!instantSheet) {
        instantSheet = new CSSStyleSheet();
        instantSheet.replaceSync("@layer presenter-instant { *, *::before, *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; } }");
      }
      if (document.adoptedStyleSheets.indexOf(instantSheet) === -1) document.adoptedStyleSheets = document.adoptedStyleSheets.concat([instantSheet]);
    } catch (e) {
      /* no adopted sheets */
    }
  }
  function disableInstant() {
    if (!instantSheet) return;
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter(function (s) {
      return s !== instantSheet;
    });
  }
  function finishAnimations() {
    try {
      timeAnimations().forEach(function (a) {
        try {
          a.finish();
        } catch (e) {
          /* not finishable */
        }
      });
    } catch (e) {
      /* no WAAPI */
    }
  }

  // ---------------------------------------------------------------- network

  var nativeFetch = window.fetch;
  function installFetch() {
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
      try {
        var u = new URL(url, location.href);
        if (u.origin === location.origin) {
          if (netProfile === "slow") u.searchParams.set("demo-net", run && run.instant ? "slow-instant" : "slow");
          url = u.href;
          input = typeof input === "string" ? url : new Request(url, input);
        }
      } catch (e) {
        /* leave input */
      }
      pendingFetches++;
      var done = function () {
        pendingFetches--;
      };
      var p = nativeFetch.call(window, input, init);
      p.then(done, done);
      return p;
    };
  }

  // Instant mode keeps no idle time, but a `wait` still lasts while the navigation or request the
  // previous actions started is in flight (fetch, render, focus, scroll restoration), capped at
  // the authored duration: a replay then settles the way the animated run did, and a wait that is
  // shorter than a slow response still leaves that request in flight, so stale-request aborts
  // replay deterministically.
  async function settle(ms) {
    var deadline = Date.now() + Math.min(ms, 2000);
    // Queued work (a dialog's close event, form submission, traversal) starts on later tasks and
    // its listeners may only then issue the request the authored wait covered; give it a short
    // real pause before polling for work in flight.
    await sleep(Math.min(ms, 120));
    while (Date.now() < deadline) {
      var busy = pendingFetches > 0;
      try {
        if (window.navigation && navigation.transition) busy = true;
      } catch (e) {
        /* none */
      }
      if (!busy) break;
      await sleep(10);
    }
    await raf();
  }

  // Waits for the work a step started: requests, a navigation, finite running animations. Paused
  // and infinite animations never settle, so they do not count, and the whole wait gives up after
  // 2000 ms: a step that cannot settle still reports done.
  var QUIESCENCE_MS = 2000;
  function settles(a) {
    try {
      if (a.playState !== "running" || !a.effect) return false;
      var t = a.effect.getComputedTiming();
      return isFinite(t.endTime) && isFinite(t.activeDuration);
    } catch (e) {
      return false;
    }
  }
  async function quiescence() {
    var start = Date.now();
    var left = function () {
      return Math.max(0, QUIESCENCE_MS - (Date.now() - start));
    };
    var capped = function (p) {
      return Promise.race([p, sleep(left())]);
    };
    while (pendingFetches > 0 && Date.now() - start < 1500) await sleep(20);
    try {
      if (window.navigation && navigation.transition) await capped(navigation.transition.finished.catch(function () {}));
    } catch (e) {
      /* none */
    }
    try {
      await capped(
        Promise.all(
          timeAnimations()
            .filter(settles)
            .map(function (a) {
              return a.finished.catch(function () {});
            }),
        ),
      );
    } catch (e) {
      /* none */
    }
    await raf();
    await raf();
  }

  // ---------------------------------------------------------------- flags

  function enhancementSheets() {
    return Array.prototype.slice.call(document.querySelectorAll('link[rel="stylesheet"][data-flag="enhance-css"], style[data-flag="enhance-css"]'));
  }
  var removedSupports = []; // { sheet, rules: [{ index, cssText }] }
  function applyFlag(flag, on) {
    flags[flag] = on;
    if (flag === "enhance-css") {
      var mode = document.documentElement.getAttribute("data-enhance-css-mode") || "all";
      if (mode === "supports-blocks") {
        if (!on) {
          // Off is the base rules only: every @supports block goes, positive and negative, and
          // nothing is inserted in its place. The first step is then the cropped regular grid
          // in every browser, and s1 restores both blocks, so each browser shows what it supports:
          // lanes, or the columns fallback. Pages with positive blocks only behave as before.
          removedSupports = [];
          Array.prototype.slice.call(document.styleSheets).forEach(function (sheet) {
            // The base stylesheet is never part of an enhancement.
            if (sheet.href && sheet.href.indexOf("/live-ish/theme.css") !== -1) return;
            var removed = [];
            try {
              for (var i = sheet.cssRules.length - 1; i >= 0; i--) {
                var rule = sheet.cssRules[i];
                if (!(rule instanceof CSSSupportsRule)) continue;
                removed.unshift({ index: i, cssText: rule.cssText });
                sheet.deleteRule(i);
              }
            } catch (e) {
              /* cross-origin sheet */
            }
            if (removed.length) removedSupports.push({ sheet: sheet, rules: removed });
          });
        } else {
          removedSupports.forEach(function (entry) {
            // First block first: once every earlier block is back, a block's own index holds again.
            for (var k = 0; k < entry.rules.length; k++) {
              var r = entry.rules[k];
              try {
                entry.sheet.insertRule(r.cssText, Math.min(r.index, entry.sheet.cssRules.length));
              } catch (e) {
                /* unsupported rule */
              }
            }
          });
          removedSupports = [];
        }
      } else {
        enhancementSheets().forEach(function (el) {
          if (el.sheet) el.sheet.disabled = !on;
          else el.disabled = !on;
        });
      }
      return;
    }
    if (flag === "enhance-js" || flag === "csp-enforce") {
      throw errorOf("flag-unknown", flag + " reloads the document; the engine splits the step at it");
    }
    throw errorOf("flag-unknown", "Unknown flag " + flag);
  }

  // ---------------------------------------------------------------- rects

  function computeRects() {
    var rects = {};
    for (var i = 0; i < watched.length; i++) {
      var sel = watched[i];
      var list = [];
      try {
        var els = document.querySelectorAll(sel);
        for (var j = 0; j < els.length; j++) {
          var r = rectOf(els[j]);
          var cs = getComputedStyle(els[j]);
          if (r.w > 0 && r.h > 0 && cs.visibility !== "hidden") list.push(r);
        }
      } catch (e) {
        /* bad selector */
      }
      rects[sel] = list;
    }
    var active = document.activeElement;
    var focus = active && active !== document.body && active !== document.documentElement ? rectOf(active) : null;
    var fv = false;
    try {
      fv = !!active && active.matches(":focus-visible");
    } catch (e) {
      fv = false;
    }
    return { rects: rects, focus: focus, focusVisible: fv, animating: isAnimating(), layers: computeLayers(active) };
  }
  // Top-layer elements (open popovers, modal dialogs, fullscreen), in the order they opened. They
  // paint above the page, so the presenter keeps spotlights, callouts and the focus ring from
  // drawing over them unless the box marks the layer or something inside it. `owns` lists the watched selectors that match the layer or a descendant;
  // `focus` says the focused element is inside it.
  var layerOrder = new Map();
  var layerSeq = 0;
  document.addEventListener(
    "toggle",
    function (e) {
      if (!(e.target instanceof Element)) return;
      if (e.newState === "closed") layerOrder.delete(e.target);
      else if (e.newState === "open" && !layerOrder.has(e.target)) layerOrder.set(e.target, ++layerSeq);
      scheduleRects();
    },
    true,
  );
  function computeLayers(active) {
    var found = [];
    [":popover-open", "dialog:modal", ":fullscreen"].forEach(function (q) {
      try {
        var els = document.querySelectorAll(q);
        for (var i = 0; i < els.length; i++) if (found.indexOf(els[i]) === -1) found.push(els[i]);
      } catch (e) {
        /* the selector is not supported */
      }
    });
    var seen = new Map();
    var out = [];
    for (var i = 0; i < found.length; i++) {
      var el = found[i];
      if (!layerOrder.has(el)) layerOrder.set(el, ++layerSeq);
      seen.set(el, true);
      var r = rectOf(el);
      if (!(r.w > 0 && r.h > 0) || getComputedStyle(el).visibility === "hidden") continue;
      var owns = [];
      for (var j = 0; j < watched.length; j++) {
        try {
          var m = document.querySelectorAll(watched[j]);
          for (var k = 0; k < m.length; k++) {
            if (el.contains(m[k])) {
              owns.push(watched[j]);
              break;
            }
          }
        } catch (e) {
          /* bad selector */
        }
      }
      r.z = layerOrder.get(el);
      r.owns = owns;
      r.focus = !!active && el.contains(active);
      out.push(r);
    }
    layerOrder.forEach(function (_, el) {
      if (!seen.has(el)) layerOrder.delete(el);
    });
    return out.sort(function (a, b) {
      return a.z - b.z;
    });
  }
  function postRects(force) {
    if (!frameId) return;
    var data = computeRects();
    var json = JSON.stringify(data);
    if (!force && json === lastRectsJson) return;
    lastRectsJson = json;
    post({ type: "rects", seq: ++rectsSeq, viewport: { w: window.innerWidth, h: window.innerHeight }, rects: data.rects, focus: data.focus, focusVisibleNative: data.focusVisible || focusVisibleNative === true, animating: data.animating, layers: data.layers });
  }
  var rafPending = false;
  function scheduleRects() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () {
      rafPending = false;
      postRects(false);
    });
  }
  function startObservers() {
    try {
      new ResizeObserver(scheduleRects).observe(document.documentElement);
    } catch (e) {
      /* none */
    }
    window.addEventListener("resize", scheduleRects);
    document.addEventListener("scroll", scheduleRects, true);
    try {
      new MutationObserver(scheduleRects).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    } catch (e) {
      /* none */
    }
    document.addEventListener("focusin", scheduleRects);
    document.addEventListener("focusout", scheduleRects);
    // Animations and transitions: their start, and their end so the final geometry always arrives.
    ["transitionrun", "transitionend", "transitioncancel", "animationstart", "animationend", "animationcancel"].forEach(function (type) {
      document.addEventListener(type, scheduleRects, true);
    });
    // While a finite animation runs, rects are sampled every animation frame: a transform
    // animation fires no observer, so its rects would otherwise go stale.
    (function loop() {
      if (liveRects || Date.now() < activeUntil || isAnimating()) scheduleRects();
      requestAnimationFrame(loop);
    })();
  }

  // ---------------------------------------------------------------- asserts and digest

  function evaluate(target, expect) {
    var negate = expect.charAt(0) === "!";
    var ex = negate ? expect.slice(1) : expect;
    var el = document.querySelector(target);
    var actual = "";
    var pass = false;
    function visible(e) {
      if (!e) return false;
      var r = e.getBoundingClientRect();
      var cs = getComputedStyle(e);
      return r.width > 0 && r.h !== 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    }
    var m;
    if (ex.charAt(0) === ":") {
      pass = !!el && el.matches(ex);
      actual = el ? (pass ? "matches" : "does not match") + " " + ex : "missing";
    } else if (ex === "focused") {
      pass = !!el && document.activeElement === el;
      actual = document.activeElement ? describe(document.activeElement) : "none";
    } else if (ex === "visible") {
      pass = visible(el);
      actual = el ? (pass ? "visible" : "not visible") : "missing";
    } else if (ex === "hidden") {
      pass = !visible(el);
      actual = el ? (pass ? "hidden" : "visible") : "missing";
    } else if ((m = /^count=(\d+)$/.exec(ex))) {
      var n = document.querySelectorAll(target).length;
      pass = n === Number(m[1]);
      actual = String(n);
    } else if ((m = /^value-length([<>=])(\d+)$/.exec(ex))) {
      var len = el && "value" in el ? String(el.value).length : -1;
      pass = m[1] === ">" ? len > Number(m[2]) : m[1] === "<" ? len < Number(m[2]) : len === Number(m[2]);
      actual = String(len);
    } else if ((m = /^inline-size([<>=])(\d+)px$/.exec(ex))) {
      var w = el ? el.getBoundingClientRect().width : -1;
      pass = m[1] === ">" ? w > Number(m[2]) : m[1] === "<" ? w < Number(m[2]) : Math.round(w) === Number(m[2]);
      actual = Math.round(w) + "px";
    } else if ((m = /^(?:text~=|contains:)(.*)$/.exec(ex))) {
      var text = el ? deepText(el) : "";
      pass = text.indexOf(m[1]) !== -1;
      actual = text.trim().slice(0, 80);
    } else if ((m = /^attr:([\w-]+)(?:=(.*))?$/.exec(ex))) {
      var has = !!el && el.hasAttribute(m[1]);
      pass = m[2] === undefined ? has : has && el.getAttribute(m[1]) === m[2];
      actual = has ? m[1] + "=" + el.getAttribute(m[1]) : "no " + m[1];
    } else if ((m = /^no-attr:([\w-]+)$/.exec(ex))) {
      pass = !!el && !el.hasAttribute(m[1]);
      actual = el && el.hasAttribute(m[1]) ? "has " + m[1] : "no " + m[1];
    } else if ((m = /^url=(.*)$/.exec(ex))) {
      var here = location.pathname + location.search;
      pass = here === m[1];
      actual = here;
    } else if ((m = /^style:block-size=([\d.]+)lh$/.exec(ex))) {
      var cs = el ? getComputedStyle(el) : null;
      var lh = cs ? parseFloat(cs.lineHeight) : 0;
      var bs = cs ? parseFloat(cs.blockSize || cs.height) : -1;
      pass = !!cs && Math.abs(bs - Number(m[1]) * lh) <= 2;
      actual = bs + "px (lh " + lh + "px)";
    } else if ((m = /^style:([\w-]+)=(.+)$/.exec(ex))) {
      var sv = el ? getComputedStyle(el).getPropertyValue(m[1]).trim() : "";
      pass = !!el && sv === m[2];
      actual = el ? m[1] + "=" + sv : "missing";
    } else if ((m = /^columns=(\d+)$/.exec(ex))) {
      var cols = el ? getComputedStyle(el).gridTemplateColumns : "";
      var count = cols && cols !== "none" ? cols.trim().split(/\s+/).length : 0;
      pass = count === Number(m[1]);
      actual = cols || "none";
    } else {
      actual = "unknown expectation " + ex;
    }
    if (negate) pass = !pass;
    return { pass: pass, actual: actual };
  }

  // The text a person sees in an element: its own, plus open shadow roots and same-origin iframe
  // documents inside it.
  function deepText(el) {
    var out = el.textContent || "";
    var stack = [el];
    while (stack.length) {
      var node = stack.pop();
      if (node.shadowRoot) {
        out += " " + (node.shadowRoot.textContent || "");
        stack.push.apply(stack, node.shadowRoot.querySelectorAll("*"));
      }
      if (node.tagName === "IFRAME") {
        try {
          var doc = node.contentDocument;
          if (doc && doc.body) {
            out += " " + (doc.body.textContent || "");
            stack.push.apply(stack, doc.body.querySelectorAll("*"));
          }
        } catch (e) {
          /* cross-origin */
        }
      }
      if (node === el) stack.push.apply(stack, el.querySelectorAll("*"));
    }
    return out;
  }

  function describe(el) {
    if (!el) return "none";
    var s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    return s;
  }

  function digest() {
    var entries = [];
    // `?flags=` says how this document was mounted, not where it is: a replay mounts with the flags
    // accumulated so far, and a forward run toggles them in place. The flags are entries of their own.
    entries.push("url=" + location.pathname + location.search.replace(/([?&])flags=[^&]*&?/, "$1").replace(/[?&]$/, ""));
    entries.push("title=" + document.title);
    entries.push("history=" + history.length);
    entries.push("active=" + describe(document.activeElement));
    entries.push("popovers=" + document.querySelectorAll(":popover-open").length);
    var dialogs = document.querySelectorAll("dialog[open]");
    entries.push("dialogs=" + dialogs.length);
    var controls = document.querySelectorAll("input[id], textarea[id], select[id]");
    for (var i = 0; i < controls.length; i++) entries.push("value:" + controls[i].id + "=" + (controls[i].type === "checkbox" ? controls[i].checked : controls[i].value));
    entries.push("scroll=" + Math.round(window.scrollY));
    Object.keys(flags).forEach(function (k) {
      entries.push("flag:" + k + "=" + flags[k]);
    });
    entries.push("revealed=" + revealed.join(","));
    Object.keys(resized).forEach(function (k) {
      entries.push("inline-size:" + k + "=" + resized[k]);
    });
    entries.push("terminal-lines=" + terminalLines);
    asserts.forEach(function (a) {
      entries.push("assert:" + a.stepId + ":" + a.index + "=" + a.pass);
    });
    var probes = hooks().probes;
    if (typeof probes === "function") {
      try {
        var extra = probes() || {};
        Object.keys(extra).forEach(function (k) {
          entries.push("probe:" + k + "=" + extra[k]);
        });
      } catch (e) {
        /* probe failure */
      }
    }
    entries.sort();
    return fnv(entries.join("\n"));
  }
  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ("0000000" + h.toString(16)).slice(-8);
  }

  // ---------------------------------------------------------------- cues

  async function cue(kind, data, ms) {
    if (!run || run.instant) return;
    var msg = { type: "cue", runId: run.runId, index: run.cursor.action, cue: Object.assign({ kind: kind }, data) };
    post(msg);
    if (ms > 0 && !reducedMotion) await sleep(ms);
    else if (ms > 0) await sleep(Math.min(ms, 120));
  }

  // ---------------------------------------------------------------- actions

  function viaKind(via, key) {
    var v = String(via);
    if (/hook:/.test(v)) return "hook";
    if (/requestClose/.test(v)) return "dialog-close";
    if (/hidePopover/.test(v)) return "popover-hide";
    if (/requestSubmit/.test(v)) return "submit";
    if (/dispatch/.test(v)) return "dispatch";
    if (/selectedIndex|\.next\(\)|\.prev\(\)/.test(v)) return "select";
    if (/navigation\.back|history\.back/.test(v)) return "back";
    if (/navigation\.forward|history\.forward/.test(v)) return "forward";
    if (/focus\(/.test(v)) return "focus";
    if (/click\(\)/.test(v)) return "click";
    if (key === "Escape") return "dialog-close";
    if (key === "Tab" || key === "Shift+Tab") return "focus";
    if (key === "Enter" || key === "Space") return "click";
    if (key === "ArrowDown" || key === "ArrowUp") return "select";
    return "dispatch";
  }

  function keycapLabel(key) {
    return { Escape: "Esc", "Shift+Tab": "Shift Tab", "Alt+ArrowLeft": "Alt ←", "Alt+ArrowRight": "Alt →", ArrowDown: "↓", ArrowUp: "↑" }[key] || key;
  }

  function focusThenClick(el) {
    if (focusable(el)) {
      try {
        el.focus({ preventScroll: true, focusVisible: false });
      } catch (e) {
        el.focus();
      }
    }
    el.click();
  }

  function topmostDialog() {
    var open = document.querySelectorAll("dialog[open]");
    return open.length ? open[open.length - 1] : null;
  }
  function topmostPopover() {
    var open = document.querySelectorAll(":popover-open");
    return open.length ? open[open.length - 1] : null;
  }

  // Back and Forward. The traversal may be intercepted (same document; the run
  // continues here) or load a document (`pagehide` posts `unloading` with the cursor), so nothing
  // is announced up front. Navigation API promises must not surface as uncaught errors.
  function swallow(result) {
    if (!result) return;
    if (result.committed) result.committed.catch(function () {});
    if (result.finished) result.finished.catch(function () {});
    if (typeof result.catch === "function") result.catch(function () {});
  }
  // Back and Forward stay inside this frame. The guard asks whether this
  // frame has an entry to go to: the Navigation API's canGoBack/canGoForward when its current entry
  // matches the document, else a count of the entries this frame made, kept in window.name (it
  // belongs to the frame and survives loads). WebKit 26.0 leaves currentEntry on the first entry
  // after intercepted navigations, so the count is what guards there. The move itself is
  // history.back()/forward(): WebKit 26.0's navigation.back() in a sandboxed frame tries to move the
  // presenter window, while history traversal from the frame stays in the frame. A move the guard
  // refuses is skipped, never handed to the joint session history.
  function traverse(dir) {
    var nav = window.navigation;
    var d = frameDepth();
    var can;
    if (nav && nav.currentEntry && nav.currentEntry.url === location.href) can = dir === "back" ? nav.canGoBack : nav.canGoForward;
    else can = dir === "back" ? d.index > 0 : d.index < d.max;
    if (!can) throw errorOf("via-unsupported", "No " + dir + " entry in this frame");
    traversing = true;
    saveDepth({ index: Math.max(0, d.index + (dir === "back" ? -1 : 1)), max: Math.max(d.max, d.index + (dir === "back" ? 0 : 1)) });
    if (dir === "back") history.back();
    else history.forward();
  }
  var traversing = false;

  // window.name is the frame's own and survives loads. A page may use it for itself (a server app
  // keep their session there), so the count is only kept while the name is empty or already ours.
  function ownName() {
    return !window.name || window.name.indexOf('{"index":') === 0;
  }
  function frameDepth() {
    if (!ownName()) return { index: 0, max: 0 };
    try {
      var parsed = JSON.parse(window.name || "{}");
      if (typeof parsed.index === "number" && typeof parsed.max === "number") return parsed;
    } catch (e) {
      /* not a count */
    }
    return { index: 0, max: 0 };
  }
  function saveDepth(d) {
    if (!ownName()) return;
    try {
      window.name = JSON.stringify({ index: d.index, max: d.max });
    } catch (e) {
      /* refused */
    }
  }
  // Counts this frame's entries: a document load that is a new navigation, then every same-document
  // push (the Navigation API's navigate event followed by navigatesuccess, which covers intercepted
  // links and pushState; without the API, the pushState wrapper). A frame's first document leaves
  // the name alone until it is left, when `pagehide` writes the count (multi-page builds, below), so
  // a named load is one the frame made itself. Frames send no referrer, so nothing else can say.
  (function recordFrameEntries() {
    var type = (performance.getEntriesByType("navigation")[0] || {}).type;
    var d = frameDepth();
    if (type === "navigate" && window.name) saveDepth({ index: d.index + 1, max: d.index + 1 });
    function pushed() {
      var cur = frameDepth();
      saveDepth({ index: cur.index + 1, max: cur.index + 1 });
    }
    var nav = window.navigation;
    if (nav && typeof nav.addEventListener === "function") {
      var pending = null;
      nav.addEventListener("navigate", function (e) {
        pending = e.navigationType;
      });
      nav.addEventListener("navigatesuccess", function () {
        if (pending === "push") pushed();
        else if (pending === "traverse" && !traversing) {
          // A traversal this runtime did not make (hands-on Back): only the API can say where it went.
          try {
            if (nav.currentEntry && nav.currentEntry.url === location.href) saveDepth({ index: nav.currentEntry.index, max: nav.entries().length - 1 });
          } catch (err) {
            /* keep the count */
          }
        }
        pending = null;
        traversing = false;
      });
      nav.addEventListener("navigateerror", function () {
        pending = null;
        traversing = false;
      });
      return;
    }
    var push = history.pushState;
    history.pushState = function () {
      pushed();
      return push.apply(history, arguments);
    };
  })();

  async function exec(action, instant) {
    var el;
    switch (action.type) {
      case "pointer":
        el = q(action.to);
        await cue("cursor", { to: rectOf(el), ms: pace.glideMs }, pace.glideMs);
        return;
      case "click":
        el = q(action.target);
        await cue("cursor", { to: rectOf(el), ms: pace.glideMs }, pace.glideMs);
        await cue("ripple", { at: rectOf(el) }, pace.rippleMs);
        if (el.matches('button[type="submit"], input[type="submit"]') || (el.form && el.type === "submit")) markUnloadingSoon();
        var link = multiPage ? el.closest("a[href]") : null;
        var prevented = false;
        if (link) {
          await loadFinished();
          markOwnLoad();
          window.addEventListener(
            "click",
            function (e) {
              prevented = e.defaultPrevented;
            },
            { once: true },
          );
        }
        focusThenClick(el);
        if (link && !prevented && !(window.navigation && navigation.transition)) await leaving();
        return;
      case "key": {
        await cue("keycap", { label: keycapLabel(action.key), ms: 900 }, 150);
        var kind = viaKind(action.via, action.key);
        el = action.target ? q(action.target) : null;
        if (kind === "dialog-close") {
          var d = el && el.tagName === "DIALOG" ? el : topmostDialog();
          if (!d) throw errorOf("via-unsupported", "No open dialog to close");
          if (typeof d.requestClose === "function") d.requestClose();
          else {
            var ev = new Event("cancel", { cancelable: true });
            if (d.dispatchEvent(ev)) d.close();
          }
        } else if (kind === "popover-hide") {
          var p = el || topmostPopover();
          if (!p) throw errorOf("via-unsupported", "No open popover to hide");
          p.hidePopover();
        } else if (kind === "focus") {
          if (!el) throw errorOf("via-unsupported", "focus(target) needs a target");
          el.focus({ focusVisible: true });
        } else if (kind === "click") {
          focusThenClick(el || document.activeElement);
        } else if (kind === "submit") {
          var f = (el || document.activeElement).form || (el || document.activeElement).closest("form");
          if (!f) throw errorOf("via-unsupported", "No form owner for requestSubmit");
          markUnloadingSoon();
          f.requestSubmit();
        } else if (kind === "select") {
          var s = el || document.activeElement;
          var dir = action.key === "ArrowUp" ? -1 : 1;
          s.selectedIndex = Math.max(0, Math.min(s.options.length - 1, s.selectedIndex + dir));
          s.dispatchEvent(new Event("input", { bubbles: true }));
          s.dispatchEvent(new Event("change", { bubbles: true }));
        } else if (kind === "back" || kind === "forward") {
          traverse(kind);
          await sleep(instant ? 60 : 200);
        } else if (kind === "hook") {
          var hookName = /hook:([\w-]+)/.exec(String(action.via))[1];
          await callHook(hookName, [], instant);
        } else {
          var t = el || document.activeElement || document;
          var parts = action.key.split("+");
          var keyName = parts[parts.length - 1] === "Space" ? " " : parts[parts.length - 1];
          var initDict = { key: keyName, bubbles: true, cancelable: true, shiftKey: parts.indexOf("Shift") !== -1, altKey: parts.indexOf("Alt") !== -1 };
          t.dispatchEvent(new KeyboardEvent("keydown", initDict));
          t.dispatchEvent(new KeyboardEvent("keyup", initDict));
        }
        return;
      }
      case "focus":
        el = q(action.target);
        el.focus({ focusVisible: action.visible !== false });
        return;
      case "type": {
        el = q(action.target);
        el.focus({ preventScroll: true });
        var text = action.text;
        for (var i = 0; i < text.length; i++) {
          if (run && run.cancelled) return;
          insertText(el, text.charAt(i), "insertText");
          if (!instant && !(run && run.finishing)) await sleep(reducedMotion ? 0 : pace.charMs);
          else if (i % 40 === 0) await raf();
        }
        return;
      }
      case "paste":
        el = q(action.target);
        el.focus({ preventScroll: true });
        await cue("caption", { text: "Paste", ms: 900 }, 300);
        insertText(el, action.text, "insertFromPaste");
        return;
      case "resize": {
        if (action.target === ":viewport") {
          post({ type: "resize-viewport", inlineSize: action.inlineSize, ms: instant ? 0 : pace.resizeMs });
          await sleep(instant ? 30 : pace.resizeMs + 30);
          resized[":viewport"] = action.inlineSize;
          return;
        }
        el = q(action.target);
        var from = el.getBoundingClientRect().width + "px";
        if (!instant && !reducedMotion) {
          try {
            var anim = el.animate([{ inlineSize: from }, { inlineSize: action.inlineSize }], { duration: pace.resizeMs, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
            await anim.finished.catch(function () {});
            anim.cancel();
          } catch (e) {
            /* no WAAPI */
          }
        }
        el.style.inlineSize = action.inlineSize;
        resized[action.target] = action.inlineSize;
        return;
      }
      case "toggle":
        applyFlag(action.flag, action.on);
        return;
      case "navigate":
        if (action.history) {
          traverse(action.history);
        } else if (action.url) {
          if (multiPage) {
            await loadFinished();
            markOwnLoad();
          }
          if (window.navigation) swallow(navigation.navigate(action.url));
          else location.assign(action.url);
        }
        if (multiPage && !(window.navigation && navigation.transition)) await leaving();
        else await sleep(instant ? 60 : 200);
        return;
      case "network":
        netProfile = action.profile;
        if (!instant) await cue("caption", { text: action.profile === "slow" ? "Slow network" : "Fast network", ms: 900 }, 0);
        var netHook = hooks().setNetwork;
        if (typeof netHook === "function") await netHook(action.profile);
        return;
      case "hook":
        await callHook(action.name, action.args || [], instant);
        return;
      case "terminal": {
        var lines = document.querySelectorAll("[data-line]");
        for (var k = 0; k < lines.length; k++) {
          var ln = Number(lines[k].getAttribute("data-line"));
          if (ln >= action.lines[0] && ln <= action.lines[1]) {
            lines[k].hidden = false;
            if (!instant && lines[k].getAttribute("data-kind") === "cmd") await sleep(Math.min(350, 30 * (lines[k].textContent || "").length));
            else if (!instant) await sleep(Math.min(350, Number(lines[k].getAttribute("data-delay") || 0)));
          }
        }
        terminalLines = Math.max(terminalLines, action.lines[1]);
        var scroller = document.querySelector("[data-terminal]") || document.scrollingElement;
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
        return;
      }
      case "reveal":
        el = q(action.target);
        el.hidden = false;
        el.removeAttribute("hidden");
        if (revealed.indexOf(action.target) === -1) revealed.push(action.target);
        if (!instant) await sleep(pace.revealMs);
        return;
      case "wait":
        if (!instant && !(run && run.finishing)) await sleep(action.ms);
        else if (instant) await settle(action.ms);
        return;
      case "assert": {
        var result = evaluate(action.target, action.expect);
        asserts.push({ stepId: run ? run.stepId : "", index: run ? run.cursor.action : 0, target: action.target, expect: action.expect, pass: result.pass, actual: result.actual });
        return;
      }
      default:
        throw errorOf("exception", "Unknown action " + action.type);
    }
  }

  var unloadSoon = false;
  function markUnloadingSoon() {
    unloadSoon = true;
  }
  // Multi-page builds. A click on a
  // link or a navigate that loads another page ends this document's part of the run: the runtime
  // waits here for pagehide, whose `unloading` names the next action, and the presenter resumes
  // the run in the new document. A same-document traversal (popstate) or a load that never comes
  // ends the wait. The load is counted as one of the frame's own entries, as any load the frame
  // makes is: a link pressed in hands-on mode counts through `pagehide`.
  var multiPage = document.documentElement.hasAttribute("data-pages");
  // Flags travel on the request, so no server instance has to remember them: a link or navigate to
  // another page of this build carries the document's flags in `?flags=`.
  function withFlags(href) {
    var names = Object.keys(flags);
    if (!multiPage || !names.length) return href;
    var u = new URL(href, location.href);
    var dir = location.pathname.slice(0, location.pathname.lastIndexOf("/") + 1);
    if (u.origin !== location.origin || u.pathname.indexOf(dir) !== 0 || u.searchParams.has("flags")) return href;
    u.searchParams.set(
      "flags",
      names
        .map(function (k) {
          return k + ":" + (flags[k] ? 1 : 0);
        })
        .join(","),
    );
    return u.href;
  }
  if (multiPage) {
    window.addEventListener("pagehide", markOwnLoad);
    document.addEventListener(
      "click",
      function (e) {
        var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
        if (a) a.href = withFlags(a.href);
      },
      true,
    );
  }
  function leaving() {
    return new Promise(function (resolve) {
      var t = setTimeout(resolve, 5000);
      window.addEventListener(
        "popstate",
        function () {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
    });
  }
  function markOwnLoad() {
    if (!window.name) saveDepth(frameDepth());
  }
  // A navigation started before the document's load event has finished is a replace in every
  // engine (no session history entry). The runtime is ready at DOMContentLoaded, so an instant
  // replay's navigate would otherwise replace the entry page, leave no entry for a later Back,
  // and WebKit's history.back() would then move the presenter window. Wait for load to finish.
  function loadFinished() {
    return new Promise(function (resolve) {
      var t = setTimeout(resolve, 3000);
      function check() {
        var nt = performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
        if (nt ? nt.loadEventEnd > 0 : document.readyState === "complete") {
          clearTimeout(t);
          resolve();
          return;
        }
        window.addEventListener(
          "load",
          function () {
            setTimeout(check, 0);
          },
          { once: true },
        );
      }
      check();
    });
  }
  // Instant replay and Next during playback load the next page with no view transition.
  // Skipping rejects the transition's promises; they are handled here, or Chrome reports
  // "Transition was skipped" as an uncaught error in the frame.
  window.addEventListener("pageswap", function (e) {
    var vt = e.viewTransition;
    if (!vt || !run || !(run.instant || run.finishing || reducedMotion)) return;
    [vt.ready, vt.finished, vt.updateCallbackDone].forEach(function (p) {
      if (p && typeof p.catch === "function") p.catch(function () {});
    });
    vt.skipTransition();
  });
  // Only a run still playing continues in the next document; a finished run's step-done is out.
  window.addEventListener("pagehide", function () {
    if (run && run.playing && !run.unloadPosted) {
      run.unloadPosted = true;
      post({ type: "unloading", runId: run.runId, cursor: { step: run.cursor.step, action: run.cursor.action + 1 } });
    }
  });
  // A document restored from the back/forward cache runs no script: the run that left it already
  // continues elsewhere (cancel it, so its pending wait cannot resume here), and the presenter
  // needs a fresh `ready` to init this document and resume its own run in it.
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    if (run) run.cancelled = true;
    traversing = false;
    announce(flags);
  });

  function insertText(el, text, inputType) {
    var before = new InputEvent("beforeinput", { inputType: inputType, data: text, bubbles: true, cancelable: true });
    if (!el.dispatchEvent(before)) return;
    if (typeof el.setRangeText === "function" && "value" in el) {
      var end = el.value.length;
      el.setRangeText(text, end, end, "end");
    } else if (el.isContentEditable) {
      el.append(document.createTextNode(text));
    } else if ("value" in el) {
      el.value += text;
    }
    el.dispatchEvent(new InputEvent("input", { inputType: inputType, data: text, bubbles: true }));
  }

  async function callHook(name, args, instant) {
    var h = hooks()[name];
    if (typeof h !== "function") throw errorOf("hook-missing", "Frame hook " + name + " is not registered");
    var result = h.apply(null, args.concat([{ instant: instant }]));
    var budget = sleep(600).then(function () {
      return "timeout";
    });
    var outcome = await Promise.race([Promise.resolve(result), budget]);
    if (outcome === "timeout") post({ type: "error", runId: run ? run.runId : undefined, code: "timeout", message: "Hook " + name + " exceeded 600ms" });
  }

  // ---------------------------------------------------------------- runs

  async function runStep(msg) {
    probeFocusVisibleOption();
    if (run && run.playing) run.cancelled = true;
    var instant = msg.mode === "instant";
    var r = { runId: msg.runId, stepId: msg.stepId, instant: instant, cancelled: false, finishing: false, playing: true, cursor: { step: 0, action: msg.startAt || 0 } };
    run = r;
    activeUntil = Date.now() + 600;
    var started = performance.now();
    if (instant) enableInstant();
    try {
      for (var i = msg.startAt || 0; i < msg.actions.length; i++) {
        if (r.cancelled) break;
        r.cursor.action = i;
        if (r.finishing) {
          if (msg.actions[i].type === "wait") continue;
          await exec(msg.actions[i], true);
        } else {
          await exec(msg.actions[i], instant);
        }
        if (refusedFocus) await regainFocus();
        postRects(true);
        activeUntil = Date.now() + 600;
      }
      if (instant) {
        await quiescence();
        finishAnimations();
      }
      if (refusedFocus && !r.cancelled) await regainFocus();
    } catch (err) {
      if (!r.cancelled) post({ type: "error", runId: r.runId, code: err.code || "exception", message: err.message || String(err), action: r.cursor.action, selector: err.selector, ids: err.code === "selector-not-found" ? documentIds() : undefined });
    }
    if (instant && run === r) disableInstant();
    r.playing = false;
    if (r.cancelled) return; // a newer run owns the document now
    postRects(true);
    postDone({ type: "step-done", runId: r.runId, stepId: r.stepId, asserts: asserts.slice(), digest: digest(), ms: Math.round(performance.now() - started), finished: !!r.finishing });
  }
  // The last step-done this document posted. A `finish` for a run that has already ended means the
  // presenter never heard it (it still shows the run as playing): post it again.
  var lastDone = null;
  function postDone(msg) {
    lastDone = msg;
    post(Object.assign({}, msg));
  }

  async function replayTo(msg) {
    probeFocusVisibleOption();
    if (run && run.playing) run.cancelled = true;
    var r = { runId: msg.runId, stepId: "", instant: true, cancelled: false, finishing: false, playing: true, cursor: { step: msg.from ? msg.from.step : 0, action: 0 } };
    run = r;
    var started = performance.now();
    enableInstant();
    try {
      for (var s = msg.from ? msg.from.step : 0; s < msg.steps.length; s++) {
        if (r.cancelled) break;
        var acts = msg.steps[s].actions;
        r.stepId = msg.steps[s].stepId;
        r.cursor.step = s;
        for (var a = s === (msg.from ? msg.from.step : 0) ? (msg.from ? msg.from.action : 0) : 0; a < acts.length; a++) {
          if (r.cancelled) break;
          r.cursor.action = a;
          await exec(acts[a], true);
          if (refusedFocus) await regainFocus();
        }
      }
      await quiescence();
      finishAnimations();
      if (refusedFocus && !r.cancelled) await regainFocus();
    } catch (err) {
      if (!r.cancelled) post({ type: "error", runId: r.runId, code: err.code || "exception", message: err.message || String(err), action: r.cursor.action, selector: err.selector, ids: err.code === "selector-not-found" ? documentIds() : undefined });
    }
    if (run === r) disableInstant();
    r.playing = false;
    if (r.cancelled) return; // a newer run owns the document now
    postRects(true);
    postDone({ type: "step-done", runId: r.runId, stepId: r.stepId, asserts: asserts.slice(), digest: digest(), ms: Math.round(performance.now() - started), finished: true });
  }

  // ---------------------------------------------------------------- keys

  var FORWARD_ALWAYS = ["PageDown", "PageUp"];
  var FORWARD_SCRIPTED = ["ArrowRight", "ArrowLeft", " ", "b", ".", "f", "h", "l", "r", "t", "d", "F5"];
  // A step can move focus into this frame (an Escape returns it to the button that opened a dialog), and from
  // then on the presenter's window hears only what is forwarded. In scripted mode the deck's other
  // keys go up too, so no clicker or keyboard key dies here; hands-on mode keeps them in the demo
  //. Tab and Escape go up as well, so reader mode can move focus past the frame
  //; in hands-on mode Tab moves through the demo and Escape is the demo's
  // (a dialog).
  var FORWARD_SCRIPTED_ONLY = ["Home", "End", "Backspace", "Enter", "g", "s", "o", "?", "Tab", "Escape"];
  function onKeydown(e) {
    // The runtime's own dispatch(keydown) and hook-driven events are untrusted; let builds see them.
    if (!e.isTrusted) return;
    var key = e.key;
    var inText = isTextControl(document.activeElement);
    var forward = FORWARD_ALWAYS.indexOf(key) !== -1 || (FORWARD_SCRIPTED.indexOf(key) !== -1 && (!handsOn || !inText)) || (FORWARD_SCRIPTED_ONLY.indexOf(key) !== -1 && !handsOn && !!frameId);
    if (forward) {
      e.preventDefault();
      e.stopPropagation();
      post({ type: "key", key: key === " " ? "Space" : key, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, ctrl: e.ctrlKey });
      return;
    }
    if (!handsOn && frameId) {
      // Scripted mode: stray keys must not change demo state.
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // ---------------------------------------------------------------- protocol

  function handle(msg) {
    switch (msg.type) {
      case "init":
        frameId = msg.frameId;
        handsOn = !!msg.handsOn;
        reducedMotion = !!msg.reducedMotion;
        if (msg.pace) pace = Object.assign(pace, msg.pace);
        flags = Object.assign({}, msg.flags || {});
        document.documentElement.setAttribute("data-presenter", "audience");
        postRects(true);
        return;
      case "run-step":
        if (msg.frameId !== frameId) return;
        void runStep(msg);
        return;
      case "replay-to":
        if (msg.frameId !== frameId) return;
        void replayTo(msg);
        return;
      case "finish":
        if (run && run.playing && run.runId === msg.runId) {
          run.finishing = true;
          finishAnimations();
        } else if (lastDone && lastDone.runId === msg.runId) {
          post(Object.assign({}, lastDone));
        }
        return;
      case "reset": {
        var r = hooks().reset;
        if (typeof r === "function") void r();
        return;
      }
      case "set-flag":
        try {
          applyFlag(msg.flag, msg.on);
        } catch (err) {
          post({ type: "error", code: err.code || "flag-unknown", message: err.message });
        }
        postRects(true);
        return;
      case "set-live":
        if (msg.on) document.documentElement.setAttribute("data-live", "");
        else document.documentElement.removeAttribute("data-live");
        return;
      case "set-mode":
        handsOn = !!msg.handsOn;
        if (handsOn) {
          try {
            window.focus();
          } catch (e) {
            /* none */
          }
        }
        return;
      case "focus-grant":
        if (msg.frameId !== frameId) return;
        grantFocus();
        return;
      case "watch":
        watched = Array.isArray(msg.selectors) ? msg.selectors.slice() : [];
        liveRects = !!msg.live;
        lastRectsJson = "";
        postRects(true);
        return;
      default:
        return;
    }
  }

  function valid(data) {
    return data && typeof data === "object" && data.v === 2 && typeof data.type === "string";
  }

  window.addEventListener("message", function (e) {
    if (warm || !embedded || e.source !== window.parent || e.origin !== PRESENTER) return;
    if (!valid(e.data)) return;
    handle(e.data);
  });

  window.addEventListener("keydown", onKeydown, true);
  window.addEventListener("error", function (e) {
    post({ type: "error", code: "exception", message: String(e.message || "error") });
  });

  function ready() {
    if (warm) return;
    installFetch();
    watchFocus();
    startObservers();
    var initialFlags = {};
    var fl = document.documentElement.getAttribute("data-flags");
    if (fl) {
      fl.split(",").forEach(function (pair) {
        var kv = pair.split(":");
        if (kv[0]) initialFlags[kv[0]] = kv[1] !== "0";
      });
    }
    flags = initialFlags;
    // A supports-blocks enhancement that starts off : its @supports blocks leave before the
    // first paint the presenter shows, as a later toggle would remove them.
    if (initialFlags["enhance-css"] === false && document.documentElement.getAttribute("data-enhance-css-mode") === "supports-blocks") applyFlag("enhance-css", false);
    announce(initialFlags);
  }
  function announce(withFlags) {
    var hookNames = Object.keys(hooks()).filter(function (k) {
      return typeof hooks()[k] === "function";
    });
    post({ type: "ready", build: document.documentElement.getAttribute("data-build") || "", url: location.pathname + location.search, title: document.title, supports: features(), hooks: hookNames, flags: withFlags });
  }
  function onLoaded() {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(ready, ready);
    else ready();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onLoaded);
  else onLoaded();
})();
