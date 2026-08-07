"use client";

import { useTheme } from "@/components/ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <label className="fixed top-4 right-4 z-50 inline-flex items-center cursor-pointer select-none">
      <input
        type="checkbox"
        className="sr-only peer"
        checked={isDark}
        onChange={toggleTheme}
        aria-label="Cambiar entre modo claro y oscuro"
      />
      <span className="w-11 h-6 flex items-center rounded-full bg-slate-300 dark:bg-slate-700 px-0.5 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500">
        <span
          className={`w-5 h-5 flex items-center justify-center rounded-full bg-white text-[10px] shadow-sm transition-transform ${
            isDark ? "translate-x-5" : "translate-x-0"
          }`}
        >
          {isDark ? "🌙" : "☀️"}
        </span>
      </span>
    </label>
  );
}
