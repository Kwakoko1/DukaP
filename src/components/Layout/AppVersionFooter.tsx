import React from 'react';
import { versionMetadata } from '../../config/versionMetadata';

interface AppVersionFooterProps {
  className?: string;
  isFixed?: boolean;
}

export const AppVersionFooter: React.FC<AppVersionFooterProps> = ({ 
  className = '', 
}) => {
  const { appName, currentYear, version, buildNumber } = versionMetadata;

  const baseClasses = `w-full text-center py-1.5 px-4 text-[11px] font-medium tracking-tight text-slate-400 dark:text-slate-500 transition-colors select-none ${className}`;

  return (
    <div className={baseClasses} aria-label="Application Version Information">
      <div className="inline-flex items-center justify-center space-x-2 flex-wrap gap-y-1">
        <span className="font-semibold text-slate-700 dark:text-slate-300">{appName}</span>
        <span>&copy; {currentYear}</span>
        <span className="text-slate-300 dark:text-slate-700">&bull;</span>
        <span>Version <strong className="font-semibold text-slate-700 dark:text-slate-300">{version}</strong></span>
        <span className="text-slate-300 dark:text-slate-700">&bull;</span>
        <span>Build <code className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-700/50">{buildNumber}</code></span>
      </div>
    </div>
  );
};

export default AppVersionFooter;
