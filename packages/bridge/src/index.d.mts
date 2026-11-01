export declare const PROTOCOL_VERSION: 2;
export declare const SESSION_PARAM: "s";
export declare const SESSION_COOKIE: "live-ish-session";
export declare const SESSION_HEADER: "x-live-ish-session";
export declare const MOUNT_PARAM: "mount";
export declare const PRESENTER_PARAM: "presenter";

export interface FrameCspOptions {
  /** Origins allowed to embed the app. Defaults to `presenterOrigins()`. */
  presenter?: string | string[];
  /** More origins for `script-src`. */
  script?: string | string[];
  /** Adds `'unsafe-eval'`, for a dev server that needs it. */
  dev?: boolean;
}

/** A Node `IncomingMessage` and a fetch `Request` both fit. */
export interface SessionRequest {
  url: string;
  headers?: { get(name: string): string | null } | Record<string, string | string[] | undefined>;
}

export declare function presenterOrigins(env?: Record<string, string | undefined>): string[];
export declare function frameCsp(options?: FrameCspOptions): string;
export declare function frameHeaders(options?: FrameCspOptions): Record<string, string>;
export declare function runtimeTag(src?: string): string;
export declare function bridgeScript(): string;
export declare function frameSession(request: SessionRequest): string;
