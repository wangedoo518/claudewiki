import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AppShell } from "@/shell/AppShell";
import { ClawWikiShell } from "@/shell/ClawWikiShell";
import { useSettingsStore } from "@/state/settings-store";
import { Toaster } from "sonner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

/**
 * Conditionally render the shell based on the `clawwikiShell` settings
 * flag (S0.2 dual-track cut-over).
 *
 * - false (default) → legacy AppShell (Phase 6 surfaces preserved)
 * - true → ClawWikiShell (Sidebar + 9 canonical routes + DeepTutor palette)
 *
 * Must live inside the providers because it reads zustand state.
 */
function ShellSwitch() {
  const clawwikiShell = useSettingsStore((state) => state.clawwikiShell);
  return clawwikiShell ? <ClawWikiShell /> : <AppShell />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>
            <ShellSwitch />
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </ThemeProvider>
      </HashRouter>
    </QueryClientProvider>
  );
}
