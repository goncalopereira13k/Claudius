import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "system" | "light" | "dark";

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeCtx>({ theme: "system", setTheme: () => {}, isDark: false });

function resolveIsDark(theme: Theme): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem("claudius-theme") as Theme) ?? "system"
  );
  const [isDark, setIsDark] = useState(() => resolveIsDark(
    (localStorage.getItem("claudius-theme") as Theme) ?? "system"
  ));

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    function apply() {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      root.classList.toggle("dark", dark);
      setIsDark(dark);
    }

    apply();
    if (theme === "system") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem("claudius-theme", t);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

// Shared chart color helper — use inside components
export function useChartColors(isDark: boolean) {
  return {
    tooltipBg:     isDark ? "#181510" : "#faf7ee",
    tooltipBorder: isDark ? "#453a26" : "#cfc2a0",
    axis:          isDark ? "#a3906c" : "#6e6350",
    grid:          isDark ? "#453a2640" : "#cfc2a060",
    cursor:        isDark ? "#453a2620" : "#cfc2a030",
  };
}
