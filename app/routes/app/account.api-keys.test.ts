import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireRegisteredUser = vi.fn();
vi.mock("~/hooks/useAuth", () => ({
  requireRegisteredUser: (...args: unknown[]) => mockRequireRegisteredUser(...args),
}));

const mockGetPersonalTeamForUser = vi.fn();
const mockUserIsTeamMember = vi.fn();
vi.mock("~/server/team_model", () => ({
  getPersonalTeamForUser: (...args: unknown[]) => mockGetPersonalTeamForUser(...args),
  userIsTeamMember: (...args: unknown[]) => mockUserIsTeamMember(...args),
}));

const mockListApiKeysForTeam = vi.fn();
const mockMintApiKey = vi.fn();
const mockRevokeApiKey = vi.fn();
vi.mock("~/server/api_key", () => ({
  listApiKeysForTeam: (...args: unknown[]) => mockListApiKeysForTeam(...args),
  mintApiKey: (...args: unknown[]) => mockMintApiKey(...args),
  revokeApiKey: (...args: unknown[]) => mockRevokeApiKey(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRegisteredUser.mockResolvedValue({ id: "user-1", username: "landon" });
  mockGetPersonalTeamForUser.mockResolvedValue({
    id: "team-1",
    name: "landon's Team",
    is_personal: true,
    created_at: "x",
  });
  mockListApiKeysForTeam.mockResolvedValue([]);
  mockUserIsTeamMember.mockResolvedValue(true);
});

function makeRequest(form: Record<string, string>): Request {
  const body = new URLSearchParams(form);
  return new Request("http://localhost:3000/app/account/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

describe("loader", () => {
  it("returns the user's personal team + their keys", async () => {
    const { loader } = await import("./account.api-keys");
    mockListApiKeysForTeam.mockResolvedValueOnce([
      { id: "k1", team_id: "team-1", key_prefix: "rk_live_aaa1",
        display_name: "Claude", created_at: "x", last_used_at: null, revoked_at: null },
    ]);
    const result = await loader({
      request: new Request("http://localhost:3000/app/account/api-keys"),
      params: {}, context: {},
    } as never);
    expect(result.teamId).toBe("team-1");
    expect(result.keys).toHaveLength(1);
    expect(result.keys[0].display_name).toBe("Claude");
  });

  it("throws 500 when the user has no personal team", async () => {
    const { loader } = await import("./account.api-keys");
    mockGetPersonalTeamForUser.mockResolvedValueOnce(null);

    try {
      await loader({
        request: new Request("http://localhost:3000/app/account/api-keys"),
        params: {}, context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(500);
    }
  });
});

describe("action — mint", () => {
  it("mints a key and returns the full value once", async () => {
    const { action } = await import("./account.api-keys");
    mockMintApiKey.mockResolvedValueOnce({
      key: "rk_live_TEST_FULL_KEY",
      apiKey: { display_name: "Claude" },
    });
    const result = await action({
      request: makeRequest({ intent: "mint", display_name: "Claude" }),
      params: {}, context: {},
    } as never);
    expect(result).toEqual({
      mintedKey: "rk_live_TEST_FULL_KEY",
      mintedDisplayName: "Claude",
    });
    expect(mockMintApiKey).toHaveBeenCalledWith("team-1", "Claude", "user-1");
  });

  it("rejects empty display_name", async () => {
    const { action } = await import("./account.api-keys");
    const result = await action({
      request: makeRequest({ intent: "mint", display_name: "" }),
      params: {}, context: {},
    } as never);
    expect(result.error).toBeDefined();
    expect(mockMintApiKey).not.toHaveBeenCalled();
  });

  it("rejects display_name longer than 100 chars", async () => {
    const { action } = await import("./account.api-keys");
    const long = "x".repeat(101);
    const result = await action({
      request: makeRequest({ intent: "mint", display_name: long }),
      params: {}, context: {},
    } as never);
    expect(result.error).toBeDefined();
    expect(mockMintApiKey).not.toHaveBeenCalled();
  });
});

describe("action — revoke", () => {
  it("revokes when api_key_id is provided", async () => {
    const { action } = await import("./account.api-keys");
    const result = await action({
      request: makeRequest({ intent: "revoke", api_key_id: "key-1" }),
      params: {}, context: {},
    } as never);
    expect(result).toEqual({ revokedId: "key-1" });
    expect(mockRevokeApiKey).toHaveBeenCalledWith("key-1", "team-1");
  });

  it("returns error when api_key_id missing", async () => {
    const { action } = await import("./account.api-keys");
    const result = await action({
      request: makeRequest({ intent: "revoke" }),
      params: {}, context: {},
    } as never);
    expect(result.error).toBeDefined();
    expect(mockRevokeApiKey).not.toHaveBeenCalled();
  });

  it("returns error when user is not a team member", async () => {
    const { action } = await import("./account.api-keys");
    mockUserIsTeamMember.mockResolvedValueOnce(false);
    const result = await action({
      request: makeRequest({ intent: "revoke", api_key_id: "key-1" }),
      params: {}, context: {},
    } as never);
    expect(result.error).toBeDefined();
    expect(mockRevokeApiKey).not.toHaveBeenCalled();
  });
});

describe("action — unknown intent", () => {
  it("returns error", async () => {
    const { action } = await import("./account.api-keys");
    const result = await action({
      request: makeRequest({ intent: "unknown" }),
      params: {}, context: {},
    } as never);
    expect(result.error).toBeDefined();
  });
});
