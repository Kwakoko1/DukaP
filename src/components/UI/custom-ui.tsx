import React, { useEffect, useRef, useState } from 'react';
import { GripHorizontal, RotateCcw, Eye, EyeOff } from 'lucide-react';

// Reusable Button component
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  isLoading = false,
  disabled,
  ...props
}) => {
  const baseStyle = 'inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]';
  
  const variants = {
    primary: 'bg-primary text-white hover:bg-primary-hover shadow-sm shadow-primary/20',
    secondary: 'bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-darkbg-border dark:text-slate-200 dark:hover:bg-slate-700',
    outline: 'border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-darkbg-border dark:text-slate-300 dark:hover:bg-slate-800',
    danger: 'bg-danger text-white hover:bg-danger-hover shadow-sm shadow-danger/20',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
  };

  const sizes = {
    xs: 'px-2 py-1 text-xs',
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
    icon: 'p-2 text-sm h-9 w-9',
  };

  return (
    <button
      className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin -ml-0.5 mr-1.5 h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
};

// LoadingButton — convenience alias with explicit loading state
export const LoadingButton: React.FC<ButtonProps & { isLoading: boolean }> = (props) => <Button {...props} />;

// Reusable Card components
export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
  <div className={`bg-white dark:bg-darkbg-card rounded-xl border border-slate-200 dark:border-darkbg-border shadow-sm overflow-hidden ${className}`} {...props}>
    {children}
  </div>
);

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
  <div className={`p-5 flex flex-col space-y-1.5 border-b border-slate-100 dark:border-darkbg-border/30 ${className}`} {...props}>
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ children, className = '', ...props }) => (
  <h3 className={`text-base font-semibold leading-none tracking-tight text-slate-900 dark:text-white ${className}`} {...props}>
    {children}
  </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ children, className = '', ...props }) => (
  <p className={`text-xs text-slate-500 dark:text-slate-400 ${className}`} {...props}>
    {children}
  </p>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
  <div className={`p-5 ${className}`} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
  <div className={`p-5 border-t border-slate-100 dark:border-darkbg-border/30 flex items-center justify-end ${className}`} {...props}>
    {children}
  </div>
);

// Reusable Input Component
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-darkbg-border dark:bg-darkbg-card dark:text-slate-100 dark:ring-offset-slate-950 dark:placeholder:text-slate-500 dark:focus-visible:ring-primary-dark ${className}`}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

// Reusable Badge component
export const Badge: React.FC<{
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'outline' | 'info';
  className?: string;
}> = ({ children, variant = 'default', className = '' }) => {
  const styles = {
    default: 'bg-primary/10 text-primary dark:bg-primary-dark/20 dark:text-primary-dark',
    success: 'bg-success/10 text-success dark:bg-success/20 dark:text-green-400',
    warning: 'bg-warning/10 text-amber-600 dark:bg-warning/20 dark:text-warning',
    danger: 'bg-danger/10 text-danger dark:bg-danger/20 dark:text-red-400',
    outline: 'border border-slate-300 text-slate-600 dark:border-darkbg-border dark:text-slate-300',
    info: 'bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[variant]} ${className}`}>
      {children}
    </span>
  );
};

