"use client";

import { useEffect, useState } from "react";

/** Runs before first paint, from the layout, so a dark page never flashes light. */
export const THEME_BOOT = `try{var t=localStorage.getItem("docs-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const saved = document.documentElement.dataset.theme;
    // Read once on mount: the server cannot know a stored choice or the system setting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(saved === "light" || saved === "dark" ? saved : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("docs-theme", next);
    } catch {
      // Storage can be off. The choice still lasts for this page.
    }
  }

  return (
    <button type="button" className="site__toggle" onClick={toggle}>
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
