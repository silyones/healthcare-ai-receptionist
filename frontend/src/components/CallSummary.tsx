import type { CallSummaryData } from '../types'
import LoadingSpinner from './LoadingSpinner'

type Props = {
  data: CallSummaryData
  onDone: () => void
  loading?: boolean
}

export default function CallSummary({ data, onDone, loading = false }: Props) {
  const formattedTime = new Date(data.timestamp).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <LoadingSpinner label="Loading summary…" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
      <div className="bg-card text-text-light rounded-2xl shadow-xl w-full max-w-lg p-6 sm:p-8">
        <p className="text-accent text-sm font-semibold uppercase tracking-wide mb-1">
          Call complete
        </p>
        <h2 className="text-xl sm:text-2xl font-bold mb-1">
          Thanks, {data.user_name}!
        </h2>
        <p className="text-text-light/60 text-sm mb-6">{formattedTime}</p>

        <section className="mb-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-accent mb-2">
            Summary
          </h3>
          <p className="leading-relaxed text-sm sm:text-base">{data.summary}</p>
        </section>

        <section className="mb-8">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-accent mb-3">
            Appointments
          </h3>
          {data.appointments.length === 0 ? (
            <p className="text-text-light/60 text-sm">No appointments booked.</p>
          ) : (
            <ul className="space-y-2">
              {data.appointments.map((appt) => (
                <li
                  key={appt.id}
                  className="bg-navy/5 border border-navy/10 rounded-lg px-4 py-3"
                >
                  <p className="font-medium text-sm sm:text-base">{appt.title}</p>
                  <p className="text-sm text-text-light/70">
                    {appt.date} at {appt.time}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <button
          type="button"
          onClick={onDone}
          className="w-full bg-accent hover:bg-accent/90 text-navy font-semibold py-3 rounded-lg transition"
        >
          Done
        </button>
      </div>
    </div>
  )
}
