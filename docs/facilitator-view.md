# Plan 1 - Standard: Facilitator View - Slide-Out Drawer

## Context

The board toolbar has two problems: (1) on mobile, the title and toolbar controls overflow off-screen, and (2) non-owner users see controls they can't/shouldn't use (timer, attach, column management, settings). The goal is to create a "Mission Control" panel for board owners that consolidates all facilitator controls into a slide-out drawer, while simplifying the main toolbar to only show what everyone needs.

## Approach: Owner Slide-Out Drawer

A persistent slide-out panel (drawer) on the right edge of the screen, visible only to owners. The main toolbar becomes minimal and mobile-friendly. All owner-only controls move into the drawer.

---

## 1. Simplified Toolbar (all users)

**File: `app/components/BoardToolbar.tsx`**

- **Left side:** Board title (truncated with `truncate` on mobile, click-to-edit for owners only)
- **Right side:** TimerDisplay (read-only countdown when running), Vote counter (when voting enabled), Export button
- Remove: Timer start/stop, +Column, Attach, Settings gear — all move to FacilitatorPanel
- Gate title editing on `isOwner` (already partially done for `boardLocked`)
- Use `flex-shrink`, `min-w-0`, and `truncate` to prevent overflow on mobile

## 2. Facilitator Panel (owners only)

**New file: `app/components/FacilitatorPanel.tsx`**

A slide-out drawer from the right edge:

- **Toggle handle:** A small tab/button fixed to the right edge (e.g., gear icon or rocket icon), always visible to owners. Clicking slides the panel open/closed.
- **Panel width:** `w-72` on desktop, full-width on mobile (`w-full sm:w-72`)
- **Overlay:** Semi-transparent backdrop on mobile that closes panel on tap
- **Animation:** `transition-transform duration-300` with `translate-x-full` (closed) / `translate-x-0` (open)
- **Sections inside the panel:**

### a. Timer Controls
- Duration input + Start/Stop button
- Reuse existing timer logic from `TimerButton.tsx`

### b. Quick Toggles
- Voting System on/off (with votes-per-person input when enabled)
- Lock Notes toggle
- Lock Board toggle
- Each uses a reusable `ToggleSwitch` component
- Changes apply immediately via `updateBoardSettings` (no separate save button)

### c. Column Management
- +Add Column button
- List of existing columns with delete option

### d. Attachments
- +Add Attachment button (opens existing AttachmentModal)
- Count of current attachments

### e. Board Settings
- Settings gear opens existing BoardSettingsModal (or we inline the remaining settings)

## 3. Reusable ToggleSwitch Component

**New file: `app/components/ToggleSwitch.tsx`**

Extract the toggle switch pattern already used in `BoardSettingsModal.tsx` into a reusable component:

```tsx
interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  color?: "blue" | "amber" | "red";  // default "blue"
  label?: string;
  description?: string;
}
```

Refactor `BoardSettingsModal.tsx` to use this component too.

## 4. Permission Hardening

**File: `app/components/BoardToolbar.tsx`**
- Only show Export button for non-owners
- Title editing gated on `isOwner && !boardLocked`

**File: `app/context/BoardContext.tsx`**
- No changes needed — actions already check `isReadOnly`

**File: `app/components/Board.tsx`**
- Render `<FacilitatorPanel />` only when `isOwner` is true

## 5. Mobile Responsiveness

- Toolbar: `flex items-center gap-2 min-w-0` with title using `truncate`
- Panel: slides over content on mobile (overlay), slides beside content on desktop (push or overlay)
- Panel toggle handle: small fixed button on right edge, `z-40`

---

## Files to Create
- `app/components/FacilitatorPanel.tsx` — slide-out drawer with all owner controls
- `app/components/ToggleSwitch.tsx` — reusable toggle switch

## Files to Modify
- `app/components/BoardToolbar.tsx` — strip down to title + timer display + vote counter + export
- `app/components/Board.tsx` — add FacilitatorPanel, adjust layout for panel
- `app/components/BoardSettingsModal.tsx` — use ToggleSwitch component
- `app/images/icons.tsx` — add any needed icons (e.g., RocketIcon or PanelIcon for the toggle handle)

