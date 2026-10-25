# Captured evidence: Better Auth MCP spike (#552)

Raw output of the runs behind
[`../better-auth-mcp-spike.md`](../better-auth-mcp-spike.md), captured
2026-10-24 against `server.mts` on `http://localhost:3000`. The runs used
scratch `.ts` copies of the scripts in this folder; the `.mts` files here were
then re-run from a clean install with the same results. Tokens are redacted;
authorization codes were already truncated by the script. Client ids differ
between runs because each run registers or resolves its own client.

## Run 1. Claude-shaped flow, DCR fallback, both eras, refresh rotation and replay (`CLIENT=dcr node claude-sim.mts`)

```text
### 1. POST /mcp without token (167 ms)
401
WWW-Authenticate: Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/mcp", scope="training:read"

### 2. GET http://localhost:3000/.well-known/oauth-protected-resource/mcp (32 ms)
{
  "resource": "http://localhost:3000/mcp",
  "authorization_servers": [
    "http://localhost:3000/api/auth"
  ],
  "bearer_methods_supported": [
    "header"
  ],
  "dpop_signing_alg_values_supported": [
    "EdDSA",
    "ES256",
    "ES512",
    "PS256",
    "RS256"
  ],
  "scopes_supported": [
    "training:read",
    "training:propose",
    "training:log"
  ]
}
resource === MCP_URL: true

### 3. GET http://localhost:3000/.well-known/oauth-authorization-server/api/auth (15 ms)
{
  "issuer": "http://localhost:3000/api/auth",
  "issuer_matches": true,
  "client_id_metadata_document_supported": true,
  "token_endpoint_auth_methods_supported": [
    "none",
    "client_secret_basic",
    "client_secret_post",
    "private_key_jwt"
  ],
  "code_challenge_methods_supported": [
    "S256"
  ],
  "registration_endpoint": "http://localhost:3000/api/auth/oauth2/register",
  "scopes_supported": [
    "openid",
    "offline_access",
    "training:read",
    "training:propose",
    "training:log"
  ],
  "authorization_response_iss_parameter_supported": true
}

### 4. DCR POST http://localhost:3000/api/auth/oauth2/register (61 ms)
{
  "status": 201,
  "client_id": "jsfMWJellhEQFZgTWCEZGZfnZwgNwPwP",
  "scope": "openid offline_access training:read training:propose training:log",
  "client_id_issued_at": 1792863570,
  "client_name": "Claude",
  "redirect_uris": [
    "https://claude.ai/api/mcp/auth_callback"
  ],
  "token_endpoint_auth_method": "none",
  "grant_types": [
    "authorization_code",
    "refresh_token"
  ],
  "response_types": [
    "code"
  ],
  "application_type": "web",
  "disabled": false,
  "dpop_bound_access_tokens": false,
  "resources": [
    "http://localhost:3000/mcp"
  ]
}

### 4. client
{
  "CLIENT": "dcr",
  "cimdOk": true,
  "clientId": "jsfMWJellhEQFZgTWCEZGZfnZwgNwPwP",
  "redirectUri": "https://claude.ai/api/mcp/auth_callback"
}

### 5. authorize request
{
  "scope": "training:read offline_access",
  "resource": "http://localhost:3000/mcp"
}

### 5. user-agent trace (559 ms)
[
  {
    "method": "GET",
    "url": "http://localhost:3000/api/auth/oauth2/authorize?…",
    "status": 302,
    "location": "/login?…"
  },
  {
    "method": "GET",
    "url": "http://localhost:3000/login?…",
    "status": 200
  },
  {
    "method": "POST",
    "url": "http://localhost:3000/login?…",
    "status": 302,
    "location": "/consent?…"
  },
  {
    "method": "GET",
    "url": "http://localhost:3000/consent?…",
    "status": 200
  },
  {
    "method": "POST",
    "url": "http://localhost:3000/consent?…",
    "status": 302,
    "location": "https://claude.ai/api/mcp/auth_callback?…"
  }
]

### 6. callback
{
  "code": "kaE8QD…",
  "state": "azjPtQAENKrTqGH6GE_Y3Q",
  "iss": "http://localhost:3000/api/auth",
  "state_ok": true,
  "iss_ok": true
}

### 7. token exchange (90 ms)
{
  "status": 200,
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "training:read offline_access",
  "has_refresh_token": true,
  "has_id_token": false
}

### 7. access token JWT
{
  "header": {
    "typ": "at+jwt",
    "alg": "EdDSA",
    "kid": "kgmxs6nPHDC7dCK4FYZCsQ5nLD9xfjDU"
  },
  "payload": {
    "sub": "gPsgc5hQqBGLC9EkN9msQgXIY4c5Aim9",
    "aud": "http://localhost:3000/mcp",
    "client_id": "jsfMWJellhEQFZgTWCEZGZfnZwgNwPwP",
    "azp": "jsfMWJellhEQFZgTWCEZGZfnZwgNwPwP",
    "scope": "training:read offline_access",
    "sid": "Z5c25d0NSy1l0ZNkdJHY3Lj9VALpY41R",
    "iss": "http://localhost:3000/api/auth",
    "iat": 1792863571,
    "exp": 1792867171,
    "jti": "8mjk9iDpagOyRU2cxENHO6gcwYeZBmgs",
    "lifetime_s": 3600
  }
}

### 8a. 2025-06-18 initialize
{
  "status": 200,
  "sessionId": null,
  "body": "event: message\ndata: {\"result\":{\"protocolVersion\":\"2025-06-18\",\"capabilities\":{\"tools\":{\"listChanged\":true}},\"serverInfo\":{\"name\":\"trainm8-spike\",\"version\":\"0.0.0\"}},\"jsonrpc\":\"2.0\",\"id\":1}\n\n"
}

### 8a. 2025-06-18 tools/call get_week
{
  "status": 200,
  "sessionId": null,
  "body": "event: message\ndata: {\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"week for athlete (era=legacy, client=jsfMWJellhEQFZgTWCEZGZfnZwgNwPwP, scopes=training:read offline_access)\"}]},\"jsonrpc\":\"2.0\",\"id\":2}\n\n"
}

### 8a. 2025-11-25 initialize
{
  "status": 200,
  "sessionId": null,
  "body": "event: message\ndata: {\"result\":{\"protocolVersion\":\"2025-11-25\",\"capabilities\":{\"tools\":{\"listChanged\":true}},\"serverInfo\":{\"name\":\"trainm8-spike\",\"version\":\"0.0.0\"}},\"jsonrpc\":\"2.0\",\"id\":1}\n\n"
}

### 8a. 2025-11-25 tools/call get_week
{
  "status": 200,
  "sessionId": null,
  "body": "event: message\ndata: {\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"week for athlete (era=legacy, client=jsfMWJellhEQFZgTWCEZGZfnZwgNwPwP, scopes=training:read offline_access)\"}]},\"jsonrpc\":\"2.0\",\"id\":2}\n\n"
}

### 8a. 2025-era GET /mcp (SSE stream open)
{
  "status": 405,
  "body": "{\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32000,\"message\":\"Method not allowed.\"},\"id\":null}"
}

### 8b. 2026-07-28 (v2 client pinned)
{
  "negotiated": "2026-07-28",
  "tools": [
    "get_week"
  ],
  "call": [
    {
      "type": "text",
      "text": "week for athlete (era=modern, client=jsfMWJellhEQFZgTWCEZGZfnZwgNwPwP, scopes=training:read offline_access)"
    }
  ]
}

### 9. refresh #1 (91 ms)
{
  "status": 200,
  "rotated": true,
  "aud": "http://localhost:3000/mcp"
}

### 9. replay old refresh token inside the 30 s reuse window
{
  "status": 200,
  "same_response": true
}

### 9. replay old refresh token after 31 s
{
  "status": 400,
  "error_description": "invalid refresh token",
  "error": "invalid_grant"
}

### 9. the rotated (newest) refresh token after the replay (family revoked?)
{
  "status": 400,
  "error_description": "session not found",
  "error": "invalid_grant"
}
```

