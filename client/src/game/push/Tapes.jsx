import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Euler, Matrix4, Quaternion, Vector3 } from 'three'

import { TRACK_HALF_WIDTH } from '@shared/world'

import { getGame } from '../../store/game'
import { getQuality } from '../../store/quality'
import { createBoxInstances, disposeBlocks } from '../blocks'
import { sharedMaterials, STYLE } from '../materials'
import { MAX_STAGES, STAGES, TAPES } from './course'
import { tiltAt, trackPoint } from './path'
import { push, TAPE_STRETCH } from './pushControl'
import { STAGE_THEMES } from './themes'

/**
 * The tapes across the end of every slope: a stack of bands strung post to post across
 * the track (the posts are the track's own, see track.js) - striped in the stage's own
 * colour and white, gold and white on the last, more of them the harder the stage; and
 * dark red and black on any tape too strong for the Fat you have, so you can see where
 * a roll will stop. They sag a touch between their posts and flutter as you roll. Each band is a row of short
 * segments, so it can bend: rolling into it, it stretches round your belly, further and
 * further until it SNAPS (pushControl decides when); then each half swings away off its
 * post and drops, and lies on the track behind you for the rest of the roll. Once your
 * roll is over they're all whole again.
 *
 * Every segment of every tape near the camera is one instance of one InstancedMesh - a
 * single draw call - placed each frame from shared scratch objects (no allocation).
 */

/** Segments per band, and the band's size: across the track's floor, belly high. */
const SEGMENTS = 12
const SPAN = TRACK_HALF_WIDTH * 2 - 0.3
const HALF_SPAN = SPAN / 2
const SEG = SPAN / SEGMENTS
const BAND_H = 0.3
const BAND_T = 0.07
/** The lowest band's middle above the floor, and the gap from one band to the next. */
const BOTTOM = 0.55
const STEP = 0.46
/** How many bands tape `stage`'s stack has: a couple at first, up to six on the hardest. */
const bandsOf = (stage) => Math.min(6, 2 + Math.floor(stage / 2))
/** How wide the bow round a belly is (m), as a share of how big the ball is. */
const BOW_WIDTH = 1.5
/** A snapped half swings down off its post like this: how fast, how bouncy. */
const SWING_RATE = 4
const SWING_BOUNCE = 8
/** Lying on the track: this far over it. */
const FLOOR = 0.05
/** Not rolling, the tapes are laid out only every this many frames. */
const IDLE_EVERY = 30

const MAX_INSTANCES = MAX_STAGES * 6 * SEGMENTS

const GOLD = new Color('#ffcc1f')
const WHITE = new Color('#ffffff')
const LOCKED = new Color('#8a0f1c')
const LOCKED_DARK = new Color('#1d1d24')
/** Each stage's stripe colour (its theme's gate colour), made once. */
const STRIPES = new Map(Object.entries(STAGE_THEMES).map(([id, theme]) => [id, new Color(theme.gate)]))
/** How far a band sags in its middle, and how it flutters while you roll. */
const SAG = 0.09
const FLUTTER = 0.07

const _m = new Matrix4()
const _p = new Vector3()
const _q = new Quaternion()
const _s = new Vector3()
const _e = new Euler()

/**
 * Colours instance `i`, segment `seg` of band `band` of stage `stage`'s tape (`last` the
 * final one, `locked` too strong for you) - only when that changes.
 */
function paint(tapes, colours, i, seg, band, stage, last, locked) {
  const light = (seg + band) % 2 === 1
  const kind = locked ? (light ? 3 : 4) : light ? 1 : last ? 2 : 0
  const key = 1 + kind + 8 * stage
  if (colours[i] === key) return false
  colours[i] = key
  const colour = kind === 1 ? WHITE : kind === 2 ? GOLD : kind === 3 ? LOCKED : kind === 4 ? LOCKED_DARK : STRIPES.get(STAGES[stage].id) ?? WHITE
  tapes.setColorAt(i, colour)
  return true
}

