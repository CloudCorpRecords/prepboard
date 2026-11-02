# prepboard — Build Report

MCP Rebuild 1000, Batch 8. Clean-room rebuild of
gallaghern51-art/calaf-mcp (rank 339, Tier C — LABELLED CORE
SUBSET), built from the public README spec captured in
`specs-batch8/calaf.md` and the fixture
`harness/fixtures/calaf-mcp-tools-original.json`. That fixture is
docs-derived: the README enumerates 38 account-server tools but
publishes full parameter tables for only 4, so this rebuild builds
exactly those 4 and omits the other 34 rather than inventing their
schemas. Parity proves the rebuild matches this program's defined
subset spec, labelled docs-derived core subset. Local build only —
nothing pushed or published.

Identity: repo `prepboard`, npm `@reneturcios/prepboard`,
MCP name `io.github.CloudCorpRecords/prepboard`, version `0.1.0`,
bin `prepboard` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `prepboard: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Calaf seeds core subset (4 of 38):
  format, validate, import, list workspaces." = **77 chars**
  (≤100 ✓); npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/prepboard:0.1.0` carries **no**
  `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/prepboard"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts` (`seed-format`, `validate-seed`,
  `import-seed`, `workspaces`, `mcp`, `--version`; exit 2 usage /
  1 upstream-or-auth error), `src/mcp.ts`, `src/types.ts`,
  `src/prepboard.ts` (core logic, `VERSION = "0.1.0"`)
- `test/prepboard.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to prepboard)

## Tools implemented (4 of 38 subset)

Built: `get_seed_format`, `validate_seed`, `import_seed`,
`list_workspaces` — the full set of tools with published parameter
tables, as recorded in the fixture `_source`.

Omitted (34, prose purposes only in the README; schemas not
invented): `export_seed`, `get_profile_schema`, `get_firm_profile`,
`submit_firm_profile`, `log_touchpoint`, `update_contact`,
`add_task`, `get_contacts`, `get_firms`, `log_firm_work`,
`get_firm_work`, `remove_firm_work`, `get_applications`,
`schedule_interview`, `add_application`, `update_application`,
`get_tasks`, `complete_task`, `snooze_task`, `add_firm`,
`update_firm`, `add_office`, `add_note`, `get_notes`,
`update_note`, `create_workspace`, `rename_workspace`,
`archive_workspace`, `add_template`, `get_templates`,
`update_template`, `add_prep_question`, `get_prep`,
`draft_prep_answer`. The same list is recorded in the fixture
`_source`.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with explicit
  inputSchema literals, per the standing fleet rule: `McpServer`'s
  zod-to-JSON-Schema conversion injects `$schema` /
  `additionalProperties` keys that are absent from the defined spec
  and break exact schema parity. Zod still validates every
  `tools/call`. `validate_seed`'s `seed` (and `import_seed`'s) is
  served exactly as the fixture defines it:
  `{"anyOf": [{"type": "string"}, {"type": "object"}]}`, required;
  the zod side mirrors it with a string-or-record union.
- Core (`src/prepboard.ts`) forwards each call as a JSON-RPC
  `tools/call` POST and returns the upstream `result` value
  verbatim. **This forwarding wire shape is a documented
  reconstruction** from the public spec (the original servers are
  remote Streamable HTTP MCP endpoints; no original server was
  probed).
- Endpoint routing: `get_seed_format` + `validate_seed` → public
  seeds endpoint `https://calaf.ai/api/mcp` (no auth, token never
  sent even when configured); `import_seed` + `list_workspaces` →
  account endpoint `https://calaf.ai/api/mcp-account` with
  `Authorization: Bearer <token>` from env `CALAF_ACCESS_TOKEN`.
  Overrides: `CALAF_MCP_URL` (public), `CALAF_ACCOUNT_MCP_URL`
  (account); trailing slashes stripped.
- Missing token: account tools fail before any request with an
  error naming `CALAF_ACCESS_TOKEN` — surfaced as an MCP `isError`
  result / CLI exit 1. Never a fabricated result.
- Error mapping: non-OK HTTP surfaces status plus the upstream
  message when present; a JSON-RPC `error` surfaces its message; an
  upstream `isError` result surfaces its text; a response with no
  `result` is an error; network failures are wrapped with context.
