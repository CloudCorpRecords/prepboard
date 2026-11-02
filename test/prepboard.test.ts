import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getSeedFormat,
  importSeed,
  listWorkspaces,
  resolveAccountUrl,
  resolvePublicUrl,
  validateSeed,
} from "../src/prepboard.js";
import type { FetchFn, HttpResponse } from "../src/types.js";

function jsonResponse(body: unknown, status = 200, statusText = "OK"): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function rpcResult(result: unknown): unknown {
  return { jsonrpc: "2.0", id: 1, result };
}

interface Captured {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function fakeFetch(captured: Captured, body: unknown = rpcResult({ content: [{ type: "text", text: "ok" }] })): FetchFn {
  return async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    captured.url = url;
    captured.method = init?.method;
    captured.headers = init?.headers;
    captured.body = init?.body;
    return jsonResponse(body);
  };
}

function sentBody(c: Captured): { method?: string; params?: { name?: string; arguments?: Record<string, unknown> } } {
  return JSON.parse(c.body ?? "{}") as { method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
}

const PUBLIC = "https://calaf.ai/api/mcp";
const ACCOUNT = "https://calaf.ai/api/mcp-account";

describe("endpoint resolution", () => {
  it("defaults to the documented endpoints and strips trailing slashes", () => {
    assert.equal(resolvePublicUrl(undefined), PUBLIC);
    assert.equal(resolveAccountUrl(undefined), ACCOUNT);
    assert.equal(resolvePublicUrl("https://example.test/mcp/"), "https://example.test/mcp");
    assert.equal(resolveAccountUrl("  "), ACCOUNT);
  });
});

describe("endpoint routing", () => {
  it("get_seed_format posts tools/call to the public endpoint with no Authorization header", async () => {
    const c: Captured = {};
    const out = await getSeedFormat(fakeFetch(c), {});
    assert.equal(c.url, PUBLIC);
    assert.equal(c.method, "POST");
    assert.equal(c.headers?.Authorization, undefined);
    const body = sentBody(c);
    assert.equal(body.method, "tools/call");
    assert.equal(body.params?.name, "get_seed_format");
    assert.deepEqual(body.params?.arguments, {});
    assert.deepEqual(out, { content: [{ type: "text", text: "ok" }] });
  });

  it("validate_seed posts to the public endpoint, not the account endpoint", async () => {
    const c: Captured = {};
    await validateSeed(fakeFetch(c), {}, { seed: "seed-text" });
    assert.equal(c.url, PUBLIC);
    assert.equal(c.headers?.Authorization, undefined);
  });

  it("list_workspaces posts to the account endpoint", async () => {
    const c: Captured = {};
    await listWorkspaces(fakeFetch(c), { token: "tok-123" });
    assert.equal(c.url, ACCOUNT);
    assert.equal(sentBody(c).params?.name, "list_workspaces");
  });

  it("import_seed posts to the account endpoint", async () => {
    const c: Captured = {};
    await importSeed(fakeFetch(c), { token: "tok-123" }, { workspace: "ws1", seed: "s" });
    assert.equal(c.url, ACCOUNT);
    assert.equal(sentBody(c).params?.name, "import_seed");
  });

  it("honours endpoint overrides from the caller", async () => {
    const c1: Captured = {};
    await getSeedFormat(fakeFetch(c1), { publicUrl: "https://example.test/seeds/" });
    assert.equal(c1.url, "https://example.test/seeds");
    const c2: Captured = {};
    await listWorkspaces(fakeFetch(c2), { token: "t", accountUrl: "https://example.test/acct" });
    assert.equal(c2.url, "https://example.test/acct");
  });
});

describe("auth", () => {
  it("sends Authorization: Bearer <token> on account calls", async () => {
    const c: Captured = {};
    await listWorkspaces(fakeFetch(c), { token: "tok-abc" });
    assert.equal(c.headers?.Authorization, "Bearer tok-abc");
  });

  it("missing token is an honest error naming CALAF_ACCESS_TOKEN and sends no request", async () => {
    let called = false;
    const spy: FetchFn = async () => { called = true; return jsonResponse(rpcResult({})); };
    await assert.rejects(() => listWorkspaces(spy, {}), /CALAF_ACCESS_TOKEN/);
    await assert.rejects(
      () => importSeed(spy, { token: "   " }, { workspace: "ws1", seed: "s" }),
      /CALAF_ACCESS_TOKEN/,
    );
    assert.equal(called, false);
  });

  it("public tools never require or send a token, even when one is configured", async () => {
    const c: Captured = {};
    await validateSeed(fakeFetch(c), { token: "tok-abc" }, { seed: "s" });
    assert.equal(c.url, PUBLIC);
    assert.equal(c.headers?.Authorization, undefined);
  });
});

describe("request shaping", () => {
  it("validate_seed forwards a string seed verbatim", async () => {
    const c: Captured = {};
    await validateSeed(fakeFetch(c), {}, { seed: "my-seed-doc" });
    assert.deepEqual(sentBody(c).params?.arguments, { seed: "my-seed-doc" });
  });

  it("validate_seed forwards an object seed verbatim", async () => {
    const c: Captured = {};
    const seed = { orgs: [{ name: "Firm A" }], version: 2 };
    await validateSeed(fakeFetch(c), {}, { seed });
    assert.deepEqual(sentBody(c).params?.arguments, { seed });
  });

  it("validate_seed rejects a missing/invalid seed before any request", async () => {
    let called = false;
    const spy: FetchFn = async () => { called = true; return jsonResponse(rpcResult({})); };
    await assert.rejects(
      () => validateSeed(spy, {}, { seed: 42 as unknown as string }),
      /seed must be a string or an object/,
    );
    await assert.rejects(() => validateSeed(spy, {}, { seed: "  " }), /seed/);
    assert.equal(called, false);
  });

  it("import_seed forwards workspace, seed and parts", async () => {
    const c: Captured = {};
    await importSeed(
      fakeFetch(c),
      { token: "t" },
      { workspace: "ws-main", seed: { orgs: [] }, parts: ["orgs", "prep"] },
    );
    assert.deepEqual(sentBody(c).params?.arguments, {
      workspace: "ws-main",
      seed: { orgs: [] },
      parts: ["orgs", "prep"],
    });
  });

  it("import_seed omits parts when not supplied and requires a workspace", async () => {
    const c: Captured = {};
    await importSeed(fakeFetch(c), { token: "t" }, { workspace: "ws-main", seed: "s" });
    assert.deepEqual(sentBody(c).params?.arguments, { workspace: "ws-main", seed: "s" });
    await assert.rejects(
      () => importSeed(fakeFetch({}, rpcResult({})), { token: "t" }, { workspace: " ", seed: "s" }),
      /workspace/,
    );
  });
});

describe("upstream error mapping", () => {
  it("HTTP 500 surfaces status and upstream message", async () => {
    const failing: FetchFn = async () => jsonResponse({ message: "boom" }, 500, "Internal Server Error");
    await assert.rejects(() => getSeedFormat(failing, {}), /HTTP 500.*boom/);
  });

  it("JSON-RPC error surfaces its message", async () => {
    const failing: FetchFn = async () =>
      jsonResponse({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "invalid seed" } });
    await assert.rejects(() => validateSeed(failing, {}, { seed: "s" }), /Calaf MCP error: invalid seed/);
  });

  it("upstream isError result surfaces its text", async () => {
    const failing: FetchFn = async () =>
      jsonResponse(rpcResult({ isError: true, content: [{ type: "text", text: "seed failed validation" }] }));
    await assert.rejects(() => validateSeed(failing, {}, { seed: "s" }), /seed failed validation/);
  });

  it("network failure is wrapped with context", async () => {
    const failing: FetchFn = async () => { throw new Error("socket hang up"); };
    await assert.rejects(() => getSeedFormat(failing, {}), /Calaf MCP request failed: socket hang up/);
  });

  it("a response with no result is an error, not a fake success", async () => {
    const failing: FetchFn = async () => jsonResponse({ jsonrpc: "2.0", id: 1 });
    await assert.rejects(() => getSeedFormat(failing, {}), /no result/);
  });
});
