import { useEffect, useRef, useState } from 'react'
import { Track, type RemoteParticipant, type RemoteTrack } from 'livekit-client'

const RMS_THRESHOLD = 4

export function useAgentTalking(agentParticipant?: RemoteParticipant) {
  const [isTalking, setIsTalking] = useState(false)
  const rafRef = useRef<number>(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)

  useEffect(() => {
    if (!agentParticipant) {
      setIsTalking(false)
      return
    }

    let disposed = false

    const cleanup = () => {
      cancelAnimationFrame(rafRef.current)
      sourceRef.current?.disconnect()
      sourceRef.current = null
      analyserRef.current = null
      if (audioContextRef.current?.state !== 'closed') {
        void audioContextRef.current?.close()
      }
      audioContextRef.current = null
      setIsTalking(false)
    }

    const setupAnalyser = (mediaStreamTrack: MediaStreamTrack) => {
      cleanup()
      if (disposed) return

      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      const stream = new MediaStream([mediaStreamTrack])
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser
      sourceRef.current = source

      const buffer = new Uint8Array(analyser.fftSize)

      const tick = () => {
        if (disposed || !analyserRef.current) return
        analyserRef.current.getByteTimeDomainData(buffer)
        let sum = 0
        for (let i = 0; i < buffer.length; i++) {
          const v = buffer[i] - 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / buffer.length)
        setIsTalking(rms > RMS_THRESHOLD)
        rafRef.current = requestAnimationFrame(tick)
      }

      void audioContext.resume().then(() => {
        rafRef.current = requestAnimationFrame(tick)
      })
    }

    const attachTrack = () => {
      for (const pub of agentParticipant.audioTrackPublications.values()) {
        const track = pub.track
        if (track && track.mediaStreamTrack) {
          setupAnalyser(track.mediaStreamTrack)
          return true
        }
      }
      return false
    }

    if (!attachTrack()) {
      const onTrackSubscribed = (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio && track.mediaStreamTrack) {
          setupAnalyser(track.mediaStreamTrack)
        }
      }
      agentParticipant.on('trackSubscribed', onTrackSubscribed)
      return () => {
        disposed = true
        agentParticipant.off('trackSubscribed', onTrackSubscribed)
        cleanup()
      }
    }

    return () => {
      disposed = true
      cleanup()
    }
  }, [agentParticipant])

  return isTalking
}
