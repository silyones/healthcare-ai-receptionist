import { useState } from 'react'
import CalendarConnect from './components/CalendarConnect'
import CallSummary from './components/CallSummary'
import VoiceAgent from './components/VoiceAgent'
import type { AppScreen, CallSummaryData } from './types'

function App() {
  const [screen, setScreen] = useState<AppScreen>('connect')
  const [phone, setPhone] = useState('')
  const [summaryData, setSummaryData] = useState<CallSummaryData | null>(null)

  if (screen === 'call' && phone) {
    return (
      <VoiceAgent
        phone={phone}
        onEndCall={(data) => {
          setSummaryData(data)
          setScreen('summary')
        }}
        onCancel={() => setScreen('connect')}
      />
    )
  }

  if (screen === 'summary' && summaryData) {
    return (
      <CallSummary
        data={summaryData}
        onDone={() => {
          setSummaryData(null)
          setScreen('connect')
        }}
      />
    )
  }

  return (
    <CalendarConnect
      onStartCall={(p) => {
        setPhone(p)
        setScreen('call')
      }}
    />
  )
}

export default App
