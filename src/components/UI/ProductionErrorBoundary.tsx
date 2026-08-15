/**
 * DukaPos SaaS — React Production Error Boundary
 * Catches unhandled UI exceptions, displays friendly secure error screens with correlation IDs,
 * and prevents stack trace leakage in production.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Shield, Home } from 'lucide-react';
import { monitoringService } from '../../services/monitoringService';
import { isChunkLoadError } from '../../utils/safeLazy';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorId: string;
}

export class ProductionErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorId: ''
  };

  public static getDerivedStateFromError(_: Error): State {
    return {
      hasError: true,
      errorId: monitoringService.generateCorrelationId()
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    monitoringService.recordFailedRequest();
    console.error(`[ProductionErrorBoundary] Unhandled UI Exception caught. Correlation ID: ${this.state.errorId}`, error, errorInfo);

    if (isChunkLoadError(error) && typeof window !== 'undefined') {
      const attempts = parseInt(sessionStorage.getItem('dukapos_chunk_reload_attempts') || '0', 10);
      if (attempts < 2) {
        sessionStorage.setItem('dukapos_chunk_reload_attempts', String(attempts + 1));
        console.info('[ProductionErrorBoundary] Auto-healing dynamic module import failure via page reload...');
        if ('caches' in window) {
          caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
        }
        window.location.reload();
      }
    }
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('dukapos_chunk_reload_attempts');
      if ('caches' in window) {
        caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
      }
    }
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, errorId: '' });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold tracking-tight text-white">System Exception Recovered</h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                DukaPos encountered an unexpected interface event. The background engine has automatically isolated the issue and preserved your workspace state.
              </p>
            </div>

            <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
              <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-indigo-400" />
                Support Tracking Reference
              </div>
              <div className="text-xs font-mono text-indigo-300 font-semibold select-all">
                {this.state.errorId || 'corr-prod-system-active'}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl transition flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Interface
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm rounded-xl transition flex items-center justify-center gap-2"
              >
                <Home className="w-4 h-4" />
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
