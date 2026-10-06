// app/config/growth_refs.ts
// The ref each board call to action puts in its link, so the homepage and
// login routes can tell a click on it from any other visit and record it
// (server/growth_model.ts). Client-safe: imported by board components.
export const INVITE_REF = "board-invite";
export const KEEP_REF = "keep-notice";
export const CLAIM_REMINDER_REF = "claim-reminder";
