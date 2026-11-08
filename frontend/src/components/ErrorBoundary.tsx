import { RefreshCw } from "lucide-react";
import { Component, type ReactNode } from "react";

import { LogoMark } from "./Logo";
import { Button } from "./ui";

/**
 * Shows a way out instead of a blank page if a screen crashes while rendering.
 * (React only supports this as a class component.) The cart is kept in
 * sessionStorage, so reloading doesn't lose a sale in progress.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-abyss-900 px-6 text-center">
        <LogoMark className="size-14" />
        <p className="max-w-sm text-white">Something went wrong on this screen.</p>
        <Button icon={RefreshCw} onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }
}
