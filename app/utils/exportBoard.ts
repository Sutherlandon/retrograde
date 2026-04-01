import type { Column } from "~/server/board.types";

function escapeCSVField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return '"' + field.replace(/"/g, '""') + '"';
  }
  return field;
}

export function exportToCSV(_title: string, columns: Column[]): string {
  if (columns.length === 0) return "";

  const headers = columns.map((c) => c.title).join(",");
  const maxNotes = Math.max(...columns.map((c) => c.notes.length));

  if (maxNotes === 0) return headers;

  const rows: string[] = [];
  for (let i = 0; i < maxNotes; i++) {
    const cells = columns.map((col) => {
      const note = col.notes[i];
      if (!note) return "";
      return escapeCSVField(`${note.text} (${note.likes})`);
    });
    rows.push(cells.join(","));
  }

  return [headers, ...rows].join("\n");
}

export function exportToMarkdown(title: string, columns: Column[]): string {
  const lines: string[] = [`# ${title}`, ""];

  for (const col of columns) {
    lines.push(`## ${col.title}`);
    if (col.prompt) {
      lines.push("### Prompt");
      lines.push(col.prompt);
      lines.push("");
      lines.push("### Notes");
    }
    for (const note of col.notes) {
      lines.push(`- ${note.text} (${note.likes})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