## Run 2. CIMD with claude.ai's real metadata document, fetched by `@better-auth/cimd/node` (`CLIENT=claude-web`)

```text
### 4. client
{
  "CLIENT": "claude-web",
  "cimdOk": true,
  "clientId": "https://claude.ai/oauth/mcp-oauth-client-metadata",
  "redirectUri": "https://claude.ai/api/mcp/auth_callback"
}

### 5. authorize request
{
  "scope": "training:read offline_access",
  "resource": "http://localhost:3000/mcp"
}

### 5. user-agent trace (729 ms)
[
  {
    "method": "GET",
    "url": "http://localhost:3000/api/auth/oauth2/authorize?…",
    "status": 302,
    "location": "/login?…"
  },
  {
    "method": "GET",
    "url": "http://localhost:3000/login?…",
    "status": 200
  },
  {
    "method": "POST",
    "url": "http://localhost:3000/login?…",
    "status": 302,
    "location": "/consent?…"
  },
  {
    "method": "GET",
    "url": "http://localhost:3000/consent?…",
    "status": 200
  },
  {
    "method": "POST",
    "url": "http://localhost:3000/consent?…",
    "status": 302,
    "location": "https://claude.ai/api/mcp/auth_callback?…"
  }
]

### 6. callback
{
  "code": "6hbit3…",
  "state": "Ccr0kuoCTgy7nkLk0V_BNw",
  "iss": "http://localhost:3000/api/auth",
  "state_ok": true,
  "iss_ok": true
}

### 7. token exchange (61 ms)
{
  "status": 200,
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "training:read offline_access",
  "has_refresh_token": true,
  "has_id_token": false
}

### 7. access token JWT
{
  "header": {
    "typ": "at+jwt",
    "alg": "EdDSA",
    "kid": "kgmxs6nPHDC7dCK4FYZCsQ5nLD9xfjDU"
  },
  "payload": {
    "sub": "gPsgc5hQqBGLC9EkN9msQgXIY4c5Aim9",
    "aud": "http://localhost:3000/mcp",
    "client_id": "https://claude.ai/oauth/mcp-oauth-client-metadata",
    "azp": "https://claude.ai/oauth/mcp-oauth-client-metadata",
    "scope": "training:read offline_access",
    "sid": "v5NEGw6zXThh4GYmq1hSpi3cbKQapITS",
    "iss": "http://localhost:3000/api/auth",
    "iat": 1792863622,
    "exp": 1792867222,
    "jti": "p_0_zoslgQHkP0ecAvfOrbjkQA1FREa1",
    "lifetime_s": 3600
  }
}

### 8a. 2025-06-18 initialize
{
  "status": 200,
  "sessionId": null,
  "body": "event: message\ndata: {\"result\":{\"protocolVersion\":\"2025-06-18\",\"capabilities\":{\"tools\":{\"listChanged\":true}},\"serverInfo\":{\"name\":\"trainm8-spike\",\"version\":\"0.0.0\"}},\"jsonrpc\":\"2.0\",\"id\":1}\n\n"
}

### 8a. 2025-06-18 tools/call get_week
{
  "status": 200,
  "sessionId": null,
  "body": "event: message\ndata: {\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"week for athlete (era=legacy, client=https://claude.ai/oauth/mcp-oauth-client-metadata, scopes=training:read offline_access)\"}]},\"jsonrpc\":\"2.0\",\"id\":2}\n\n"
}
```

