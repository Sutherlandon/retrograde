# Retrograde JSON API (Agent-Facing)

These endpoints let an AI agent create a board with custom columns,
bulk-populate it with notes and action items, hand the URL to humans for
async review, read the final state back after humans have voted, moved, and
edited, and keep curating the board itself: rename it, edit, move and delete
notes, restructure its columns, and manage who facilitates it.

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
agent over the API (title, columns, action items, facilitators).

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
gets `403 FORBIDDEN` from every endpoint below. Crewless boards and boards on
crews with members-only turned off admit anyone with the board id.

### Facilitation

Some writes need the caller to be able to **facilitate** the board, the same
rule as the Command Deck in the UI. A caller can facilitate a board when any
of these hold:

- the board has open facilitation on (every trial board does);
- the caller owns the board — an API key's agent owns the boards it creates;
- a facilitator granted the caller facilitation;
- the caller owns the board's crew (ADR-0027).

`GET /api/v1/boards/:id` reports it as `canFacilitate`. Everything else needs
only board access: adding, editing, moving and deleting notes, and renaming a
column, exactly as any participant can in the UI.

The human who minted your key owns your crew, so they have full authority
over every board on it, yours included: they can facilitate it, and archive,
delete, duplicate or move it from their dashboard.

## Errors

Every error is JSON: `{ "error": { "code": "...", "message": "..." } }`.

| Status | `code`               | When                                                                                   |
|--------|----------------------|----------------------------------------------------------------------------------------|
| 400    | `BAD_REQUEST`        | Malformed JSON, a body that isn't a JSON object, or a field fails validation.          |
| 401    | `UNAUTHORIZED`       | A write without valid credentials; a board-create call whose `Authorization` header doesn't resolve (revoked or unknown key, expired `agent_token`); any call without credentials on a self-hosted instance. |
| 403    | `FORBIDDEN`          | No board access, or the call needs facilitation and the caller cannot facilitate the board. |
| 404    | `NOT_FOUND`          | The board does not exist, or the note, column or facilitator named in the path is not on this board. |
| 405    | `METHOD_NOT_ALLOWED` | Wrong HTTP method.                                                                     |
| 413    | `PAYLOAD_TOO_LARGE`  | More than 200 notes or 100 action items in one request.                                |
| 423    | `LOCKED`             | A facilitator locked the board (or, where noted, just the notes). Nothing was written. |

### Locks

| Call | Notes locked | Board locked |
|---|:---:|:---:|
| Add, edit, move or delete notes; rename a column | blocked | blocked |
| Add action items; rename the board; add, re-prompt or delete a column | — | blocked |
| Read the board; list, grant or revoke facilitators | — | — |

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

**Errors:** an `Authorization` header that doesn't resolve to a user — an
unknown or revoked API key, an expired or garbled `agent_token` — returns
`401 UNAUTHORIZED` and creates nothing. Only a call with no `Authorization`
header at all takes the trial flow.

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
- `423 LOCKED` — the notes or the whole board are locked; nothing was added.

### POST /api/v1/boards/:id/action-items

Bulk create action items on a board — the follow-up checklist humans work
through after the session, shown in the board's Action Items panel. See issue
#88 / ADR-0006.

**Credentials required.** The caller needs board access and must be able to
facilitate the board (see Facilitation), or gets `403`. An API key's agent
owns the boards it creates, so those always pass. A locked board returns
`423 LOCKED` and adds nothing; locking only the notes does not block action
items.

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

### PATCH /api/v1/boards/:id

Rename the board. **Needs facilitation.** Blocked by a board lock.

**Request:** `{ "title": "Deprecated — moved to Q3 board" }` — `title` is
required, 1-200 chars after trimming.

**Response (200):** full board state JSON.

### PATCH /api/v1/boards/:id/notes/:noteId

Edit a note's text, move it to another column, or both. Needs board access
only. Blocked by either lock.

**Request:**
```json
{ "text": "Passkeys shipped", "columnId": "<column-uuid>" }
```

| Field      | Required | Notes |
|------------|----------|-------|
| `text`     | one of the two | Non-empty, max 2000 chars. Replaces the note's text. |
| `columnId` | one of the two | A column on this board. The note moves to the end of that column; naming its current column leaves it where it is. |

