import React, { useState, useEffect } from 'react';
import { 
  subscribePWAUpdate, 
  executeSafePWAUpdate, 
  getCurrentVersion, 
  type PWAUpdateState 
} from '../../services/pwaUpdateService';
import { RefreshCw, Sparkles, AlertCircle, Clock, X, ShieldCheck } from 'lucide-react';
import { Badge } from '../UI/custom-ui';

export const PWAUpdateBanner: React.FC = () => {
  const [updateState, setUpdateState] = useState<PWAUpdateState>({
    isUpdateAvailable: false,
    isCartActive: false,
    pendingSyncCount: 0,
    deferredUntilCheckout: false
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

  if (!updateState.isUpdateAvailable || dismissed) {
    return null;
  }

  const handleUpdate = async () => {
    setIsUpdating(true);
    await executeSafePWAUpdate();
  };

  const newBuild = updateState.latestVersionInfo?.buildNumber || 'NEW';

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-50 animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-slate-900/95 dark:bg-darkbg-card/95 backdrop-blur-md text-white p-4 rounded-2xl border border-indigo-500/40 shadow-2xl shadow-indigo-950/40 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-600/30 text-indigo-400 rounded-xl border border-indigo-500/30 shrink-0">
              <Sparkles className="h-5 w-5 animate-pulse text-indigo-400" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold flex items-center gap-2">
                <span>DukaPOS SaaS Update Ready</span>
                <Badge variant="outline" className="text-[9px] border-indigo-400/50 text-indigo-300 font-mono">
                  Build #{newBuild}
                </Badge>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                New build available (Running {currentVer.buildNumber}). Instant 1-click update ready.
              </p>
            </div>
          </div>

          <button
            onClick={() => setDismissed(true)}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            title="Remind me later"
          >
            <X size={15} />
          </button>
        </div>

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
          <button
            onClick={handleUpdate}
            disabled={isUpdating}
            className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition disabled:opacity-50"
          >
            <RefreshCw size={14} className={isUpdating ? 'animate-spin' : ''} />
            <span>{isUpdating ? 'Applying Update...' : '⚡ Update Now'}</span>
          </button>

          <button
            onClick={() => setDismissed(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1"
          >
            <Clock size={13} />
            <span>Later</span>
          </button>
        </div>
      </div>
    </div>
  );
};
