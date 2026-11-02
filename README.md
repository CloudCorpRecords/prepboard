# prepboard

prepboard is a small forwarding client for the Calaf recruiting
workspace servers. It covers the seed workflow: read the seed
document format, validate a seed against it, import a seed into a
workspace, and list your workspaces. One binary serves a
command-line interface and a stdio MCP server.

> **Labelled core subset — 4 of 38 tools.** The original Calaf
> account server documents 38 tools, but only four of them have
> published parameter tables. prepboard builds exactly those four
> and omits the other 34 rather than inventing their schemas. The
> omitted tools are: `export_seed`, `get_profile_schema`,
> `get_firm_profile`, `submit_firm_profile`, `log_touchpoint`,
> `update_contact`, `add_task`, `get_contacts`, `get_firms`,
> `log_firm_work`, `get_firm_work`, `remove_firm_work`,
> `get_applications`, `schedule_interview`, `add_application`,
> `update_application`, `get_tasks`, `complete_task`, `snooze_task`,
> `add_firm`, `update_firm`, `add_office`, `add_note`, `get_notes`,
> `update_note`, `create_workspace`, `rename_workspace`,
> `archive_workspace`, `add_template`, `get_templates`,
> `update_template`, `add_prep_question`, `get_prep`,
> `draft_prep_answer`.

## How it talks to Calaf

Calls are forwarded as JSON-RPC `tools/call` POSTs to the upstream
MCP endpoints — this wire shape is a documented reconstruction from
the public spec, and the upstream `result` value is returned
verbatim.

- Public seeds endpoint: `https://calaf.ai/api/mcp` — no auth.
  Serves `seed-format` / `get_seed_format` and
  `validate-seed` / `validate_seed`.
- Account endpoint: `https://calaf.ai/api/mcp-account` — requires
  `Authorization: Bearer <token>` with the token from the
  `CALAF_ACCESS_TOKEN` environment variable. Serves
  `import-seed` / `import_seed` and `workspaces` /
  `list_workspaces`. When the token is missing, these commands fail
  with an error naming `CALAF_ACCESS_TOKEN`; they never fabricate a
  result.

Endpoint overrides: `CALAF_MCP_URL` for the public endpoint and
`CALAF_ACCOUNT_MCP_URL` for the account endpoint.

## Install

```bash
npx @reneturcios/prepboard seed-format
```

Or run the container image:

```bash
docker run -i ghcr.io/cloudcorprecords/prepboard
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead. Account commands inside the
container need `-e CALAF_ACCESS_TOKEN=...`.

## CLI

```bash
prepboard seed-format
prepboard validate-seed '<seed-json-or-string>'
prepboard import-seed my-workspace '<seed-json-or-string>' --parts orgs,templates,prep,contacts
prepboard workspaces

prepboard --version
```

A `<seed>` argument is taken as a JSON value when it parses as an
object, otherwise as a plain string seed — the Calaf seed format
accepts both a string and an object form. Commands print the
upstream result as JSON. Exit codes: `0` on success, `1` when a call
fails (including a missing token or an upstream error), `2` for
usage errors.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio MCP
server:

```bash
npx -y @reneturcios/prepboard mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "prepboard": {
      "command": "npx",
      "args": ["-y", "@reneturcios/prepboard", "mcp"],
      "env": {
        "CALAF_ACCESS_TOKEN": "<your Calaf access token>"
      }
    }
  }
}
```

The token is only needed for `import_seed` and `list_workspaces`;
`get_seed_format` and `validate_seed` work with nothing configured.

### Tools

| Tool | Input | Endpoint | What it returns |
| --- | --- | --- | --- |
| `get_seed_format` | (none) | public | The seed document format. |
| `validate_seed` | `seed` (string or object, required) | public | The validation result for that seed. |
| `import_seed` | `workspace` (required), `seed` (string or object, required), `parts` (string array, optional: orgs / templates / prep / contacts) | account | The import result. |
| `list_workspaces` | (none) | account | The caller's workspaces. |

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network (fake fetch fixtures)
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
