import "server-only";
import { connect } from "node:net";

/**
 * Whether anything listens at an origin. A connection and not a request: a server app may log every
 * request it gets, and a frame's log must show only what the demo did.
 */
export function serverAnswers(origin: string, ms = 600): Promise<boolean> {
  const { hostname, port, protocol } = new URL(origin);
  return new Promise((resolve) => {
    const socket = connect({ host: hostname.replace(/^\[|\]$/g, ""), port: Number(port || (protocol === "https:" ? 443 : 80)) });
    const done = (up: boolean) => {
      socket.destroy();
      resolve(up);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(ms, () => done(false));
  });
}
