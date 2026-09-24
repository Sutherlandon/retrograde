import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireRegisteredUser = vi.fn();
vi.mock("~/hooks/useAuth", () => ({
  requireRegisteredUser: (...args: unknown[]) => mockRequireRegisteredUser(...args),
}));

const mockCreateTeam = vi.fn();
const mockListTeamsForUser = vi.fn();
vi.mock("~/server/team_model", () => ({
  createTeam: (...args: unknown[]) => mockCreateTeam(...args),
  listTeamsForUser: (...args: unknown[]) => mockListTeamsForUser(...args),
}));

vi.mock("~/components/StatusLED", () => ({ StatusLED: () => null }));

const mockAccountCanCreateNamedCrew = vi.fn();
vi.mock("~/server/entitlements", () => ({
  accountCanCreateNamedCrew: (...args: unknown[]) => mockAccountCanCreateNamedCrew(...args),
}));

const mockGetBillingForUser = vi.fn();
vi.mock("~/server/billing_model", () => ({
  getBillingForUser: (...args: unknown[]) => mockGetBillingForUser(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRegisteredUser.mockResolvedValue({ id: "user-1", username: "landon" });
  mockListTeamsForUser.mockResolvedValue([]);
  mockCreateTeam.mockResolvedValue("team-new");
  mockAccountCanCreateNamedCrew.mockResolvedValue(true);
  mockGetBillingForUser.mockResolvedValue({
    userId: "user-1",
    email: "landon@example.com",
    stripeCustomerId: "cus_existing",
    stripeSubscriptionId: "sub_existing",
    subscriptionStatus: "active",
  });
});

function formRequest(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request("http://localhost:3000/app/crews", { method: "POST", body: form });
}

describe("teams loader", () => {
  it("lists the caller's teams (CREW-001)", async () => {
    const { loader } = await import("./crews");
    mockListTeamsForUser.mockResolvedValueOnce([
      { id: "t1", name: "landon's Team", is_personal: true, member_count: 1, board_count: 0, open_action_items: 0 },
    ]);
    const result = await loader({ request: new Request("http://x"), params: {}, context: {} } as never);
    expect(result.teams).toHaveLength(1);
    expect(mockListTeamsForUser).toHaveBeenCalledWith("user-1");
  });

  it("CREW-002: returns entitled=true and hasBilling=true when the account has an active subscription", async () => {
    const { loader } = await import("./crews");
    const result = await loader({ request: new Request("http://x"), params: {}, context: {} } as never);
    expect(result.entitled).toBe(true);
    expect(result.hasBilling).toBe(true);
    expect(mockAccountCanCreateNamedCrew).toHaveBeenCalledWith("user-1");
    expect(mockGetBillingForUser).toHaveBeenCalledWith("user-1");
  });

  it("CREW-002: returns entitled=false and hasBilling=false for an account with no billing record", async () => {
    mockAccountCanCreateNamedCrew.mockResolvedValueOnce(false);
    mockGetBillingForUser.mockResolvedValueOnce(null);
    const { loader } = await import("./crews");
    const result = await loader({ request: new Request("http://x"), params: {}, context: {} } as never);
    expect(result.entitled).toBe(false);
    expect(result.hasBilling).toBe(false);
  });

  it("CREW-002: hasBilling is true once a Stripe customer exists, even before the subscription is active", async () => {
    mockAccountCanCreateNamedCrew.mockResolvedValueOnce(false);
    mockGetBillingForUser.mockResolvedValueOnce({
      userId: "user-1",
      email: "landon@example.com",
      stripeCustomerId: "cus_existing",
      stripeSubscriptionId: null,
      subscriptionStatus: null,
    });
    const { loader } = await import("./crews");
    const result = await loader({ request: new Request("http://x"), params: {}, context: {} } as never);
    expect(result.entitled).toBe(false);
    expect(result.hasBilling).toBe(true);
  });
});

describe("teams action", () => {
  it("creates a team and redirects to it", async () => {
    const { action } = await import("./crews");
    const res = (await action({
      request: formRequest({ intent: "create", name: "Voyager Crew" }),
      params: {}, context: {},
    } as never)) as Response;
    expect(mockCreateTeam).toHaveBeenCalledWith("Voyager Crew", "user-1");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/app/crews/team-new");
  });

  it("rejects an empty name", async () => {
    const { action } = await import("./crews");
    const result = await action({
      request: formRequest({ intent: "create", name: "  " }),
      params: {}, context: {},
    } as never);
    expect((result as { error?: string }).error).toBeDefined();
    expect(mockCreateTeam).not.toHaveBeenCalled();
  });

  it("CREW-002: throws 403 when the account is not entitled to a named crew, and never calls createTeam", async () => {
    mockAccountCanCreateNamedCrew.mockResolvedValueOnce(false);
    const { action } = await import("./crews");
    try {
      await action({
        request: formRequest({ intent: "create", name: "Voyager Crew" }),
        params: {}, context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(403);
    }
    expect(mockAccountCanCreateNamedCrew).toHaveBeenCalledWith("user-1");
    expect(mockCreateTeam).not.toHaveBeenCalled();
  });

  it("CREW-002: creates the crew when the account is entitled", async () => {
    mockAccountCanCreateNamedCrew.mockResolvedValueOnce(true);
    const { action } = await import("./crews");
    const res = (await action({
      request: formRequest({ intent: "create", name: "Voyager Crew" }),
      params: {}, context: {},
    } as never)) as Response;
    expect(mockAccountCanCreateNamedCrew).toHaveBeenCalledWith("user-1");
    expect(mockCreateTeam).toHaveBeenCalledWith("Voyager Crew", "user-1");
    expect(res.status).toBe(302);
  });
});
