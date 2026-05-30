/* Catches render errors in a view so a single malformed record cannot blank the whole app. */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  // Clears a caught error when it changes, so navigating away from a view that threw recovers without
  // remounting the subtree and discarding the sibling views' scroll and state.
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('View render failed', error, info);
  }

  override componentDidUpdate(prevProps: Props): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-danger/40 bg-surface p-4 text-sm text-danger">
          Something went wrong rendering this view. {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}
