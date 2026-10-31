// @vitest-environment jsdom
// app/components/HotkeysModal.test.tsx
// The modal is generated from HOTKEY_GROUPS, so a hotkey added there shows up
// without touching the component.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { HOTKEY_GROUPS, MAC_KEY_SYMBOLS } from "~/config/hotkeys";
import { HotkeysModal } from "./HotkeysModal";

function setPlatform(platform: string) {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
}

function keysOnRow(description: string) {
  const row = screen.getByText(description).closest("li")!;
  return Array.from(row.querySelectorAll("kbd"));
}

describe("HotkeysModal", () => {
  beforeEach(() => setPlatform("Win32"));

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders nothing while closed", () => {
    render(<HotkeysModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists every group and hotkey in the registry", () => {
    render(<HotkeysModal isOpen onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Hotkeys" });

    for (const group of HOTKEY_GROUPS) {
      const section = within(dialog).getByRole("region", { name: group.title });
      for (const hotkey of group.hotkeys) {
        const row = within(section).getByText(hotkey.description).closest("li")!;
        const keys = Array.from(row.querySelectorAll("kbd")).map((k) => k.textContent);
        expect(keys).toEqual(hotkey.keys);
      }
    }
  });

  it("documents notes and action items as one group, since their keys are the same", () => {
    const group = HOTKEY_GROUPS.find((g) => g.title === "Notes and action items")!;
    expect(group.hotkeys.map((h) => h.keys.join("+"))).toEqual(["Return", "Shift+Return", "Tab", "Shift+Tab", "Esc"]);

    const titles = HOTKEY_GROUPS.map((g) => g.title);
    expect(titles).not.toContain("Notes");
    expect(titles).not.toContain("Action items");
    expect(titles).not.toContain("Editing");
  });

  it("documents Esc once, for every edit", () => {
    const esc = HOTKEY_GROUPS.flatMap((g) => g.hotkeys).filter((h) => h.keys.includes("Esc"));
    expect(esc).toEqual([{ keys: ["Esc"], description: "Cancel the current edit" }]);
  });

  it("names the keys away from a Mac", () => {
    render(<HotkeysModal isOpen onClose={vi.fn()} />);
    const keys = keysOnRow("New line").map((k) => k.textContent);
    expect(keys).toEqual(["Shift", "Return"]);
  });

  it("shows each key's symbol and name on a Mac", () => {
    setPlatform("MacIntel");
    render(<HotkeysModal isOpen onClose={vi.fn()} />);

    const [shift, tab] = keysOnRow("Save and start a new one in the next column");
    expect(shift).toHaveTextContent("⇧Shift");
    expect(tab).toHaveTextContent("⇥Tab");
    expect(keysOnRow("New line")[1]).toHaveTextContent(/↩.*Return/);
    expect(keysOnRow("Cancel the current edit")[0]).toHaveTextContent("⎋Esc");
  });

  it("has a Mac symbol for every key in the registry", () => {
    const keys = HOTKEY_GROUPS.flatMap((g) => g.hotkeys).flatMap((h) => h.keys);
    for (const key of keys) expect(MAC_KEY_SYMBOLS[key]).toBeTruthy();
  });

  it("renders outside the header, whose stacking context would trap the overlay", () => {
    const { container } = render(<HotkeysModal isOpen onClose={vi.fn()} />);
    expect(container.querySelector("[role=dialog]")).toBeNull();
    expect(document.body.querySelector("[role=dialog]")).not.toBeNull();
  });

  it("takes focus on the list, so the arrow keys scroll it on a short screen", () => {
    render(<HotkeysModal isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId("hotkeys-list")).toHaveFocus();
  });

  it("keeps the title and X out of the part that scrolls", () => {
    render(<HotkeysModal isOpen onClose={vi.fn()} />);
    const list = screen.getByTestId("hotkeys-list");
    expect(list.className).toMatch(/overflow-y-auto/);
    expect(list).not.toContainElement(screen.getByRole("heading", { name: "Hotkeys" }));
    expect(list).not.toContainElement(screen.getByRole("button", { name: "Close" }));
  });

  it("has the X as its only button", () => {
    render(<HotkeysModal isOpen onClose={vi.fn()} />);
    expect(screen.getAllByRole("button")).toEqual([screen.getByRole("button", { name: "Close" })]);
  });

  it("closes from the X, the backdrop and Escape", () => {
    const onClose = vi.fn();
    render(<HotkeysModal isOpen onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByTestId("hotkeys-backdrop"));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
