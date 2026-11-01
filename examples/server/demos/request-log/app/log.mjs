// The server's own request log, one list per frame session, so a hidden second frame's requests
// never show in the frame on screen.
const logs = new Map();

export function log(session, kind, path) {
  const rows = logs.get(session) ?? [];
  rows.push({ kind, path });
  logs.set(session, rows);
}

export const logFor = (session) => logs.get(session) ?? [];

export function clearLog(session) {
  logs.delete(session);
}