## Files Referenced (no changes)
- `app/context/BoardContext.tsx` — existing actions and state used as-is
- `app/server/board.types.ts` — no type changes needed
- `app/components/AttachmentModal.tsx` — opened from within FacilitatorPanel
- `app/components/TimerButton.tsx` — timer logic reused/extracted

---

## Verification

1. **Desktop:** Open board as owner — see minimal toolbar + toggle handle on right. Click handle to open Mission Control panel. Verify all controls work (timer, toggles, +column, attach).
2. **Desktop non-owner:** No toggle handle visible. Only see title, timer display, vote counter, export.
3. **Mobile owner:** Toolbar doesn't overflow. Panel opens as full-width overlay. Tap backdrop to close.
4. **Mobile non-owner:** Clean minimal toolbar with truncated title and export button only.
5. **Lock states:** Panel controls respect lock state (board locked disables relevant toggles).
6. **Run existing tests:** `npm test` to ensure no regressions.
7. **Add tests:** Unit tests for ToggleSwitch component and FacilitatorPanel rendering logic.

---
---

# Plan 2 - Whimsical: The Command Deck

## Context

Same problems as Plan 1 — toolbar overflow on mobile, non-owners see controls they shouldn't, and the owner needs a "mission control" feel. This plan takes a more creative, playful approach.

## Concept: The Floating Command Deck

A **floating, draggable control pod** that lives on top of the board — only visible to owners. Think of it as a mini spaceship cockpit that the facilitator can park anywhere on screen. It has three states:

### State 1: "Orbiting" (Minimized)
A small **floating pill/capsule** (56px tall) docked to the bottom-right by default. Shows:
- A rocket/command icon on the left
- **Status LEDs** — tiny colored dots indicating active states:
  - Green pulse = timer running
  - Amber = notes locked
  - Red = board locked
  - Blue = voting enabled
- Click or drag handle to expand

The pill gently **pulses/breathes** with a subtle CSS animation (`animate-pulse` on the glow shadow) to feel alive.

### State 2: "Docked" (Expanded Command Deck)
Clicking the pill expands it into a **rounded panel** (~320px wide) with a dark, cockpit-style theme (`bg-gray-900/95 backdrop-blur-sm`). The panel has categorized "instrument clusters":

**Header Bar:**
- "Command Deck" title in small caps with a subtle gradient text
- Minimize button (chevron down) to return to pill
- Drag handle area (cursor-move)

**Instrument Sections** (stacked vertically with dividers):

#### Mission Clock (Timer)
- Large digital-style timer display (monospace font)
- Duration picker: compact minutes:seconds with +/- buttons
- Start/Stop button styled as a glowing green/red "launch" button
- When running: pulsing green border ring around the section

#### Board Controls
- **+Column** button (full width, outlined)
- **Attach** button (full width, outlined, opens AttachmentModal)

#### System Toggles
- Each toggle is a horizontal row: label + status LED + switch
- **Voting** — toggle + votes-per-person input (inline, only when enabled)
- **Lock Notes** — amber LED + toggle
- **Lock Board** — red LED + toggle
- Toggles save **immediately** (no separate save button) via `updateBoardSettings`

#### Quick Stats Footer
- "3 columns · 12 notes · 2 attachments" in tiny muted text

### State 3: Mobile Adaptation
On screens < 640px:
- The pill becomes a **fixed bottom-right FAB** (floating action button, 48x48 circle with rocket icon)
- Tapping it opens the Command Deck as a **bottom sheet** sliding up from the bottom edge
- Sheet has a drag handle bar at top, slides down to dismiss
- Semi-transparent backdrop behind it

## Visual Design

