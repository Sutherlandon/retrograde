# Retrograde JSON API (Agent-Facing)

Four endpoints let an AI agent create a board with custom columns,
bulk-populate it with notes and action items, hand the URL to humans for
async review, then read the final state back after humans have voted, moved,
and edited.

`/llms.txt` (source: `public/llms.txt`) carries the same API in compact form
for AI discoverability.

## Base URL

This site's origin (e.g. `https://retrograde.sh` in production,
`http://localhost:5173` under `npm run dev`, or `http://localhost:3000` under
`npm start` and Docker).

All endpoints are versioned under `/api/v1/`.

## Authentication

A call carries one of three credentials, or none:

- An API key: `Authorization: Bearer rk_live_<...>` (preferred).
- A trial `agent_token`: `Authorization: Bearer <agent_token>`.
- A signed-in browser session cookie.

A self-hosted instance (`SELF_HOSTED=true`) accepts only API keys and
signed-in sessions. It has no trial flow and no anonymous reads, and answers
`401 UNAUTHORIZED` to any call without one (ADR-0021).

### API keys (`rk_live_…`)

A human user with a Retrograde account mints an API key on their crew's page
(`/app/crews/<id>`, the "AI Crew" section) and gives it to the agent. A
personal crew holds one key; a named crew (the paid tier) holds any number.
The key authenticates as the agent identity associated with that key. Boards
the key creates go into the key's crew with the key's agent as their owner,
so they never auto-archive.

```
Authorization: Bearer rk_live_<...>
```

API keys are revocable (the human revokes via the same page) and have no
expiry. Each key creates a distinct agent identity, so a crew can run
"Claude (roadmap)" and "GPT-4 (planning)" as visibly separate contributors.

### Trial flow (no credentials)

On the hosted service, `POST /api/v1/boards` works WITHOUT credentials — an
agent discovers Retrograde and creates a trial board to demo value. The
response includes an `agent_token` (a session-cookie value) that the agent
uses on subsequent calls. Trial boards are **crewless**, have **no owner**,
and auto-archive 30 days after creation (ADR-0005). Everyone with the link
can facilitate them: humans in the UI (timer, locks, settings, columns), the
agent over the API (action items).

The path from trial to paid is designed not to break the agent:

1. A human opens `board_url` and clicks **Claim this board** (or pastes the
   link into the claim dialog on their dashboard). They become its owner and
   the board moves into their personal crew, so it no longer auto-archives.
   Personal crews are never members-only, so **the agent's `agent_token`
   keeps working**.
2. The human moves the board into a named crew. Named crews are the paid
   tier — a Stripe subscription the human starts from `/app/crews` — and are
   members-only by default, so the agent's token now gets `403 FORBIDDEN`.
   The human mints an API key for their agent on the crew page — that key is
   the agent's membership.

Nothing is handed over until the human asks for control.

### Board access

A board in a members-only crew admits only that crew's members, the board's
owner and facilitators, and API keys minted for that crew; every other caller
gets `403 FORBIDDEN` from all four endpoints. Crewless boards and boards on
crews with members-only turned off admit anyone with the board id.

## Errors

Every error is JSON: `{ "error": { "code": "...", "message": "..." } }`.

| Status | `code`               | When                                                                                   |
|--------|----------------------|----------------------------------------------------------------------------------------|
| 400    | `BAD_REQUEST`        | Malformed JSON, or a field fails validation.                                           |
| 401    | `UNAUTHORIZED`       | A notes or action-items call without valid credentials; any call without them on a self-hosted instance. |
| 403    | `FORBIDDEN`          | No board access, or (action items only) the caller cannot facilitate the board.        |
| 404    | `NOT_FOUND`          | The board does not exist.                                                              |
| 405    | `METHOD_NOT_ALLOWED` | Wrong HTTP method.                                                                     |
| 413    | `PAYLOAD_TOO_LARGE`  | More than 200 notes or 100 action items in one request.                                |

## Endpoints

### POST /api/v1/boards

Create a board with custom columns. A call without credentials also mints a
trial agent identity.

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
| `display_name` | no       | string (max 100 chars)        | Label shown beside every note the agent creates. Defaults to `"Agent"`. Used only by a call without credentials, which mints a new trial agent; an API key's agent keeps the name given when the key was minted. |
| `columns`      | no       | array of `{title, prompt?}`   | Up to 20. Each column title 1-100 chars; prompt optional. Empty/omitted → the default columns "What went well?" and "What can we do better?". |

Follow-ups are not a column: every board carries an Action Items checklist,
written with `POST /api/v1/boards/:id/action-items` and read back as
`actionItems`.

**Response (201) — trial flow (no credentials):**
```json
{
  "board_id": "uuid",
  "board_url": "https://retrograde.sh/app/board/uuid",
  "agent_token": "..."
}
```

Hand `board_url` to humans. Save `agent_token`; it authenticates the agent's
later calls on this board. The board is crewless and auto-archives after 30
days (ADR-0005).

**Response (201) — with credentials:**
```json
{
  "board_id": "uuid",
  "board_url": "https://retrograde.sh/app/board/uuid",
  "team_id": "uuid-of-crew"
}
```

No `agent_token` — the caller is already authenticated. The credential decides
where the board lands:
- API key → the key's crew, owned by the key's agent; never auto-archives.
- Signed-in session → the account's personal crew.
- `agent_token` → another crewless trial board for the same agent;
  `team_id` is `null`.

