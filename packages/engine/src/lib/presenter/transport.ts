import { channelName, STORAGE_KEY, type PresenterState, type SyncMessage } from "./types";

export type Transport = "broadcast" | "storage";

export interface Sync {
  send: (msg: SyncMessage) => void;
  /** Last state written to localStorage by any window, if readable. */
  readStored: () => PresenterState | null;
  transport: Transport;
  close: () => void;
}

/**
 * BroadcastChannel is primary; every state write also lands in localStorage and windows listen to
 * both `message` and `storage`, so a browser without one still syncs.
 */
export function createSync(onMessage: (msg: SyncMessage) => void): Sync {
  const name = channelName();
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(name) : null;
  const handleChannel = (e: MessageEvent) => {
    if (e.data && typeof e.data.type === "string") onMessage(e.data as SyncMessage);
  };
  const handleStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      const state = JSON.parse(e.newValue) as PresenterState;
      onMessage({ type: "state", state });
    } catch {
      /* ignore malformed storage */
    }
  };
  channel?.addEventListener("message", handleChannel);
  window.addEventListener("storage", handleStorage);

  return {
    transport: channel ? "broadcast" : "storage",
    send(msg) {
      channel?.postMessage(msg);
      if (msg.type === "state") {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(msg.state));
        } catch {
          /* private window or quota; BroadcastChannel still carries it */
        }
      }
    },
    readStored() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as PresenterState) : null;
      } catch {
        return null;
      }
    },
    close() {
      channel?.removeEventListener("message", handleChannel);
      channel?.close();
      window.removeEventListener("storage", handleStorage);
    },
  };
}