// Reusable Dialog Modal component
export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  subHeader?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  draggable?: boolean;
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  subHeader,
  children,
  footer,
  size = 'md',
  draggable = true,
}) => {
  const firstFocusableRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isPeeking, setIsPeeking] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Reset position when dialog opens
  useEffect(() => {
    if (isOpen) {
      setPosition({ x: 0, y: 0 });
      setIsPeeking(false);
    }
  }, [isOpen]);

  // Escape key + body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';

    const timer = setTimeout(() => {
      firstFocusableRef.current?.focus();
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea, a, kbd, [role="button"]')) return;

    // Prevent text selection interference
    e.preventDefault();
    
    // Set pointer capture to guarantee pointermove and pointerup stream to this element
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
    };
    document.body.style.userSelect = 'none';
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current) return;

    const deltaX = e.clientX - dragStartRef.current.startX;
    const deltaY = e.clientY - dragStartRef.current.startY;

    const newX = dragStartRef.current.initialX + deltaX;
    const newY = dragStartRef.current.initialY + deltaY;

    // Soft clamp to viewport
    const maxClampX = Math.max(100, window.innerWidth * 0.45);
    const maxClampY = Math.max(100, window.innerHeight * 0.45);
    const clampedX = Math.max(-maxClampX, Math.min(maxClampX, newX));
    const clampedY = Math.max(-maxClampY, Math.min(maxClampY, newY));

    setPosition({ x: clampedX, y: clampedY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      dragStartRef.current = null;
      document.body.style.userSelect = '';
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
    }
  };

  const sizes: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-6xl',
  };

  return (
    /* Outer overlay — fixed to viewport, centered vertically */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 transition-all duration-200 ${
          isPeeking
            ? 'bg-slate-900/10 backdrop-blur-none'
            : isDragging || position.x !== 0 || position.y !== 0
            ? 'bg-slate-900/30 dark:bg-slate-950/40 backdrop-blur-none'
            : 'bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm'
        }`}
        onClick={onClose}
      />

      {/* Modal box — flex column, draggable via transform */}
      <div
        style={
          position.x !== 0 || position.y !== 0
            ? { transform: `translate3d(${position.x}px, ${position.y}px, 0)` }
            : undefined
        }
        className={`relative flex flex-col w-full ${sizes[size]} max-h-[calc(100vh-32px)] rounded-2xl bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border shadow-2xl z-10 animate-scale-in overflow-hidden transition-opacity duration-150 ${
          isPeeking
            ? 'opacity-20 select-none'
            : isDragging
            ? 'opacity-95 shadow-indigo-500/40 ring-2 ring-indigo-500/40 scale-[1.002]'
            : ''
        }`}
      >
        {/* ── Sticky Header (Draggable Handle) ── */}
        <div
          ref={headerRef}
          className={`flex-none border-b border-slate-100 dark:border-darkbg-border/40 bg-slate-50/90 dark:bg-darkbg/90 touch-none ${
            draggable ? 'cursor-grab active:cursor-grabbing select-none' : ''
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          title={draggable ? 'Click & drag header to move modal window' : undefined}
        >
          {/* Top Visual Drag Handle Bar */}
          {draggable && (
            <div className="flex justify-center pt-2 pb-0 cursor-grab active:cursor-grabbing">
              <div className="w-16 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full opacity-70 hover:opacity-100 transition-opacity" />
            </div>
          )}

          <div className="px-5 pt-1.5 pb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 pointer-events-none">
              {draggable && (
                <GripHorizontal size={16} className="text-indigo-500 dark:text-indigo-400 opacity-80 flex-shrink-0" />
              )}
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">{title}</h3>
            </div>
            
            {/* Header Actions */}
            <div className="flex items-center gap-1 shrink-0 pointer-events-auto">
              {/* Peek Mode Button */}
              <button
                type="button"
                onClick={() => setIsPeeking(!isPeeking)}
                onPointerDown={(e) => e.stopPropagation()}
                className={`rounded-lg p-1.5 transition-colors text-xs flex items-center gap-1 ${
                  isPeeking 
                    ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300' 
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title={isPeeking ? 'Exit Peek Mode' : 'Peek Behind: Make modal transparent to view screen underneath'}
              >
                {isPeeking ? <EyeOff size={13} /> : <Eye size={13} />}
                <span className="hidden sm:inline text-[10px] font-bold">Peek</span>
              </button>

              {/* Reset Position Button (if moved) */}
              {(position.x !== 0 || position.y !== 0) && (
                <button
                  type="button"
                  onClick={() => setPosition({ x: 0, y: 0 })}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors text-xs flex items-center gap-1"
                  title="Reset Modal Position to Center"
                >
                  <RotateCcw size={12} />
                  <span className="hidden sm:inline text-[10px] font-bold">Center</span>
                </button>
              )}

              {/* Close Button */}
              <button
                ref={firstFocusableRef}
                onClick={onClose}
                onPointerDown={(e) => e.stopPropagation()}
                className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                title="Close (Esc)"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          {description && (
            <p className="px-5 pb-2 text-xs text-slate-500 dark:text-slate-400 pointer-events-none">{description}</p>
          )}
          {subHeader && (
            <div className="px-5 pt-1 pb-0 bg-white dark:bg-darkbg-card border-t border-slate-100 dark:border-darkbg-border/40 pointer-events-auto">
              {subHeader}
            </div>
          )}
        </div>

        {/* ── Scrollable Content Area ── */}
        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
          {children}
        </div>

        {/* ── Sticky Footer ── */}
        {footer && (
          <div className="flex-none px-5 py-2.5 border-t border-slate-100 dark:border-darkbg-border/30 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