## Run 3. CIMD with Claude Code's real document and a random loopback port (`CLIENT=claude-code`)

```text
### 4. client
{
  "CLIENT": "claude-code",
  "cimdOk": true,
  "clientId": "https://claude.ai/oauth/claude-code-client-metadata",
  "redirectUri": "http://localhost:33415/callback"
}

### 5. authorize request
{
  "scope": "training:read offline_access",
  "resource": "http://localhost:3000/mcp"
}

### 5. user-agent trace (645 ms)
[
  {
    "method": "GET",
    "url": "http://localhost:3000/api/auth/oauth2/authorize?…",
    "status": 302,
    "location": "/login?…"
  },
  {
    "method": "GET",
    "url": "http://localhost:3000/login?…",
    "status": 200
  },
  {
    "method": "POST",
    "url": "http://localhost:3000/login?…",
    "status": 302,
    "location": "/consent?…"
  },
  {
    "method": "GET",
    "url": "http://localhost:3000/consent?…",
    "status": 200
  },
  {
    "method": "POST",
    "url": "http://localhost:3000/consent?…",
    "status": 302,
    "location": "http://localhost:33415/callback?…"
  }
]

### 6. callback
{
  "code": "WZMbn2…",
  "state": "F7ybZJQGF9U1COiXot-dwA",
  "iss": "http://localhost:3000/api/auth",
  "state_ok": true,
  "iss_ok": true
}

### 7. token exchange (78 ms)
{
  "status": 200,
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "training:read offline_access",
  "has_refresh_token": true,
  "has_id_token": false
}
```

## Run 3b. The same with `127.0.0.1` (`LOOPBACK_HOST=127.0.0.1`)

```text
### 4. client
{
  "CLIENT": "claude-code",
  "cimdOk": true,
  "clientId": "https://claude.ai/oauth/claude-code-client-metadata",
  "redirectUri": "http://127.0.0.1:45358/callback"
}

### 5. authorize request
{
  "scope": "training:read offline_access",
  "resource": "http://localhost:3000/mcp"
}

### 5. user-agent trace (263 ms)
[
  {
    "method": "GET",
    "url": "http://localhost:3000/api/auth/oauth2/authorize?…",
    "status": 302,
    "location": "/login?…"
  },
  {
    "method": "GET",
    "url": "http://localhost:3000/login?…",
    "status": 200
  },
  {
    "method": "POST",
    "url": "http://localhost:3000/login?…",
    "status": 302,
    "location": "http://127.0.0.1:45358/callback?…"
  }
]

### 6. callback
{
  "code": "xIdOVl…",
  "state": "aoYacKhSqbT6IRrlVvw8FA",
  "iss": "http://localhost:3000/api/auth",
  "state_ok": true,
  "iss_ok": true
}
```

## Run 4. Epic session bridged to a Better Auth session, fresh client so consent shows (`LOGIN=epic CLIENT=dcr`)

```text
### 5. user-agent trace (201 ms)
[
  {
    "method": "GET",
    "url": "http://localhost:3000/api/auth/oauth2/authorize?…",
    "status": 302,
    "location": "/login?…"
  },
  {
    "method": "GET",
    "url": "http://localhost:3000/login?…",
    "status": 200
  },
  {
    "method": "GET",
    "url": "http://localhost:3000/epic-login?…",
    "status": 302,
    "location": "/login?…"
  },
  {
    "method": "GET",
    "url": "http://localhost:3000/login?…",
    "status": 302,
    "location": "/consent?…"
  },
  {
    "method": "GET",
    "url": "http://localhost:3000/consent?…",
    "status": 200
  },
  {
    "method": "POST",
    "url": "http://localhost:3000/consent?…",
    "status": 302,
    "location": "https://claude.ai/api/mcp/auth_callback?…"
  }
]

### 6. callback
{
  "code": "ALFkZV…",
  "state": "PeDgnweq7xyFJEXZawj7iQ",
  "iss": "http://localhost:3000/api/auth",
  "state_ok": true,
  "iss_ok": true
}

### 7. token exchange (50 ms)
{
  "status": 200,
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "training:read offline_access",
  "has_refresh_token": true,
  "has_id_token": false
}
```

