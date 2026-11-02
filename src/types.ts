/**
 * prepboard types.
 *
 * prepboard is a forwarding client for the Calaf MCP servers: the
 * public seeds server (no auth) and the account server (Bearer
 * token). HTTP access is described by a minimal response surface so
 * tests can inject a fake fetch and never touch the network.
 */

/** A seed document: a string form or an object form, per the public spec. */
export type SeedValue = string | Record<string, unknown>;

export interface ValidateSeedOptions {
  seed: SeedValue;
}

export interface ImportSeedOptions {
  workspace: string;
  seed: SeedValue;
  parts?: string[];
}

/** Endpoint + credential configuration resolved from the environment. */
export interface PrepboardConfig {
  /** Public seeds endpoint (no auth). Env CALAF_MCP_URL. */
  publicUrl?: string;
  /** Account endpoint (Bearer token). Env CALAF_ACCOUNT_MCP_URL. */
  accountUrl?: string;
  /** Access token for the account endpoint. Env CALAF_ACCESS_TOKEN. */
  token?: string;
}

/** Minimal HTTP response surface so tests can inject fixtures. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;
