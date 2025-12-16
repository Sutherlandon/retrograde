import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
const STORAGE_KEY = "theme";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(resolved: "light" | "dark") {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");

  // Initial load + localStorage
  useEffect(() => {
    const stored =
      (localStorage.getItem(STORAGE_KEY) as Theme) ||
      "system";
    setThemeState(stored);

    const resolved = stored === "system" ? getSystemTheme() : stored;
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, []);

  // Watch system changes
  useEffect(() => {
    // if (typeof window === "undefined") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const handler = () => {
      if (theme === "system") {
        const next = getSystemTheme();
        setResolvedTheme(next);
        applyTheme(next);
      }
    };

    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = (next: Theme) => {
    // if (typeof window === "undefined") return;

    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);

    const resolved = next === "system" ? getSystemTheme() : next;
    setResolvedTheme(resolved);
    applyTheme(resolved);
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  const themeObject = {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
  };

  console.log(theme, '/', resolvedTheme);

  return themeObject;
}