## Run 4c. Bridge for a user created the Epic way: cuid id, `name` null, no Better Auth account (`EPIC_USER=epiconly`)

```text
### 8b. 2026-07-28 (v2 client pinned)
{
  "negotiated": "2026-07-28",
  "tools": [
    "get_week"
  ],
  "call": [
    {
      "type": "text",
      "text": "week for epiconly (era=modern, client=lBGaQXsQyQYXpIYYrbhAVTCpxseHBCwV, scopes=training:read offline_access)"
    }
  ]
}
```

## Run 5. Resource variants, step-up, foreign tokens, request hygiene, revocation, DCR flood (`negative.mts`, NODE_ENV unset)

```text
### A. authorize+token with resource=http://localhost:3000/mcp/
{
  "authorize_error": {
    "error": "invalid_target",
    "error_description": "requested resource http://localhost:3000/mcp/ is not configured",
    "state": "s",
    "iss": "http://localhost:3000/api/auth"
  }
}

### A. authorize+token with resource=http://LOCALHOST:3000/mcp
{
  "authorize_error": {
    "error": "invalid_target",
    "error_description": "requested resource http://LOCALHOST:3000/mcp is not configured",
    "state": "s",
    "iss": "http://localhost:3000/api/auth"
  }
}

### A. authorize+token with resource=http://localhost:3000/other
{
  "authorize_error": {
    "error": "invalid_target",
    "error_description": "requested resource http://localhost:3000/other is not configured",
    "state": "s",
    "iss": "http://localhost:3000/api/auth"
  }
}

### A. authorize+token with resource=(none)
{
  "token_status": 200,
  "aud": "(opaque token, 32 chars)",
  "mcp": {
    "status": 401,
    "www-authenticate": "Bearer resource_metadata=\"http://localhost:3000/.well-known/oauth-protected-resource/mcp\", scope=\"training:read\"",
    "body": "{\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32000,\"message\":\"no token payload\"},\"id\":null}"
  }
}

### B. token scope=training:propose -> POST /mcp (requiredScopes training:read)
{
  "scope": "training:propose offline_access",
  "mcp": {
    "status": 403,
    "www-authenticate": "Bearer error=\"insufficient_scope\", scope=\"training:read\", resource_metadata=\"http://localhost:3000/.well-known/oauth-protected-resource/mcp\", error_description=\"access token is missing required scope: training:read\"",
    "body": "{\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32000,\"message\":\"access token is missing required scope: training:read\"},\"id\":null}"
  }
}

### C1. id_token (aud=client_id) presented as bearer
{
  "id_token_aud": "pYfUhQZJSGoHykVjlbJtDKyDrTymVsFn",
  "mcp": {
    "status": 401,
    "www-authenticate": "Bearer resource_metadata=\"http://localhost:3000/.well-known/oauth-protected-resource/mcp\", scope=\"training:read\"",
    "body": "{\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32000,\"message\":\"invalid access token\"},\"id\":null}"
  }
}

### C2. access token with aud edited (bad signature)
{
  "status": 401,
  "www-authenticate": "Bearer resource_metadata=\"http://localhost:3000/.well-known/oauth-protected-resource/mcp\", scope=\"training:read\"",
  "body": "{\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32000,\"message\":\"invalid access token\"},\"id\":null}"
}

### C3. garbage bearer
{
  "status": 401,
  "www-authenticate": "Bearer resource_metadata=\"http://localhost:3000/.well-known/oauth-protected-resource/mcp\", scope=\"training:read\"",
  "body": "{\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32000,\"message\":\"no token payload\"},\"id\":null}"
}

### D1. redirect_uri not registered
{
  "error": "Error: stuck at GET http://localhost:3000/api/auth/error?error=invalid_redirect&error_description=invalid+redirect+uri: 200 <!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>Error</title>\n    <style>\n      * {\n        box-sizing: border-box;\n      }\n      body {\n        font-family: -apple-",
  "verifier": "fc5xGOJVkd6rzAuoMN_ImrJgz7t4Yc3exhuFnCFma18",
  "jar": {
    "cookies": {}
  }
}

### D2. no PKCE
{
  "callback": {
    "error": "invalid_request",
    "error_description": "pkce is required for public clients",
    "state": "s",
    "iss": "http://localhost:3000/api/auth"
  },
  "verifier": "Q_Gd95Z9YSKWfSqczHoG2aiusrfozW3w3Xbs8e1UBTc",
  "jar": {
    "cookies": {}
  },
  "redirect_uri": "https://claude.ai/api/mcp/auth_callback",
  "resource": "http://localhost:3000/mcp"
}

### D3. PKCE plain
{
  "callback": {
    "error": "invalid_request",
    "error_description": "code_challenge_method must be one of: S256",
    "state": "s",
    "iss": "http://localhost:3000/api/auth"
  },
  "verifier": "olVvJhV7O9fuI0is7fM9Xuca6FrRxdtDuQjqWiwMKc8",
  "jar": {
    "cookies": {}
  },
  "redirect_uri": "https://claude.ai/api/mcp/auth_callback",
  "resource": "http://localhost:3000/mcp"
}

### D4. DCR with javascript: redirect
{
  "status": 400,
  "body": {
    "error": "invalid_redirect_uri",
    "error_description": "redirect_uris[0]: URL cannot use javascript:, data:, or vbscript: scheme"
  }
}

### D5. CIMD client_id on a host that serves no document
{
  "error": "Error: stuck at GET http://localhost:3000/api/auth/oauth2/authorize?response_type=code&client_id=https%3A%2F%2Fexample.com%2Foauth%2Fnot-a-client&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&code_challenge=735m5P8GCFdoM2upq-EGJVIefupI2ctoXFq43qwS1Gg&code_challenge_method=S256&state=s&scope=training%3Aread+offline_access&resource=http%3A%2F%2Flocalhost%3A3000%2Fmcp: 400 {\"error\"",
  "verifier": "7JpXOJ40JQfqGs2woOmOFX0iXU-Chdzq5JLcEDwRHRM",
  "jar": {
    "cookies": {}
  }
}

### E1. RFC 7009 revoke refresh token
{
  "status": 200
}

### E1. refresh with the revoked token
{
  "status": 400,
  "body": {
    "error_description": "invalid refresh token",
    "error": "invalid_grant"
  }
}

### E1. access token (JWT) after its refresh token was revoked
{
  "status": 200,
  "www-authenticate": null,
  "body": "event: message\ndata: {\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"week for athlete (era=legacy, client=pYfUhQZJSGoHykVjlbJtDKyDrTymVsFn, scopes=training:read offline_access)\"}]},\"jsonrpc\":\"2.0\",\"id\":1"
}

### E2. user deletes consent ("disconnect Claude")
{
  "status": 200,
  "consentsBefore": 8
}

### E2. refresh after consent deleted (expect invalid_grant; Better Auth?)
{
  "status": 200,
  "body": {
    "access_token": "<redacted>",
    "expires_in": 3600,
    "expires_at": 1792867340,
    "token_type": "Bearer",
    "refresh_token": "<redacted>",
    "scope": "training:read offline_access"
  }
}

### E2. old access token after consent deleted
{
  "status": 200,
  "www-authenticate": null,
  "body": "event: message\ndata: {\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"week for athlete (era=legacy, client=BwwhEYXBfstcFyvtPETXZkhpfdThhgrx, scopes=training:read offline_access)\"}]},\"jsonrpc\":\"2.0\",\"id\":1"
}

### F. 40 anonymous DCR registrations in a row (NODE_ENV unset)
{
  "201": 40
}
```

