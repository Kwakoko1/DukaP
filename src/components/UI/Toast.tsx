import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  duration: number;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
}

interface ToastContextValue {
  success: (title: string, message?: string, duration?: number) => void;
  error: (title: string, message?: string, duration?: number) => void;
  warning: (title: string, message?: string, duration?: number) => void;
  info: (title: string, message?: string, duration?: number) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
};

// ─── Toast Item ──────────────────────────────────────────────────────────────

const VARIANT_CONFIG: Record<ToastVariant, {
  icon: React.ReactNode;
  bg: string;
  border: string;
  bar: string;
  title: string;
}> = {
  success: {
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />,
    bg: 'bg-white dark:bg-darkbg-card',
    border: 'border-emerald-200 dark:border-emerald-800/40',
    bar: 'bg-emerald-500',
    title: 'text-emerald-700 dark:text-emerald-400',
  },
  error: {
    icon: <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />,
    bg: 'bg-white dark:bg-darkbg-card',
    border: 'border-red-200 dark:border-red-800/40',
    bar: 'bg-red-500',
    title: 'text-red-700 dark:text-red-400',
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />,
    bg: 'bg-white dark:bg-darkbg-card',
    border: 'border-amber-200 dark:border-amber-800/40',
    bar: 'bg-amber-500',
    title: 'text-amber-700 dark:text-amber-400',
  },
  info: {
    icon: <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />,
    bg: 'bg-white dark:bg-darkbg-card',
    border: 'border-blue-200 dark:border-blue-800/40',
    bar: 'bg-blue-500',
    title: 'text-blue-700 dark:text-blue-400',
  },
};

const ToastItem: React.FC<{ toast: Toast; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
  const cfg = VARIANT_CONFIG[toast.variant];
  const [progress, setProgress] = useState(100);
  const [visible, setVisible] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Slide-in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const step = 100 / (toast.duration / 50);
    intervalRef.current = setInterval(() => {
      setProgress(p => {
        if (p - step <= 0) {
          clearInterval(intervalRef.current!);
          handleDismiss();
          return 0;
        }
        return p - step;
      });
    }, 50);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => onDismiss(toast.id), 300);
  }, [onDismiss, toast.id]);

  return (
    <div
      className={`
        relative overflow-hidden w-80 max-w-[calc(100vw-2rem)] rounded-xl border shadow-lg shadow-slate-900/10
        ${cfg.bg} ${cfg.border}
        transition-all duration-300 ease-out
        ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'}
      `}
    >
      {/* Content */}
      <div className="flex items-start gap-3 p-4 pr-9">
        {cfg.icon}
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-bold leading-tight ${cfg.title}`}>{toast.title}</p>
          {toast.message && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{toast.message}</p>
          )}
        </div>
      </div>

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-0.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Progress bar */}
      <div className="h-0.5 bg-slate-100 dark:bg-darkbg-border w-full">
        <div
          className={`h-full transition-all ease-linear ${cfg.bar}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const ConfirmDialogRenderer: React.FC<{ state: ConfirmState | null; onClose: () => void }> = ({ state, onClose }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (state) requestAnimationFrame(() => setVisible(true));
    else setVisible(false);
  }, [state]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state) { state.resolve(false); onClose(); }
      if (e.key === 'Enter' && state) { state.resolve(true); onClose(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [state, onClose]);

  if (!state) return null;

  const btnVariants = {
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    warning: 'bg-amber-500 hover:bg-amber-600 text-white',
    primary: 'bg-primary hover:bg-primary-hover text-white',
  };
  const variantColor = state.variant || 'danger';
  const accentBar = variantColor === 'danger' ? 'from-red-500 to-red-400' : variantColor === 'warning' ? 'from-amber-500 to-amber-400' : 'from-primary to-indigo-500';

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm"
        onClick={() => { state.resolve(false); onClose(); }}
      />

      {/* Dialog box */}
      <div className={`
        relative w-full max-w-sm rounded-2xl bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border
        shadow-2xl overflow-hidden
        transition-all duration-200
        ${visible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}
      `}>
        {/* Top accent bar */}
        <div className={`h-1 w-full bg-gradient-to-r ${accentBar}`} />

        <div className="p-6">
          <h3 className="text-sm font-black text-slate-900 dark:text-white">{state.title}</h3>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{state.message}</p>

          <div className="mt-6 flex items-center justify-end gap-2.5">
            <button
              autoFocus
              onClick={() => { state.resolve(false); onClose(); }}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-darkbg-border text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              {state.cancelLabel || 'Cancel'}
            </button>
            <button
              onClick={() => { state.resolve(true); onClose(); }}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition ${btnVariants[variantColor]}`}
            >
              {state.confirmLabel || 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const addToast = useCallback((variant: ToastVariant, title: string, message?: string, duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(prev => [...prev.slice(-4), { id, variant, title, message, duration }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const ctx: ToastContextValue = {
    success: (title, msg, dur) => addToast('success', title, msg, dur),
    error: (title, msg, dur) => addToast('error', title, msg, dur),
    warning: (title, msg, dur) => addToast('warning', title, msg, dur),
    info: (title, msg, dur) => addToast('info', title, msg, dur),
    confirm,
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}

      {/* Toast stack — bottom-right */}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 items-end pointer-events-none"
      >
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      <ConfirmDialogRenderer
        state={confirmState}
        onClose={() => setConfirmState(null)}
      />
    </ToastContext.Provider>
  );
};