### POST /api/v1/boards/:id/notes

Bulk add notes to columns of an existing board.

**Credentials required:** an API key, an `agent_token`, or a session cookie.
Any caller with board access may add notes; facilitation is not required.

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
| `notes[].text`  | yes      | Non-empty, max 2000 chars.                                                  |

**Response (201):** full board state JSON (same shape as `GET /api/v1/boards/:id`).

**Errors:**
- `400 BAD_REQUEST` — malformed body, empty text, or columnId not on this board.
- `401 UNAUTHORIZED` — missing or invalid credentials.
- `403 FORBIDDEN` — no board access (see Board access).
- `404 NOT_FOUND` — board does not exist.
- `413 PAYLOAD_TOO_LARGE` — more than 200 notes in one request.

### POST /api/v1/boards/:id/action-items

Bulk create action items on a board — the follow-up checklist humans work
through after the session, shown in the board's Action Items panel. See issue
#88 / ADR-0006.

**Credentials required.** The caller needs board access and must be able to
facilitate the board, or gets `403`. Anyone can facilitate a trial board; on
a crew board it takes the board's owner, a granted facilitator, or open
facilitation turned on. An API key's agent owns the boards it creates, so
those always pass.

**Request:**
```json
{
  "items": [
    { "text": "Schedule follow-up with infra team" },
    { "text": "Prototype the passkey flow" }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `items` | yes | 1-100 per request; each needs non-empty `text` (≤2000 chars). |

**Response (201):** full board state including `actionItems` (each with
`id`, `text`, `completed`, `item_order`, `created_at`, `completed_at`).

Humans check items off in the UI; poll `GET /api/v1/boards/:id` and read
`actionItems[].completed` to see progress.

### GET /api/v1/boards/:id

Read the full board state as JSON.

**Credentials optional**, except for a board in a members-only crew (see
Board access) and on a self-hosted instance. With credentials, the
viewer-specific fields — `isOwner`, `canFacilitate`, `notes[].user_votes` —
describe the caller.

**Response (200):**
```json
{
  "id": "uuid",
  "title": "Roadmap H2 2026",
  "team_id": "uuid",
  "team_name": "Platform",
  "hasOwner": true,
  "isOwner": false,
  "canFacilitate": false,
  "openFacilitation": false,
  "votingEnabled": true,
  "votingAllowed": 5,
  "votingScope": "board",
  "notesLocked": false,
  "boardLocked": false,
  "attributionEnabled": false,
  "hideOthersNotes": false,
  "actionItemsVisible": true,
  "timerRunning": false,
  "timerStartedAt": null,
  "timerEndsAt": null,
  "voterCount": 4,
  "contributorCount": 5,
  "columns": [
    {
      "id": "uuid",
      "title": "Backend",
      "prompt": "",
      "col_order": 0,
      "notes": [
        {
          "id": "uuid",
          "text": "Migrate auth to passkeys",
          "votes": 3,
          "user_votes": 0,
          "likes": 1,
          "note_order": 0,
          "created": "1758585600000",
          "is_new": false,
          "author": { "display_name": "Claude", "is_agent": true }
        }
      ]
    }
  ],
  "actionItems": [
    {
      "id": "uuid",
      "text": "Schedule follow-up with infra team",
      "completed": false,
      "item_order": 0,
      "created_at": "2026-09-23T06:00:00.000000",
      "completed_at": null
    }
  ]
}
```

- `team_id` and `team_name` are `null` on a crewless board.
- `votingScope` is `"board"`, `"column"`, or `"note"`.
- `notes[].created` is epoch milliseconds, as a string.
- `notes[].votes` is the note's total; `user_votes` is the caller's share.
- With `hideOthersNotes` on (blind brainstorm), every viewer, the caller
  included, sees only the notes they wrote.

**Attribution.** Each note's `author` is `{ display_name, is_agent }` when its
author is shown and `null` otherwise. Humans see the same attribution in the
UI (a robot icon next to the agent's display name on every note it authored).

**Anonymity is the default for humans.** `attributionEnabled` defaults to
`false` on new boards. When off, human-authored notes have `author: null` —
the API omits the data, not just the UI. This preserves the social contract
of a retro: notes are ideas, not signed positions. A facilitator can flip
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

This runs the trial flow, so it needs the hosted service or a local instance
without `SELF_HOSTED=true`.

```bash
BASE=http://localhost:5173   # npm run dev

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

# 4. Agent adds a follow-up action item
curl -s -X POST $BASE/api/v1/boards/$BOARD_ID/action-items \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"text":"Schedule follow-up with infra team"}]}' | jq '.actionItems'

# 5. (Human opens $BASE/app/board/$BOARD_ID, votes, moves notes)

# 6. Agent reads back the final state
curl -s $BASE/api/v1/boards/$BOARD_ID | jq
```

## Not in the API

- **No MCP server.** The HTTP API is the wire protocol; agents call it
  directly.
- **No per-key scopes.** Every key acts with its agent's full access; there
  are no read-only or per-board keys.
- **No agent name verification.** Anyone can claim `display_name: "Claude"`.
  The `is_agent` flag tells humans the source is agent-claimed, not verified.
- **No update / delete via the API.** The agent creates; humans curate in the
  UI.
- **No webhooks or push.** The agent polls `GET /api/v1/boards/:id` to see
  what humans did.
