import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '@/lib/error-reporting';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/lifecycle errors anywhere in the React tree so a single broken
 * component shows a recoverable fallback instead of a blank white window — and
 * logs the crash (with its component stack) to the app.log error file.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError({
      source: 'react',
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
    });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleOpenLog = (): void => {
    void window.stacklet?.diagnostics?.openLog?.();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <div className="max-w-lg space-y-3">
          <h1 className="text-xl font-semibold text-danger">Something went wrong</h1>
          <p className="text-sm text-muted">
            Stacklet hit an unexpected error and recovered this view. The details were saved
            to the error log so they can be investigated and fixed later.
          </p>
          <pre className="max-h-40 overflow-auto rounded-lg border border-danger/30 bg-danger/5 p-3 text-left text-xs text-danger">
            {error.message}
          </pre>
          <div className="flex justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={this.handleOpenLog}
              className="rounded-lg border border-primary/30 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/10"
            >
              Open error log
            </button>
          </div>
        </div>
      </div>
    );
  }
}