## Run 5b. The DCR flood with `NODE_ENV=production` (rate limiter on)

```text
### F. 40 anonymous DCR registrations in a row (NODE_ENV unset)
{
  "201": 2,
  "429": 38
}
```

## Run 6. Per-tool step-up on both eras, with the bypass attempts (`stepup.mts`)

```text
### 2025-06-18 propose_week_change with training:read only
{
  "status": 403,
  "www-authenticate": "Bearer error=\"insufficient_scope\", scope=\"training:read training:propose\", resource_metadata=\"http://localhost:3000/.well-known/oauth-protected-resource/mcp\", error_description=\"access token is missing required scope: training:read training:propose\"",
  "body": "{\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32000,\"message\":\"access token is missing required scope: training:read training:propose\"},\"id\":null}"
}

### 2026-07-28 propose_week_change with training:read only
{
  "error": "InsufficientScopeError: Insufficient scope: required \"training:read training:propose\"",
  "http": {
    "status": 403,
    "wwwAuth": "Bearer error=\"insufficient_scope\", scope=\"training:read training:propose\", resource_metadata=\"http://localhost:3000/.well-known/oauth-protected-resource/mcp\", error_description=\"access token is missing required scope: training:read training:propose\""
  }
}

### 2026-07-28 get_week with training:read only (unaffected)
{
  "ok": [
    {
      "type": "text",
      "text": "week for athlete (era=modern, client=IoADGCiJOPCwxsFrEHXDPzCelEswgTnP, scopes=training:read offline_access)"
    }
  ],
  "http": {
    "status": 200,
    "wwwAuth": null
  }
}

### 2025-06-18 propose_week_change after step-up
{
  "status": 200,
  "www-authenticate": null,
  "body": "event: message\ndata: {\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"proposal created (stub)\"}]},\"jsonrpc\":\"2.0\",\"id\":1}\n\n"
}

### 2026-07-28 propose_week_change after step-up
{
  "ok": [
    {
      "type": "text",
      "text": "proposal created (stub)"
    }
  ],
  "http": {
    "status": 200,
    "wwwAuth": null
  }
}

### bypass: 2025-06-18 propose_week_change with Mcp-Name: get_week
{
  "status": 403,
  "www-authenticate": "Bearer error=\"insufficient_scope\", scope=\"training:read training:propose\", resource_metadata=\"http://localhost:3000/.well-known/oauth-protected-resource/mcp\", error_description=\"access token is missing required scope: training:read training:propose\"",
  "body": "{\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32000,\"message\":\"access token is missing required scope: training:read training:propose\"},\"id\":null}"
}

### bypass: 2025-06-18 batch [get_week, propose_week_change]
{
  "status": 403,
  "www-authenticate": "Bearer error=\"insufficient_scope\", scope=\"training:read training:propose\", resource_metadata=\"http://localhost:3000/.well-known/oauth-protected-resource/mcp\", error_description=\"access token is missing required scope: training:read training:propose\"",
  "body": "{\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32000,\"message\":\"access token is missing required scope: training:read training:propose\"},\"id\":null}"
}

### bypass: 2026-07-28 propose_week_change with Base64-encoded Mcp-Name
{
  "error": "InsufficientScopeError: Insufficient scope: required \"training:read training:propose\"",
  "http": {
    "status": 403,
    "wwwAuth": "Bearer error=\"insufficient_scope\", scope=\"training:read training:propose\", resource_metadata=\"http://localhost:3000/.well-known/oauth-protected-resource/mcp\", error_description=\"access token is missing required scope: training:read training:propose\""
  }
}

### bypass: 2026-07-28 propose_week_change with Mcp-Name: get_week
{
  "error": "InsufficientScopeError: Insufficient scope: required \"training:read training:propose\"",
  "http": {
    "status": 403,
    "wwwAuth": "Bearer error=\"insufficient_scope\", scope=\"training:read training:propose\", resource_metadata=\"http://localhost:3000/.well-known/oauth-protected-resource/mcp\", error_description=\"access token is missing required scope: training:read training:propose\""
  }
}
```

