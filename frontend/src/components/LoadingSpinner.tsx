type Props = {
  label?: string
  className?: string
}

export default function LoadingSpinner({ label, className = '' }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <div
        className="w-10 h-10 rounded-full border-2 border-accent/30 border-t-accent animate-spin"
        role="status"
        aria-label={label ?? 'Loading'}
      />
      {label && <p className="text-white/70 text-sm animate-pulse">{label}</p>}
    </div>
  )
}
