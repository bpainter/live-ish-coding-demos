export type Target = "local" | "deployed";
export type Mode = "local" | "one-host" | "two-hosts";
export type Provider = "vercel" | "netlify" | "cloudflare" | "render" | "railway";
type Env = Record<string, string | undefined>;

export interface Hosting {
  mode: Mode;
  /** The deck's public address, for canonical URLs. Empty when nothing names one. */
  site: string;
  /** The frames origin. Empty unless `mode` is "two-hosts". */
  frames: string;
}

export interface Address {
  path?: string;
  regex?: string;
}

export interface HeaderRule {
  source: string;
  has?: { type: string; key?: string; value?: string }[];
  headers: { key: string; value: string }[];
}

export declare const PROVIDERS: Record<Provider, { env: string; sha: string; site?: (env: Env) => string | undefined; preview?: (env: Env) => boolean; buildFileHeaders?: Record<string, string> }>;
export declare function detectProvider(env: Env): Provider | undefined;
export declare function resolveTarget(env: Env): Target;
export declare function resolveHosting(input: { env: Env; hosts: { site?: string; frames?: string }; target: Target; provider?: Provider }): Hosting;
export declare function externalOrigins(input: { hosts: { external?: Record<string, string> }; target: Target }): Record<string, string>;
export declare function assertHosting(input: { target: Target; mode: Mode; site: string }): void;
export declare function resolveBuildId(env: Env, provider?: Provider): string;
export declare function addressSource(address: Address): string;
export declare function headerRules(input: { production: boolean; mode: Mode; site: string; frames: string; addresses: Address[]; publicFiles?: string[] }): HeaderRule[];