## Run 6, before the fix. The same bypass attempts against the header-first gate of ab893fd

```text
### bypass: 2025-06-18 propose_week_change with Mcp-Name: get_week
{
  "status": 200,
  "www-authenticate": null,
  "body": "event: message\ndata: {\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"proposal created (stub)\"}]},\"jsonrpc\":\"2.0\",\"id\":1}\n\n"
}

### bypass: 2025-06-18 batch [get_week, propose_week_change]
{
  "status": 200,
  "www-authenticate": null,
  "body": "event: message\ndata: {\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"proposal created (stub)\"}]},\"jsonrpc\":\"2.0\",\"id\":2}\n\nevent: message\ndata: {\"result\":{\"content\""
}

### bypass: 2026-07-28 propose_week_change with Base64-encoded Mcp-Name
{
  "ok": [
    {
      "type": "text",
      "text": "proposal created (stub)"
    }
  ],
  "http": {
    "status": 200,
    "wwwAuth": null
  }
}

### bypass: 2026-07-28 propose_week_change with Mcp-Name: get_week
{
  "error": "ProtocolError: Bad Request: the request headers and body disagree: the body carries params.name=\"propose_week_change\" but the Mcp-Name header names \"get_week\"",
  "http": {
    "status": 400,
    "wwwAuth": null
  }
}
```

## Run 7. The same server with `legacy: 'reject'`, as Better Auth's docs advise

```text
### 8a. 2025-06-18 initialize
{
  "status": 400,
  "sessionId": null,
  "body": "{\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32022,\"message\":\"Unsupported protocol version: 2025-06-18\",\"data\":{\"supported\":[\"2026-07-28\"],\"requested\":\"2025-06-18\"}},\"id\":1}"
}

### 8a. 2025-06-18 tools/call get_week
{
  "status": 400,
  "sessionId": null,
  "body": "{\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32022,\"message\":\"Unsupported protocol version: 2025-06-18\",\"data\":{\"supported\":[\"2026-07-28\"],\"requested\":\"2025-06-18\"}},\"id\":2}"
}

### 8a. 2025-11-25 initialize
{
  "status": 400,
  "sessionId": null,
  "body": "{\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32022,\"message\":\"Unsupported protocol version: 2025-11-25\",\"data\":{\"supported\":[\"2026-07-28\"],\"requested\":\"2025-11-25\"}},\"id\":1}"
}

### 8a. 2025-11-25 tools/call get_week
{
  "status": 400,
  "sessionId": null,
  "body": "{\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32022,\"message\":\"Unsupported protocol version: 2025-11-25\",\"data\":{\"supported\":[\"2026-07-28\"],\"requested\":\"2025-11-25\"}},\"id\":2}"
}

### 8a. 2025-era GET /mcp (SSE stream open)
{
  "status": 405,
  "body": "{\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32000,\"message\":\"Method not allowed.\"},\"id\":null}"
}

### 8b. 2026-07-28 (v2 client pinned)
{
  "negotiated": "2026-07-28",
  "tools": [
    "get_week"
  ],
  "call": [
    {
      "type": "text",
      "text": "week for athlete (era=modern, client=yMZNmpckcuCtrHRIhJfQhpbHiWnVyNut, scopes=training:read offline_access)"
    }
  ]
}
```

## Run 8. The official SDK clients with their own OAuth: v1 1.32.2 (2025-era, DCR) and v2 2.4.0 pinned to 2026-07-28 (CIMD)

