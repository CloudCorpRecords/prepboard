/**
 * prepboard core: a LABELLED CORE SUBSET (4 of 38) of the Calaf MCP
 * account-server tool set. Only the four tools whose parameter
 * tables are published in the original's public README are built:
 *
 *   get_seed_format   no params                          -> public endpoint
 *   validate_seed     seed (string | object, required)   -> public endpoint
 *   import_seed       workspace + seed (required),
 *                     parts (string[], optional)         -> account endpoint
 *   list_workspaces   no params                          -> account endpoint
 *
 * The other 34 documented tools have prose purposes only in the
 * README; their schemas are not invented, so they are omitted (the
 * full omission list lives in the parity fixture's _source and in
 * BUILD-REPORT.md).
 *
 * Forwarding wire shape (documented reconstruction): each call is
 * forwarded as a JSON-RPC `tools/call` POST to the upstream MCP
 * endpoint and the JSON-RPC `result` value is returned verbatim.
 * The public seeds endpoint is https://calaf.ai/api/mcp (no auth);
 * the account endpoint is https://calaf.ai/api/mcp-account and
 * requires `Authorization: Bearer <token>` with the token read from
 * the CALAF_ACCESS_TOKEN environment variable. Endpoint overrides:
 * CALAF_MCP_URL (public) and CALAF_ACCOUNT_MCP_URL (account). A
 * missing token is an honest error naming CALAF_ACCESS_TOKEN —
 * never a fabricated result. Upstream HTTP errors, JSON-RPC errors,
 * and upstream isError results all surface as thrown errors.
 *
 * All HTTP goes through an injected FetchFn so everything is
 * testable offline.
 */
import type {
  FetchFn,
  ImportSeedOptions,
  PrepboardConfig,
  ValidateSeedOptions,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_PUBLIC_URL = "https://calaf.ai/api/mcp";
export const DEFAULT_ACCOUNT_URL = "https://calaf.ai/api/mcp-account";

export const PUBLIC_URL_ENV = "CALAF_MCP_URL";
export const ACCOUNT_URL_ENV = "CALAF_ACCOUNT_MCP_URL";
export const TOKEN_ENV = "CALAF_ACCESS_TOKEN";

/** Resolve an endpoint URL: env value when non-blank, else default. Trailing slashes are stripped. */
export function resolveUrl(value: string | undefined, fallback: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  const base = v ? v : fallback;
  return base.replace(/\/+$/, "");
}

export function resolvePublicUrl(value?: string): string {
  return resolveUrl(value, DEFAULT_PUBLIC_URL);
}

export function resolveAccountUrl(value?: string): string {
  return resolveUrl(value, DEFAULT_ACCOUNT_URL);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmpty(value: unknown, field: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new Error(`${field} must be a non-empty string`);
  return v;
}

function requireSeed(value: unknown): string | Record<string, unknown> {
  if (typeof value === "string") {
    if (!value.trim()) throw new Error("seed must be a non-empty string or an object");
    return value;
  }
  if (isRecord(value)) return value;
  throw new Error("seed must be a string or an object");
}

function resultErrorText(result: Record<string, unknown>): string {
  const content = result.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (isRecord(item) && typeof item.text === "string" && item.text) return item.text;
    }
  }
  return "Calaf MCP server returned an error result";
}

/**
 * Forward one tool call to an upstream Calaf MCP endpoint as a
 * JSON-RPC tools/call POST and return the result value verbatim.
 * When `token` is supplied it is sent as a Bearer credential.
 */
async function callUpstream(
  fetchFn: FetchFn,
  url: string,
  toolName: string,
  args: Record<string, unknown>,
  token?: string,
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  });
  let response;
  try {
    response = await fetchFn(url, { method: "POST", headers, body });
  } catch (err) {
    throw new Error(
      `Calaf MCP request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!response.ok) {
    let detail = "";
    try {
      const payload: unknown = await response.json();
      if (isRecord(payload)) {
        if (isRecord(payload.error) && typeof payload.error.message === "string" && payload.error.message) {
          detail = `: ${payload.error.message}`;
        } else if (typeof payload.message === "string" && payload.message) {
          detail = `: ${payload.message}`;
        } else if (typeof payload.error === "string" && payload.error) {
          detail = `: ${payload.error}`;
        }
      }
    } catch {
      // A non-JSON error body still reports its HTTP status below.
    }
    throw new Error(
      `Calaf MCP request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${detail}`,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Calaf MCP server returned a response that was not valid JSON");
  }
  if (isRecord(payload) && payload.error != null) {
    const e = payload.error;
    if (isRecord(e) && typeof e.message === "string" && e.message) {
      throw new Error(`Calaf MCP error: ${e.message}`);
    }
    throw new Error(`Calaf MCP error: ${JSON.stringify(e)}`);
  }
  if (!isRecord(payload) || !("result" in payload)) {
    throw new Error("Calaf MCP server returned a response with no result");
  }
  const result = payload.result;
  if (isRecord(result) && result.isError === true) {
    throw new Error(resultErrorText(result));
  }
  return result;
}

function requireToken(config: PrepboardConfig): string {
  const token = typeof config.token === "string" ? config.token.trim() : "";
  if (!token) {
    throw new Error(
      `${TOKEN_ENV} is not set: this tool requires an access token for the Calaf account endpoint (set ${TOKEN_ENV} in the environment)`,
    );
  }
  return token;
}

/** Returns the seed document format. Public endpoint, no auth. */
export async function getSeedFormat(
  fetchFn: FetchFn,
  config: PrepboardConfig = {},
): Promise<unknown> {
  return callUpstream(fetchFn, resolvePublicUrl(config.publicUrl), "get_seed_format", {});
}

/** Validates a seed document against the format. Public endpoint, no auth. */
export async function validateSeed(
  fetchFn: FetchFn,
  config: PrepboardConfig,
  options: ValidateSeedOptions,
): Promise<unknown> {
  const seed = requireSeed(options.seed);
  return callUpstream(fetchFn, resolvePublicUrl(config.publicUrl), "validate_seed", { seed });
}

/** Imports a seed into a workspace. Account endpoint, Bearer token required. */
export async function importSeed(
  fetchFn: FetchFn,
  config: PrepboardConfig,
  options: ImportSeedOptions,
): Promise<unknown> {
  const workspace = requireNonEmpty(options.workspace, "workspace");
  const seed = requireSeed(options.seed);
  const token = requireToken(config);
  const args: Record<string, unknown> = { workspace, seed };
  if (options.parts !== undefined) {
    if (!Array.isArray(options.parts) || options.parts.some((p) => typeof p !== "string")) {
      throw new Error("parts must be an array of strings");
    }
    args.parts = options.parts;
  }
  return callUpstream(fetchFn, resolveAccountUrl(config.accountUrl), "import_seed", args, token);
}

/** Lists the caller's workspaces. Account endpoint, Bearer token required. */
export async function listWorkspaces(
  fetchFn: FetchFn,
  config: PrepboardConfig = {},
): Promise<unknown> {
  const token = requireToken(config);
  return callUpstream(fetchFn, resolveAccountUrl(config.accountUrl), "list_workspaces", {}, token);
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
