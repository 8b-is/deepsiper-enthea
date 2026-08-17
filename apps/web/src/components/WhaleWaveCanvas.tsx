import React, { useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  size: number
  speedX: number
  speedY: number
  alpha: number
  pulseSpeed: number
}

interface Ripple {
  x: number
  y: number
  radius: number
  maxRadius: number
  alpha: number
  color: string
}

export const WhaleWaveCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    const handleResize = () => {
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }

    window.addEventListener('resize', handleResize)

    // Glowing deep sea plankton particles
    const particleCount = 45
    const particles: Particle[] = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 2.5 + 1,
      speedX: (Math.random() - 0.5) * 0.4,
      speedY: -Math.random() * 0.6 - 0.2, // drifting upwards like deep sea luminescence
      alpha: Math.random() * 0.7 + 0.3,
      pulseSpeed: Math.random() * 0.03 + 0.01,
    }))

    // Sonar pulse ripples
    const ripples: Ripple[] = []

    const addRipple = (x: number, y: number, color = 'rgba(56, 189, 248,') => {
      ripples.push({
        x,
        y,
        radius: 5,
        maxRadius: Math.min(width, height) * 0.45,
        alpha: 0.8,
        color,
      })
    }

    const handleClick = (e: MouseEvent) => {
      addRipple(e.clientX, e.clientY, 'rgba(6, 182, 212,')
    }

    window.addEventListener('click', handleClick)

    // Whale state
    let whaleTime = 0
    let whaleX = -200
    let whaleY = height * 0.45
    let whaleAngle = 0
    let targetWhaleY = height * 0.45

    const handleMouseMove = (e: MouseEvent) => {
      targetWhaleY = height * 0.2 + (e.clientY / height) * (height * 0.5)
      // Occasionally emit faint ripple on rapid mouse movement
      if (Math.random() < 0.05) {
        ripples.push({
          x: e.clientX,
          y: e.clientY,
          radius: 2,
          maxRadius: 60,
          alpha: 0.3,
          color: 'rgba(99, 102, 241,',
        })
      }
    }

    window.addEventListener('mousemove', handleMouseMove)

    // Render Loop
    let time = 0
    const render = () => {
      time += 0.012
      whaleTime += 0.015

      ctx.clearRect(0, 0, width, height)

      // 1. Deep ocean ambient lighting gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height)
      bgGrad.addColorStop(0, '#030712')
      bgGrad.addColorStop(0.4, '#040d21')
      bgGrad.addColorStop(0.75, '#051b38')
      bgGrad.addColorStop(1, '#020617')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, width, height)

      // 2. Draw Multi-Layer Hydrodynamic Ocean Waves
      const waveLayers = [
        { amplitude: 35, frequency: 0.0018, speed: 0.8, yOffset: height * 0.35, color: 'rgba(6, 182, 212, 0.04)', stroke: 'rgba(6, 182, 212, 0.2)' },
        { amplitude: 50, frequency: 0.0012, speed: 1.2, yOffset: height * 0.52, color: 'rgba(14, 116, 144, 0.06)', stroke: 'rgba(56, 189, 248, 0.25)' },
        { amplitude: 40, frequency: 0.0022, speed: 1.5, yOffset: height * 0.68, color: 'rgba(30, 58, 138, 0.08)', stroke: 'rgba(99, 102, 241, 0.3)' },
        { amplitude: 60, frequency: 0.0009, speed: 0.6, yOffset: height * 0.82, color: 'rgba(3, 105, 161, 0.1)', stroke: 'rgba(56, 189, 248, 0.35)' },
      ]

      waveLayers.forEach((layer) => {
        ctx.beginPath()
        ctx.moveTo(0, height)
        ctx.lineTo(0, layer.yOffset)

        for (let x = 0; x <= width; x += 15) {
          const y = layer.yOffset +
            Math.sin(x * layer.frequency + time * layer.speed) * layer.amplitude +
            Math.sin(x * layer.frequency * 0.5 + time * 0.4) * (layer.amplitude * 0.5)
          ctx.lineTo(x, y)
        }

        ctx.lineTo(width, height)
        ctx.closePath()

        ctx.fillStyle = layer.color
        ctx.fill()

        ctx.strokeStyle = layer.stroke
        ctx.lineWidth = 1.5
        ctx.stroke()
      })

      // 3. Update & Draw Sonar Shockwave Ripples
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i]
        if (!r) continue

        r.radius += 2.2
        r.alpha *= 0.97

        if (r.alpha < 0.01 || r.radius > r.maxRadius) {
          ripples.splice(i, 1)
          continue
        }

        ctx.beginPath()
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2)
        ctx.strokeStyle = `${r.color} ${r.alpha})`
        ctx.lineWidth = 1.8
        ctx.stroke()

        // Inner echo ring
        if (r.radius > 30) {
          ctx.beginPath()
          ctx.arc(r.x, r.y, r.radius * 0.65, 0, Math.PI * 2)
          ctx.strokeStyle = `${r.color} ${r.alpha * 0.5})`
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }

      // 4. Update & Draw Bioluminescent Whale (The Sovereign Leviathan)
      whaleX += 0.85
      if (whaleX > width + 280) {
        whaleX = -320
        whaleY = height * 0.4 + Math.random() * (height * 0.3)
      }

      // Smooth vertical movement towards mouse target
      whaleY += (targetWhaleY - whaleY) * 0.02
      const swimBob = Math.sin(whaleTime * 1.5) * 16
      const currentWhaleY = whaleY + swimBob

      // Angle of inclination based on vertical velocity
      const targetAngle = (targetWhaleY - whaleY) * 0.001
      whaleAngle += (targetAngle - whaleAngle) * 0.05

      ctx.save()
      ctx.translate(whaleX, currentWhaleY)
      ctx.rotate(whaleAngle)

      // Draw Whale Silhouette with Bioluminescent Contour
      const whaleLength = 240
      const whaleHeight = 55
      const tailWag = Math.sin(whaleTime * 2.2) * 14

      // Glow effect behind whale
      const glow = ctx.createRadialGradient(0, 0, 20, 0, 0, 160)
      glow.addColorStop(0, 'rgba(56, 189, 248, 0.18)')
      glow.addColorStop(0.6, 'rgba(99, 102, 241, 0.08)')
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(0, 0, 160, 0, Math.PI * 2)
      ctx.fill()

      // Whale Body
      ctx.beginPath()
      // Head
      ctx.moveTo(whaleLength * 0.5, 0)
      // Upper back curve
      ctx.bezierCurveTo(
        whaleLength * 0.25, -whaleHeight * 0.8,
        -whaleLength * 0.1, -whaleHeight * 0.7,
        -whaleLength * 0.4, -whaleHeight * 0.2,
      )
      // Tail peduncle
      ctx.quadraticCurveTo(
        -whaleLength * 0.55, tailWag * 0.3,
        -whaleLength * 0.7, tailWag,
      )
      // Tail fluke top
      ctx.lineTo(-whaleLength * 0.82, tailWag - 32)
      ctx.quadraticCurveTo(-whaleLength * 0.75, tailWag, -whaleLength * 0.7, tailWag)
      // Tail fluke bottom
      ctx.lineTo(-whaleLength * 0.82, tailWag + 32)
      ctx.quadraticCurveTo(-whaleLength * 0.72, tailWag + 6, -whaleLength * 0.45, whaleHeight * 0.3)
      // Belly curve
      ctx.bezierCurveTo(
        -whaleLength * 0.1, whaleHeight * 0.9,
        whaleLength * 0.25, whaleHeight * 0.8,
        whaleLength * 0.5, 0,
      )
      ctx.closePath()

      // Fill with abyssal navy
      const whaleBodyGrad = ctx.createLinearGradient(-whaleLength * 0.7, 0, whaleLength * 0.5, 0)
      whaleBodyGrad.addColorStop(0, 'rgba(15, 23, 42, 0.85)')
      whaleBodyGrad.addColorStop(0.5, 'rgba(30, 58, 138, 0.7)')
      whaleBodyGrad.addColorStop(1, 'rgba(6, 182, 212, 0.85)')
      ctx.fillStyle = whaleBodyGrad
      ctx.fill()

      // Bioluminescent wireframe / edge glow
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)'
      ctx.lineWidth = 1.8
      ctx.stroke()

      // Pectoral Fin
      const finFlutter = Math.sin(whaleTime * 2.2 + 0.5) * 8
      ctx.beginPath()
      ctx.moveTo(whaleLength * 0.1, whaleHeight * 0.3)
      ctx.quadraticCurveTo(
        whaleLength * 0.05, whaleHeight * 1.3 + finFlutter,
        -whaleLength * 0.15, whaleHeight * 1.1 + finFlutter,
      )
      ctx.quadraticCurveTo(
        -whaleLength * 0.05, whaleHeight * 0.5,
        whaleLength * 0.1, whaleHeight * 0.3,
      )
      ctx.fillStyle = 'rgba(14, 165, 233, 0.45)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Whale Eye (glowing point)
      ctx.beginPath()
      ctx.arc(whaleLength * 0.38, -whaleHeight * 0.12, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#38bdf8'
      ctx.shadowColor = '#38bdf8'
      ctx.shadowBlur = 10
      ctx.fill()
      ctx.shadowBlur = 0

      // Ventral Grooves / Pleats (Bioluminescent stripes)
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)'
      ctx.lineWidth = 1
      for (let g = 0; g < 4; g++) {
        ctx.beginPath()
        const yOff = whaleHeight * 0.2 + g * 7
        ctx.moveTo(whaleLength * 0.35 - g * 12, yOff)
        ctx.quadraticCurveTo(
          whaleLength * 0.1, yOff + 10,
          -whaleLength * 0.1 - g * 10, yOff + 4,
        )
        ctx.stroke()
      }

      // Echolocation / Sonar Pulse from Whale blowhole every few seconds
      if (Math.floor(whaleTime * 20) % 180 === 0) {
        addRipple(whaleX + whaleLength * 0.3, currentWhaleY - whaleHeight * 0.4, 'rgba(56, 189, 248,')
      }

      ctx.restore()

      // 5. Draw Plankton Particles
      particles.forEach((p) => {
        p.x += p.speedX
        p.y += p.speedY
        p.alpha += Math.sin(time * 5 + p.x) * p.pulseSpeed

        if (p.y < -10) {
          p.y = height + 10
          p.x = Math.random() * width
        }
        if (p.x < -10) p.x = width + 10
        if (p.x > width + 10) p.x = -10

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(56, 189, 248, ${Math.max(0.1, Math.min(0.9, p.alpha))})`
        ctx.fill()
      })

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('click', handleClick)
      window.removeEventListener('mousemove', handleMouseMove)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
