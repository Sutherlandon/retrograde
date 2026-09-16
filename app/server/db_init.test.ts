// app/server/db_init.test.ts
// Startup must stop when it cannot reach the database — a bad password, an
// unreachable host, or a TLS failure — instead of leaving a server running
// that fails on every request.
import { describe, it, expect, vi } from "vitest";

const connectError = new Error("self-signed certificate in certificate chain");
vi.mock("./db_config", () => ({
  pool: {
    connect: vi.fn(async () => {
      throw connectError;
    }),
  },
}));

describe("initializeDatabase", () => {
  it("exits with a FATAL message when it cannot connect", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { initializeDatabase } = await import("./db_init");
    await initializeDatabase();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("FATAL: could not connect to the database"), connectError);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
