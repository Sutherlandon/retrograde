import { describe, it, expect } from "vitest";
import { exportToCSV, exportToMarkdown } from "./exportBoard";
import type { Attachment, Column } from "~/server/board.types";

function makeColumn(title: string, notes: { text: string; likes: number; votes?: number }[]): Column {
  return {
    id: `col-${title}`,
    title,
    prompt: "",
    col_order: 0,
    notes: notes.map((n, i) => ({
      id: `note-${i}`,
      column_id: `col-${title}`,
      text: n.text,
      likes: n.likes,
      votes: n.votes,
      is_new: false,
      created: "2026-01-01",
      note_order: i,
    })),
  };
}

const noOptions = { votingEnabled: false, votingAllowed: 5, voterCount: 0, attachments: [] };

describe("exportToCSV", () => {
  it("generates CSV with column headers and note data", () => {
    const columns = [
      makeColumn("Good", [{ text: "Fast deploys", likes: 3 }, { text: "Great teamwork", likes: 1 }]),
      makeColumn("Bad", [{ text: "Slow reviews", likes: 2 }]),
    ];

    const csv = exportToCSV("Sprint 1", columns);
    const lines = csv.split("\n");

    expect(lines[0]).toBe("Good,Bad");
    expect(lines[1]).toBe("Fast deploys (3),Slow reviews (2)");
    expect(lines[2]).toBe("Great teamwork (1),");
  });

  it("pads shorter columns with empty cells", () => {
    const columns = [
      makeColumn("A", [{ text: "one", likes: 0 }, { text: "two", likes: 0 }, { text: "three", likes: 0 }]),
      makeColumn("B", [{ text: "only", likes: 1 }]),
      makeColumn("C", []),
    ];

    const csv = exportToCSV("Test", columns);
    const lines = csv.split("\n");

    expect(lines[0]).toBe("A,B,C");
    expect(lines[1]).toBe("one (0),only (1),");
    expect(lines[2]).toBe("two (0),,");
    expect(lines[3]).toBe("three (0),,");
  });

  it("handles empty board with no columns", () => {
    const csv = exportToCSV("Empty", []);
    expect(csv).toBe("");
  });

  it("handles columns with no notes", () => {
    const columns = [makeColumn("A", []), makeColumn("B", [])];
    const csv = exportToCSV("Empty Notes", columns);
    expect(csv).toBe("A,B");
  });

  it("escapes fields containing commas", () => {
    const columns = [
      makeColumn("Col", [{ text: "hello, world", likes: 0 }]),
    ];

    const csv = exportToCSV("Test", columns);
    const lines = csv.split("\n");
    expect(lines[1]).toBe('"hello, world (0)"');
  });

  it("escapes fields containing double quotes", () => {
    const columns = [
      makeColumn("Col", [{ text: 'said "wow"', likes: 1 }]),
    ];

    const csv = exportToCSV("Test", columns);
    const lines = csv.split("\n");
    expect(lines[1]).toBe('"said ""wow"" (1)"');
  });

  it("escapes fields containing newlines", () => {
    const columns = [
      makeColumn("Col", [{ text: "line1\nline2", likes: 0 }]),
    ];

    const csv = exportToCSV("Test", columns);
    // The field should be quoted since it contains a newline
    expect(csv).toContain('"line1\nline2 (0)"');
  });
});

describe("exportToMarkdown", () => {
  it("generates markdown with title, column headers, and bulleted notes (likes mode)", () => {
    const columns = [
      makeColumn("Good", [{ text: "Fast deploys", likes: 3 }, { text: "Great teamwork", likes: 1 }]),
      makeColumn("Bad", [{ text: "Slow reviews", likes: 2 }]),
    ];

    const md = exportToMarkdown("Sprint 1", columns, noOptions);
    const lines = md.split("\n");

    expect(lines[0]).toBe("# Sprint 1");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("> **Scoring:** Likes");
    expect(lines[3]).toBe("");
    expect(lines[4]).toBe("## Good");
    expect(lines[5]).toBe("- Fast deploys (3 likes)");
    expect(lines[6]).toBe("- Great teamwork (1 likes)");
    expect(lines[7]).toBe("");
    expect(lines[8]).toBe("## Bad");
    expect(lines[9]).toBe("- Slow reviews (2 likes)");
  });

  it("shows votes and participant count when voting is enabled (board scope)", () => {
    const columns = [
      makeColumn("Good", [{ text: "Fast deploys", likes: 0, votes: 4 }]),
    ];

    const md = exportToMarkdown("Sprint 1", columns, {
      votingEnabled: true,
      votingAllowed: 5,
      votingScope: "board",
      voterCount: 3,
      attachments: [],
    });
    const lines = md.split("\n");

    expect(lines[2]).toBe("> **Scoring:** Votes (max 5 per person per board) · 3 participants");
    expect(lines[5]).toBe("- Fast deploys (4 votes)");
  });

  it("shows voting scope in scoring line for column scope", () => {
    const md = exportToMarkdown("T", [], {
      votingEnabled: true, votingAllowed: 3, votingScope: "column", voterCount: 2, attachments: [],
    });
    expect(md).toContain("> **Scoring:** Votes (max 3 per person per column) · 2 participants");
  });

  it("shows voting scope in scoring line for note scope", () => {
    const md = exportToMarkdown("T", [], {
      votingEnabled: true, votingAllowed: 2, votingScope: "note", voterCount: 4, attachments: [],
    });
    expect(md).toContain("> **Scoring:** Votes (max 2 per person per note) · 4 participants");
  });

  it("shows singular 'participant' when voterCount is 1", () => {
    const md = exportToMarkdown("T", [], { votingEnabled: true, votingAllowed: 3, votingScope: "board", voterCount: 1, attachments: [] });
    expect(md).toContain("1 participant");
  });

  it("includes source link when boardUrl is provided", () => {
    const md = exportToMarkdown("T", [], { ...noOptions, boardUrl: "https://retrograde.app/app/board/abc123" });
    expect(md).toContain("> **Source:** https://retrograde.app/app/board/abc123");
  });

  it("omits source line when boardUrl is not provided", () => {
    const md = exportToMarkdown("T", [], noOptions);
    expect(md).not.toContain("**Source:**");
  });

  it("appends attachments section with links", () => {
    const attachments: Attachment[] = [
      { id: "a1", board_id: "b1", filename: "Retro Notes", link: "https://example.com/notes", type: "link", image_data: null, created_at: "" },
      { id: "a2", board_id: "b1", filename: "photo.png", link: null, type: "image", image_data: "base64...", created_at: "" },
    ];

    const md = exportToMarkdown("Sprint 1", [], { ...noOptions, attachments });
    expect(md).toContain("## Attachments");
    expect(md).toContain("- [Retro Notes](https://example.com/notes)");
    expect(md).toContain("- photo.png _(image)_");
  });

  it("omits attachments section when there are none", () => {
    const md = exportToMarkdown("Sprint 1", [], noOptions);
    expect(md).not.toContain("## Attachments");
  });

  it("handles empty columns", () => {
    const columns = [makeColumn("Empty", [])];

    const md = exportToMarkdown("Test", columns, noOptions);
    expect(md).toContain("## Empty");
    // No bullet items after the header
    const lines = md.split("\n");
    const headerIndex = lines.indexOf("## Empty");
    expect(lines[headerIndex + 1]).toBe("");
  });

  it("handles empty board with no options (legacy call)", () => {
    const md = exportToMarkdown("Empty Board", []);
    expect(md).toBe("# Empty Board\n");
  });
});
