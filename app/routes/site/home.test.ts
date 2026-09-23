// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

// Track session data across mock calls
let sessionData: Record<string, string> = {};

vi.mock("~/session.server", () => ({
  getSession: vi.fn(async () => ({
    get: (key: string) => sessionData[key],
    set: (key: string, value: string) => { sessionData[key] = value; },
    unset: (key: string) => { delete sessionData[key]; },
  })),
  commitSession: vi.fn(async () => "session-cookie-value"),
}));

const mockPoolQuery = vi.fn();
const hosting = vi.hoisted(() => ({ selfHosted: false }));
vi.mock("~/server/db_config", () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
  },
  oauthUsernameField: "preferred_username",
  get selfHosted() {
    return hosting.selfHosted;
  },
}));

const mockCreateBoard = vi.fn();
vi.mock("~/server/board_model", () => ({
  createBoard: (...args: unknown[]) => mockCreateBoard(...args),
}));

// Home renders <Form>/<Link> which need a data-router context we don't set
// up here; stub the pieces the component needs while keeping `redirect`
// (used by both the loader and action under test) as the real implementation.
let mockActionData: unknown = undefined;
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children?: React.ReactNode }) =>
      React.createElement("a", { href: to, ...rest }, children),
    Form: ({ children, ...rest }: { children?: React.ReactNode }) =>
      React.createElement("form", { ...rest }, children),
    useActionData: () => mockActionData,
  };
});

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  sessionData = {};
  hosting.selfHosted = false;
  mockActionData = undefined;
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockCreateBoard.mockResolvedValue("new-board-id");
});

function makeFormData(fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  return form;
}

describe("home page action", () => {
  it("creates board and anonymous user when no session exists [SITE-003]", async () => {
    const { action } = await import("./home");

    // getOrCreateUser will INSERT anonymous user
    const anonId = "anon-uuid-123";
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: anonId }] });

    const formData = makeFormData({ title: "My Retro", no_jerks: "on" });
    const request = new Request("http://localhost:3000/", {
      method: "POST",
      body: formData,
    });

    const response = await action({ request, params: {}, context: {} } as never) as unknown as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/app/board/new-board-id");
    expect(response.headers.get("Set-Cookie")).toBe("session-cookie-value");
    expect(mockCreateBoard).toHaveBeenCalledWith("My Retro");
  });

  it("creates board with existing registered user session", async () => {
    const { action } = await import("./home");

    sessionData["userId"] = "registered-user-1";
    // getOrCreateUser SELECT returns existing user
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "registered-user-1", preferred_username: "realuser" }],
      rowCount: 1,
    });

    const formData = makeFormData({ title: "Team Retro", no_jerks: "on" });
    const request = new Request("http://localhost:3000/", {
      method: "POST",
      body: formData,
    });

    const response = await action({ request, params: {}, context: {} } as never) as unknown as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/app/board/new-board-id");
    // No Set-Cookie needed for existing user
    expect(response.headers.get("Set-Cookie")).toBeNull();
    // GAP-002: even a registered visitor hitting the trial form gets a
    // crewless, ownerless board — it's claimable, not pre-owned.
    expect(mockCreateBoard).toHaveBeenCalledWith("Team Retro");
  });

  it("returns validation error when title is too short", async () => {
    const { action } = await import("./home");
    const formData = makeFormData({ title: "ab", no_jerks: "on" });
    const request = new Request("http://localhost:3000/", {
      method: "POST",
      body: formData,
    });

    const response = await action({ request, params: {}, context: {} } as never) as unknown as Response;
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.errors.title).toBeDefined();
  });

  it("returns validation error when kindness checkbox not checked", async () => {
    const { action } = await import("./home");
    const formData = makeFormData({ title: "Valid Title" });
    const request = new Request("http://localhost:3000/", {
      method: "POST",
      body: formData,
    });

    const response = await action({ request, params: {}, context: {} } as never) as unknown as Response;
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.errors.no_jerks).toBeDefined();
  });
});