```text
### v1 SDK 1.32.2 (2025-era)
{
  "registered_client_id": "gtOUkPqcZFvznbRjQqQRzgMnYGgSeRmv",
  "authorize_params": {
    "client_id": "gtOUkPqcZFvznbRjQqQRzgMnYGgSeRmv",
    "code_challenge_method": "S256",
    "scope": "training:read",
    "resource": "http://localhost:3000/mcp"
  },
  "negotiated": "2025-11-25",
  "tools": [
    "get_week"
  ],
  "call": [
    {
      "type": "text",
      "text": "week for athlete (era=legacy, client=gtOUkPqcZFvznbRjQqQRzgMnYGgSeRmv, scopes=training:read)"
    }
  ]
}
[mcp-sdk] OAuthClientProvider does not implement saveDiscoveryState()/discoveryState(); the SEP-2352 callback-leg authorization-server binding cannot be checked. Implement discoveryState (persist alongside codeVerifier) — see docs/migration/upgrade-to-v2.md §SEP-2352.

### v2 SDK 2.4.0 (2026-07-28 pinned)
{
  "client_id": "https://claude.ai/oauth/claude-code-client-metadata",
  "authorize_params": {
    "code_challenge_method": "S256",
    "scope": "training:read offline_access",
    "resource": "http://localhost:3000/mcp"
  },
  "negotiated": "2026-07-28",
  "tools": [
    "get_week"
  ],
  "call": [
    {
      "type": "text",
      "text": "week for athlete (era=modern, client=https://claude.ai/oauth/claude-code-client-metadata, scopes=training:read offline_access)"
    }
  ]
}
```

## Run 9. MCP Inspector CLI 2.12.0 with a bearer from run 1

```text
$ mcp-inspector --cli http://localhost:3000/mcp --method tools/list --header "Authorization: Bearer <token>"
{
  "tools": [
    {
      "name": "get_week",
      "description": "Read the athlete's current training week (spike stub).",
      "inputSchema": {
        "type": "object",
        "properties": {},
        "$schema": "https://json-schema.org/draft/2020-12/schema"
      },
      "annotations": {
        "readOnlyHint": true
      }
    }
  ]
}
$ mcp-inspector --cli ... --method tools/call --tool-name get_week
{
  "content": [
    {
      "type": "text",
      "text": "week for athlete (era=legacy, client=IeXsWKFPnKnCZwOqfyTYtLkAtXnFaong, scopes=training:read offline_access)"
    }
  ]
}
$ mcp-inspector --cli ... --method tools/list   (no token)
{"error":{"code":"auth_required","message":"Interactive OAuth requires a TTY on stdin or stderr (or MCP_AUTO_OPEN_ENABLED=true). For CI/non-interactive runs use --stored-auth-only."}}
```

## Run 10. No `offline_access` means no refresh token; `ACCESS_TTL=120` (`SCOPE='training:read' CLIENT=dcr`)

```text
### 7. token exchange (31 ms)
{
  "status": 200,
  "token_type": "Bearer",
  "expires_in": 120,
  "scope": "training:read",
  "has_refresh_token": false,
  "has_id_token": false
}
```

## Run 11. HTTPS front that keeps the Host header, as a tunnel does (BASE_URL=https://localhost:3443, self-signed cert trusted by the client only), after pointing jwksUrl inside

