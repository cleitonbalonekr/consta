"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import type { Theme } from "@/lib/theme";

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/** Switches between light and dark. Until the lawyer picks one, the theme follows the system. */
export function ThemeToggle() {
  useEffect(() => {
    const system = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => storedTheme() ?? applyTheme(system.matches ? "dark" : "light");
    system.addEventListener("change", follow);
    return () => system.removeEventListener("change", follow);
  }, []);

  function toggle() {
    const next: Theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private windows may refuse storage; the choice then lasts until the page reloads.
    }
  }

  return (
    <button
      id="theme-toggle"
      type="button"
      onClick={toggle}
      aria-label="Alternar tema claro e escuro"
      title="Alternar tema"
      className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
    >
      <Moon className="size-4.5 dark:hidden" aria-hidden />
      <Sun className="hidden size-4.5 dark:block" aria-hidden />
    </button>
  );
}
