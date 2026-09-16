// app/components/AppLayout.test.ts
// The app-wide loader decides whether the sidebar offers Billing. It is shown
// only to an active subscriber on the hosted service: a self-hosted instance
// has no Stripe account behind it, even though every account there is
// entitled to tier 3 (ADR-0013, ADR-0016).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/hooks/useAuth", () => ({
  requireRegisteredUser: vi.fn(async () => ({ id: "user-1", username: "landon" })),
}));

let selfHosted = false;
vi.mock("~/server/db_config", () => ({
  pool: { query: vi.fn(async () => ({ rows: [{ external_id: "ext-1" }] })) },
  siteAdminIds: [],
  get selfHosted() {
    return selfHosted;
  },
  get hostingConfig() {
    return { selfHosted, hideLogout: false, siteLogo: null };
  },
}));

vi.mock("~/server/admin_model", () => ({ isGrantedAdmin: vi.fn(async () => false) }));
vi.mock("~/server/team_model", () => ({ listTeamsForUser: vi.fn(async () => []) }));
vi.mock("~/server/board_model", () => ({ countUnassignedBoardsForUser: vi.fn(async () => 0) }));

const mockAccountCanCreateNamedCrew = vi.fn();
vi.mock("~/server/entitlements", () => ({
  accountCanCreateNamedCrew: (...args: unknown[]) => mockAccountCanCreateNamedCrew(...args),
}));

import { loader } from "./AppLayout";

function load() {
  return loader({ request: new Request("http://localhost/app/dashboard") } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  selfHosted = false;
});

describe("AppLayout loader — sidebar Billing visibility", () => {
  it("offers Billing to an active subscriber on the hosted service", async () => {
    mockAccountCanCreateNamedCrew.mockResolvedValue(true);
    expect((await load()).isSubscribed).toBe(true);
  });

  it("hides Billing from an account without a subscription", async () => {
    mockAccountCanCreateNamedCrew.mockResolvedValue(false);
    expect((await load()).isSubscribed).toBe(false);
  });

  it("hides Billing on a self-hosted instance, where every account is entitled but nobody pays through Stripe (ADR-0016)", async () => {
    selfHosted = true;
    mockAccountCanCreateNamedCrew.mockResolvedValue(true);
    expect((await load()).isSubscribed).toBe(false);
  });
});

describe("AppLayout loader — hosting config", () => {
  it("hands the header the deployment's hosting config (ADR-0017)", async () => {
    selfHosted = true;
    mockAccountCanCreateNamedCrew.mockResolvedValue(true);
    expect((await load()).hosting).toEqual({ selfHosted: true, hideLogout: false, siteLogo: null });
  });
});
