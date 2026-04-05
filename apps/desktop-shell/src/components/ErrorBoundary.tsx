import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8">
          <div
            className="flex size-12 items-center justify-center rounded-full"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--color-error) 10%, transparent)",
            }}
          >
            <AlertTriangle
              className="size-6"
              style={{ color: "var(--color-error)" }}
            />
          </div>
          <div className="text-center">
            <h2 className="text-subhead font-semibold text-foreground">
              Something went wrong
            </h2>
            <p className="mt-1 max-w-md text-body-sm text-muted-foreground">
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={this.handleReset}
          >
            <RefreshCw className="size-3.5" />
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
