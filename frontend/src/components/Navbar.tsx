type Props = {
  subtitle?: string
}

export default function Navbar({ subtitle }: Props) {
  return (
    <header className="sticky top-0 z-50 bg-navy border-b border-white/10 px-4 sm:px-6 py-3 sm:py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-accent text-lg sm:text-xl font-bold tracking-tight truncate">
            Mykare Voice Assistant
          </h1>
          {subtitle && (
            <p className="text-white/60 text-xs sm:text-sm truncate mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        <div className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-accent/15 flex items-center justify-center">
          <span className="text-accent text-sm font-bold">M</span>
        </div>
      </div>
    </header>
  )
}
