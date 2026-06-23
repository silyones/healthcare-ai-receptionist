import { useEffect, useState } from 'react'
import { connectGoogleCalendar, getAuthStatus, identifyUser } from '../api'
import CalendarExpiredBanner from './CalendarExpiredBanner'
import LoadingSpinner from './LoadingSpinner'

type Props = {
  onStartCall: (phone: string) => void
}

export default function CalendarConnect({ onStartCall }: Props) {
  const [phone, setPhone] = useState(
    () => localStorage.getItem('clinic_phone') ?? '',
  )
  const [connected, setConnected] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [startingCall, setStartingCall] = useState(false)
  const [calendarExpired, setCalendarExpired] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function checkStatus() {
      const params = new URLSearchParams(window.location.search)
      const returnedPhone = params.get('phone') ?? phone
      const calendarFlag = params.get('calendar')

      if (returnedPhone) {
        setPhone(returnedPhone)
        localStorage.setItem('clinic_phone', returnedPhone)
      }

      if (calendarFlag === 'connected' && returnedPhone) {
        setConnected(true)
        setCalendarExpired(false)
        window.history.replaceState({}, '', window.location.pathname)
        setCheckingStatus(false)
        return
      }

      if (!returnedPhone) {
        setCheckingStatus(false)
        return
      }

      try {
        const status = await getAuthStatus(returnedPhone)
        if (!cancelled) {
          setConnected(status.google_calendar_connected)
          setCalendarExpired(!status.google_calendar_connected)
        }
      } catch {
        if (!cancelled) {
          setConnected(false)
        }
      } finally {
        if (!cancelled) {
          setCheckingStatus(false)
        }
      }
    }

    checkStatus()
    return () => {
      cancelled = true
    }
  }, [phone])

  const handleConnect = async () => {
    if (!phone.trim()) {
      setError('Please enter your phone number.')
      return
    }
    setError(null)
    setConnecting(true)
    try {
      const user = await identifyUser(phone.trim())
      localStorage.setItem('clinic_phone', phone.trim())
      localStorage.setItem('clinic_user_name', user.name)
      connectGoogleCalendar(phone.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect calendar.')
      setConnecting(false)
    }
  }

  const handleStartCall = () => {
    setStartingCall(true)
    onStartCall(phone.trim())
  }

  if (checkingStatus) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <LoadingSpinner label="Checking calendar status…" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
      <div className="bg-card text-text-light rounded-2xl shadow-xl w-full max-w-md p-6 sm:p-8">
        <div className="text-center mb-6 sm:mb-8">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl sm:text-3xl">🏥</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold mb-2">Welcome to Mykare</h2>
          <p className="text-text-light/70 text-sm">
            Connect your Google Calendar to sync appointments, then start a voice
            call with Aria.
          </p>
        </div>

        {calendarExpired && connected === false && phone.trim() && (
          <div className="mb-4">
            <CalendarExpiredBanner
              phone={phone}
              onDismiss={() => setCalendarExpired(false)}
            />
          </div>
        )}

        <label className="block text-sm font-medium mb-2" htmlFor="phone">
          Phone number
        </label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 (555) 123-4567"
          disabled={connecting || startingCall}
          className="w-full border border-text-light/20 rounded-lg px-4 py-3 mb-4 focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
        />

        {error && (
          <p className="text-red-600 text-sm mb-4" role="alert">
            {error}
          </p>
        )}

        {!connected ? (
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting || startingCall}
            className="w-full bg-accent hover:bg-accent/90 text-navy font-semibold py-3 rounded-lg transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {connecting && (
              <span className="w-4 h-4 border-2 border-navy/30 border-t-navy rounded-full animate-spin" />
            )}
            {connecting ? 'Redirecting to Google…' : 'Connect Google Calendar'}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 text-accent font-semibold">
              <span className="text-xl">✓</span>
              <span>Calendar Connected</span>
            </div>
            <button
              type="button"
              onClick={handleStartCall}
              disabled={startingCall}
              className="w-full bg-button-dark hover:bg-button-dark/90 text-white font-semibold py-3 rounded-lg transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {startingCall && (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {startingCall ? 'Starting call…' : 'Start Call'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
