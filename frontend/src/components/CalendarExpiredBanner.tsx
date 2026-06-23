import { connectGoogleCalendar } from '../api'

type Props = {
  phone: string
  onDismiss?: () => void
}

export default function CalendarExpiredBanner({ phone, onDismiss }: Props) {
  const handleReconnect = () => {
    if (phone.trim()) {
      connectGoogleCalendar(phone.trim())
    }
  }

  return (
    <div
      role="alert"
      className="bg-amber-500/15 border border-amber-400/40 rounded-xl px-4 py-3 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center gap-3"
    >
      <div className="flex-1 min-w-0">
        <p className="text-amber-200 font-semibold text-sm sm:text-base">
          Google Calendar session expired
        </p>
        <p className="text-amber-100/80 text-xs sm:text-sm mt-1">
          Reconnect to sync new appointments to your calendar.
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="px-3 py-2 text-xs sm:text-sm text-white/70 hover:text-white transition"
          >
            Dismiss
          </button>
        )}
        <button
          type="button"
          onClick={handleReconnect}
          className="bg-accent hover:bg-accent/90 text-navy font-semibold px-4 py-2 rounded-lg text-xs sm:text-sm transition"
        >
          Reconnect Calendar
        </button>
      </div>
    </div>
  )
}