export default function Tapes() {
  const ref = useRef(null)
  const mesh = useMemo(() => createBoxInstances(MAX_INSTANCES, sharedMaterials().toy, STYLE.SMOOTH), [])
  /** What colour each instance was last given (0 none): repainted only when it changes. */
  const colours = useMemo(() => new Uint16Array(MAX_INSTANCES), [])
  /** Frames since the tapes were last laid out while nobody was rolling (they're still then). */
  const idle = useRef(0)

  useEffect(() => () => disposeBlocks(mesh), [mesh])

  useFrame((state) => {
    const tapes = ref.current
    if (!tapes) return
    const rolling = push.active
    // In the lobby the tapes stand still: re-lay them (for the view distance as the
    // camera moves) only every so often; rolling, every frame.
    if (!rolling) {
      idle.current += 1
      if (idle.current > 1 && idle.current % IDLE_EVERY !== 0) return
    } else idle.current = 0
    const far = getQuality().viewDistance
    const now = performance.now()
    const lastStage = STAGES.length - 1
    // Too strong for you: rolling, for the Fat behind the roll; in the lobby, for yours.
    const fat = rolling ? push.power : getGame().profile.fat
    const flutter = rolling ? state.clock.elapsedTime * 7 : 0
    let repainted = false
    let i = 0

    for (const tape of TAPES) {
      const brokenAt = rolling && push.tapesBroken.includes(tape.stage) ? push.tapeAt[tape.stage] : 0
      trackPoint(tape.meter, 0, 0, _p)
      if (_p.distanceTo(state.camera.position) > far) continue
      const age = brokenAt ? (now - brokenAt) / 1000 : 0
      const breakX = brokenAt ? push.tapeBreakX[tape.stage] : 0
      // A belly pressing in (only yours: you roll the tapes you see) bows the bands out,
      // round the ball, up to as far as they stretch.
      const press = rolling && !brokenAt && push.phase !== 'top' ? push.meter + push.radius - tape.meter : 0
      const bow = Math.min(TAPE_STRETCH, Math.max(0, press))
      const width = BOW_WIDTH * Math.max(0.6, push.radius)
      // Snapped: how far each half has swung down off its post (radians), bouncing.
      const swing = brokenAt ? (Math.PI / 2) * (1 - Math.exp(-SWING_RATE * age) * Math.cos(SWING_BOUNCE * age)) : 0
      const tilt = tiltAt(tape.meter)
      const bands = bandsOf(tape.stage)
      const last = tape.stage === lastStage
      const locked = tape.need > fat

      for (let band = 0; band < bands; band += 1) {
        const h = BOTTOM + band * STEP
        for (let seg = 0; seg < SEGMENTS; seg += 1) {
          if (i >= MAX_INSTANCES) break
          const x = -HALF_SPAN + (seg + 0.5) * SEG
          let meter = tape.meter
          let along = x
          let y = h
          let roll = 0
          let pitch = tilt
          if (brokenAt) {
            // Each half hangs off its own post: swung down `swing` from level, and what
            // would go through the floor lies on it instead, billowing on down the track.
            const side = x < breakX ? -1 : 1
            const fromPost = Math.abs(side * HALF_SPAN - x)
            along = side * HALF_SPAN - side * fromPost * Math.cos(swing)
            y = h - fromPost * Math.sin(swing)
            meter = tape.meter + 0.5 * Math.sin(swing) * (fromPost / SPAN)
            roll = side * swing
            if (y < FLOOR) {
              along -= side * (FLOOR - y) * 0.35
              y = FLOOR
              roll = 0
              pitch = tilt + Math.PI / 2
            }
          } else {
            // A touch of sag between the posts, a flutter as you roll, and pushed out
            // round your belly - the ends staying tied on.
            const ends = 1 - (x / HALF_SPAN) ** 4
            y -= SAG * (1 - (x / HALF_SPAN) ** 2)
            if (flutter) meter += Math.sin(flutter + x * 1.4 + band * 0.9) * FLUTTER * ends
            if (bow > 0) {
              const off = (x - push.x) / width
              meter += bow * Math.exp(-off * off) * ends
            }
          }
          trackPoint(meter, along, y, _p)
          _e.set(pitch, 0, roll)
          _q.setFromEuler(_e)
          // Stretched, the bands thin a little.
          _s.set(SEG * 1.04, BAND_H * (1 - 0.25 * (bow / TAPE_STRETCH)), BAND_T)
          tapes.setMatrixAt(i, _m.compose(_p, _q, _s))
          if (paint(tapes, colours, i, seg, band, tape.stage, last, locked)) repainted = true
          i += 1
        }
      }
    }

    tapes.count = i
    tapes.instanceMatrix.needsUpdate = true
    if (repainted && tapes.instanceColor) tapes.instanceColor.needsUpdate = true
  })

  return <primitive ref={ref} object={mesh} />
}
