// app/config/board_limits.ts
// Length limits for board content. One table for every writer — the browser
// routes, the agent JSON API, and the inputs that keep people under them — so
// a person and an agent are held to the same rules (ADR-0027).

export const BOARD_LIMITS = {
  boardTitle: 200,
  columnTitle: 100,
  columnPrompt: 2000,
  noteText: 2000,
  actionItemText: 2000,
} as const;

export type BoardLimitField = keyof typeof BOARD_LIMITS;

const LABELS: Record<BoardLimitField, string> = {
  boardTitle: "Board title",
  columnTitle: "Column title",
  columnPrompt: "Column prompt",
  noteText: "Note text",
  actionItemText: "Action item text",
};

/** The error for a value over its field's limit, or null when it fits. */
export function tooLong(field: BoardLimitField, value: string | null | undefined): string | null {
  if (value == null || value.length <= BOARD_LIMITS[field]) return null;
  return `${LABELS[field]} exceeds ${BOARD_LIMITS[field]} chars`;
}
