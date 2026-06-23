import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext,
} from '@livekit/components-react'
import { ConnectionState, type RemoteParticipant } from 'livekit-client'
import { getAppointments, getLiveKitToken, getToolsWsUrl, identifyUser } from '../api'
import type { CallSummaryData, ToolFeedItem, ToolWsMessage } from '../types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import ariaAvatar from '../../star.jpg'
import LoadingSpinner from './LoadingSpinner'

type Props = {
  onEndCall: (summary: CallSummaryData) => void
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

function AgentSpeakingAvatar({ participant }: { participant?: RemoteParticipant }) {
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => {
    if (!participant) {
      setSpeaking(false)
      return
    }

    const onSpeakingChanged = () => setSpeaking(participant.isSpeaking)
    onSpeakingChanged()
    participant.on('isSpeakingChanged', onSpeakingChanged)
    return () => {
      participant.off('isSpeakingChanged', onSpeakingChanged)
    }
  }, [participant])

  return <SpeakingAvatar speaking={speaking} />
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
  const [agentSpeaking, setAgentSpeaking] = useState(false)
  const micActive = isMicrophoneEnabled && connectionState === ConnectionState.Connected

  useEffect(() => {
    if (!agentParticipant) {
      setAgentSpeaking(false)
      return
    }
    const onSpeakingChanged = () => setAgentSpeaking(agentParticipant.isSpeaking)
    onSpeakingChanged()
    agentParticipant.on('isSpeakingChanged', onSpeakingChanged)
    return () => {
      agentParticipant.off('isSpeakingChanged', onSpeakingChanged)
    }
  }, [agentParticipant])

  const [feedItems, setFeedItems] = useState<ToolFeedItem[]>([])
  const [ending, setEnding] = useState(false)
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

    if (data.tool === 'identify_user' && data.status === 'done' && data.user_name) {
      localStorage.setItem('clinic_user_name', data.user_name)
      if (typeof data.user_id === 'number') {
        localStorage.setItem('clinic_user_id', String(data.user_id))
      }
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

  const handleEndCall = async () => {
    if (ending) return
    setEnding(true)
    room.disconnect()
    let appointments: CallSummaryData['appointments'] = []
    const userIdRaw = localStorage.getItem('clinic_user_id')
    const userId = userIdRaw ? Number.parseInt(userIdRaw, 10) : Number.NaN
    if (!Number.isNaN(userId)) {
      try {
        const data = await getAppointments(userId)
        appointments = data.appointments
      } catch {
        // fallback to empty appointments if fetch fails
      }
    }
    onEndCall({
      summary: 'Call ended. Thank you for visiting the clinic.',
      appointments,
      user_name: localStorage.getItem('clinic_user_name') ?? 'Guest',
      timestamp: new Date().toISOString(),
    })
  }

  const statusLabel = useMemo(() => {
    switch (connectionState) {
      case ConnectionState.Connecting:
        return 'Connecting…'
      case ConnectionState.Connected:
        if (remoteParticipants.length === 0) {
          return 'Waiting for Aria to join…'
        }
        return agentSpeaking ? 'Aria is speaking' : 'Listening…'
      case ConnectionState.Disconnected:
        return 'Disconnected'
      default:
        return 'Initializing…'
    }
  }, [connectionState, agentSpeaking, remoteParticipants.length])

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

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_minmax(260px,320px)] gap-4 sm:gap-6 p-4 sm:p-6 min-h-0 overflow-auto">
        <div className="flex flex-col items-center justify-center gap-4 sm:gap-6 order-2 lg:order-1">
          <AgentSpeakingAvatar participant={agentParticipant} />
          <p className="text-white/70 text-center max-w-md text-sm sm:text-base px-2">
            {connectionState === ConnectionState.Connected &&
            remoteParticipants.length === 0
              ? 'Aria is joining the room. Please allow microphone access when prompted.'
              : 'Speak naturally to book, check, modify, or cancel appointments.'}
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

function PreCallScreen({
  phone,
  onPhoneChange,
  onStart,
  starting,
  error,
}: {
  phone: string
  onPhoneChange: (value: string) => void
  onStart: () => void
  starting: boolean
  error: string | null
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
      <div className="bg-card text-text-light rounded-2xl shadow-xl w-full max-w-md p-6 sm:p-8">
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex justify-center mb-4">
            <Avatar className="h-24 w-24 sm:h-28 sm:w-28">
              <AvatarImage src={ariaAvatar} alt="Aria" />
              <AvatarFallback className="bg-button-dark text-white text-2xl font-bold">
                A
              </AvatarFallback>
            </Avatar>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold mb-2">Welcome to Mykare</h2>
          <p className="text-text-light/70 text-sm">
            Enter your phone number and start a voice call with Aria to book
            appointments.
          </p>
        </div>

        <label className="block text-sm font-medium mb-2" htmlFor="phone">
          Phone number
        </label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="+1 (555) 123-4567"
          disabled={starting}
          className="w-full border border-text-light/20 rounded-lg px-4 py-3 mb-4 focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
        />

        {error && (
          <p className="text-red-600 text-sm mb-4" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onStart}
          disabled={starting || !phone.trim()}
          className="w-full bg-button-dark hover:bg-button-dark/90 text-white font-semibold py-3 rounded-lg transition disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {starting && (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          {starting ? 'Starting call…' : 'Start Call'}
        </button>
      </div>
    </div>
  )
}

export default function VoiceAgent({ onEndCall }: Props) {
  const [phone, setPhone] = useState(
    () => localStorage.getItem('clinic_phone') ?? '',
  )
  const [callStarted, setCallStarted] = useState(false)
  const [starting, setStarting] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [disconnected, setDisconnected] = useState(false)

  const roomName = useMemo(
    () => `clinic-${phone.replace(/\D/g, '') || 'guest'}`,
    [phone],
  )

  const handleStartCall = async () => {
    if (!phone.trim()) {
      setSetupError('Please enter your phone number.')
      return
    }
    setSetupError(null)
    setStarting(true)
    try {
      const user = await identifyUser(phone.trim())
      localStorage.setItem('clinic_phone', phone.trim())
      localStorage.setItem('clinic_user_id', String(user.id))
      if (user.name) {
        localStorage.setItem('clinic_user_name', user.name)
      }
      setCallStarted(true)
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Failed to start call.')
    } finally {
      setStarting(false)
    }
  }

  const resetCall = () => {
    setCallStarted(false)
    setToken(null)
    setServerUrl(null)
    setLoading(false)
    setError(null)
    setDisconnected(false)
  }

  useEffect(() => {
    if (!callStarted) {
      return
    }

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
  }, [callStarted, roomName, phone])

  if (!callStarted) {
    return (
      <PreCallScreen
        phone={phone}
        onPhoneChange={setPhone}
        onStart={handleStartCall}
        starting={starting}
        error={setupError}
      />
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <LoadingSpinner label="Connecting to LiveKit…" />
      </div>
    )
  }

  if (disconnected) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="bg-card text-text-light rounded-xl p-6 sm:p-8 max-w-md w-full text-center">
          <p className="mb-4 text-sm sm:text-base">
            The call was disconnected. Make sure the voice agent is running
            (`python agent.py dev`).
          </p>
          <button
            type="button"
            onClick={resetCall}
            className="bg-button-dark text-white px-6 py-2.5 rounded-lg w-full sm:w-auto"
          >
            Try Again
          </button>
        </div>
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
            onClick={resetCall}
            className="bg-button-dark text-white px-6 py-2.5 rounded-lg w-full sm:w-auto"
          >
            Try Again
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
      onDisconnected={() => setDisconnected(true)}
      onError={(err) => setError(err?.message ?? 'LiveKit connection failed')}
    >
      <CallUI phone={phone} roomName={roomName} onEndCall={onEndCall} />
    </LiveKitRoom>
  )
}
