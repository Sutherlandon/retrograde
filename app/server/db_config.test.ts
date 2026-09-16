import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Captures what db_config hands the pg Pool, so SSL settings can be asserted.
const poolConfigs = vi.hoisted(() => [] as unknown[]);
vi.mock("pg", () => ({
  Pool: class {
    constructor(config: unknown) {
      poolConfigs.push(config);
    }
  },
}));

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  // Spies are per test. Restoring here stops a console.error recorded by an
  // earlier test from satisfying a later test's assertion.
  vi.restoreAllMocks();
  poolConfigs.length = 0;
  process.env = { ...originalEnv };
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://user:pass@host/db";
  process.env.STRIPE_RESTRICTED_KEY = "rk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";
  process.env.STRIPE_PRICE_ID = "price_test_123";
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.SESSION_SECRET = "test-session-secret";
  process.env.OAUTH_CLIENT_ID = "test-client-id";
  process.env.OAUTH_CLIENT_SECRET = "test-client-secret";
  process.env.OAUTH_SCOPES = "openid profile email";
  process.env.OAUTH_AUTHORIZATION_URL = "https://auth.example.com/authorize";
  process.env.OAUTH_TOKEN_URL = "https://auth.example.com/token";
  process.env.OAUTH_USERINFO_URL = "https://auth.example.com/userinfo";
  process.env.SITE_ADMIN_IDS = "admin-sub-1";
  for (const name of ["VERCEL_URL", "VERCEL_ENV", "OAUTH_REDIRECT_URI", "PG_HOST", "PG_USER", "PG_PASSWORD", "PG_SCHEMA", "PORT"]) {
    delete process.env[name];
  }
});

afterEach(() => {
  process.env = originalEnv;
});