**Response (200):** full board state JSON.

**Errors:** `404` if the note isn't on this board; `400` if `columnId` isn't
a column on this board.

### DELETE /api/v1/boards/:id/notes/:noteId

Delete a note. Needs board access only. Blocked by either lock.

**Response (200):** full board state JSON. `404` if the note isn't on this board.

### POST /api/v1/boards/:id/columns

Add a column after the board's last one. **Needs facilitation.** Blocked by a
board lock.

**Request:** `{ "title": "Blocked", "prompt": "Waiting on someone else" }` —
`title` is required (1-100 chars after trimming); `prompt` is optional (max
2000 chars, default empty).

**Response (201):** full board state JSON. The new column is the last entry
in `columns`, and the `Location` header is its URL,
`/api/v1/boards/:id/columns/:columnId`.

### PATCH /api/v1/boards/:id/columns/:columnId

Rename a column, set its prompt, or both. Send at least one field.

| Field    | Rule | Notes |
|----------|------|-------|
| `title`  | board access; blocked by either lock | 1-100 chars after trimming. |
| `prompt` | **needs facilitation**; blocked by a board lock | Max 2000 chars. `""` clears it. |

A request with both fields must satisfy both rules; nothing is written
otherwise.

**Response (200):** full board state JSON. `404` if the column isn't on this board.

### DELETE /api/v1/boards/:id/columns/:columnId

Delete a column **and every note in it**. **Needs facilitation.** Blocked by a
board lock.

**Response (200):** full board state JSON. `404` if the column isn't on this board.

### GET /api/v1/boards/:id/facilitators

List the board's owner and granted facilitators. **Needs facilitation.**

**Response (200):**
```json
{
  "facilitators": [
    { "user_id": "uuid", "role": "owner", "username": "Claude (roadmap)" },
    { "user_id": "uuid", "role": "facilitator", "username": "landon" }
  ],
  "openFacilitation": false
}
```

The crew owner is not listed: they facilitate by owning the crew, not by a
grant.

### POST /api/v1/boards/:id/facilitators

Grant facilitation to a registered user. **Needs facilitation.** Never
blocked by a lock.

**Request:** `{ "username": "landon" }` — the user's Retrograde username.

**Response (201):** the facilitator list, as for `GET`. `404` if no
registered user has that username. Granting the owner, or someone who is
already a facilitator, changes nothing.

### DELETE /api/v1/boards/:id/facilitators/:userId

Revoke a facilitator grant, by the `user_id` from the list. **Needs
facilitation.** Never blocked by a lock. The owner can never be removed.

**Response (200):** the facilitator list. `404` if that user holds no
facilitator grant on this board, which includes the owner.

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

# 7. Agent closes an item it was tracking: delete the note...
NOTE_ID=$(curl -s $BASE/api/v1/boards/$BOARD_ID | jq -r '.columns[0].notes[0].id')
curl -s -X DELETE $BASE/api/v1/boards/$BOARD_ID/notes/$NOTE_ID \
  -H "Authorization: Bearer $TOKEN" | jq '.columns[0].notes | length'

# 8. ...and renames the board when the work is done
curl -s -X PATCH $BASE/api/v1/boards/$BOARD_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Roadmap H2 2026 (closed)"}' | jq .title
```

Anyone can facilitate a trial board, so the trial `agent_token` passes step 8.
With an API key, the agent owns the boards it creates and passes it too.

## Not in the API

- **No MCP server.** The HTTP API is the wire protocol; agents call it
  directly.
- **No per-key scopes.** Every key acts with its agent's full access; there
  are no read-only or per-board keys.
- **No agent name verification.** Anyone can claim `display_name: "Claude"`.
  The `is_agent` flag tells humans the source is agent-claimed, not verified.
- **Not every board control yet.** The API cannot like or vote on notes,
  reorder notes within a column, change board settings or locks, run the
  timer, manage attachments, edit, check off or delete action items, toggle
  open facilitation, or delete, archive, duplicate or move a board. Those
  stay in the UI.
- **No facilitation for agents on boards they don't own.** Agents are not
  registered users, so a human can't grant one facilitation by username.
- **No webhooks or push.** The agent polls `GET /api/v1/boards/:id` to see
  what humans did.
