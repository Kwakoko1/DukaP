import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, LogOut } from 'lucide-react';

import { clearActiveSession } from '../../utils/sessionStorage';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Global ErrorBoundary Caught Exception]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetSession = () => {
    clearActiveSession();
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-950 px-4 text-slate-100 font-sans select-none">
          <div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-lg text-center relative overflow-hidden">
            {/* Ambient Red Glow */}
            <div className="absolute -top-12 -left-12 h-32 w-32 rounded-full bg-red-600/20 blur-3xl"></div>

            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-400 ring-1 ring-red-500/30 mb-6">
              <AlertTriangle className="h-7 w-7 animate-pulse" />
            </div>

            <h2 className="text-xl font-black text-white tracking-tight">Application Exception Caught</h2>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              DukaPos encountered an unhandled runtime error. Your workspace state has been protected.
            </p>

            {this.state.error && (
              <div className="mt-4 max-h-32 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-left font-mono text-[11px] text-red-400 scrollbar-thin">
                <div className="font-bold">{this.state.error.name}: {this.state.error.message}</div>
                {this.state.error.stack && (
                  <div className="mt-1 text-[10px] text-slate-500 opacity-80 whitespace-pre-wrap">
                    {this.state.error.stack.split('\n').slice(0, 4).join('\n')}
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition active:scale-95"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Reload Workspace</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetSession}
                className="flex-1 flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 text-xs font-bold text-slate-300 hover:bg-slate-800 transition active:scale-95"
              >
                <LogOut className="h-4 w-4" />
                <span>Reset Local Session</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