describe("oauthRedirectUri", () => {
  it("uses OAUTH_REDIRECT_URI in local dev (no VERCEL_ENV)", async () => {
    process.env.OAUTH_REDIRECT_URI = "http://localhost:3000/auth/callback";
    const { oauthRedirectUri } = await import("./db_config");
    expect(oauthRedirectUri).toBe("http://localhost:3000/auth/callback");
  });

  it("uses VERCEL_URL when VERCEL_ENV is preview", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "retrograde-abc123.vercel.app";
    process.env.OAUTH_REDIRECT_URI = "https://retrograde.example.com/auth/callback";
    const { oauthRedirectUri } = await import("./db_config");
    expect(oauthRedirectUri).toBe("https://retrograde-abc123.vercel.app/auth/callback");
  });

  it("uses OAUTH_REDIRECT_URI in production even when VERCEL_URL is set", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "retrograde-prod.vercel.app";
    process.env.OAUTH_REDIRECT_URI = "https://retrograde.example.com/auth/callback";
    const { oauthRedirectUri } = await import("./db_config");
    expect(oauthRedirectUri).toBe("https://retrograde.example.com/auth/callback");
  });

  it("refuses to boot a preview deployment without VERCEL_URL, rather than sending sign-in callbacks elsewhere", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.VERCEL_ENV = "preview";
    process.env.OAUTH_REDIRECT_URI = "https://retrograde.example.com/auth/callback";

    await expect(import("./db_config")).rejects.toThrow("exit");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("VERCEL_URL");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("fails loudly when OAUTH_REDIRECT_URI is missing outside preview", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.OAUTH_REDIRECT_URI;

    await expect(import("./db_config")).rejects.toThrow("exit");

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("OAUTH_REDIRECT_URI")
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("requireEnv failures", () => {
  it("fails loudly when STRIPE_RESTRICTED_KEY is missing", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.OAUTH_REDIRECT_URI = "http://localhost:3000/auth/callback";
    delete process.env.STRIPE_RESTRICTED_KEY;

    await expect(import("./db_config")).rejects.toThrow("exit");

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("STRIPE_RESTRICTED_KEY")
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("fails loudly when CRON_SECRET is missing", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.OAUTH_REDIRECT_URI = "http://localhost:3000/auth/callback";
    delete process.env.CRON_SECRET;

    await expect(import("./db_config")).rejects.toThrow("exit");

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("CRON_SECRET")
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ADR-0016: a self-hosted instance is licensed outside Stripe, so it boots
// with no Stripe configuration at all — and the switch is parsed strictly so
// a typo can never silently flip a deployment between modes.
describe("SELF_HOSTED deployment mode", () => {
  function spyExit() {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    return { exitSpy, errorSpy };
  }

  beforeEach(() => {
    // Spies from earlier tests in this file are never restored, so their
    // accumulated console.error calls would satisfy stringContaining here
    // vacuously. Start every test in this block with fresh spies.
    vi.restoreAllMocks();
    process.env.OAUTH_REDIRECT_URI = "http://localhost:3000/auth/callback";
    delete process.env.SELF_HOSTED;
  });

  it("treats an unset SELF_HOSTED as the hosted service, exporting the Stripe config", async () => {
    const config = await import("./db_config");
    expect(config.selfHosted).toBe(false);
    expect(config.stripeRestrictedKey).toBe("rk_test_123");
    expect(config.stripeWebhookSecret).toBe("whsec_test_123");
    expect(config.stripePriceId).toBe("price_test_123");
  });

  it("treats SELF_HOSTED=false exactly like unset", async () => {
    process.env.SELF_HOSTED = "false";
    const config = await import("./db_config");
    expect(config.selfHosted).toBe(false);
    expect(config.stripePriceId).toBe("price_test_123");
  });

  it("boots a self-hosted instance with no Stripe variables, exporting null Stripe config", async () => {
    process.env.SELF_HOSTED = "true";
    delete process.env.CRON_SECRET;
    delete process.env.STRIPE_RESTRICTED_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_PRICE_ID;
    const config = await import("./db_config");
    expect(config.selfHosted).toBe(true);
    expect(config.stripeRestrictedKey).toBeNull();
    expect(config.stripeWebhookSecret).toBeNull();
    expect(config.stripePriceId).toBeNull();
  });

  it("does not require CRON_SECRET on a self-hosted instance, which runs no scheduled cleanup (ADR-0020)", async () => {
    process.env.SELF_HOSTED = "true"; // CRON_SECRET deleted explicitly below
    delete process.env.STRIPE_RESTRICTED_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_PRICE_ID;
    delete process.env.CRON_SECRET;
    const config = await import("./db_config");
    expect(config.cronSecret).toBeNull();
  });

  it("refuses to boot when SELF_HOSTED=true but CRON_SECRET is set", async () => {
    const { exitSpy, errorSpy } = spyExit();
    process.env.SELF_HOSTED = "true"; // CRON_SECRET stays set from beforeEach
    delete process.env.STRIPE_RESTRICTED_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_PRICE_ID;

    await expect(import("./db_config")).rejects.toThrow("exit");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("SELF_HOSTED=true");
    expect(errorSpy.mock.calls[0][0]).toContain("CRON_SECRET");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("refuses to boot when SELF_HOSTED=true but a Stripe variable is also set", async () => {
    const { exitSpy, errorSpy } = spyExit();
    process.env.SELF_HOSTED = "true";
    delete process.env.CRON_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_PRICE_ID;

    await expect(import("./db_config")).rejects.toThrow("exit");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("SELF_HOSTED=true");
    expect(errorSpy.mock.calls[0][0]).toContain("STRIPE_RESTRICTED_KEY");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("refuses to boot on a SELF_HOSTED value other than true or false", async () => {
    const { exitSpy, errorSpy } = spyExit();
    process.env.SELF_HOSTED = "yes";

    await expect(import("./db_config")).rejects.toThrow("exit");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("SELF_HOSTED"));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// The likeliest self-hosted misconfiguration is upgrading without SELF_HOSTED,
// which trips the hosted service's Stripe requirement first. The error must
// name the switch, not just the missing Stripe variable.
describe("hosted-service Stripe config errors", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.OAUTH_REDIRECT_URI = "http://localhost:3000/auth/callback";
    delete process.env.SELF_HOSTED;
  });

  it("names SELF_HOSTED=true when a Stripe variable is missing", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.STRIPE_PRICE_ID;

    await expect(import("./db_config")).rejects.toThrow("exit");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("STRIPE_PRICE_ID");
    expect(errorSpy.mock.calls[0][0]).toContain("SELF_HOSTED=true");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ADR-0017: everything that varies by deployment is read from the
// environment, so a self-hosted customer never edits code to configure it.
describe("hosting configuration from the environment", () => {
  function spyExit() {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    return { exitSpy, errorSpy };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.OAUTH_REDIRECT_URI = "http://localhost:3000/auth/callback";
    delete process.env.SELF_HOSTED;
    delete process.env.HIDE_LOGOUT;
    delete process.env.OAUTH_USERNAME_FIELD;
    delete process.env.SITE_LOGO_LIGHT_URL;
    delete process.env.SITE_LOGO_DARK_URL;
    delete process.env.SITE_LOGO_ALT;
  });

  it("defaults to showing logout, the preferred_username claim, and no site logo", async () => {
    const config = await import("./db_config");
    expect(config.hideLogout).toBe(false);
    expect(config.oauthUsernameField).toBe("preferred_username");
    expect(config.siteLogo).toBeNull();
    expect(config.hostingConfig).toEqual({ selfHosted: false, hideLogout: false, siteLogo: null });
  });

  it("hides logout when HIDE_LOGOUT=true", async () => {
    process.env.HIDE_LOGOUT = "true";
    const config = await import("./db_config");
    expect(config.hideLogout).toBe(true);
    expect(config.hostingConfig.hideLogout).toBe(true);
  });

  it("refuses to boot on a HIDE_LOGOUT value other than true or false", async () => {
    const { exitSpy, errorSpy } = spyExit();
    process.env.HIDE_LOGOUT = "1";

    await expect(import("./db_config")).rejects.toThrow("exit");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("HIDE_LOGOUT");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("reads the username claim from OAUTH_USERNAME_FIELD", async () => {
    process.env.OAUTH_USERNAME_FIELD = "email";
    const config = await import("./db_config");
    expect(config.oauthUsernameField).toBe("email");
  });

  it("exposes a site logo when all three SITE_LOGO_* variables are set", async () => {
    process.env.SITE_LOGO_LIGHT_URL = "https://cdn.example.com/light.svg";
    process.env.SITE_LOGO_DARK_URL = "https://cdn.example.com/dark.svg";
    process.env.SITE_LOGO_ALT = "Example Corp";
    const config = await import("./db_config");
    const logo = { light: "https://cdn.example.com/light.svg", dark: "https://cdn.example.com/dark.svg", alt: "Example Corp" };
    expect(config.siteLogo).toEqual(logo);
    expect(config.hostingConfig.siteLogo).toEqual(logo);
  });

  it("refuses to boot on a partial site logo, naming every missing variable", async () => {
    const { exitSpy, errorSpy } = spyExit();
    process.env.SITE_LOGO_LIGHT_URL = "https://cdn.example.com/light.svg";

    await expect(import("./db_config")).rejects.toThrow("exit");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("SITE_LOGO_DARK_URL");
    expect(errorSpy.mock.calls[0][0]).toContain("SITE_LOGO_ALT");
    expect(errorSpy.mock.calls[0][0]).not.toContain("SITE_LOGO_LIGHT_URL,");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("carries SELF_HOSTED into the hosting config the client receives", async () => {
    process.env.SELF_HOSTED = "true";
    delete process.env.CRON_SECRET;
    delete process.env.STRIPE_RESTRICTED_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_PRICE_ID;
    const config = await import("./db_config");
    expect(config.hostingConfig.selfHosted).toBe(true);
  });
});

// ADR-0017: where logout sends the browser, and which stored profile field is
// shown as the username. Both are validated at startup.
describe("logout redirect and username field", () => {
  function spyExit() {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    return { exitSpy, errorSpy };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.OAUTH_REDIRECT_URI = "http://localhost:3000/auth/callback";
    delete process.env.SELF_HOSTED;
    delete process.env.OAUTH_LOGOUT_REDIRECT_URL;
    delete process.env.OAUTH_USERNAME_FIELD;
  });

  it("sends a logged-out browser to / by default", async () => {
    const config = await import("./db_config");
    expect(config.oauthLogoutRedirectUrl).toBe("/");
  });

  it("reads an absolute logout URL from OAUTH_LOGOUT_REDIRECT_URL", async () => {
    process.env.OAUTH_LOGOUT_REDIRECT_URL = "https://auth.example.com/logout";
    const config = await import("./db_config");
    expect(config.oauthLogoutRedirectUrl).toBe("https://auth.example.com/logout");
  });

  it("accepts a path on this instance", async () => {
    process.env.OAUTH_LOGOUT_REDIRECT_URL = "/app/dashboard";
    const config = await import("./db_config");
    expect(config.oauthLogoutRedirectUrl).toBe("/app/dashboard");
  });

  it("refuses to boot on a logout redirect that is neither an http(s) URL nor a path", async () => {
    const { exitSpy, errorSpy } = spyExit();
    process.env.OAUTH_LOGOUT_REDIRECT_URL = "auth.example.com/logout";

    await expect(import("./db_config")).rejects.toThrow("exit");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("OAUTH_LOGOUT_REDIRECT_URL");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("refuses a protocol-relative logout redirect, which a browser treats as another host", async () => {
    const { exitSpy, errorSpy } = spyExit();
    process.env.OAUTH_LOGOUT_REDIRECT_URL = "//auth.example.com/logout";

    await expect(import("./db_config")).rejects.toThrow("exit");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("OAUTH_LOGOUT_REDIRECT_URL");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("refuses to boot on an OAUTH_USERNAME_FIELD that is not a stored profile field, listing the ones that are", async () => {
    const { exitSpy, errorSpy } = spyExit();
    process.env.OAUTH_USERNAME_FIELD = "upn";

    await expect(import("./db_config")).rejects.toThrow("exit");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const message = errorSpy.mock.calls[0][0] as string;
    expect(message).toContain("OAUTH_USERNAME_FIELD");
    for (const field of ["preferred_username", "email", "name", "given_name", "family_name"]) {
      expect(message).toContain(field);
    }
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

function expectFatal() {
  const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("exit");
  }) as never);
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  return async (...mustMention: string[]) => {
    await expect(import("./db_config")).rejects.toThrow("exit");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const message = String(errorSpy.mock.calls[0][0]);
    for (const text of mustMention) expect(message).toContain(text);
    expect(exitSpy).toHaveBeenCalledWith(1);
  };
}

// The database connection uses TLS everywhere except local development
// (`npm run dev`). pg lets SSL parameters in the connection string override
// the pool's ssl option, so a URL that turns SSL off is refused outside
// development rather than silently winning.
describe("database connection", () => {
  beforeEach(() => {
    process.env.OAUTH_REDIRECT_URI = "http://localhost:3000/auth/callback";
    delete process.env.SELF_HOSTED;
  });

  it("requires TLS in production and verifies the server certificate", async () => {
    process.env.NODE_ENV = "production";
    await import("./db_config");
    expect(poolConfigs).toEqual([
      { connectionString: "postgresql://user:pass@host/db", ssl: { rejectUnauthorized: true } },
    ]);
  });

  it("requires TLS in any environment other than local development", async () => {
    process.env.NODE_ENV = "test";
    await import("./db_config");
    expect(poolConfigs[0]).toMatchObject({ ssl: { rejectUnauthorized: true } });
  });

  it("does not force TLS in local development", async () => {
    process.env.NODE_ENV = "development";
    await import("./db_config");
    expect(poolConfigs).toEqual([{ connectionString: "postgresql://user:pass@host/db", ssl: false }]);
  });

  it("keeps connection-string SSL parameters such as sslrootcert for a private CA", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@db.internal:5432/retro?sslmode=verify-full&sslrootcert=/etc/retro/ca.pem";
    await import("./db_config");
    expect(poolConfigs[0]).toMatchObject({
      connectionString: "postgresql://user:pass@db.internal:5432/retro?sslmode=verify-full&sslrootcert=/etc/retro/ca.pem",
    });
  });

  it("refuses sslmode=disable outside local development", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@host/db?sslmode=disable";
    await expectFatal()("DATABASE_URL", "sslmode=disable");
  });

  it("refuses ssl=false outside local development", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@host/db?ssl=false";
    await expectFatal()("DATABASE_URL", "ssl=false");
  });

  it("allows a local development database without TLS", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost/db?sslmode=disable";
    await import("./db_config");
    expect(poolConfigs).toHaveLength(1);
  });

  it("builds the connection from the PG_* variables, URL-encoding the credentials", async () => {
    delete process.env.DATABASE_URL;
    process.env.PG_HOST = "db.example.com";
    process.env.PG_USER = "retro";
    process.env.PG_PASSWORD = "p@ss/word";
    process.env.PG_SCHEMA = "retrograde";
    await import("./db_config");
    expect(poolConfigs[0]).toMatchObject({ connectionString: "postgresql://retro:p%40ss%2Fword@db.example.com/retrograde" });
  });

  it("refuses to boot without database configuration, naming what is missing", async () => {
    delete process.env.DATABASE_URL;
    process.env.PG_HOST = "db.example.com";
    await expectFatal()("DATABASE_URL", "PG_USER", "PG_PASSWORD", "PG_SCHEMA");
  });

  it("refuses to boot when DATABASE_URL and PG_* variables are both set", async () => {
    process.env.PG_HOST = "db.example.com";
    await expectFatal()("DATABASE_URL", "PG_HOST");
  });

  it("refuses a DATABASE_URL that is not a postgres URL", async () => {
    process.env.DATABASE_URL = "mysql://user:pass@host/db";
    await expectFatal()("DATABASE_URL");
  });

  it("logs where it connects without printing the password", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.DATABASE_URL = "postgresql://retro:s3cr3tpw@db.example.com:5432/retrograde";
    await import("./db_config");
    const logged = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toContain("retrograde");
    expect(logged).not.toContain("s3cr3tpw");
  });
});

// CLAUDE.md rule 5, applied to every variable the app reads: required ones
// exit when missing, optional ones exit when malformed. Nothing warns and
// carries on.
describe("every setting fails fast", () => {
  beforeEach(() => {
    process.env.OAUTH_REDIRECT_URI = "http://localhost:3000/auth/callback";
    delete process.env.SELF_HOSTED;
  });

  it("exports the session and OAuth settings it validated", async () => {
    process.env.NODE_ENV = "production";
    const config = await import("./db_config");
    expect(config.sessionSecret).toBe("test-session-secret");
    expect(config.isProduction).toBe(true);
    expect(config.oauthClientId).toBe("test-client-id");
    expect(config.oauthClientSecret).toBe("test-client-secret");
    expect(config.oauthScopes).toBe("openid profile email");
    expect(config.oauthAuthorizationUrl).toBe("https://auth.example.com/authorize");
    expect(config.oauthTokenUrl).toBe("https://auth.example.com/token");
    expect(config.oauthUserinfoUrl).toBe("https://auth.example.com/userinfo");
    expect(config.siteAdminIds).toEqual(["admin-sub-1"]);
  });

  it.each([
    "SESSION_SECRET",
    "OAUTH_CLIENT_ID",
    "OAUTH_CLIENT_SECRET",
    "OAUTH_SCOPES",
    "OAUTH_AUTHORIZATION_URL",
    "OAUTH_TOKEN_URL",
    "OAUTH_USERINFO_URL",
    "SITE_ADMIN_IDS",
  ])("refuses to boot when %s is missing", async (name) => {
    delete process.env[name];
    await expectFatal()(name);
  });

  it.each(["OAUTH_AUTHORIZATION_URL", "OAUTH_TOKEN_URL", "OAUTH_USERINFO_URL", "OAUTH_REDIRECT_URI"])(
    "refuses to boot when %s is not an http(s) URL",
    async (name) => {
      process.env[name] = "auth.example.com/endpoint";
      await expectFatal()(name);
    }
  );

  it("refuses a SITE_ADMIN_IDS that lists no ids", async () => {
    process.env.SITE_ADMIN_IDS = " , ";
    await expectFatal()("SITE_ADMIN_IDS");
  });

  it("trims and splits SITE_ADMIN_IDS", async () => {
    process.env.SITE_ADMIN_IDS = " sub-a , sub-b ";
    expect((await import("./db_config")).siteAdminIds).toEqual(["sub-a", "sub-b"]);
  });

  it.each([["unset", undefined], ["staging", "staging"]])(
    "refuses to boot when NODE_ENV is %s",
    async (_label, value) => {
      if (value === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = value;
      await expectFatal()("NODE_ENV");
    }
  );

  it.each(["abc", "0", "70000", "3000.5"])("refuses to boot when PORT is %s", async (value) => {
    process.env.PORT = value;
    await expectFatal()("PORT");
  });

  it("accepts a valid PORT", async () => {
    process.env.PORT = "8080";
    await expect(import("./db_config")).resolves.toBeDefined();
  });
});
