import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useIsSpeaking,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext,
} from '@livekit/components-react'
import { ConnectionState, RoomEvent } from 'livekit-client'
import { getLiveKitToken } from '../api'
import type { CallSummaryData, ToolFeedItem } from '../types'

type Props = {
  phone: string
  onEndCall: (summary: CallSummaryData) => void
  onCancel: () => void
}

function ToolFeed({ items }: { items: ToolFeedItem[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [items])

  return (
    <div className="bg-button-dark/60 rounded-xl p-4 h-full flex flex-col min-h-0">
      <h3 className="text-accent text-sm font-semibold uppercase tracking-wide mb-3">
        Activity Feed
      </h3>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {items.length === 0 && (
          <p className="text-white/50 text-sm">Waiting for agent activity…</p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="bg-navy/50 rounded-lg px-3 py-2 text-sm text-white/90"
          >
            <span className="text-accent mr-2">›</span>
            {item.message}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function SpeakingAvatar({ speaking }: { speaking: boolean }) {
  return (
    <div className="relative flex items-center justify-center w-40 h-40">
      {speaking && (
        <>
          <span className="absolute inset-0 rounded-full border-2 border-accent animate-pulse-ring" />
          <span
            className="absolute inset-2 rounded-full border border-accent/50 animate-pulse-ring"
            style={{ animationDelay: '0.4s' }}
          />
        </>
      )}
      <div
        className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center text-4xl font-bold transition-all duration-300 ${
          speaking
            ? 'bg-accent text-navy shadow-[0_0_30px_rgba(0,201,177,0.5)]'
            : 'bg-button-dark text-white'
        }`}
      >
        A
      </div>
    </div>
  )
}

function MicIndicator({ active }: { active: boolean }) {
  const bars = [0, 1, 2, 3, 4, 5, 6]

  return (
    <div className="flex items-end justify-center gap-1 h-8">
      {bars.map((bar) => (
        <div
          key={bar}
          className={`w-1 rounded-full bg-accent transition-all ${
            active ? 'waveform-bar' : 'h-1 opacity-40'
          }`}
          style={active ? { animationDelay: `${bar * 0.1}s` } : undefined}
        />
      ))}
    </div>
  )
}

function CallUI({
  phone,
  onEndCall,
}: {
  phone: string
  onEndCall: (summary: CallSummaryData) => void
}) {
  const room = useRoomContext()
  const connectionState = useConnectionState()
  const { isMicrophoneEnabled } = useLocalParticipant()
  const remoteParticipants = useRemoteParticipants()
  const agentParticipant = remoteParticipants[0]
  const agentSpeaking = useIsSpeaking(agentParticipant)
  const micActive = isMicrophoneEnabled && connectionState === ConnectionState.Connected

  const [feedItems, setFeedItems] = useState<ToolFeedItem[]>([])
  const [ending, setEnding] = useState(false)

  const addFeedItem = (message: string) => {
    setFeedItems((prev) => [
      ...prev,
      { id: `${Date.now()}-${prev.length}`, message, timestamp: new Date() },
    ])
  }

  useEffect(() => {
    if (connectionState === ConnectionState.Connected) {
      addFeedItem('Connected to voice room')
    }
  }, [connectionState])

  useEffect(() => {
    if (!room) return

    const onData = (payload: Uint8Array) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload)) as {
          type?: string
          message?: string
          summary?: string
          appointments?: CallSummaryData['appointments']
          timestamp?: string
        }
        if (data.type === 'tool' && data.message) {
          addFeedItem(data.message)
        }
        if (data.type === 'summary' && data.summary) {
          onEndCall({
            summary: data.summary,
            appointments: data.appointments ?? [],
            timestamp: data.timestamp ?? new Date().toISOString(),
          })
        }
      } catch {
        // ignore non-json payloads
      }
    }

    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room, onEndCall])

  const handleEndCall = async () => {
    if (ending) return
    setEnding(true)
    addFeedItem('Ending call…')
    room.disconnect()
    onEndCall({
      summary: 'Call ended. Thank you for visiting the clinic.',
      appointments: [],
      timestamp: new Date().toISOString(),
    })
  }

  const statusLabel = useMemo(() => {
    switch (connectionState) {
      case ConnectionState.Connecting:
        return 'Connecting…'
      case ConnectionState.Connected:
        return agentSpeaking ? 'Aria is speaking' : 'Listening…'
      case ConnectionState.Disconnected:
        return 'Disconnected'
      default:
        return 'Initializing…'
    }
  }, [connectionState, agentSpeaking])

  return (
    <div className="min-h-screen bg-navy text-white flex flex-col">
      <header className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Aria — Front Desk Assistant</h1>
          <p className="text-white/60 text-sm">{phone}</p>
        </div>
        <span className="text-accent text-sm">{statusLabel}</span>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 p-6 min-h-0">
        <div className="flex flex-col items-center justify-center gap-6">
          <SpeakingAvatar speaking={agentSpeaking} />
          <p className="text-white/70 text-center max-w-md">
            Speak naturally to book, check, modify, or cancel appointments.
          </p>
        </div>

        <div className="min-h-[280px] lg:min-h-0">
          <ToolFeed items={feedItems} />
        </div>
      </div>

      <footer className="px-6 py-5 border-t border-white/10 bg-button-dark/40">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <MicIndicator active={micActive} />
            <span className="text-sm text-white/70">
              {micActive ? 'Microphone active' : 'Microphone muted'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleEndCall}
            disabled={ending}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2.5 rounded-lg transition disabled:opacity-60"
          >
            End Call
          </button>
        </div>
      </footer>

      <RoomAudioRenderer />
    </div>
  )
}

export default function VoiceAgent({ phone, onEndCall, onCancel }: Props) {
  const [token, setToken] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const roomName = useMemo(
    () => `clinic-${phone.replace(/\D/g, '') || 'guest'}`,
    [phone],
  )

  useEffect(() => {
    let cancelled = false
    getLiveKitToken(roomName, phone)
      .then((data) => {
        if (!cancelled) {
          setToken(data.token)
          setServerUrl(data.url)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to get token')
        }
      })
    return () => {
      cancelled = true
    }
  }, [roomName, phone])

  if (error) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center p-6">
        <div className="bg-card text-text-light rounded-xl p-8 max-w-md text-center">
          <p className="mb-4">{error}</p>
          <button
            type="button"
            onClick={onCancel}
            className="bg-button-dark text-white px-6 py-2 rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  if (!token || !serverUrl) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="text-accent animate-pulse">Connecting to LiveKit…</div>
      </div>
    )
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect
      audio
      video={false}
      onDisconnected={onCancel}
    >
      <CallUI phone={phone} onEndCall={onEndCall} />
    </LiveKitRoom>
  )
}
