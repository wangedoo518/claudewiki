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
  clawwikiEnabled: boolean;
  setThemeMode: (theme: ThemeMode) => void;
  setWarwolf: (enabled: boolean) => void;
  setClawwiki: (enabled: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "dark",
  warwolfEnabled: true,
  clawwikiEnabled: false,
  setThemeMode: () => {},
  setWarwolf: () => {},
  setClawwiki: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSettingsStore((state) => state.theme);
  const warwolfTheme = useSettingsStore((state) => state.warwolfTheme);
  const clawwikiShell = useSettingsStore((state) => state.clawwikiShell);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setWarwolfTheme = useSettingsStore((state) => state.setWarwolfTheme);
  const setClawwikiShell = useSettingsStore(
    (state) => state.setClawwikiShell,
  );
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

    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const resolved = e.matches ? "dark" : "light";
      setResolvedTheme(resolved);
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(resolved);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // Apply / remove warwolf theme class.
  // NOTE: when the ClawWiki shell is active we suppress warwolf so the
  // DeepTutor warm palette wins (the two would otherwise both set the
  // same `--color-*` variables and fight for specificity).
  useEffect(() => {
    const root = document.documentElement;
    if (warwolfTheme && !clawwikiShell) {
      root.classList.add("theme-warwolf");
    } else {
      root.classList.remove("theme-warwolf");
    }
  }, [warwolfTheme, clawwikiShell]);

  // Apply / remove DeepTutor theme class. Tied 1:1 to `clawwikiShell`
  // because the canonical §5 diagram says the new shell is inseparable
  // from its warm palette. Decoupling them (e.g. "DeepTutor palette on
  // the old AppShell") is explicitly out of scope per the doc.
  useEffect(() => {
    const root = document.documentElement;
    if (clawwikiShell) {
      root.classList.add("theme-deeptutor");
    } else {
      root.classList.remove("theme-deeptutor");
    }
  }, [clawwikiShell]);

  const setThemeMode = (mode: ThemeMode) => {
    setTheme(mode);
  };

  const setWarwolf = (enabled: boolean) => {
    setWarwolfTheme(enabled);
  };

  const setClawwiki = (enabled: boolean) => {
    setClawwikiShell(enabled);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        warwolfEnabled: warwolfTheme,
        clawwikiEnabled: clawwikiShell,
        setThemeMode,
        setWarwolf,
        setClawwiki,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