- CLI seed arguments are taken as a JSON value when they parse as
  an object, otherwise as a plain string seed (the seed format
  accepts both forms). `import-seed` accepts
  `--parts orgs,templates,prep,contacts`.
- All HTTP flows through an injectable `FetchFn` (types.ts). The
  test suite uses a fake fetch returning hand-written JSON-RPC
  fixtures; no live call is made in tests.

## Verification (foreground, exact outputs)

### 1. Build
```
$ ./node_modules/.bin/tsc --noEmit ; echo exit=$?
exit=0
$ npm run build
build exit=0 — dist/ produced, including dist/cli.js
```

### 2. Tests
```
$ npm test (tsx --test test/*.test.ts)
ℹ tests 19
ℹ pass 19
ℹ fail 0
```
Covers: endpoint default/override/trailing-slash resolution;
routing of all four tools (public vs account endpoint); Bearer
header present on account calls and absent on public calls;
missing-token error naming `CALAF_ACCESS_TOKEN` with no request
sent (both account tools); request shaping for `validate_seed`
(string seed verbatim, object seed verbatim, invalid seed rejected
before any request) and `import_seed` (workspace + seed + parts
forwarded, parts omitted when not supplied, blank workspace
rejected); upstream error mapping (HTTP 500 with upstream message,
JSON-RPC error message, upstream isError text, network-failure
wrapping, no-result response as error).

### 3. CLI / MCP smoke
`--version` → `0.1.0` (exit 0); unknown command exits 2 with
Usage; `workspaces` with no token exits 1 with
`error: CALAF_ACCESS_TOKEN is not set: ...`. MCP `initialize` over
stdio → `serverInfo: {"name":"prepboard","version":"0.1.0"}`; a
stdio `tools/call` for `list_workspaces` without a token returned
`isError: true` naming `CALAF_ACCESS_TOKEN`. No live Calaf call was
made in smoke — the exercised paths need no network, and no live
result is claimed.

### 4. Parity (harness)
```
$ python3 ~/workspace/mcp-rebuild-100/harness/parity.py \
    --original ~/workspace/mcp-rebuild-100/harness/fixtures/calaf-mcp-tools-original.json \
    --rebuild "stdio:node <abs path>/builds/prepboard/dist/cli.js mcp" \
    --out ~/workspace/mcp-rebuild-100/builds/prepboard/parity-out
verdict=PASS parity_pct=100.0 original_tools=4 rebuild_tools=4 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
(parity.json: identical_tools 4/4, against the 4-tool subset
fixture.) Original side is tools-file mode, so `fixture_results`
records `SKIPPED-TOOLS-FILE-MODE` — expected harness semantics,
not an error.

## Lockfile status

`package-lock.json` was generated clean via Route 3: a temp copy
holding only `package.json` (no `node_modules`/`dist`), offline
`npm install --package-lock-only --ignore-scripts --offline`,
verified after generation — parses as JSON, top-level `name` is
`@reneturcios/prepboard`, version `0.1.0`, 128 package entries —
then only the lockfile was placed in the build dir. Local
`node_modules` is a copy of the fxrates sibling's tree used only
for the local build/test; it is not part of the lockfile
generation.

## Gaps / honest notes

- Core subset by design: 34 of the 38 documented tools are omitted
  because the public README gives them prose purposes only, with no
  parameter tables. Building them would require inventing schemas,
  which this program does not do. If the authenticated account
  server's live `tools/list` is ever captured, those tools can be
  added against a probed spec.
- Docs-derived spec: the four built tools' schemas come from the
  README's published parameter tables — no original calaf server
  was probed, so parity proves the rebuild matches this program's
  defined subset spec, not a hand-probed original.
- Forwarding wire shape is a documented reconstruction: the
  JSON-RPC `tools/call` POST envelope and the Bearer-token header
  follow the documented Streamable HTTP + OAuth shape in the spec;
  the account server's real auth is OAuth 2.1 with dynamic client
  registration + PKCE, and this rebuild's simpler contract is that
  the caller supplies an already-obtained access token via
  `CALAF_ACCESS_TOKEN`. The README also documents a plain-HTTP
  validator (`POST https://calaf.ai/api/seed-validate`); it is not
  used — `validate_seed` forwards to the MCP endpoint like the
  other tools.
- No live call was made: every endpoint is fake-fetch tested only,
  so live payload/response-shape drift against calaf.ai is
  unverified until the publish wave.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.
