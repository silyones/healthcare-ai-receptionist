import { lazy, Suspense, useState } from 'react'
import CallSummary from './components/CallSummary'
import ErrorBoundary from './components/ErrorBoundary'
import LoadingSpinner from './components/LoadingSpinner'
import Navbar from './components/Navbar'
import type { AppScreen, CallSummaryData } from './types'

const VoiceAgent = lazy(() => import('./components/VoiceAgent'))

function App() {
  const [screen, setScreen] = useState<AppScreen>('call')
  const [callKey, setCallKey] = useState(0)
  const [summaryData, setSummaryData] = useState<CallSummaryData | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const navbarSubtitle =
    screen === 'call' ? 'Voice call with Aria' : 'Call summary'

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
          {screen === 'summary' && summaryData ? (
            <CallSummary
              data={summaryData}
              loading={summaryLoading}
              onDone={() => {
                setSummaryData(null)
                setScreen('call')
                setCallKey((key) => key + 1)
              }}
            />
          ) : (
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center">
                  <LoadingSpinner label="Loading call UI…" />
                </div>
              }
            >
              <VoiceAgent key={callKey} onEndCall={handleEndCall} />
            </Suspense>
          )}
        </ErrorBoundary>
      </main>
    </div>
  )
}

export default App
