// app/server/db_init.test.ts
// Startup must stop when it cannot reach the database — a bad password, an
// unreachable host, or a TLS failure — instead of leaving a server running
// that fails on every request.
import { describe, it, expect, vi } from "vitest";

const connectError = new Error("self-signed certificate in certificate chain");
const schemaConnect = vi.hoisted(() => ({ calls: 0, fail: true }));
vi.mock("./db_config", () => ({
  schemaPool: {
    connect: async () => {
      schemaConnect.calls += 1;
      if (schemaConnect.fail) throw connectError;
      return { query: async () => ({}), release() {} };
    },
  },
}));

describe("initializeDatabase", () => {
  // db_config starts the build and gates every query on it (ADR-0024). An
  // import-time side effect here would start a second, ungated build.
  it("does nothing when imported", async () => {
    schemaConnect.calls = 0;
    await import("./db_init");
    expect(schemaConnect.calls).toBe(0);
  });

  it("exits with a FATAL message when it cannot connect", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { initializeDatabase } = await import("./db_init");
    await initializeDatabase();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("FATAL: could not connect to the database"), connectError);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
