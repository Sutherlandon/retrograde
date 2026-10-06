// app/server/event_model.ts
// The events table (ADR-0026): one append-only record of what people do,
// each event tagged with the registry ID of the action it belongs to
// (docs/spec/0001-action-registry.md), so feature use is counted against the
// registry's own list of features. Every event is also a [METRIC] line, which
// lasts only as long as Vercel keeps runtime logs. Recording never throws:
// losing an event must not break the page or the action it rides on.
import { pool } from "./db_config";
import { logError, logMetric } from "./logger";

// The vocabulary so far: the board calls to action and what they lead to.
// Feature tracking adds to it.
export type EventName =
  | "invite_click"          // followed "Start a free board" from a board (BRD-022)
  | "invite_board_created"  // then created a board from the homepage form (SITE-003)
  | "keep_click"            // followed "Log in" in the kept-until line (BRD-021)
  | "claim_reminder_click"  // followed "Log in" in the claim reminder (BRD-020)
  | "board_claimed";        // claimed a board (BRD-020; DASH-016 shares the action)

export interface EventDetails {
  actionId?: string | null; // registry ID, e.g. "BRD-020"
  userId?: string | null;
  boardId?: string | null;  // the board the action acted on
  teamId?: string | null;
  properties?: Record<string, unknown>;
}

export async function recordEvent(name: EventName, details: EventDetails = {}): Promise<void> {
  const { actionId = null, userId = null, boardId = null, teamId = null, properties = {} } = details;
  const context = Object.fromEntries(
    Object.entries({ name, actionId, boardId, userId, teamId, ...properties }).filter(([, value]) => value != null)
  );
  logMetric("Event", context);
  try {
    await pool.query(
      `INSERT INTO events (name, action_id, user_id, board_id, team_id, properties) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [name, actionId, userId, boardId, teamId, JSON.stringify(properties)]
    );
  } catch (error) {
    logError("events insert", error);
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
