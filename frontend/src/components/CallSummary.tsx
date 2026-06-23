import type { CallSummaryData } from '../types'

type Props = {
  data: CallSummaryData
  onDone: () => void
}

export default function CallSummary({ data, onDone }: Props) {
  const formattedTime = new Date(data.timestamp).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-6">
      <div className="bg-card text-text-light rounded-2xl shadow-xl w-full max-w-lg p-8">
        <h1 className="text-2xl font-bold mb-2">Call Summary</h1>
        <p className="text-text-light/60 text-sm mb-6">{formattedTime}</p>

        <section className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-accent mb-2">
            Summary
          </h2>
          <p className="leading-relaxed">{data.summary}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-accent mb-3">
            Appointments
          </h2>
          {data.appointments.length === 0 ? (
            <p className="text-text-light/60 text-sm">No appointments booked.</p>
          ) : (
            <ul className="space-y-2">
              {data.appointments.map((appt) => (
                <li
                  key={appt.id}
                  className="bg-navy/5 border border-navy/10 rounded-lg px-4 py-3"
                >
                  <p className="font-medium">{appt.title}</p>
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
