import { describe, it, expect } from "vitest";

describe("board.legacy loader", () => {
  it("redirects /board/:id to /app/board/:id [BRD-018]", async () => {
    const { loader } = await import("./board.legacy");

    let response: Response | undefined;
    try {
      await loader({ params: { id: "board-42" } } as never);
    } catch (thrown) {
      response = thrown as Response;
    }

    expect(response).toBeInstanceOf(Response);
    expect(response!.status).toBe(302);
    expect(response!.headers.get("Location")).toBe("/app/board/board-42");
  });

  it("redirects to /app when no id param is present [BRD-018]", async () => {
    const { loader } = await import("./board.legacy");

    let response: Response | undefined;
    try {
      await loader({ params: {} } as never);
    } catch (thrown) {
      response = thrown as Response;
    }

    expect(response).toBeInstanceOf(Response);
    expect(response!.status).toBe(302);
    expect(response!.headers.get("Location")).toBe("/app");
  });
});
