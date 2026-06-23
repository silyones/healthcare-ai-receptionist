import { lazy, Suspense, useState } from 'react'
import CalendarConnect from './components/CalendarConnect'
import CallSummary from './components/CallSummary'
import ErrorBoundary from './components/ErrorBoundary'
import LoadingSpinner from './components/LoadingSpinner'
import Navbar from './components/Navbar'
import type { AppScreen, CallSummaryData } from './types'

const VoiceAgent = lazy(() => import('./components/VoiceAgent'))

function App() {
  const [screen, setScreen] = useState<AppScreen>('connect')
  const [phone, setPhone] = useState('')
  const [summaryData, setSummaryData] = useState<CallSummaryData | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const navbarSubtitle =
    screen === 'call'
      ? 'Voice call with Aria'
      : screen === 'summary'
        ? 'Call summary'
        : 'Connect your calendar to get started'

  const handleEndCall = (data: CallSummaryData) => {
    setSummaryLoading(true)
    setSummaryData(data)
    setScreen('summary')
    setSummaryLoading(false)
  }

  return (
    <div className="min-h-screen bg-navy flex flex-col">
      <Navbar subtitle={navbarSubtitle} />
      <main className="flex-1 flex flex-col min-h-0">
        <ErrorBoundary>
          {screen === 'call' && phone ? (
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center">
                  <LoadingSpinner label="Loading call UI…" />
                </div>
              }
            >
              <VoiceAgent
                phone={phone}
                onEndCall={handleEndCall}
                onCancel={() => setScreen('connect')}
              />
            </Suspense>
          ) : screen === 'summary' && summaryData ? (
          <CallSummary
            data={summaryData}
            loading={summaryLoading}
            onDone={() => {
              setSummaryData(null)
              setScreen('connect')
            }}
          />
        ) : (
          <CalendarConnect
            onStartCall={(p) => {
              setPhone(p)
              setScreen('call')
            }}
          />
        )}
        </ErrorBoundary>
      </main>
    </div>
  )
}

export default App
