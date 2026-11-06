"use client"

/**
 * Tiny synthesized sound kit (Web Audio API, no audio files).
 * Off by default; switched on from the extension popup (chrome.storage). Every synth takes (context, destination, start
 * time) so it can also be rendered offline for testing.
 */

export type SoundName = "meow" | "mrrp" | "purr" | "yawn" | "chirp" | "tick" | "pop" | "growl" | "hiss" | "scratch"
type Synth = (c: BaseAudioContext, out: AudioNode, t: number) => void

const MASTER_VOLUME = 0.3

let ctx: AudioContext | null = null
let master: GainNode | null = null
let enabled: boolean | null = null
const listeners = new Set<() => void>()

function readPref(): boolean {
  if (enabled !== null) return enabled
  return (enabled = false)
}

export function isSoundOn(): boolean {
  return typeof window !== "undefined" && readPref()
}

export function subscribeSound(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function setSoundOn(on: boolean) {
  enabled = on
  listeners.forEach((fn) => fn())
}

export function play(name: SoundName) {
  if (!isSoundOn()) return
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = MASTER_VOLUME
      master.connect(ctx.destination)
    }
    if (ctx.state === "suspended") void ctx.resume()
    SYNTHS[name](ctx, master!, ctx.currentTime + 0.01)
  } catch {
    // Audio is a nice-to-have; never let it break the page.
  }
}

// ── building blocks ─────────────────────────────────────────────────────────

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>()
function noise(c: BaseAudioContext) {
  let buf = noiseCache.get(c)
  if (!buf) {
    buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    noiseCache.set(c, buf)
  }
  return buf
}

function envelope(c: BaseAudioContext, t: number, attack: number, peak: number, release: number, hold = 0) {
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + attack)
  g.gain.setValueAtTime(peak, t + attack + hold)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release)
  return g
}

function bandpass(c: BaseAudioContext, q: number, points: [number, number][], t: number) {
  const f = c.createBiquadFilter()
  f.type = "bandpass"
  f.Q.value = q
  f.frequency.setValueAtTime(points[0][1], t)
  for (const [at, hz] of points.slice(1)) f.frequency.linearRampToValueAtTime(hz, t + at)
  return f
}

/** A vowel-ish cat voice: a buzzy source pushed through two moving formants. */
function catVoice(
  c: BaseAudioContext,
  out: AudioNode,
  t: number,
  o: { pitch: [number, number][]; f1: [number, number][]; f2: [number, number][]; dur: number; peak: number }
) {
  const osc = c.createOscillator()
  osc.type = "sawtooth"
  osc.frequency.setValueAtTime(o.pitch[0][1], t)
  for (const [at, hz] of o.pitch.slice(1)) osc.frequency.exponentialRampToValueAtTime(hz, t + at)

  const vib = c.createOscillator()
  const vibDepth = c.createGain()
  vib.frequency.value = 6
  vibDepth.gain.value = 10
  vib.connect(vibDepth).connect(osc.frequency)

  const env = envelope(c, t, 0.04, o.peak, o.dur - 0.06, 0.02)
  const f1 = bandpass(c, 3, o.f1, t)
  const f2 = bandpass(c, 4.5, o.f2, t)
  const f2gain = c.createGain()
  f2gain.gain.value = 0.55
  osc.connect(f1).connect(env)
  osc.connect(f2).connect(f2gain).connect(env)
  env.connect(out)

  osc.start(t)
  vib.start(t)
  osc.stop(t + o.dur + 0.05)
  vib.stop(t + o.dur + 0.05)
}

// ── the sounds ──────────────────────────────────────────────────────────────

