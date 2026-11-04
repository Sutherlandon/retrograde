// app/server/db_init.test.ts
// Startup must stop when the database is misconfigured — a bad password, an
// unknown host, or a TLS failure — instead of leaving a server running that
// fails on every request. A connection dropped in transit (Neon waking a
// suspended compute) is retried, and if it keeps dropping the build rejects
// without exiting: on Vercel an exit is a 500 for every request on the
// instance, including pages that never query (ADR-0028).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const connectError = new Error("self-signed certificate in certificate chain");
const schemaConnect = vi.hoisted(() => ({
  calls: 0,
  errors: [] as unknown[],
  always: null as unknown,
  connectDelayMs: 0,
  queries: [] as string[],
  // Thrown by the first statement that is neither BEGIN nor ROLLBACK.
  statementError: null as unknown,
  rollbackError: null as unknown,
  released: [] as unknown[],
}));
vi.mock("./db_config", () => ({
  schemaPool: {
    connect: async () => {
      schemaConnect.calls += 1;
      if (schemaConnect.connectDelayMs) await new Promise((resolve) => setTimeout(resolve, schemaConnect.connectDelayMs));
      if (schemaConnect.always) throw schemaConnect.always;
      const next = schemaConnect.errors.shift();
      if (next) throw next;
      return {
        query: async (sql: string) => {
          schemaConnect.queries.push(sql);
          if (sql === "ROLLBACK" && schemaConnect.rollbackError) throw schemaConnect.rollbackError;
          if (sql !== "BEGIN" && sql !== "ROLLBACK" && schemaConnect.statementError) throw schemaConnect.statementError;
          return { rows: [], rowCount: 0 };
        },
        release(error?: unknown) {
          schemaConnect.released.push(error);
        },
      };
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

// Settles the build and returns what it rejected with, or undefined.
async function runInit(): Promise<unknown> {
  const { initializeDatabase } = await import("./db_init");
  const done = initializeDatabase().then(
    () => undefined,
    (error: unknown) => error
  );
  await vi.runAllTimersAsync();
  return done;
}

let exitSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  schemaConnect.calls = 0;
  schemaConnect.errors = [];
  schemaConnect.always = null;
  schemaConnect.connectDelayMs = 0;
  schemaConnect.queries = [];
  schemaConnect.statementError = null;
  schemaConnect.rollbackError = null;
  schemaConnect.released = [];
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
    ["pg's own connect timeout", () => new Error("Connection terminated due to connection timeout")],
    ["the pool's connect timeout", () => new Error("timeout exceeded when trying to connect")],
  ])("retries %s and builds the schema once it connects", async (_label, makeError) => {
    schemaConnect.errors = [makeError()];

    await runInit();

    expect(schemaConnect.calls).toBe(2);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[db] connect attempt 1 failed"));
    expect(exitSpy).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith("Database initialized successfully!");
  });

  // The failure in production: Neon kept dropping the connection while its
  // compute woke, and the exit turned that into a 500 on the homepage.
  it("rejects without exiting once every retry has been used, so the instance keeps serving", async () => {
    const reset = new Error("Connection terminated unexpectedly");
    schemaConnect.always = reset;

    const error = await runInit();

    expect(error).toBe(reset);
    expect(schemaConnect.calls).toBe(6);
    expect(warnSpy).toHaveBeenCalledTimes(5);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("[db] database unavailable after 6 attempts"), reset);
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining("FATAL"), expect.anything());
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // pg's connect timeout bounds each attempt; the budget bounds them all, so a
  // request is never held for six full timeouts.
  it("stops retrying once the connect budget is spent", async () => {
    schemaConnect.connectDelayMs = 5000;
    schemaConnect.always = new Error("Connection terminated due to connection timeout");

    const error = await runInit();

    expect(error).toBe(schemaConnect.always);
    expect(schemaConnect.calls).toBe(3);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("rejects without exiting when the connection drops mid-build, and discards the broken client", async () => {
    const dropped = new Error("Connection terminated unexpectedly");
    schemaConnect.statementError = dropped;
    schemaConnect.rollbackError = new Error("Client was closed and is not queryable");

    const error = await runInit();

    expect(error).toBe(dropped);
    expect(schemaConnect.queries).toContain("ROLLBACK");
    expect(schemaConnect.released).toEqual([dropped]);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // A statement that fails on a healthy connection is a schema bug, and every
  // later build would fail the same way.
  it("exits when a schema statement fails on a healthy connection", async () => {
    const bug = Object.assign(new Error('syntax error at or near "TABLEE"'), { code: "42601" });
    schemaConnect.statementError = bug;

    await runInit();

    expect(schemaConnect.queries).toContain("ROLLBACK");
    expect(errorSpy).toHaveBeenCalledWith("Error during database initialization:", bug);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("returns the client to the pool after a successful build", async () => {
    await runInit();

    expect(schemaConnect.queries.at(-1)).toBe("COMMIT");
    expect(schemaConnect.released).toEqual([undefined]);
  });

  // ADR-0026: one append-only events table, tagged with registry IDs, that
  // feature tracking and the board calls to action read. [METRIC] lines only
  // last as long as Vercel keeps runtime logs.
  it("creates the events table idempotently", async () => {
    await runInit();

    const ddl = schemaConnect.queries.find((q) => q.includes("CREATE TABLE IF NOT EXISTS events"));
    expect(ddl).toBeDefined();
    expect(ddl).toContain("name TEXT NOT NULL");
    expect(ddl).toContain("action_id TEXT");
    expect(ddl).toContain("properties JSONB NOT NULL DEFAULT '{}'");
    expect(ddl).toContain("created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()");
    expect(ddl).toContain("CREATE INDEX IF NOT EXISTS idx_events_action_created ON events(action_id, created_at)");
  });
});