describe("homepage link preview", () => {
  it("shares the night-sky card, with its size and alt text", async () => {
    const { meta } = await import("./home");
    const tags = meta({ data: { origin: "https://retrograde.sh" } });
    expect(tags).toContainEqual({ property: "og:image", content: "https://retrograde.sh/og-image.png" });
    expect(tags).toContainEqual({ property: "og:image:width", content: "1200" });
    expect(tags).toContainEqual({ property: "og:image:height", content: "630" });
    expect(tags).toContainEqual(expect.objectContaining({ property: "og:image:alt" }));
  });

  // Staging's previews asked production for og-image.png, which production
  // did not have yet: the image must come from the deployment serving the page.
  it("points the preview at the deployment serving the page", async () => {
    const { meta } = await import("./home");
    const tags = meta({ data: { origin: "https://staging.retrograde.sh" } });
    expect(tags).toContainEqual({ property: "og:image", content: "https://staging.retrograde.sh/og-image.png" });
    expect(tags).toContainEqual({ property: "og:url", content: "https://staging.retrograde.sh/" });
  });

  it("keeps production as the canonical page for search engines", async () => {
    const { meta } = await import("./home");
    const tags = meta({ data: { origin: "https://staging.retrograde.sh" } });
    expect(tags).toContainEqual({ tagName: "link", rel: "canonical", href: "https://retrograde.sh" });
  });

  it("hands meta the origin the request arrived on", async () => {
    const { loader } = await import("./home");
    const request = new Request("https://staging.retrograde.sh/?utm_source=slack");
    expect(await loader({ request } as never)).toEqual({ origin: "https://staging.retrograde.sh" });
  });

  it("ships the preview image at the size the tags declare", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const png = readFileSync(resolve(process.cwd(), "public/og-image.png"));
    // PNG IHDR: width and height are big-endian uint32s at bytes 16 and 20.
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });
});

