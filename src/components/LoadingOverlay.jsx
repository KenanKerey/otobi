export default function LoadingOverlay() {
  return (
    <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="hud-surface rounded-md p-6 flex flex-col items-center gap-3 shadow-2xl shadow-black/60 hud-fade">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-white/[0.06]" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-yellow-300/60 animate-spin" />
          <div className="absolute inset-2 rounded-full border border-transparent border-t-emerald-400/40 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
        </div>
        <div className="text-center">
          <p className="hud-mono text-[10px] text-white/40 tracking-[0.2em]">VERİ ALINIYOR</p>
        </div>
      </div>
    </div>
  );
}
