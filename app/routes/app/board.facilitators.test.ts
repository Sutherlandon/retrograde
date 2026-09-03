import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireFacilitator = vi.fn();
vi.mock("~/server/board_permissions", () => ({
  requireFacilitator: (...args: unknown[]) => mockRequireFacilitator(...args),
}));

const mockList = vi.fn();
const mockAdd = vi.fn();
const mockRemove = vi.fn();
const mockSetOpen = vi.fn();
const mockGetOpen = vi.fn();
vi.mock("~/server/board_model", () => ({
  listFacilitatorsServer: (...args: unknown[]) => mockList(...args),
  addFacilitatorServer: (...args: unknown[]) => mockAdd(...args),
  removeFacilitatorServer: (...args: unknown[]) => mockRemove(...args),
  setOpenFacilitationServer: (...args: unknown[]) => mockSetOpen(...args),
  getOpenFacilitationServer: (...args: unknown[]) => mockGetOpen(...args),
}));

const mockFindUser = vi.fn();
vi.mock("~/server/admin_model", () => ({
  findRegisteredUserByUsername: (...args: unknown[]) => mockFindUser(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireFacilitator.mockResolvedValue({ id: "owner-1", username: "landon" });
  mockList.mockResolvedValue([{ user_id: "owner-1", role: "owner", username: "landon" }]);
  mockGetOpen.mockResolvedValue(false);
});

function formRequest(method: string, fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request("http://localhost:3000/app/board/board-1/facilitators", {
    method,
    body: form,
  });
}

describe("board.facilitators loader", () => {
  it("returns facilitators + openFacilitation for permitted callers", async () => {
    const { loader } = await import("./board.facilitators");
    const res = (await loader({
      request: new Request("http://localhost:3000/app/board/board-1/facilitators"),
      params: { id: "board-1" }, context: {},
    } as never)) as Response;
    const body = await res.json();
    expect(body.facilitators).toHaveLength(1);
    expect(body.openFacilitation).toBe(false);
    expect(mockRequireFacilitator).toHaveBeenCalled();
  });
});

describe("board.facilitators action", () => {
  it("POST grants facilitator by username", async () => {
    const { action } = await import("./board.facilitators");
    mockFindUser.mockResolvedValueOnce({ id: "user-9", username: "sam" });

    const res = (await action({
      request: formRequest("POST", { username: "sam" }),
      params: { id: "board-1" }, context: {},
    } as never)) as Response;

    expect(mockAdd).toHaveBeenCalledWith("board-1", "user-9");
    const body = await res.json();
    expect(body.error).toBeUndefined();
  });

  it("POST returns an error payload when username not found", async () => {
    const { action } = await import("./board.facilitators");
    mockFindUser.mockResolvedValueOnce(null);

    const res = (await action({
      request: formRequest("POST", { username: "ghost" }),
      params: { id: "board-1" }, context: {},
    } as never)) as Response;

    const body = await res.json();
    expect(body.error).toContain("ghost");
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("DELETE revokes a facilitator", async () => {
    const { action } = await import("./board.facilitators");
    const res = (await action({
      request: formRequest("DELETE", { userId: "user-9" }),
      params: { id: "board-1" }, context: {},
    } as never)) as Response;
    expect(mockRemove).toHaveBeenCalledWith("board-1", "user-9");
    expect(res.status).toBe(200);
  });

  it("PATCH toggles open facilitation", async () => {
    const { action } = await import("./board.facilitators");
    mockSetOpen.mockResolvedValue(true);
    mockGetOpen.mockResolvedValue(true);
    const res = (await action({
      request: formRequest("PATCH", { openFacilitation: "true" }),
      params: { id: "board-1" }, context: {},
    } as never)) as Response;
    expect(mockSetOpen).toHaveBeenCalledWith("board-1", true);
    const body = await res.json();
    expect(body.openFacilitation).toBe(true);
    expect(body.error).toBeUndefined();
  });

  // GAP-002: the invariant is enforced on write. A crewless board's
  // open_facilitation can never be closed — setOpenFacilitationServer
  // reports that the write was refused, and this route surfaces it.
  it("PATCH refuses to close facilitation on a crewless board and leaves it TRUE", async () => {
    const { action } = await import("./board.facilitators");
    mockSetOpen.mockResolvedValue(false); // refused: the model's invariant guard
    mockGetOpen.mockResolvedValue(true); // still TRUE — the write never applied
    const res = (await action({
      request: formRequest("PATCH", { openFacilitation: "false" }),
      params: { id: "board-1" }, context: {},
    } as never)) as Response;
    expect(mockSetOpen).toHaveBeenCalledWith("board-1", false);
    const body = await res.json();
    expect(body.error).toBe("Anonymous boards are open to everyone.");
    expect(body.openFacilitation).toBe(true);
  });

  it("propagates the permission rejection", async () => {
    const { action } = await import("./board.facilitators");
    mockRequireFacilitator.mockRejectedValueOnce(new Response("Forbidden", { status: 403 }));
    try {
      await action({
        request: formRequest("POST", { username: "sam" }),
        params: { id: "board-1" }, context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(403);
    }
  });
});
