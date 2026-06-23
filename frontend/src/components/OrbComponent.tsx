import { useEffect, useRef } from 'react'

type OrbComponentProps = {
  isTalking: boolean
}

const OUTER_SIZE = 200
const INNER_SIZE = 140
const CENTER_OUTER = OUTER_SIZE / 2
const CENTER_INNER = INNER_SIZE / 2

type Particle = {
  angle: number
  speed: number
  radiusX: number
  radiusY: number
  flickerPhase: number
}

function createParticles(count: number): Particle[] {
  return Array.from({ length: count }, () => ({
    angle: Math.random() * Math.PI * 2,
    speed: 0.003 + Math.random() * 0.008,
    radiusX: 28 + Math.random() * 18,
    radiusY: 22 + Math.random() * 14,
    flickerPhase: Math.random() * Math.PI * 2,
  }))
}

const RING_CONFIG = [
  { radius: 74, speed: 0.004, direction: 1, segments: 24, dash: 0.55 },
  { radius: 84, speed: 0.006, direction: -1, segments: 28, dash: 0.5 },
  { radius: 94, speed: 0.0035, direction: 1, segments: 32, dash: 0.45 },
]

export function OrbComponent({ isTalking }: OrbComponentProps) {
  const outerRef = useRef<HTMLCanvasElement>(null)
  const innerRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>(createParticles(40))
  const talkingRef = useRef(isTalking)
  const startRef = useRef(performance.now())

  talkingRef.current = isTalking

  useEffect(() => {
    const outerCanvas = outerRef.current
    const innerCanvas = innerRef.current
    if (!outerCanvas || !innerCanvas) return

    const outerCtx = outerCanvas.getContext('2d')
    const innerCtx = innerCanvas.getContext('2d')
    if (!outerCtx || !innerCtx) return

    const dpr = window.devicePixelRatio || 1
    outerCanvas.width = OUTER_SIZE * dpr
    outerCanvas.height = OUTER_SIZE * dpr
    innerCanvas.width = INNER_SIZE * dpr
    innerCanvas.height = INNER_SIZE * dpr
    outerCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
    innerCtx.setTransform(dpr, 0, 0, dpr, 0, 0)

    let raf = 0

    const drawOuterRings = (t: number) => {
      outerCtx.clearRect(0, 0, OUTER_SIZE, OUTER_SIZE)
      const talking = talkingRef.current
      const breathe = 0.5 + 0.5 * Math.sin(t * 0.0015)

      for (const ring of RING_CONFIG) {
        const speed = ring.speed * (talking ? 2.8 : 1)
        const rotation = t * 0.001 * speed * ring.direction
        const baseAlpha = talking ? 0.55 + breathe * 0.35 : 0.25 + breathe * 0.15

        for (let i = 0; i < ring.segments; i++) {
          const segAngle = (Math.PI * 2) / ring.segments
          const start = rotation + i * segAngle
          const end = start + segAngle * ring.dash
          const pulse = 0.5 + 0.5 * Math.sin(t * 0.004 + i * 0.7)
          const alpha = baseAlpha * (0.6 + pulse * 0.4)
          const useGreen = (i + Math.floor(t * 0.002)) % 2 === 0

          outerCtx.beginPath()
          outerCtx.arc(CENTER_OUTER, CENTER_OUTER, ring.radius, start, end)
          outerCtx.strokeStyle = useGreen
            ? `rgba(0, 255, 163, ${alpha})`
            : `rgba(99, 102, 241, ${alpha})`
          outerCtx.lineWidth = talking ? 2.2 : 1.4
          outerCtx.shadowBlur = talking ? 12 : 6
          outerCtx.shadowColor = useGreen
            ? 'rgba(0, 255, 163, 0.6)'
            : 'rgba(99, 102, 241, 0.6)'
          outerCtx.stroke()
        }
      }
      outerCtx.shadowBlur = 0
    }

    const drawInnerOrb = (t: number) => {
      innerCtx.clearRect(0, 0, INNER_SIZE, INNER_SIZE)
      const talking = talkingRef.current
      const breathe = 0.5 + 0.5 * Math.sin(t * 0.002)
      const waveAmp = talking ? 3 : 1

      innerCtx.save()
      innerCtx.beginPath()
      innerCtx.arc(CENTER_INNER, CENTER_INNER, CENTER_INNER - 2, 0, Math.PI * 2)
      innerCtx.clip()

      const bg = innerCtx.createRadialGradient(
        CENTER_INNER * 0.35,
        CENTER_INNER * 0.35,
        4,
        CENTER_INNER,
        CENTER_INNER,
        CENTER_INNER,
      )
      bg.addColorStop(0, '#1a6b7a')
      bg.addColorStop(0.35, '#2d1b6b')
      bg.addColorStop(0.7, '#0d0b2e')
      bg.addColorStop(1, '#020408')
      innerCtx.fillStyle = bg
      innerCtx.fillRect(0, 0, INNER_SIZE, INNER_SIZE)

      for (let w = 0; w < 5; w++) {
        const isGreen = w % 2 === 0
        const color = isGreen ? 'rgba(0, 255, 163,' : 'rgba(99, 102, 241,'
        const phase = t * 0.002 + w * 1.2
        const alpha = (talking ? 0.35 : 0.2) + breathe * 0.1

        innerCtx.beginPath()
        for (let x = 0; x <= INNER_SIZE; x += 2) {
          const nx = (x - CENTER_INNER) / CENTER_INNER
          const y =
            CENTER_INNER +
            Math.sin(nx * 4 + phase) * 8 * waveAmp +
            Math.sin(nx * 7 - phase * 1.3 + w) * 4 * waveAmp
          if (x === 0) innerCtx.moveTo(x, y)
          else innerCtx.lineTo(x, y)
        }
        innerCtx.lineTo(INNER_SIZE, INNER_SIZE)
        innerCtx.lineTo(0, INNER_SIZE)
        innerCtx.closePath()
        innerCtx.fillStyle = `${color} ${alpha})`
        innerCtx.fill()
      }

      const particles = particlesRef.current
      const particleSpeed = talking ? 2.5 : 1
      for (const p of particles) {
        p.angle += p.speed * particleSpeed
        const px = CENTER_INNER + Math.cos(p.angle) * p.radiusX
        const py = CENTER_INNER + Math.sin(p.angle) * p.radiusY
        const flicker = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.006 + p.flickerPhase))
        const size = 1 + flicker * (talking ? 2 : 1)

        innerCtx.beginPath()
        innerCtx.arc(px, py, size, 0, Math.PI * 2)
        innerCtx.fillStyle = `rgba(0, 255, 163, ${flicker * (talking ? 0.9 : 0.5)})`
        innerCtx.fill()
      }

      const shine = innerCtx.createRadialGradient(
        CENTER_INNER * 0.35,
        CENTER_INNER * 0.3,
        0,
        CENTER_INNER * 0.35,
        CENTER_INNER * 0.3,
        CENTER_INNER * 0.7,
      )
      shine.addColorStop(0, 'rgba(255, 255, 255, 0.35)')
      shine.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)')
      shine.addColorStop(1, 'rgba(255, 255, 255, 0)')
      innerCtx.fillStyle = shine
      innerCtx.fillRect(0, 0, INNER_SIZE, INNER_SIZE)

      innerCtx.restore()

      const rimPulse = talking
        ? 0.6 + 0.4 * Math.sin(t * 0.012)
        : 0.35 + breathe * 0.15

      innerCtx.beginPath()
      innerCtx.arc(CENTER_INNER, CENTER_INNER, CENTER_INNER - 3, 0, Math.PI * 2)
      innerCtx.strokeStyle = talking
        ? `rgba(0, 255, 163, ${rimPulse})`
        : `rgba(99, 102, 241, ${rimPulse})`
      innerCtx.lineWidth = talking ? 3 : 2
      innerCtx.shadowBlur = talking ? 18 : 10
      innerCtx.shadowColor = talking
        ? 'rgba(0, 255, 163, 0.8)'
        : 'rgba(99, 102, 241, 0.6)'
      innerCtx.stroke()
      innerCtx.shadowBlur = 0
    }

    const loop = (now: number) => {
      const t = now - startRef.current
      drawOuterRings(t)
      drawInnerOrb(t)
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative flex items-center justify-center"
        style={{ width: OUTER_SIZE, height: OUTER_SIZE }}
      >
        <canvas
          ref={outerRef}
          width={OUTER_SIZE}
          height={OUTER_SIZE}
          className="absolute inset-0"
          aria-hidden
        />
        <canvas
          ref={innerRef}
          width={INNER_SIZE}
          height={INNER_SIZE}
          className="absolute z-10 rounded-full"
          style={{
            left: (OUTER_SIZE - INNER_SIZE) / 2,
            top: (OUTER_SIZE - INNER_SIZE) / 2,
          }}
          aria-hidden
        />
      </div>

      <div
        className={`flex items-end justify-center gap-1 h-8 transition-opacity duration-300 ${
          isTalking ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden={!isTalking}
      >
        {Array.from({ length: 11 }, (_, i) => (
          <div
            key={i}
            className="w-1 rounded-full orb-waveform-bar"
            style={{
              animationDelay: `${i * 0.08}s`,
              background: 'linear-gradient(to top, #00ffa3, #38bdf8)',
            }}
          />
        ))}
      </div>
    </div>
  )
}
