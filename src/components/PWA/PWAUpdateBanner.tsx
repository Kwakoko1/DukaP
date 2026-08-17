import React, { useState, useEffect } from 'react';
import { 
  subscribePWAUpdate, 
  executeSafePWAUpdate, 
  triggerPWAInstall,
  getCurrentVersion, 
  type PWAUpdateState 
} from '../../services/pwaUpdateService';
import { RefreshCw, Sparkles, AlertCircle, Clock, X, ShieldCheck, Download, HardDrive } from 'lucide-react';
import { Badge } from '../UI/custom-ui';

export const PWAUpdateBanner: React.FC = () => {
  const [updateState, setUpdateState] = useState<PWAUpdateState>({
    isUpdateAvailable: false,
    isCartActive: false,
    pendingSyncCount: 0,
    deferredUntilCheckout: false,
    installProgress: 0,
    loadedFiles: 0,
    totalFiles: 0,
    currentCachingFile: '',
    installStatus: 'idle',
    isInstallingPWA: false,
    canInstallPWA: false,
  });

  const [dismissed, setDismissed] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const currentVer = getCurrentVersion();

  useEffect(() => {
    const unsubscribe = subscribePWAUpdate((newState) => {
      setUpdateState(newState);
    });
    return () => unsubscribe();
  }, []);

  const showBanner = updateState.isUpdateAvailable || updateState.isInstallingPWA || updateState.canInstallPWA;

  if (!showBanner) {
    return null;
  }

  const newBuild = updateState.latestVersionInfo?.buildNumber || 'NEW';

  if (dismissed && !updateState.isInstallingPWA) {
    return (
      <button
        onClick={() => setDismissed(false)}
        className="fixed bottom-4 right-4 z-50 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-2xl border border-indigo-400/40 flex items-center gap-2 transition animate-pulse"
        title="DukaPOS Update & PWA Ready — Click to view"
      >
        <Sparkles size={14} className="text-indigo-200" />
        <span className="text-xs font-extrabold font-mono">
          {updateState.installProgress > 0 ? `Installing ${updateState.installProgress}%` : `Build #${newBuild} Ready`}
        </span>
      </button>
    );
  }

  const handleUpdate = async () => {
    setIsUpdating(true);
    await executeSafePWAUpdate();
  };

  const handleInstallApp = async () => {
    await triggerPWAInstall();
  };

  const isProgressActive = updateState.isInstallingPWA || updateState.installProgress > 0;

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-50 animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-slate-900/95 dark:bg-darkbg-card/95 backdrop-blur-md text-white p-4 rounded-2xl border border-indigo-500/40 shadow-2xl shadow-indigo-950/40 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-600/30 text-indigo-400 rounded-xl border border-indigo-500/30 shrink-0">
              {isProgressActive ? (
                <Download className="h-5 w-5 animate-bounce text-emerald-400" />
              ) : (
                <Sparkles className="h-5 w-5 animate-pulse text-indigo-400" />
              )}
            </div>
            <div>
              <h4 className="text-xs font-extrabold flex items-center gap-2">
                <span>{isProgressActive ? 'PWA Package Installation' : 'KwakoPOS Enterprise Release Ready'}</span>
                <Badge variant="outline" className="text-[9px] border-indigo-400/50 text-indigo-300 font-mono">
                  Build #{newBuild}
                </Badge>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isProgressActive 
                  ? `Caching offline bundle & static PWA assets (${updateState.loadedFiles}/${updateState.totalFiles || 7} files)...`
                  : `New release available (Running ${currentVer.buildNumber}). Instant update ready.`}
              </p>
            </div>
          </div>

          {!isProgressActive && (
            <button
              onClick={() => setDismissed(true)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              title="Remind me later"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Live Installation Progress Bar & Current File Indicator */}
        {(isProgressActive || updateState.installProgress > 0) && (
          <div className="space-y-1.5 p-3 bg-slate-950/70 border border-indigo-500/30 rounded-xl font-mono">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-indigo-300 font-bold flex items-center gap-1.5">
                <HardDrive size={13} className="text-indigo-400 animate-spin" />
                <span>Progress</span>
              </span>
              <span className="text-emerald-400 font-extrabold text-xs">
                {updateState.installProgress}%
              </span>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 rounded-full transition-all duration-300 shadow-sm"
                style={{ width: `${Math.max(5, updateState.installProgress)}%` }}
              />
            </div>

            {/* Current Active File Ticker */}
            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5 truncate">
              <span className="truncate flex items-center gap-1 text-slate-300">
                <span className="text-slate-500 font-bold">File:</span> 
                <span className="text-indigo-200 font-semibold truncate">
                  {updateState.currentCachingFile || 'Initializing static manifest...'}
                </span>
              </span>
              {updateState.totalFiles > 0 && (
                <span className="shrink-0 text-[9px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono ml-2">
                  {updateState.loadedFiles}/{updateState.totalFiles}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Dynamic Context Warnings */}
        {updateState.isCartActive && (
          <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[10px] text-amber-300 flex items-center gap-1.5 font-bold">
            <AlertCircle size={13} className="shrink-0" />
            <span>Active items in register cart. Reload will defer until checkout finishes.</span>
          </div>
        )}

        {updateState.pendingSyncCount > 0 && (
          <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-[10px] text-indigo-300 flex items-center gap-1.5">
            <ShieldCheck size={13} className="shrink-0" />
            <span>{updateState.pendingSyncCount} unsynced items will be safely committed before reload.</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-1">
          {updateState.isUpdateAvailable && (
            <button
              onClick={handleUpdate}
              disabled={isUpdating}
              className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition disabled:opacity-50"
            >
              <RefreshCw size={14} className={isUpdating ? 'animate-spin' : ''} />
              <span>{isUpdating ? 'Applying Update...' : '⚡ Update Now'}</span>
            </button>
          )}

          {updateState.canInstallPWA && (
            <button
              onClick={handleInstallApp}
              className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition"
            >
              <Download size={14} />
              <span>Install PWA App</span>
            </button>
          )}

          {!updateState.isInstallingPWA && (
            <button
              onClick={() => setDismissed(true)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1"
            >
              <Clock size={13} />
              <span>Dismiss</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
