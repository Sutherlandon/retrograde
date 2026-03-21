import { describe, it, expect } from "vitest";
import { exportToCSV, exportToMarkdown } from "./exportBoard";
import type { Column } from "~/server/board.types";

function makeColumn(title: string, notes: { text: string; likes: number }[]): Column {
  return {
    id: `col-${title}`,
    title,
    col_order: 0,
    notes: notes.map((n, i) => ({
      id: `note-${i}`,
      column_id: `col-${title}`,
      text: n.text,
      likes: n.likes,
      is_new: false,
      created: "2026-01-01",
      note_order: i,
    })),
  };
}

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
  it("generates markdown with title, column headers, and bulleted notes", () => {
    const columns = [
      makeColumn("Good", [{ text: "Fast deploys", likes: 3 }, { text: "Great teamwork", likes: 1 }]),
      makeColumn("Bad", [{ text: "Slow reviews", likes: 2 }]),
    ];

    const md = exportToMarkdown("Sprint 1", columns);
    const lines = md.split("\n");

    expect(lines[0]).toBe("# Sprint 1");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("## Good");
    expect(lines[3]).toBe("- Fast deploys (3)");
    expect(lines[4]).toBe("- Great teamwork (1)");
    expect(lines[5]).toBe("");
    expect(lines[6]).toBe("## Bad");
    expect(lines[7]).toBe("- Slow reviews (2)");
  });

  it("handles empty columns", () => {
    const columns = [makeColumn("Empty", [])];

    const md = exportToMarkdown("Test", columns);
    expect(md).toContain("## Empty");
    // No bullet items after the header
    const lines = md.split("\n");
    const headerIndex = lines.indexOf("## Empty");
    expect(lines[headerIndex + 1]).toBe("");
  });

  it("handles empty board", () => {
    const md = exportToMarkdown("Empty Board", []);
    expect(md).toBe("# Empty Board\n");
  });
});
