// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useTheme } from "./useTheme";

function mockMatchMedia(prefersDark: boolean) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = [];
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: prefersDark,
    media: query,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.push(cb),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  return listeners;
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  mockMatchMedia(false);
});

describe("useTheme [SITE-006]", () => {
  it("defaults to system and resolves from matchMedia when nothing is stored", async () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useTheme());

    await act(async () => {});

    expect(result.current.theme).toBe("system");
    expect(result.current.resolvedTheme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("persists the chosen theme to localStorage", async () => {
    const { result } = renderHook(() => useTheme());
    await act(async () => {});

    act(() => {
      result.current.setTheme("dark");
    });

    expect(localStorage.getItem("theme")).toBe("dark");
    expect(result.current.theme).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("reads a previously persisted theme from localStorage on load", async () => {
    localStorage.setItem("theme", "light");
    const { result } = renderHook(() => useTheme());

    await act(async () => {});

    expect(result.current.theme).toBe("light");
    expect(result.current.resolvedTheme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("resolves 'system' against matchMedia rather than storing a resolved value", async () => {
    mockMatchMedia(false);
    localStorage.setItem("theme", "system");
    const { result } = renderHook(() => useTheme());

    await act(async () => {});

    expect(result.current.theme).toBe("system");
    expect(result.current.resolvedTheme).toBe("light");
  });

  it("toggleTheme flips between light and dark", async () => {
    localStorage.setItem("theme", "light");
    const { result } = renderHook(() => useTheme());
    await act(async () => {});

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.resolvedTheme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
  });
});
