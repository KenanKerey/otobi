import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function ErrorBanner({ message, onRetry }) {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[2000] max-w-md w-[calc(100%-1.5rem)] hud-fade">
      <div className="hud-surface rounded-md px-3 py-2.5 shadow-2xl shadow-black/60 flex items-center gap-2.5">
        <AlertTriangle className="h-4 w-4 text-amber-400/70 shrink-0" />
        <p className="hud-mono text-[10px] text-white/40 tracking-wider flex-1">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="shrink-0 hud-mono text-[9px] text-amber-400/70 hover:text-amber-300 px-2 py-1 rounded bg-amber-400/[0.06] hover:bg-amber-400/10 flex items-center gap-1 transition-colors cursor-pointer tracking-wider"
          >
            <RefreshCw className="h-3 w-3" />
            TEKRAR
          </button>
        )}
      </div>
    </div>
  );
}
