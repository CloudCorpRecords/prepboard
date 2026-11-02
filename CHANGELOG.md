# Changelog

## 0.1.0 (2026-10-26)

- Initial release. Labelled core subset: 4 of the 38 documented
  Calaf account-server tools — only the four with published
  parameter tables; the other 34 are omitted, not approximated.
- CLI: `prepboard seed-format|validate-seed|import-seed|workspaces`
  and `prepboard mcp`.
- MCP server (`prepboard mcp`, stdio) with four tools:
  `get_seed_format`, `validate_seed`, `import_seed`, and
  `list_workspaces`.
- Calls are forwarded as JSON-RPC `tools/call` POSTs (documented
  reconstruction of the wire shape). `get_seed_format` and
  `validate_seed` go to the public seeds endpoint
  (`CALAF_MCP_URL`, default `https://calaf.ai/api/mcp`, no auth);
  `import_seed` and `list_workspaces` go to the account endpoint
  (`CALAF_ACCOUNT_MCP_URL`, default
  `https://calaf.ai/api/mcp-account`) with a Bearer token from
  `CALAF_ACCESS_TOKEN`. A missing token is an explicit error naming
  the env var, never a fabricated result.
- Upstream HTTP errors, JSON-RPC errors, and upstream error results
  all surface as errors.
- All HTTP goes through an injectable fetch function, so the test
  suite runs entirely on hand-written fixtures with no network
  access.
