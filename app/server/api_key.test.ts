import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPoolQuery = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
  },
}));

vi.mock("~/server/db_init", () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateApiKey", () => {
  it("produces a key with the rk_live_ prefix", async () => {
    const { generateApiKey } = await import("./api_key");
    const key = generateApiKey();
    expect(key.startsWith("rk_live_")).toBe(true);
    // 8 chars prefix + 32 chars of base64url (24 bytes → 32 chars)
    expect(key.length).toBeGreaterThanOrEqual(40);
  });

  it("generates a different key each call", async () => {
    const { generateApiKey } = await import("./api_key");
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a).not.toBe(b);
  });
});

describe("hashApiKey", () => {
  it("is deterministic for the same input", async () => {
    const { hashApiKey } = await import("./api_key");
    expect(hashApiKey("rk_live_abc")).toBe(hashApiKey("rk_live_abc"));
  });

  it("produces a different hash for different keys", async () => {
    const { hashApiKey } = await import("./api_key");
    expect(hashApiKey("rk_live_a")).not.toBe(hashApiKey("rk_live_b"));
  });

  it("returns a hex string of length 64 (SHA-256)", async () => {
    const { hashApiKey } = await import("./api_key");
    expect(hashApiKey("anything")).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("isApiKey", () => {
  it("recognizes rk_live_ tokens", async () => {
    const { isApiKey } = await import("./api_key");
    expect(isApiKey("rk_live_abc123")).toBe(true);
    expect(isApiKey("some-session-cookie-value")).toBe(false);
    expect(isApiKey("")).toBe(false);
  });
});

describe("mintApiKey", () => {
  it("creates an agent user, inserts the key row, returns full key once", async () => {
    const { mintApiKey } = await import("./api_key");

    // 1st query: INSERT agent user → returns id
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: "agent-user-uuid" }] });
    // 2nd query: INSERT api_key → returns the row
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{
        id: "key-1",
        team_id: "team-1",
        key_hash: "h",
        key_prefix: "rk_live_abc1",
        display_name: "Claude",
        agent_user_id: "agent-user-uuid",
        created_by: "user-1",
        created_at: "2026-06-22T00:00:00Z",
        last_used_at: null,
        revoked_at: null,
      }],
    });

    const result = await mintApiKey("team-1", "Claude", "user-1");

    // Agent user inserted first
    expect(mockPoolQuery.mock.calls[0][0]).toContain("INSERT INTO users");
    expect(mockPoolQuery.mock.calls[0][0]).toContain("is_agent");

    expect(result.key.startsWith("rk_live_")).toBe(true);
    expect(result.apiKey.id).toBe("key-1");
    expect(result.apiKey.key_prefix).toBe("rk_live_abc1");
    expect(result.apiKey.display_name).toBe("Claude");

    // Key row inserted with the hashed key, not the plaintext
    const insertCall = mockPoolQuery.mock.calls[1];
    expect(insertCall[0]).toContain("INSERT INTO api_keys");
    expect(insertCall[1][1]).not.toBe(result.key); // hash, not plain
    expect(insertCall[1][1]).toMatch(/^[a-f0-9]{64}$/);
    expect(insertCall[1][2]).toBe(result.key.slice(0, 12));
    expect(insertCall[1][3]).toBe("Claude");
    expect(insertCall[1][4]).toBe("agent-user-uuid");
    expect(insertCall[1][5]).toBe("user-1");
  });
});

describe("findApiKeyByValue", () => {
  it("returns null for non-API-key strings", async () => {
    const { findApiKeyByValue } = await import("./api_key");
    const result = await findApiKeyByValue("not-an-api-key");
    expect(result).toBeNull();
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it("returns the row when the key matches and is not revoked", async () => {
    const { findApiKeyByValue } = await import("./api_key");
    mockPoolQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: "k", team_id: "t", key_hash: "h", key_prefix: "p", display_name: "n",
        agent_user_id: "a", created_by: "u", created_at: "x", last_used_at: null, revoked_at: null,
      }],
    });
    const result = await findApiKeyByValue("rk_live_test");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("k");
  });

  it("returns null when the key matches but is revoked", async () => {
    const { findApiKeyByValue } = await import("./api_key");
    mockPoolQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: "k", team_id: "t", key_hash: "h", key_prefix: "p", display_name: "n",
        agent_user_id: "a", created_by: "u", created_at: "x", last_used_at: null,
        revoked_at: "2026-06-22T00:00:00Z",
      }],
    });
    const result = await findApiKeyByValue("rk_live_test");
    expect(result).toBeNull();
  });

  it("returns null when not found", async () => {
    const { findApiKeyByValue } = await import("./api_key");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const result = await findApiKeyByValue("rk_live_nope");
    expect(result).toBeNull();
  });
});

describe("revokeApiKey", () => {
  it("scopes the UPDATE to the team", async () => {
    const { revokeApiKey } = await import("./api_key");
    mockPoolQuery.mockResolvedValueOnce({});
    await revokeApiKey("key-1", "team-1");
    const call = mockPoolQuery.mock.calls[0];
    expect(call[0]).toContain("UPDATE api_keys");
    expect(call[0]).toContain("revoked_at = NOW()");
    expect(call[1]).toEqual(["key-1", "team-1"]);
  });
});

describe("listApiKeysForTeam", () => {
  it("returns mapped DTOs without key_hash", async () => {
    const { listApiKeysForTeam } = await import("./api_key");
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        { id: "1", team_id: "t", key_hash: "secret", key_prefix: "rk_live_aaa1",
          display_name: "A", agent_user_id: "ua", created_by: "u",
          created_at: "x", last_used_at: null, revoked_at: null },
      ],
    });
    const result = await listApiKeysForTeam("t");
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("key_hash");
    expect(result[0].key_prefix).toBe("rk_live_aaa1");
  });
});

describe("touchApiKeyLastUsed", () => {
  it("issues an UPDATE with NOW()", async () => {
    const { touchApiKeyLastUsed } = await import("./api_key");
    mockPoolQuery.mockResolvedValueOnce({});
    await touchApiKeyLastUsed("key-1");
    expect(mockPoolQuery.mock.calls[0][0]).toContain("UPDATE api_keys SET last_used_at = NOW()");
    expect(mockPoolQuery.mock.calls[0][1]).toEqual(["key-1"]);
  });
});
