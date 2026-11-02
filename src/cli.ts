#!/usr/bin/env node
/**
 * prepboard CLI (LABELLED CORE SUBSET, 4 of 38 tools).
 *
 *   prepboard seed-format
 *   prepboard validate-seed <seed>
 *   prepboard import-seed <workspace> <seed> [--parts orgs,templates,prep,contacts]
 *   prepboard workspaces
 *   prepboard mcp
 *
 * <seed> is taken as a JSON value when it parses as an object or
 * array, otherwise as a plain string seed. seed-format and
 * validate-seed call the public seeds endpoint (CALAF_MCP_URL,
 * default https://calaf.ai/api/mcp, no auth). import-seed and
 * workspaces call the account endpoint (CALAF_ACCOUNT_MCP_URL,
 * default https://calaf.ai/api/mcp-account) and require a Bearer
 * token from CALAF_ACCESS_TOKEN.
 * Exit codes: 0 success, 1 upstream/auth error, 2 usage error.
 */
import {
  ACCOUNT_URL_ENV,
  formatPayload,
  getSeedFormat,
  importSeed,
  listWorkspaces,
  PUBLIC_URL_ENV,
  TOKEN_ENV,
  validateSeed,
  VERSION,
} from "./prepboard.js";
import type { FetchFn, PrepboardConfig, SeedValue } from "./types.js";

function usage(): never {
  console.error(`Usage:
  prepboard seed-format
  prepboard validate-seed <seed>
  prepboard import-seed <workspace> <seed> [--parts orgs,templates,prep,contacts]
  prepboard workspaces
  prepboard mcp
  prepboard --version`);
  process.exit(2);
}

function flag(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

/** Parse a CLI seed argument: JSON object/array when it parses, else the raw string. */
function parseSeed(raw: string): SeedValue {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Not valid JSON: fall through and treat it as a string seed.
    }
  }
  return raw;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd) usage();
  const known = ["seed-format", "validate-seed", "import-seed", "workspaces"];
  if (!known.includes(cmd)) usage();
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const config: PrepboardConfig = {
    publicUrl: process.env[PUBLIC_URL_ENV],
    accountUrl: process.env[ACCOUNT_URL_ENV],
    token: process.env[TOKEN_ENV],
  };
  try {
    let out: unknown;
    if (cmd === "seed-format") {
      out = await getSeedFormat(fetchFn, config);
    } else if (cmd === "validate-seed") {
      if (!rest[0]) usage();
      out = await validateSeed(fetchFn, config, { seed: parseSeed(rest[0]) });
    } else if (cmd === "import-seed") {
      if (!rest[0] || !rest[1]) usage();
      const partsRaw = flag(rest, "--parts");
      const parts = partsRaw
        ? partsRaw.split(",").map((p) => p.trim()).filter(Boolean)
        : undefined;
      out = await importSeed(fetchFn, config, {
        workspace: rest[0],
        seed: parseSeed(rest[1]),
        ...(parts ? { parts } : {}),
      });
    } else {
      out = await listWorkspaces(fetchFn, config);
    }
    console.log(formatPayload(out));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
