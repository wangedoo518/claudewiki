import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  useSettingsStore,
  type ThemeMode,
} from "@/state/settings-store";

type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  warwolfEnabled: boolean;
  setThemeMode: (theme: ThemeMode) => void;
  setWarwolf: (enabled: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "dark",
  warwolfEnabled: true,
  setThemeMode: () => {},
  setWarwolf: () => {},
});

/**
 * Idempotent theme-class application on `<html>`. Uses `classList.toggle`
 * with explicit boolean to guarantee the OTHER class is always removed —
 * prevents the "html has BOTH light AND dark" state that can creep in when
 * external code (devtools manipulation, HMR race, prior buggy revision)
 * forgets to strip the losing class.
 */
function applyThemeClass(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("light", resolved === "light");
  root.classList.toggle("dark", resolved === "dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSettingsStore((state) => state.theme);
  const warwolfTheme = useSettingsStore((state) => state.warwolfTheme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setWarwolfTheme = useSettingsStore((state) => state.setWarwolfTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");

  // Resolve and apply light/dark class
  useEffect(() => {
    const resolve = () => {
      if (theme === "system") {
        const prefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)"
        ).matches;
        return prefersDark ? "dark" : "light";
      }
      return theme;
    };

    const resolved = resolve();
    setResolvedTheme(resolved);
    applyThemeClass(resolved);
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const resolved = e.matches ? "dark" : "light";
      setResolvedTheme(resolved);
      applyThemeClass(resolved);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // v3: the canonical OkLCH warm-parchment palette lives in `:root` /
  // `.dark` directly (see globals.css). The legacy `.theme-warwolf` /
  // `.theme-deeptutor` parallel palette blocks are inactive — we strip
  // both classes here so v3 tokens take effect. The blocks themselves
  // are dead code that a follow-up cleanup can remove.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-warwolf");
    root.classList.remove("theme-deeptutor");
  }, []);

  const setThemeMode = (mode: ThemeMode) => {
    setTheme(mode);
  };

  const setWarwolf = (enabled: boolean) => {
    setWarwolfTheme(enabled);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        warwolfEnabled: warwolfTheme,
        setThemeMode,
        setWarwolf,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
