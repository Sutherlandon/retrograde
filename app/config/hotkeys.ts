// app/config/hotkeys.ts
// Every hotkey in the product. The Hotkeys modal is generated from this list,
// so adding a hotkey means adding its entry here alongside its handler.

export type HotkeyKey = "Shift" | "Return" | "Tab" | "Esc";

export interface Hotkey {
  /** Keys pressed together, in the order they are shown. */
  keys: HotkeyKey[];
  description: string;
}

export interface HotkeyGroup {
  title: string;
  hotkeys: Hotkey[];
}

// How Mac apps write each key, shown beside its name on a Mac. U+FE0E keeps
// Return a text glyph, because the browser otherwise paints ↩ as a blue emoji.
export const MAC_KEY_SYMBOLS: Record<HotkeyKey, string> = {
  Shift: "⇧",
  Return: "↩︎",
  Tab: "⇥",
  Esc: "⎋",
};

export const HOTKEY_GROUPS: HotkeyGroup[] = [
  {
    title: "Notes and action items",
    hotkeys: [
      { keys: ["Return"], description: "Save" },
      { keys: ["Shift", "Return"], description: "New line" },
      { keys: ["Tab"], description: "Save and start a new one" },
      { keys: ["Shift", "Tab"], description: "Save and start a new one in the next column" },
      { keys: ["Esc"], description: "Cancel the current edit" },
    ],
  },
  {
    title: "Column titles",
    hotkeys: [
      { keys: ["Return"], description: "Save the title" },
      { keys: ["Tab"], description: "Save the title and rename the next column" },
      { keys: ["Shift", "Tab"], description: "Save the title and rename the previous column" },
    ],
  },
  {
    title: "Board title",
    hotkeys: [
      { keys: ["Return"], description: "Save the title" },
    ],
  },
];
