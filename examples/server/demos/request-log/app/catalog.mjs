import { clearLog, log } from "./log.mjs";

const NAMES = { 1: "Notebook", 2: "Pen" };
// One cache per frame session.
const caches = new Map();

export const known = (id) => id in NAMES;

const render = (id) =>
  `<h1 id="title">${NAMES[id]}</h1>`;

// Every request renders the page again.
export function plain(session, id, path) {
  log(session, "render", path);
  return render(id);
}

// The first request renders. The next is a
// hit, until something invalidates it.
export function cached(session, id, path) {
  const cache = caches.get(session) ?? {};
  caches.set(session, cache);
  if (cache[id]) {
    log(session, "hit", path);
    return cache[id];
  }
  log(session, "render", path);
  cache[id] = render(id);
  return cache[id];
}

export function invalidate(session) {
  caches.delete(session);
}

export function reset(session) {
  invalidate(session);
  clearLog(session);
}