export const SYNTHS: Record<SoundName, Synth> = {
  meow(c, out, t) {
    const v = 0.9 + Math.random() * 0.25
    catVoice(c, out, t, {
      dur: 0.62,
      peak: 2.2,
      pitch: [[0, 470 * v], [0.14, 760 * v], [0.6, 390 * v]],
      f1: [[0, 760], [0.15, 1250], [0.6, 680]],
      f2: [[0, 1750], [0.15, 2550], [0.6, 1450]],
    })
  },

  yawn(c, out, t) {
    catVoice(c, out, t, {
      dur: 1.1,
      peak: 2,
      pitch: [[0, 360], [0.32, 520], [1.05, 260]],
      f1: [[0, 560], [0.35, 1100], [1.05, 480]],
      f2: [[0, 1400], [0.35, 2200], [1.05, 1200]],
    })
  },

  mrrp(c, out, t) {
    // short rolled-r trill that rises
    const osc = c.createOscillator()
    osc.type = "triangle"
    osc.frequency.setValueAtTime(520, t)
    osc.frequency.exponentialRampToValueAtTime(840, t + 0.18)
    const am = c.createGain()
    am.gain.value = 0.5
    const lfo = c.createOscillator()
    lfo.type = "square"
    lfo.frequency.value = 30
    const depth = c.createGain()
    depth.gain.value = 0.5
    lfo.connect(depth).connect(am.gain)
    const lp = c.createBiquadFilter()
    lp.type = "lowpass"
    lp.frequency.value = 2400
    const env = envelope(c, t, 0.02, 0.7, 0.2, 0.04)
    osc.connect(am).connect(lp).connect(env).connect(out)
    osc.start(t)
    lfo.start(t)
    osc.stop(t + 0.3)
    lfo.stop(t + 0.3)
  },

  purr(c, out, t) {
    // low rumble: filtered noise + a deep hum, amplitude-pulsed ~25 times a second
    const dur = 1.3
    const src = c.createBufferSource()
    src.buffer = noise(c)
    const lp = c.createBiquadFilter()
    lp.type = "lowpass"
    lp.frequency.value = 260
    lp.Q.value = 1.2
    const hum = c.createOscillator()
    hum.frequency.value = 48
    const humGain = c.createGain()
    humGain.gain.value = 0.35

    const am = c.createGain()
    am.gain.value = 0.55
    const lfo = c.createOscillator()
    lfo.frequency.value = 25
    const depth = c.createGain()
    depth.gain.value = 0.45
    lfo.connect(depth).connect(am.gain)

    const env = c.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(1, t + 0.18)
    env.gain.setValueAtTime(1, t + dur - 0.35)
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur)

    src.connect(lp).connect(am)
    hum.connect(humGain).connect(am)
    am.connect(env).connect(out)
    src.start(t)
    hum.start(t)
    lfo.start(t)
    src.stop(t + dur)
    hum.stop(t + dur)
    lfo.stop(t + dur)
  },

  growl(c, out, t) {
    // low, rough rumble: buzzy source pulsed ~30×/s, wobbling pitch, muffled
    const dur = 0.85
    const osc = c.createOscillator()
    osc.type = "sawtooth"
    osc.frequency.setValueAtTime(92, t)
    osc.frequency.linearRampToValueAtTime(110, t + 0.3)
    osc.frequency.linearRampToValueAtTime(88, t + dur)
    const wob = c.createOscillator()
    const wobDepth = c.createGain()
    wob.frequency.value = 5
    wobDepth.gain.value = 7
    wob.connect(wobDepth).connect(osc.frequency)

    const rough = c.createGain()
    rough.gain.value = 0.55
    const lfo = c.createOscillator()
    lfo.type = "square"
    lfo.frequency.value = 31
    const lfoDepth = c.createGain()
    lfoDepth.gain.value = 0.45
    lfo.connect(lfoDepth).connect(rough.gain)

    const grit = c.createBufferSource()
    grit.buffer = noise(c)
    const gritLp = c.createBiquadFilter()
    gritLp.type = "lowpass"
    gritLp.frequency.value = 420
    const gritGain = c.createGain()
    gritGain.gain.value = 0.35

    const lp = c.createBiquadFilter()
    lp.type = "lowpass"
    lp.frequency.value = 700
    lp.Q.value = 2
    const env = envelope(c, t, 0.08, 0.5, 0.25, 0.5)

    osc.connect(rough)
    grit.connect(gritLp).connect(gritGain).connect(rough)
    rough.connect(lp).connect(env).connect(out)
    for (const n of [osc, wob, lfo, grit]) {
      n.start(t)
      n.stop(t + dur + 0.05)
    }
  },

  hiss(c, out, t) {
    const src = c.createBufferSource()
    src.buffer = noise(c)
    const hp = c.createBiquadFilter()
    hp.type = "highpass"
    hp.frequency.value = 2800
    const bp = c.createBiquadFilter()
    bp.type = "bandpass"
    bp.frequency.value = 5200
    bp.Q.value = 0.7
    const env = envelope(c, t, 0.03, 0.5, 0.3, 0.32)
    src.connect(hp).connect(bp).connect(env).connect(out)
    src.start(t)
    src.stop(t + 0.7)
  },

  scratch(c, out, t) {
    // three quick claw rakes
    for (let k = 0; k < 3; k++) {
      const at = t + k * 0.075
      const src = c.createBufferSource()
      src.buffer = noise(c)
      const bp = c.createBiquadFilter()
      bp.type = "bandpass"
      bp.Q.value = 2
      bp.frequency.setValueAtTime(1800, at)
      bp.frequency.exponentialRampToValueAtTime(5500, at + 0.07)
      const env = envelope(c, at, 0.005, 2.4, 0.07)
      src.connect(bp).connect(env).connect(out)
      src.start(at)
      src.stop(at + 0.1)
    }
  },

  chirp(c, out, t) {
    const osc = c.createOscillator()
    osc.type = "sine"
    osc.frequency.setValueAtTime(950, t)
    osc.frequency.exponentialRampToValueAtTime(1600, t + 0.08)
    const env = envelope(c, t, 0.01, 0.5, 0.12)
    osc.connect(env).connect(out)
    osc.start(t)
    osc.stop(t + 0.16)
  },

  tick(c, out, t) {
    const osc = c.createOscillator()
    osc.type = "sine"
    osc.frequency.value = 1700
    const env = envelope(c, t, 0.003, 0.3, 0.04)
    osc.connect(env).connect(out)
    osc.start(t)
    osc.stop(t + 0.06)
  },

  pop(c, out, t) {
    const osc = c.createOscillator()
    osc.type = "sine"
    osc.frequency.setValueAtTime(480, t)
    osc.frequency.exponentialRampToValueAtTime(1050, t + 0.07)
    const env = envelope(c, t, 0.005, 0.55, 0.13)
    osc.connect(env).connect(out)
    osc.start(t)
    osc.stop(t + 0.18)
  },
}
