// app/server/db_init.test.ts
// Startup must stop when it cannot reach the database — a bad password, an
// unreachable host, or a TLS failure — instead of leaving a server running
// that fails on every request. A connection dropped in transit (Neon waking a
// suspended compute) is retried first, so one blip does not kill the instance.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const connectError = new Error("self-signed certificate in certificate chain");
const schemaConnect = vi.hoisted(() => ({ calls: 0, errors: [] as unknown[], always: null as unknown }));
vi.mock("./db_config", () => ({
  schemaPool: {
    connect: async () => {
      schemaConnect.calls += 1;
      if (schemaConnect.always) throw schemaConnect.always;
      const next = schemaConnect.errors.shift();
      if (next) throw next;
      return { query: async () => ({ rows: [], rowCount: 0 }), release() {} };
    },
  },
}));

// The two resets staging logged from pg on a cold instance.
function tlsHandshakeReset() {
  return Object.assign(new Error("Client network socket disconnected before secure TLS connection was established"), {
    code: "ECONNRESET",
  });
}
function readReset() {
  return Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET", errno: -104, syscall: "read" });
}

async function runInit() {
  const { initializeDatabase } = await import("./db_init");
  const done = initializeDatabase();
  await vi.runAllTimersAsync();
  await done;
}

let exitSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  schemaConnect.calls = 0;
  schemaConnect.errors = [];
  schemaConnect.always = null;
  exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("initializeDatabase", () => {
  // db_config starts the build and gates every query on it (ADR-0024). An
  // import-time side effect here would start a second, ungated build.
  it("does nothing when imported", async () => {
    await import("./db_init");
    expect(schemaConnect.calls).toBe(0);
  });

  it("exits with a FATAL message when it cannot connect, without retrying a TLS verification failure", async () => {
    schemaConnect.always = connectError;

    await runInit();

    expect(schemaConnect.calls).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("FATAL: could not connect to the database"), connectError);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("does not retry bad credentials", async () => {
    const badPassword = Object.assign(new Error("password authentication failed for user \"app\""), { code: "28P01" });
    schemaConnect.always = badPassword;

    await runInit();

    expect(schemaConnect.calls).toBe(1);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it.each([
    ["a reset during the TLS handshake", tlsHandshakeReset],
    ["a reset while reading", readReset],
    ["a connection pg saw terminated", () => new Error("Connection terminated unexpectedly")],
    ["a connection timeout", () => Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" })],
  ])("retries %s and builds the schema once it connects", async (_label, makeError) => {
    schemaConnect.errors = [makeError()];

    await runInit();

    expect(schemaConnect.calls).toBe(2);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[db] connect attempt 1 failed"));
    expect(exitSpy).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith("Database initialized successfully!");
  });

  it("exits with a FATAL message once every retry has been used", async () => {
    const reset = tlsHandshakeReset();
    schemaConnect.always = reset;

    await runInit();

    expect(schemaConnect.calls).toBe(4);
    expect(warnSpy).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("FATAL: could not connect to the database"), reset);
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
