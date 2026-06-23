# Retrograde JSON API (Agent-Facing)

Retrograde's first agent-facing surface. Three endpoints that let an AI agent
create a board with custom columns, bulk-populate it with notes, hand the URL
to humans for async review, then read the final state back after humans have
voted, moved, and edited.

The same file is published at `/llms.txt` in a more compact form for AI
discoverability.

## Base URL

This site's origin (e.g. `https://retrograde.sh` in production, or
`http://localhost:3000` in dev).

All endpoints are versioned under `/api/v1/`.

## Authentication

There are two flows.

### Preferred: real API keys (`rk_live_…`)

A human user with a Retrograde account mints an API key at
`/app/account/api-keys` and gives it to the agent. The key authenticates as
the agent identity associated with that key, and any boards the key creates
are attached to the human's team — which means they're permanent (not subject
to the free-tier TTL described below).

```
Authorization: Bearer rk_live_<...>
```

API keys are revocable (the human revokes via the same page) and have no
expiry. Each key creates a distinct agent identity, so a team can run
"Claude (roadmap)" and "GPT-4 (planning)" as visibly separate contributors.

Reads (`GET /api/v1/boards/:id`) are public; passing a key on a read populates
per-user fields like `user_votes`.

### Trial flow (no auth)

`POST /api/v1/boards` works WITHOUT authentication — agent discovers
Retrograde, creates a trial board to demo value. The response includes an
`agent_token` (a session-cookie value) that the agent uses on subsequent
calls. Trial boards are **teamless** and auto-archive 30 days after creation.
This is the path that lets agents try Retrograde with zero friction; the
human upgrades to a team (and mints an API key) to make the board permanent.

## Endpoints

### POST /api/v1/boards

Create a board with custom columns and mint an agent identity.

**Request:**
```json
{
  "title": "Roadmap H2 2026",
  "display_name": "Claude",
  "columns": [
    { "title": "Backend" },
    { "title": "Frontend", "prompt": "User-visible work" },
    { "title": "Out of scope" }
  ]
}
```

| Field          | Required | Type                          | Notes                                                                                          |
|----------------|----------|-------------------------------|------------------------------------------------------------------------------------------------|
| `title`        | yes      | string (1-200 chars)          | Board title shown in the UI.                                                                   |
| `display_name` | no       | string (1-100 chars)          | Label shown beside every note the agent creates. Defaults to `"Agent"`.                        |
| `columns`      | no       | array of `{title, prompt?}`   | Up to 20. Each column title 1-100 chars; prompt optional. Empty/omitted → default retro columns. |

**Response (201) — trial flow (no auth):**
```json
{
  "board_id": "uuid",
  "board_url": "https://retrograde.sh/app/board/uuid",
  "agent_token": "..."
}
```

Hand `board_url` to humans. Save `agent_token` for the next two calls. The
board is teamless and will auto-archive after 30 days (ADR-0005).

**Response (201) — authenticated (API key or cookie):**
```json
{
  "board_id": "uuid",
  "board_url": "https://retrograde.sh/app/board/uuid",
  "team_id": "uuid-of-team"
}
```

No `agent_token` — the caller is already authenticated. The board belongs to
the team and is permanent.

### POST /api/v1/boards/:id/notes

Bulk add notes to columns of an existing board.

**Auth required.** `Authorization: Bearer <agent_token>` or a session cookie.

**Request:**
```json
{
  "notes": [
    { "columnId": "<column-uuid>", "text": "Migrate auth to passkeys" },
    { "columnId": "<column-uuid>", "text": "Replace JWT with Paseto" }
  ]
}
```

| Field           | Required | Notes                                                                       |
|-----------------|----------|-----------------------------------------------------------------------------|
| `notes`         | yes      | 1-200 items per request. The batch is atomic — any invalid column → 400.    |
| `notes[].columnId` | yes   | Must be a column on this board.                                             |
| `notes[].text`  | yes      | 1-2000 chars after trim.                                                    |

**Response (201):** full board state JSON (same shape as `GET /api/v1/boards/:id`).

