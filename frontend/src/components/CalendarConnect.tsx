import { useEffect, useState } from 'react'
import { connectGoogleCalendar, getAuthStatus, identifyUser } from '../api'

type Props = {
  onStartCall: (phone: string) => void
}

export default function CalendarConnect({ onStartCall }: Props) {
  const [phone, setPhone] = useState(
    () => localStorage.getItem('clinic_phone') ?? '',
  )
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const returnedPhone = params.get('phone') ?? phone
    const calendarFlag = params.get('calendar')

    if (returnedPhone) {
      setPhone(returnedPhone)
      localStorage.setItem('clinic_phone', returnedPhone)
    }

    if (calendarFlag === 'connected' && returnedPhone) {
      setConnected(true)
      window.history.replaceState({}, '', window.location.pathname)
      return
    }

    if (returnedPhone) {
      getAuthStatus(returnedPhone)
        .then((status) => setConnected(status.google_calendar_connected))
        .catch(() => setConnected(false))
    }
  }, [phone])

  const handleConnect = async () => {
    if (!phone.trim()) {
      setError('Please enter your phone number.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await identifyUser(phone.trim())
      localStorage.setItem('clinic_phone', phone.trim())
      connectGoogleCalendar(phone.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect calendar.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-6">
      <div className="bg-card text-text-light rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🏥</span>
          </div>
          <h1 className="text-2xl font-bold mb-2">Healthcare AI Receptionist</h1>
          <p className="text-text-light/70 text-sm">
            Connect your Google Calendar to sync appointments, then start a voice
            call with Aria.
          </p>
        </div>

        <label className="block text-sm font-medium mb-2" htmlFor="phone">
          Phone number
        </label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 (555) 123-4567"
          className="w-full border border-text-light/20 rounded-lg px-4 py-3 mb-4 focus:outline-none focus:ring-2 focus:ring-accent"
        />

        {error && (
          <p className="text-red-600 text-sm mb-4">{error}</p>
        )}

        {!connected ? (
          <button
            type="button"
            onClick={handleConnect}
            disabled={loading}
            className="w-full bg-accent hover:bg-accent/90 text-navy font-semibold py-3 rounded-lg transition disabled:opacity-60"
          >
            {loading ? 'Redirecting…' : 'Connect Google Calendar'}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 text-accent font-semibold">
              <span className="text-xl">✓</span>
              <span>Calendar Connected</span>
            </div>
            <button
              type="button"
              onClick={() => onStartCall(phone.trim())}
              className="w-full bg-button-dark hover:bg-button-dark/90 text-white font-semibold py-3 rounded-lg transition"
            >
              Start Call
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