describe("homepage [SITE-001]", () => {
  it("renders the hero heading and board-creation form", async () => {
    const { default: Home } = await import("./home");
    render(React.createElement(Home));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Retros your whole crew shows up for. People and Agents."
    );

    expect(screen.getByRole("heading", { level: 2, name: "Create Your First Board" })).toBeInTheDocument();
    expect(screen.getByText(/Free · No sign-up/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveAttribute("placeholder", "Your stellar board title here...");
    expect(screen.getByRole("button", { name: /Launch/i })).toBeInTheDocument();
  });

  it("opens on the headline with no release pill above it", async () => {
    const { default: Home } = await import("./home");
    render(React.createElement(Home));

    expect(screen.queryByText(/Crews & AI crewmates/)).not.toBeInTheDocument();
  });

  it("sells the product as it is, with no version number in the copy", async () => {
    const { default: Home } = await import("./home");
    const { container } = render(React.createElement(Home));

    expect(container).not.toHaveTextContent(/\b2\.0\b/);
  });

  it("brings agents in by the link they already understand, not by minting API keys", async () => {
    const { default: Home } = await import("./home");
    const { container } = render(React.createElement(Home));

    expect(container).not.toHaveTextContent(/API key|[Mm]int/);
    const aiCard = screen.getByRole("heading", { name: "AI crewmates", level: 3 }).closest("article");
    expect(aiCard).toHaveTextContent(/link/);
  });

  it("fades the closing sky in from the dark ground instead of starting it abruptly", async () => {
    const { default: Home } = await import("./home");
    render(React.createElement(Home));

    const closing = screen.getByRole("heading", { name: /Your next retro starts here/ }).closest("section")!;
    const fade = closing.querySelector('[data-testid="sky-fade"]');
    expect(fade).toHaveAttribute("aria-hidden", "true");
    expect(fade).toHaveClass("bg-gradient-to-b", "from-night-950", "to-transparent");
  });

  it("fades the hero sky out of the header band instead of meeting it at a hard edge", async () => {
    const { default: Home } = await import("./home");
    render(React.createElement(Home));

    const hero = screen.getByRole("heading", { level: 1 }).closest("section")!;
    const fade = hero.querySelector('[data-testid="sky-fade"]');
    expect(fade).toHaveAttribute("aria-hidden", "true");
    expect(fade).toHaveClass("bg-gradient-to-b", "from-night-950", "to-transparent");
  });

  it("offers the board for shared brainstorming with AI agents", async () => {
    const { default: Home } = await import("./home");
    render(React.createElement(Home));

    expect(screen.getByRole("region", { name: /idea board/i })).toBeInTheDocument();
  });

  it("keeps the hero to the pitch and the form — no tutorial link or sign-up aside", async () => {
    const { default: Home } = await import("./home");
    render(React.createElement(Home));

    expect(screen.queryByRole("link", { name: /Try the tutorial/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/No credit card\. No sign-up\./)).not.toBeInTheDocument();
  });

  it("renders a title validation error from action data", async () => {
    mockActionData = { errors: { title: "Title must be at least 3 characters." } };
    const { default: Home } = await import("./home");
    render(React.createElement(Home));

    expect(screen.getByText("Title must be at least 3 characters.")).toBeInTheDocument();
  });

  it("presents the crew features: crews, AI crewmates, facilitators, action items", async () => {
    const { default: Home } = await import("./home");
    render(React.createElement(Home));

    for (const name of ["Crews", "AI crewmates", "Facilitators", "Action items"]) {
      expect(screen.getByRole("heading", { name, level: 3 })).toBeInTheDocument();
    }
  });

  it("lists the plans with the crew price and a self-hosting contact", async () => {
    const { default: Home } = await import("./home");
    render(React.createElement(Home));

    const pricing = screen.getByRole("region", { name: /Bring the crew/i });
    expect(pricing).toHaveTextContent("$39.99");
    expect(pricing).toHaveTextContent("Guest");
    expect(pricing).toHaveTextContent("Registered");
    expect(pricing).toHaveTextContent("Crew");
    const contact = screen.getAllByRole("link", { name: /Contact us/i });
    expect(contact[0]).toHaveAttribute("href", "/contact");
  });

  it("points every create-board CTA at the hero form", async () => {
    const { default: Home } = await import("./home");
    render(React.createElement(Home));

    const ctas = screen.getAllByRole("link", { name: /Create your first board/i });
    expect(ctas.length).toBeGreaterThanOrEqual(2);
    for (const cta of ctas) expect(cta).toHaveAttribute("href", "#create-form");
    expect(document.getElementById("create-form")).toContainElement(
      screen.getByLabelText("Title")
    );
  });

  it("sends the free registered plan through sign-in", async () => {
    const { default: Home } = await import("./home");
    render(React.createElement(Home));

    expect(screen.getByRole("link", { name: /Sign in free/i })).toHaveAttribute(
      "href",
      "/auth/login"
    );
  });

  it("answers the common questions", async () => {
    const { default: Home } = await import("./home");
    render(React.createElement(Home));

    expect(screen.getByText(/Does everyone need an account\?/)).toBeInTheDocument();
    expect(screen.getByText(/How do AI agents join a board\?/)).toBeInTheDocument();
  });
});

// A self-hosted instance has no marketing site (ADR-0017) and no guests
// (ADR-0021): the homepage's board form does not exist there, so posting to it
// creates nothing, even for a signed-in user.
describe("home page action on a self-hosted instance [SITE-003]", () => {
  it("creates no board and sends the caller to the dashboard", async () => {
    hosting.selfHosted = true;
    sessionData["userId"] = "user-1";
    const { action } = await import("./home");
    const request = new Request("http://localhost:3000/", {
      method: "POST",
      body: makeFormData({ title: "Sneaky Retro", no_jerks: "on" }),
    });

    const response = (await action({ request, params: {}, context: {} } as never)) as unknown as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/app/dashboard");
    expect(mockCreateBoard).not.toHaveBeenCalled();
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });
});
