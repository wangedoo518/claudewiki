import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ClawWikiShell } from "@/shell/ClawWikiShell";
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
 * S0.4 cut day: the dual-track ShellSwitch is gone. ClawWikiShell is
 * the only shell. The legacy `AppShell` and the `clawwikiShell` settings
 * flag have been deleted along with the rest of session-workbench /
 * apps / code-tools / workbench. There is no path back to the Phase 6
 * tab-bar surface inside this binary — `phase6-rollback` is the only
 * preserved fallback (see git tag).
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>
            <ClawWikiShell />
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </ThemeProvider>
      </HashRouter>
    </QueryClientProvider>
  );
}
