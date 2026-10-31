import { BUILD_ID, buildsChannelName, channelName, STORAGE_KEY, type BuildNotice, type PresenterState, type SyncMessage } from "./types";

export type Transport = "broadcast" | "storage";

export interface Sync {
  send: (msg: SyncMessage) => void;
  /** Last state written to localStorage by any window, if readable. */
  readStored: () => PresenterState | null;
  /** Says which build this window runs, for a window that cannot hear this one's channel. */
  announceBuild: () => void;
  transport: Transport;
  close: () => void;
}

/**
 * BroadcastChannel is primary; every state write also lands in localStorage and windows listen to
 * both `message` and `storage`, so a browser without one still syncs.
 */
export function createSync(onMessage: (msg: SyncMessage) => void, handlers: { onCleared: () => void; onOtherBuild: (build: string) => void }): Sync {
  const name = channelName();
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(name) : null;
  const builds = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(buildsChannelName()) : null;
  const handleChannel = (e: MessageEvent) => {
    if (e.data && typeof e.data.type === "string") onMessage(e.data as SyncMessage);
  };
  const handleBuild = (e: MessageEvent<BuildNotice>) => {
    if (e.data && typeof e.data.build === "string" && e.data.build !== BUILD_ID) handlers.onOtherBuild(e.data.build);
  };
  const handleStorage = (e: StorageEvent) => {
    // A same-origin frame cleared the store (`key` null) or removed this key. Memory still has it.
    if (e.storageArea === localStorage && e.newValue === null && (e.key === null || e.key === STORAGE_KEY)) return handlers.onCleared();
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      const state = JSON.parse(e.newValue) as PresenterState;
      onMessage({ type: "state", state });
    } catch {
      /* ignore malformed storage */
    }
  };
  channel?.addEventListener("message", handleChannel);
  builds?.addEventListener("message", handleBuild);
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
    announceBuild() {
      builds?.postMessage({ build: BUILD_ID } satisfies BuildNotice);
    },
    close() {
      channel?.removeEventListener("message", handleChannel);
      channel?.close();
      builds?.removeEventListener("message", handleBuild);
      builds?.close();
      window.removeEventListener("storage", handleStorage);
    },
  };
}
