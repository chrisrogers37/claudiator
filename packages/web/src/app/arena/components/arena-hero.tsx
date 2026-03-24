export function ArenaHero({ compact = false }: { compact?: boolean }) {
  return (
    <div className="relative text-center mb-8">
      {/* Radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-yellow-500/5 via-transparent to-transparent pointer-events-none" />

      <div className="relative py-6">
        <h1
          className={`font-mono font-bold tracking-widest bg-gradient-to-r from-yellow-500 to-orange-400 bg-clip-text text-transparent ${
            compact ? "text-2xl" : "text-4xl md:text-6xl"
          }`}
        >
          THE ARENA
        </h1>
        {!compact && (
          <p className="font-mono text-sm text-gray-500 mt-2 tracking-wide">
            Where skills prove their worth
          </p>
        )}
      </div>
    </div>
  );
}
