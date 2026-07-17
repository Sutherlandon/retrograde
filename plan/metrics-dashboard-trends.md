# Metrics Dashboard — Growth Trends

**Status:** Done (branch `claude/metrics-dashboard-trends-e7j3td`)

## Problem

The admin dashboard only showed point-in-time aggregate counts (registered
users, notes, active boards, engaged users). There was no way to see whether
the app is *growing* — and the note count was slightly inflated because
`db_init.ts` inserts the `dev-test` seed board (with 2 notes) on every
deployment, including production.

## Approach

Trend usage over time from data already in the database — no new tables, no
event tracking, and no PII: only counts per week ever leave the database.

- **Time sources:** `users.created_at`, `boards.created_at`, and
  `notes.created` (epoch milliseconds stored as TEXT; legacy rows default to
  `'1'` and are filtered out with a `^\d{13}$` regex).
- **`getMetricsTrends(weeks = 12)`** (`app/server/metrics_model.ts`): one
  query builds weekly buckets with `generate_series` +
  `date_trunc('week', …)` so empty weeks are zero-filled, counting new
  registered users, new boards, and new notes per week. A second query counts
  registered users created *before* the window so the cumulative
  total-users line starts from the true total. Cumulative sum is computed in
  TypeScript.
- **Seed-data fix:** `SEED_BOARD_IDS = ['dev-test']` is now excluded from the
  aggregate note count and from all trend counts. (The `[METRIC]` console
  logging added in #102 is stdout-only and cannot power historical charts.)
- **`TrendChart`** (`app/components/TrendChart.tsx`): dependency-free SVG
  line + area chart. Single series per chart (so no legend), 2px line, 10%
  area wash, hairline gridlines, sparse clean-number axis ticks, direct label
  on the latest value, hover crosshair + tooltip, keyboard navigation
  (arrow keys), and a collapsible data table so no value is hover-gated.
  Colors: `blue-600` (light) / `blue-500` (dark) — validated for contrast on
  the white / gray-900 card surfaces.
- **Dashboard** (`app/routes/app/admin.dashboard.tsx`): keeps the four stat
  cards and adds a "Growth — last 12 weeks" section with four trend charts:
  new registered users, total registered users (cumulative), new boards, and
  notes created.

## Decisions

- **No charting library.** The charts are a few dozen lines of SVG; adding a
  dependency (recharts, etc.) for four single-series lines wasn't justified.
- **Weekly buckets, 12-week window.** Daily is too noisy at current usage;
  the last bucket is the current partial week.
- **No new schema.** All trends derive from existing timestamps, so history
  is available retroactively and nothing new is written per user action.
  Limitation: deleted boards/notes disappear from past weeks too — trends
  reflect surviving rows, not historical events. If exact history matters
  later, add an append-only weekly rollup table.
