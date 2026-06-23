import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useIsSpeaking,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext,
} from '@livekit/components-react'
import { ConnectionState } from 'livekit-client'
import { getLiveKitToken, getToolsWsUrl } from '../api'
import type { CallSummaryData, ToolFeedItem, ToolWsMessage } from '../types'
import CalendarExpiredBanner from './CalendarExpiredBanner'
import LoadingSpinner from './LoadingSpinner'

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
    <div className="bg-button-dark/60 rounded-xl p-3 sm:p-4 h-full flex flex-col min-h-[200px] lg:min-h-0">
      <h3 className="text-accent text-xs sm:text-sm font-semibold uppercase tracking-wide mb-3">
        Activity Feed
      </h3>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[40vh] lg:max-h-none">
        {items.length === 0 && (
          <p className="text-white/50 text-sm">Waiting for agent activity…</p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className={`rounded-lg px-3 py-3 text-sm border ${
              item.status === 'running'
                ? 'bg-navy/50 border-accent/40 text-white/90'
                : item.status === 'error'
                  ? 'bg-red-950/40 border-red-400/40 text-white'
                  : 'bg-navy/70 border-accent/20 text-white'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-accent text-xs font-semibold uppercase tracking-wide truncate">
                {item.tool.replace(/_/g, ' ')}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                  item.status === 'running'
                    ? 'bg-accent/20 text-accent animate-pulse'
                    : item.status === 'error'
                      ? 'bg-red-500/20 text-red-300'
                      : 'bg-accent/10 text-accent'
                }`}
              >
                {item.status}
              </span>
            </div>
            <p className="break-words">{item.message}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function SpeakingAvatar({ speaking }: { speaking: boolean }) {
  return (
    <div className="relative flex items-center justify-center w-32 h-32 sm:w-40 sm:h-40">
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
        className={`relative z-10 w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center text-3xl sm:text-4xl font-bold transition-all duration-300 ${
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
  roomName,
  onEndCall,
}: {
  phone: string
  roomName: string
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
  const [calendarExpired, setCalendarExpired] = useState(false)
  const onEndCallRef = useRef(onEndCall)
  onEndCallRef.current = onEndCall

  const handleToolMessage = useCallback((data: ToolWsMessage) => {
    setFeedItems((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length}`,
        tool: data.tool,
        status: data.status,
        message: data.message,
        timestamp: new Date(),
      },
    ])

    if (data.tool === 'calendar_auth' && data.status === 'error') {
      setCalendarExpired(true)
    }

    if (data.tool === 'identify_user' && data.status === 'done' && data.user_name) {
      localStorage.setItem('clinic_user_name', data.user_name)
    }

    if (
      data.tool === 'end_conversation' &&
      data.status === 'done' &&
      data.summary
    ) {
      room.disconnect()
      onEndCallRef.current({
        summary: data.summary,
        appointments: data.appointments ?? [],
        user_name: data.user_name ?? localStorage.getItem('clinic_user_name') ?? 'Guest',
        timestamp: data.timestamp ?? new Date().toISOString(),
      })
    }
  }, [room])

  useEffect(() => {
    const ws = new WebSocket(getToolsWsUrl(roomName))

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ToolWsMessage
        if (data.tool && data.status && data.message) {
          handleToolMessage(data)
        }
      } catch {
        // ignore malformed messages
      }
    }

    return () => {
      ws.close()
    }
  }, [roomName, handleToolMessage])

  const handleEndCall = () => {
    if (ending) return
    setEnding(true)
    room.disconnect()
    onEndCall({
      summary: 'Call ended. Thank you for visiting the clinic.',
      appointments: [],
      user_name: localStorage.getItem('clinic_user_name') ?? 'Guest',
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
    <div className="flex-1 flex flex-col text-white min-h-0">
      <div className="px-4 sm:px-6 py-3 border-b border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm sm:text-base font-semibold truncate">
            Aria — Front Desk Assistant
          </p>
          <p className="text-white/60 text-xs sm:text-sm truncate">{phone}</p>
        </div>
        <span className="text-accent text-xs sm:text-sm shrink-0">{statusLabel}</span>
      </div>

      {calendarExpired && (
        <div className="px-4 sm:px-6 pt-4">
          <CalendarExpiredBanner
            phone={phone}
            onDismiss={() => setCalendarExpired(false)}
          />
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_minmax(260px,320px)] gap-4 sm:gap-6 p-4 sm:p-6 min-h-0 overflow-auto">
        <div className="flex flex-col items-center justify-center gap-4 sm:gap-6 order-2 lg:order-1">
          <SpeakingAvatar speaking={agentSpeaking} />
          <p className="text-white/70 text-center max-w-md text-sm sm:text-base px-2">
            Speak naturally to book, check, modify, or cancel appointments.
          </p>
        </div>

        <div className="order-1 lg:order-2 min-h-[200px]">
          <ToolFeed items={feedItems} />
        </div>
      </div>

      <footer className="px-4 sm:px-6 py-4 sm:py-5 border-t border-white/10 bg-button-dark/40 mt-auto">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <MicIndicator active={micActive} />
            <span className="text-xs sm:text-sm text-white/70">
              {micActive ? 'Microphone active' : 'Microphone muted'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleEndCall}
            disabled={ending}
            className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2.5 rounded-lg transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {ending && (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {ending ? 'Ending call…' : 'End Call'}
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const roomName = useMemo(
    () => `clinic-${phone.replace(/\D/g, '') || 'guest'}`,
    [phone],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

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
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [roomName, phone])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <LoadingSpinner label="Connecting to LiveKit…" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="bg-card text-text-light rounded-xl p-6 sm:p-8 max-w-md w-full text-center">
          <p className="mb-4 text-sm sm:text-base" role="alert">
            {error}
          </p>
          <button
            type="button"
            onClick={onCancel}
            className="bg-button-dark text-white px-6 py-2.5 rounded-lg w-full sm:w-auto"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  if (!token || !serverUrl) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner label="Preparing room…" />
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
      <CallUI phone={phone} roomName={roomName} onEndCall={onEndCall} />
    </LiveKitRoom>
  )
}
