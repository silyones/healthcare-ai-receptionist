type Props = {
  subtitle?: string
}

export default function Navbar({ subtitle }: Props) {
  return (
    <header className="sticky top-0 z-50 bg-navy/95 backdrop-blur-sm border-b border-white/10 px-4 sm:px-6 py-3 sm:py-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-accent text-lg sm:text-xl font-bold tracking-tight">
          EchoCareAI
        </h1>
        {subtitle && (
          <p className="text-white/55 text-xs sm:text-sm mt-0.5">{subtitle}</p>
        )}
      </div>
    </header>
  )
}
