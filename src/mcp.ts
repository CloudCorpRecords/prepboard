/**
 * prepboard MCP server. Tools (LABELLED CORE SUBSET, 4 of 38):
 * get_seed_format, validate_seed, import_seed, list_workspaces.
 * Only these four have published parameter tables in the original's
 * public spec; the other 34 documented tools are omitted rather
 * than given invented schemas.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys that
 * are not in this tool's public spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schemas as explicit literals, while zod still
 * validates every tools/call argument set.
 *
 * Calls are forwarded as JSON-RPC tools/call POSTs (a documented
 * reconstruction of the wire shape). get_seed_format and
 * validate_seed go to the public seeds endpoint (env CALAF_MCP_URL,
 * default https://calaf.ai/api/mcp, no auth); import_seed and
 * list_workspaces go to the account endpoint (env
 * CALAF_ACCOUNT_MCP_URL, default https://calaf.ai/api/mcp-account)
 * with Authorization: Bearer <token> from env CALAF_ACCESS_TOKEN.
 * A missing token is an honest isError naming CALAF_ACCESS_TOKEN.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
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
import type { FetchFn, PrepboardConfig } from "./types.js";

const NoArgs = z.object({});
const SeedArg = z.union([z.string(), z.record(z.string(), z.unknown())]);
const ValidateSeedArgs = z.object({ seed: SeedArg });
const ImportSeedArgs = z.object({
  workspace: z.string(),
  seed: SeedArg,
  parts: z.array(z.string()).optional(),
});

const TOOLS = [
  {
    name: "get_seed_format",
    description: "Returns the seed document format.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "validate_seed",
    description: "Validates a seed document against the format.",
    inputSchema: {
      type: "object" as const,
      properties: {
        seed: { anyOf: [{ type: "string" }, { type: "object" }], description: "Seed document to validate against the format." },
      },
      required: ["seed"],
    },
  },
  {
    name: "import_seed",
    description: "Imports a seed into a workspace.",
    inputSchema: {
      type: "object" as const,
      properties: {
        workspace: { type: "string", description: "Workspace to import the seed into." },
        seed: { anyOf: [{ type: "string" }, { type: "object" }], description: "Seed document to import." },
        parts: { type: "array", items: { type: "string" }, description: "Optional seed parts to include in the import." },
      },
      required: ["workspace", "seed"],
    },
  },
  {
    name: "list_workspaces",
    description: "Lists the caller's workspaces.",
    inputSchema: { type: "object" as const, properties: {} },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

function configFromEnv(): PrepboardConfig {
  return {
    publicUrl: process.env[PUBLIC_URL_ENV],
    accountUrl: process.env[ACCOUNT_URL_ENV],
    token: process.env[TOKEN_ENV],
  };
}

const server = new Server(
  { name: "prepboard", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const config = configFromEnv();
  try {
    let out: unknown;
    if (name === "get_seed_format") {
      NoArgs.parse(args ?? {});
      out = await getSeedFormat(fetchFn, config);
    } else if (name === "validate_seed") {
      out = await validateSeed(fetchFn, config, ValidateSeedArgs.parse(args ?? {}));
    } else if (name === "import_seed") {
      out = await importSeed(fetchFn, config, ImportSeedArgs.parse(args ?? {}));
    } else if (name === "list_workspaces") {
      NoArgs.parse(args ?? {});
      out = await listWorkspaces(fetchFn, config);
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
