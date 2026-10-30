// Global error boundary (docs/09 Phase 4): a crash shows a message and a
// retry, never a white page. [local-first]
import { Component } from "react";

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(): void {
    // No personal data and no payload contents here (sovereignty rule).
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground break-all">
            {this.state.error.message || "Unexpected error"}
          </p>
          <button
            type="button"
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm"
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
}