```
Minimized pill (bottom-right):
┌─────────────────────────┐
│ 🚀  ● ● ●  ○           │   (●=active LEDs, ○=inactive)
└─────────────────────────┘

Expanded Command Deck:
┌─────────────────────────────────┐
│  ═══ COMMAND DECK ═══      ▼   │  ← dark header, drag handle
├─────────────────────────────────┤
│  MISSION CLOCK                  │
│  ┌─────────────────────────┐    │
│  │     03 : 00             │    │  ← big monospace timer
│  │  [-]  min:sec  [+]      │    │
│  │  [ ▶ LAUNCH ]           │    │  ← glowing green button
│  └─────────────────────────┘    │
├─────────────────────────────────┤
│  BOARD CONTROLS                 │
│  [ + Add Column ]               │
│  [ 📎 Attach File ]             │
├─────────────────────────────────┤
│  SYSTEM TOGGLES                 │
│  Voting    🔵  ──●──           │
│  Votes: [5]                     │
│  Lock Notes  🟡  ──○──         │
│  Lock Board  🔴  ──○──         │
├─────────────────────────────────┤
│  3 cols · 8 notes · 1 attach   │  ← subtle stats
└─────────────────────────────────┘
```

## Draggable Behavior
- Uses mouse/touch events (not dnd-kit, to avoid conflict with note dragging)
- Remembers position in `localStorage` per board
- Snaps to edges when released near them
- Constrained to viewport bounds
- Drag handle is the header area; clicking non-handle areas interacts with controls normally

## Simplified Toolbar (same as Plan 1)

**File: `app/components/BoardToolbar.tsx`**
- **Left:** Board title (truncated on mobile with `min-w-0 truncate`, click-to-edit for owners only)
- **Center:** TimerDisplay (read-only countdown, visible to all when timer running)
- **Right:** Vote counter (when voting enabled) + Export button only
- All other controls removed — they live in the Command Deck now
- Title editing gated on `isOwner && !boardLocked`

## Status LEDs Color Scheme
- Timer running: `bg-green-400` with `animate-pulse`
- Voting enabled: `bg-blue-400`
- Notes locked: `bg-amber-400`
- Board locked: `bg-red-500`
- Inactive: `bg-gray-600`

---

## Files to Create
- `app/components/CommandDeck.tsx` — the floating, draggable command pod (pill + expanded panel + mobile bottom sheet)
- `app/components/CommandDeckToggle.tsx` — reusable labeled toggle row with status LED
- `app/components/StatusLED.tsx` — tiny colored dot component with optional pulse animation

## Files to Modify
- `app/components/BoardToolbar.tsx` — strip to title + timer display + vote counter + export only; gate title edit on `isOwner`
- `app/components/Board.tsx` — render `<CommandDeck />` when `isOwner`; remove owner controls from toolbar props
- `app/components/BoardSettingsModal.tsx` — may be removed or simplified (toggles now live in Command Deck); keep as a "full settings" option if there are future settings that don't fit the deck
- `app/images/icons.tsx` — add `RocketIcon`, `ChevronDownIcon` (or reuse existing)

## Files Referenced (no changes)
- `app/context/BoardContext.tsx` — existing actions and state used as-is
- `app/server/board.types.ts` — no type changes needed
- `app/components/AttachmentModal.tsx` — opened from within Command Deck
- `app/components/TimerButton.tsx` — timer logic extracted/reused

---

## Verification

1. **Desktop owner:** Floating pill visible bottom-right with correct status LEDs. Click to expand Command Deck. All controls functional. Drag to reposition. Minimize back to pill. Refresh — position restored from localStorage.
2. **Desktop non-owner:** No pill, no Command Deck. Clean toolbar with title + timer + vote counter + export.
3. **Mobile owner:** FAB circle bottom-right. Tap opens bottom sheet Command Deck. Swipe/tap backdrop to dismiss.
4. **Mobile non-owner:** No FAB. Minimal toolbar that fits screen (truncated title, export).
5. **Status LEDs:** Reflect correct states in real-time (start timer → green LED pulses, toggle lock → LED changes).
6. **Immediate toggles:** Flipping a toggle in Command Deck immediately calls `updateBoardSettings`.
7. **Run existing tests:** `npm test`
8. **Add tests:** StatusLED, CommandDeckToggle, CommandDeck rendering and state transitions.
