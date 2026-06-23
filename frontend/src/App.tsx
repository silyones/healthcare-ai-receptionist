import { useState } from 'react'
import CalendarConnect from './components/CalendarConnect'
import CallSummary from './components/CallSummary'
import Navbar from './components/Navbar'
import VoiceAgent from './components/VoiceAgent'
import type { AppScreen, CallSummaryData } from './types'

function App() {
  const [screen, setScreen] = useState<AppScreen>('connect')
  const [phone, setPhone] = useState('')
  const [summaryData, setSummaryData] = useState<CallSummaryData | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const navbarSubtitle =
    screen === 'call'
      ? 'Voice call in progress'
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
        {screen === 'call' && phone ? (
          <VoiceAgent
            phone={phone}
            onEndCall={handleEndCall}
            onCancel={() => setScreen('connect')}
          />
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
      </main>
    </div>
  )
}

export default App
