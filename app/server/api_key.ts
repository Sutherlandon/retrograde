// app/server/api_key.ts
// API key generation, hashing, and CRUD. See ADR-0004.
//
// Format: rk_live_<24-char-base64url>  (~32 chars after the prefix)
// Storage: key_hash (SHA-256 of full key), key_prefix (first 12 chars for display)
// The full key is shown ONCE at mint time and never recoverable.

import { createHash, randomBytes } from "crypto";
import { pool } from "./db_config";
import type { ApiKeyDTO } from "./board.types";

// Inlined here (rather than imported from ~/hooks/useAuth) to avoid a
// circular import: useAuth imports from this file for getApiUser.
async function createAgentUserForKey(displayName: string): Promise<string> {
  const externalId = `agent-${crypto.randomUUID()}`;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (external_id, is_anonymous, is_agent, preferred_username, display_name)
     VALUES ($1, TRUE, TRUE, 'Agent', $2)
     RETURNING id`,
    [externalId, displayName]
  );
  return result.rows[0].id;
}

const KEY_PREFIX = "rk_live_";
const KEY_PREFIX_DISPLAY_LEN = 12; // "rk_live_" (8) + 4 random chars

export function generateApiKey(): string {
  const random = randomBytes(24).toString("base64url");
  return `${KEY_PREFIX}${random}`;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function isApiKey(token: string): boolean {
  return token.startsWith(KEY_PREFIX);
}

interface ApiKeyRow {
  id: string;
  team_id: string;
  key_hash: string;
  key_prefix: string;
  display_name: string;
  agent_user_id: string | null;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface MintApiKeyResult {
  key: string;        // the full key — show ONCE; never stored
  apiKey: ApiKeyDTO;  // safe-to-store metadata
}

// Thrown by mintApiKey when a personal crew already holds an active key.
// See CREW-019: personal crews (tier 2) get one AI crewmate; named crews
// (tier 3) are unlimited. The route layer catches this and surfaces the
// message as a form error rather than a 500.
export class ApiKeyLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiKeyLimitError";
  }
}

export const PERSONAL_CREW_KEY_LIMIT_MESSAGE =
  "Personal crews can hold one AI crewmate. Create a named crew to add more.";

async function isPersonalTeam(teamId: string): Promise<boolean> {
  const res = await pool.query<{ is_personal: boolean }>(
    `SELECT is_personal FROM teams WHERE id = $1`,
    [teamId]
  );
  return res.rows[0]?.is_personal ?? false;
}

/**
 * Count active (non-revoked) API keys for a team. Used to enforce CREW-019:
 * a personal crew may hold at most one; named crews are unlimited.
 */
export async function countActiveApiKeys(teamId: string): Promise<number> {
  const res = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM api_keys WHERE team_id = $1 AND revoked_at IS NULL`,
    [teamId]
  );
  return Number(res.rows[0]?.count ?? 0);
}

/**
 * Mint a new API key for a team. Creates a dedicated agent user for this key
 * (each key produces a distinct agent identity for clear attribution).
 *
 * Enforces CREW-019 in the model layer — a personal crew may hold at most
 * one active key — so no caller can bypass the cap by going around the route.
 */
export async function mintApiKey(
  teamId: string,
  displayName: string,
  createdByUserId: string
): Promise<MintApiKeyResult> {
  if (await isPersonalTeam(teamId)) {
    const activeCount = await countActiveApiKeys(teamId);
    if (activeCount >= 1) {
      throw new ApiKeyLimitError(PERSONAL_CREW_KEY_LIMIT_MESSAGE);
    }
  }

  const key = generateApiKey();
  const keyHash = hashApiKey(key);
  const keyPrefix = key.slice(0, KEY_PREFIX_DISPLAY_LEN);

  const agentUserId = await createAgentUserForKey(displayName);

  const res = await pool.query<ApiKeyRow>(
    `INSERT INTO api_keys (team_id, key_hash, key_prefix, display_name, agent_user_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, team_id, key_hash, key_prefix, display_name, agent_user_id, created_by,
               created_at, last_used_at, revoked_at`,
    [teamId, keyHash, keyPrefix, displayName, agentUserId, createdByUserId]
  );

  const row = res.rows[0];
  return {
    key,
    apiKey: {
      id: row.id,
      team_id: row.team_id,
      key_prefix: row.key_prefix,
      display_name: row.display_name,
      created_at: row.created_at,
      last_used_at: row.last_used_at,
      revoked_at: row.revoked_at,
    },
  };
}

/**
 * Look up an API key by its full value. Returns the row including agent_user_id
 * for downstream auth. Returns null if not found OR if the key is revoked.
 */
export async function findApiKeyByValue(
  key: string
): Promise<ApiKeyRow | null> {
  if (!isApiKey(key)) return null;
  const keyHash = hashApiKey(key);
  const res = await pool.query<ApiKeyRow>(
    `SELECT id, team_id, key_hash, key_prefix, display_name, agent_user_id,
            created_by, created_at, last_used_at, revoked_at
     FROM api_keys WHERE key_hash = $1`,
    [keyHash]
  );
  if (res.rowCount === 0) return null;
  const row = res.rows[0];
  if (row.revoked_at) return null;
  return row;
}

export async function touchApiKeyLastUsed(apiKeyId: string): Promise<void> {
  // Fire-and-forget; failure here doesn't block the caller.
  await pool.query(
    `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
    [apiKeyId]
  );
}

export async function revokeApiKey(
  apiKeyId: string,
  teamId: string
): Promise<void> {
  // Scope to teamId so a caller can only revoke their own team's keys.
  await pool.query(
    `UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND team_id = $2`,
    [apiKeyId, teamId]
  );
}

export async function listApiKeysForTeam(teamId: string): Promise<ApiKeyDTO[]> {
  const res = await pool.query<ApiKeyRow>(
    `SELECT id, team_id, key_hash, key_prefix, display_name, agent_user_id,
            created_by, created_at, last_used_at, revoked_at
     FROM api_keys
     WHERE team_id = $1
     ORDER BY created_at DESC`,
    [teamId]
  );
  return res.rows.map((row) => ({
    id: row.id,
    team_id: row.team_id,
    key_prefix: row.key_prefix,
    display_name: row.display_name,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    revoked_at: row.revoked_at,
  }));
}
