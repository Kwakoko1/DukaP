import React, { useEffect, useRef } from 'react';

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
          className={`flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-darkbg-border dark:bg-darkbg-card dark:ring-offset-slate-950 dark:placeholder:text-slate-500 dark:focus-visible:ring-primary-dark ${className}`}
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
interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}) => {
  const firstFocusableRef = useRef<HTMLButtonElement>(null);

  // Escape key + body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    firstFocusableRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-6xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      
      {/* Modal box */}
      <div className={`relative w-full ${sizes[size]} transform rounded-2xl bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border p-6 shadow-2xl z-10 animate-scale-in mb-8`}>
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
            <button
              ref={firstFocusableRef}
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {description && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
          )}
        </div>
        
        {/* Content */}
        <div className="my-2">{children}</div>
        
        {/* Footer */}
        {footer && (
          <div className="mt-6 flex items-center justify-end space-x-2 border-t border-slate-100 dark:border-darkbg-border/30 pt-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
