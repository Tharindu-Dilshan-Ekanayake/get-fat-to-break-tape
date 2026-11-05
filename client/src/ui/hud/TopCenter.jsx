import { TUTORIAL } from '@shared/balance'
import { formatNumber } from '@shared/format'

import { useClearTop } from '../../bloxity/reserved'
import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { u } from './style'

const BANNER_GRADIENT = 'linear-gradient(180deg, #fff6a8 0%, #ffd52a 45%, #ff9c00 100%)'
const touch = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)

/**
 * What the guide tells a new player right now - its step, with the Fat to eat up to
 * where it asks for some, and how to start rolling when you're on the ROLL ZONE - until
 * the guide's done; after that, nothing. (Max level has its own call to rebirth, up top:
 * RebirthNotice.)
 */
function useHint() {
  const step = useGame((s) => s.profile.tutorialStep)
  const fat = useGame((s) => Math.floor(s.profile.fat))
  const atRollZone = useGame((s) => s.zone.pushZone)
  const hungry = useGame((s) => !(s.profile.fat > 0))
  const current = TUTORIAL[step]
  if (!current) return null
  if (atRollZone) {
    if (hungry) return { key: 'hungry', text: 'Eat some food first - Fat is what you roll on!' }
    return { key: 'roll', text: touch ? 'Hold the ROLL! button to roll down the hill!' : 'Hold E to roll down the hill!' }
  }
  if (current.fat && fat < current.fat) return { key: current.text, text: `${current.text} ${formatNumber(fat)}/${current.fat}` }
  return { key: current.text, text: current.text }
}

/**
 * The big hint under the level bar, as in the reference. A tutorial step stays up until
 * it's done; any other hint shows for about three seconds and fades (pp-hint), so it's
 * never in the way of playing. Keyed on the hint, so a new one starts it again. Paused
 * while the HUD is out of sight (rolling, a panel open), so a hint is never used up
 * unseen.
 */
export function TopCenter() {
  const hint = useHint()
  const hidden = useGame((s) => s.pushing || s.panel !== null)
  const clear = useClearTop(0.25, 0.75)
  if (!hint) return null

  return (
    <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ top: `max(${u(196)}, ${clear + 8}px)` }}>
      <div key={hint.key} className="pp-pet" style={{ fontSize: u(60), animationPlayState: hidden ? 'paused' : 'running' }}>
        <StrokeText stroke={u(12)} gradient={BANNER_GRADIENT}>
          {hint.text}
        </StrokeText>
      </div>
    </div>
  )
}

export default TopCenter
