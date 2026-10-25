# Connecting an MCP client to a local trainm8 (Phase 0)

`/mcp` serves the action registry's reads (ADR 0092 §8) in development and test
only, behind a static per-user dev bearer token. Production answers 404 and
refuses to boot with a token configured (#639 H6) until ADR 0094's OAuth lands.

## 1. Configure a token

```bash
USER_ID="$(sqlite3 prisma/data.db "select id from User where username = 'kody'")"
TOKEN="$(openssl rand -hex 24)"
echo "MCP_DEV_TOKENS=\"$USER_ID:$TOKEN\"" >> .env   # userId:token[:scope+scope]
npm run dev                                         # http://localhost:3000
```

A token names the athlete by user id, never by username, so a rename never moves
it to another account. The default scope is `training:read`. Only
`localhost`-class Host and Origin headers are accepted (DNS-rebinding guard), so
connect to `localhost`.

## 2. MCP Inspector

```bash
npx @modelcontextprotocol/inspector --cli http://localhost:3000/mcp \
  --transport http --header "Authorization: Bearer $TOKEN" --method tools/list
```

Drop `--cli …` to use the UI: transport "Streamable HTTP", URL
`http://localhost:3000/mcp`, and the `Authorization` header above.

## 3. Claude Code

```bash
claude mcp add --transport http trainm8 http://localhost:3000/mcp \
  --header "Authorization: Bearer $TOKEN"
```

## 4. curl

```bash
curl -s http://localhost:3000/mcp -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2025-06-18' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Every number in a result is a Reading: `{ status: 'available', value }` or
`{ status: 'unavailable', reason, label }`. The athlete's answers to proposals
are not tools: no answering tool exists on MCP (ADR 0093 §3), and a call by its
name is an unknown tool. The athlete answers in trainm8.