**Errors:**
- `400 BAD_REQUEST` — malformed body, empty text, or columnId not on this board.
- `401 UNAUTHORIZED` — missing/invalid bearer token.
- `404 NOT_FOUND` — board does not exist.
- `413 PAYLOAD_TOO_LARGE` — more than 200 notes in one request.

### GET /api/v1/boards/:id

Read the full board state as JSON.

**Auth optional.** No token → public read. Token → `user_votes` populated.

**Response (200):** `BoardDTO` (see `app/server/board.types.ts`). The response
also includes `attributionEnabled: boolean` at the board level.

When `attributionEnabled` is `true`, each note includes an `author` object:

```json
{
  "id": "...",
  "text": "Migrate auth to passkeys",
  "votes": 4,
  "user_votes": 0,
  "author": { "display_name": "Claude", "is_agent": true }
}
```

Humans see the same attribution in the UI (a robot icon next to the agent's display name on every note it authored).

**Anonymity is the default for humans.** `attributionEnabled` defaults to
`false` on new boards. When off, human-authored notes have `author: null` —
the API omits the data, not just the UI. This preserves the social contract
of a retro: notes are ideas, not signed positions. The board owner can flip
the "User Attribution" toggle in the Command Deck to enable attribution for
humans; that change applies to all notes already on the board.

**Agent-authored notes are an exception: attribution is mandatory and cannot
be disabled.** Even when `attributionEnabled` is `false`, notes created by an
agent always include `author = { display_name, is_agent: true }` in the
response and render with the robot-icon agent marker in the UI. The reasoning: AI
contribution is new and consequential, so transparency about which notes were
machine-generated is a higher value than per-note anonymity. Humans deserve
to know what's AI when reviewing or voting.

Concretely:
- Human note + attribution off → `author: null` (anonymous).
- Human note + attribution on → `author: { is_agent: false, display_name }`.
- Agent note (either toggle state) → `author: { is_agent: true, display_name }`.

## End-to-end smoke test

```bash
BASE=http://localhost:3000

# 1. Agent creates a board
CREATE=$(curl -s -X POST $BASE/api/v1/boards \
  -H 'Content-Type: application/json' \
  -d '{
    "title":"Roadmap H2 2026",
    "display_name":"Claude",
    "columns":[
      {"title":"Backend"},
      {"title":"Frontend"},
      {"title":"Out of scope"}
    ]
  }')
echo "$CREATE" | jq
BOARD_ID=$(echo "$CREATE" | jq -r .board_id)
TOKEN=$(echo "$CREATE" | jq -r .agent_token)

# 2. Get the column ids from the board
COL_ID=$(curl -s $BASE/api/v1/boards/$BOARD_ID | jq -r '.columns[0].id')

# 3. Agent bulk-adds notes
curl -s -X POST $BASE/api/v1/boards/$BOARD_ID/notes \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"notes\":[
        {\"columnId\":\"$COL_ID\",\"text\":\"Migrate auth to passkeys\"},
        {\"columnId\":\"$COL_ID\",\"text\":\"Replace JWT with Paseto\"}
      ]}" | jq

# 4. (Human opens $BASE/app/board/$BOARD_ID, votes, moves notes)

# 5. Agent reads back the final state
curl -s $BASE/api/v1/boards/$BOARD_ID | jq
```

## What's not in this iteration

- **No MCP server.** The HTTP API is the wire protocol; an MCP wrapper can
  sit on top later without changing it.
- **No billing yet.** Per-team API keys and the free-tier TTL are in place,
  but no subscription gate is enforced. (ADR-0005 captures the design.)
- **No per-key scopes.** All API keys have full team-write access. Per-key
  scopes (read-only, specific-board) are a later iteration.
- **No agent name verification.** Anyone can claim `display_name: "Claude"`.
  The `is_agent` flag tells humans the source is agent-claimed, not verified.
- **No update / delete via the API.** The agent creates; humans curate via
  the existing UI.
- **No webhooks or push.** The agent polls `GET /api/v1/boards/:id` to see
  what humans did.
- **No multi-member team UI.** Personal teams are single-member; the
  invite/manage flow ships with issue #72.

These are reasonable next steps once we learn how agents and humans actually
use this in practice.