```text
### 1. POST /mcp without token (72 ms)
401
WWW-Authenticate: Bearer resource_metadata="https://localhost:3443/.well-known/oauth-protected-resource/mcp", scope="training:read"

### 2. GET https://localhost:3443/.well-known/oauth-protected-resource/mcp (31 ms)
{
  "resource": "https://localhost:3443/mcp",
  "authorization_servers": [
    "https://localhost:3443/api/auth"
  ],
  "bearer_methods_supported": [
    "header"
  ],
  "dpop_signing_alg_values_supported": [
    "EdDSA",
    "ES256",
    "ES512",
    "PS256",
    "RS256"
  ],
  "scopes_supported": [
    "training:read",
    "training:propose",
    "training:log"
  ]
}
resource === MCP_URL: true

### 3. GET https://localhost:3443/.well-known/oauth-authorization-server/api/auth (36 ms)
{
  "issuer": "https://localhost:3443/api/auth",
  "issuer_matches": true,
  "client_id_metadata_document_supported": true,
  "token_endpoint_auth_methods_supported": [
    "none",
    "client_secret_basic",
    "client_secret_post",
    "private_key_jwt"
  ],
  "code_challenge_methods_supported": [
    "S256"
  ],
  "registration_endpoint": "https://localhost:3443/api/auth/oauth2/register",
  "scopes_supported": [
    "openid",
    "offline_access",
    "training:read",
    "training:propose",
    "training:log"
  ],
  "authorization_response_iss_parameter_supported": true
}

### 4. client
{
  "CLIENT": "claude-web",
  "cimdOk": true,
  "clientId": "https://claude.ai/oauth/mcp-oauth-client-metadata",
  "redirectUri": "https://claude.ai/api/mcp/auth_callback"
}

### 5. authorize request
{
  "scope": "training:read offline_access",
  "resource": "https://localhost:3443/mcp"
}

### 5. user-agent trace (772 ms)
[
  {
    "method": "GET",
    "url": "https://localhost:3443/api/auth/oauth2/authorize?…",
    "status": 302,
    "location": "/login?…"
  },
  {
    "method": "GET",
    "url": "https://localhost:3443/login?…",
    "status": 200
  },
  {
    "method": "POST",
    "url": "https://localhost:3443/login?…",
    "status": 302,
    "location": "https://claude.ai/api/mcp/auth_callback?…"
  }
]

### 6. callback
{
  "code": "IKKoyK…",
  "state": "cfi1BwunqBqe3haepfuTlQ",
  "iss": "https://localhost:3443/api/auth",
  "state_ok": true,
  "iss_ok": true
}

### 7. token exchange (130 ms)
{
  "status": 200,
  "token_type": "Bearer",
  "expires_in": 120,
  "scope": "training:read offline_access",
  "has_refresh_token": true,
  "has_id_token": false
}

### 7. access token JWT
{
  "header": {
    "typ": "at+jwt",
    "alg": "EdDSA",
    "kid": "WduGX4GpbSqKjhFvcgLUYQwb3RlnYSYg"
  },
  "payload": {
    "sub": "W5vfhXvyeQGtTNaJ14nwPzSsVRlBqJY3",
    "aud": "https://localhost:3443/mcp",
    "client_id": "https://claude.ai/oauth/mcp-oauth-client-metadata",
    "azp": "https://claude.ai/oauth/mcp-oauth-client-metadata",
    "scope": "training:read offline_access",
    "sid": "f4DNxtnDSJ1o4U1GO63vGHOvNyRZhfuL",
    "iss": "https://localhost:3443/api/auth",
    "iat": 1792864790,
    "exp": 1792864910,
    "jti": "LzzhN4vRTIpIjX7OGn1-yq_8qI1IqJDV",
    "lifetime_s": 120
  }
}

### 8a. 2025-06-18 initialize
{
  "status": 200,
  "sessionId": null,
  "body": "event: message\ndata: {\"result\":{\"protocolVersion\":\"2025-06-18\",\"capabilities\":{\"tools\":{\"listChanged\":true}},\"serverInfo\":{\"name\":\"trainm8-spike\",\"version\":\"0.0.0\"}},\"jsonrpc\":\"2.0\",\"id\":1}\n\n"
}

### 8a. 2025-06-18 tools/call get_week
{
  "status": 200,
  "sessionId": null,
  "body": "event: message\ndata: {\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"week for athlete (era=legacy, client=https://claude.ai/oauth/mcp-oauth-client-metadata, scopes=training:read offline_access)\"}]},\"jsonrpc\":\"2.0\",\"id\":2}\n\n"
}
```

## Run 11, continued. 2026-07-28 and refresh through the HTTPS front

```text
### 8b. 2026-07-28 (v2 client pinned)
{
  "negotiated": "2026-07-28",
  "tools": [
    "get_week",
    "propose_week_change"
  ],
  "call": [
    {
      "type": "text",
      "text": "week for athlete (era=modern, client=https://claude.ai/oauth/mcp-oauth-client-metadata, scopes=training:read offline_access)"
    }
  ]
}

### 9. refresh #1 (76 ms)
{
  "status": 200,
  "rotated": true,
  "aud": "https://localhost:3443/mcp"
}

### 9. replay old refresh token inside the 30 s reuse window
{
  "status": 200,
  "same_response": true
}
```

## Run 4b. A second claude.ai (CIMD) connection for the same user skips the consent page

```text
### 5. user-agent trace (120 ms)
[
  {
    "method": "GET",
    "url": "http://localhost:3000/api/auth/oauth2/authorize?…",
    "status": 302,
    "location": "/login?…"
  },
  {
    "method": "GET",
    "url": "http://localhost:3000/login?…",
    "status": 200
  },
  {
    "method": "GET",
    "url": "http://localhost:3000/epic-login?…",
    "status": 302,
    "location": "/login?…"
  },
  {
    "method": "GET",
    "url": "http://localhost:3000/login?…",
    "status": 302,
    "location": "https://claude.ai/api/mcp/auth_callback?…"
  }
]

### 6. callback
{
  "code": "1Fbfpa…",
  "state": "7FQpea3H2Smav7Ane_A2iw",
  "iss": "http://localhost:3000/api/auth",
  "state_ok": true,
  "iss_ok": true
}
```

## Run 11, before the fix. `requireMcpAuth`'s default JWKS URL through the HTTPS front

With `requireMcpAuth`'s default `jwksUrl` (`${BASE_URL}/api/auth/jwks`), the
server fetched its own JWKS through the public URL. The fetch failed, here on
the self-signed certificate, and every `/mcp` call answered `500`, not `401`.
Pointing `jwksUrl` at `http://127.0.0.1:<port>/api/auth/jwks` fixed it.

```text
### 8a. 2025-06-18 initialize   -> "status": 500
### 8a. 2025-06-18 tools/call   -> "status": 500
### 8b. 2026-07-28 FAILED
server.log:
[Better Auth]: JWKS fetch failed: TypeError: fetch failed
    at async fetchJwks (…/@better-auth/core/dist/oauth2/verify.mjs:99:48)
  [cause]: Error: self-signed certificate { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }
```
