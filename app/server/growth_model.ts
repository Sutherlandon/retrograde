// app/server/growth_model.ts
// Growth events: the board calls to action (BRD-021, BRD-022) and what they
// lead to. Each event is a growth_events row, which a follow-up can query
// weeks later, and a [METRIC] line, which lasts only as long as Vercel keeps
// runtime logs. Recording never throws: losing an event must not break the
// page or the action it rides on.
import { pool } from "./db_config";
import { logError, logMetric } from "./logger";

export type GrowthEvent =
  | "invite_click"          // followed "Start a free board" from a board (BRD-022)
  | "invite_board_created"  // then created a board from the homepage form (SITE-003)
  | "keep_click"            // followed "Log in" in the kept-until line (BRD-021)
  | "claim_reminder_click"  // followed "Log in" in the claim reminder
  | "board_claimed";        // claimed a board, by any path (BRD-020, DASH-016)

export async function recordGrowthEvent(
  event: GrowthEvent,
  details: { boardId?: string | null; resultBoardId?: string | null; userId?: string | null } = {}
): Promise<void> {
  const { boardId = null, resultBoardId = null, userId = null } = details;
  const context = Object.fromEntries(
    Object.entries({ event, boardId, resultBoardId, userId }).filter(([, value]) => value != null)
  );
  logMetric("Growth Event", context);
  try {
    await pool.query(
      `INSERT INTO growth_events (event, board_id, result_board_id, user_id) VALUES ($1, $2, $3, $4)`,
      [event, boardId, resultBoardId, userId]
    );
  } catch (error) {
    logError("growth_events insert", error);
  }
}

// Board ids are UUIDs, or the fixed example-board ids. Anything else in a
// query string is dropped rather than stored.
const BOARD_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function boardIdFromParam(value: string | null | undefined): string | null {
  return value && BOARD_ID.test(value) ? value : null;
}

// The board a login link was sent from, read from its returnTo path.
export function boardIdFromReturnTo(returnTo: string | null | undefined): string | null {
  const match = returnTo?.match(/^\/app\/board\/([^/?#]+)$/);
  return boardIdFromParam(match?.[1]);
}
