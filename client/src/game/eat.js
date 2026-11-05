import { sfx } from '../audio/sfx'
import { actions } from '../net/actions'
import { push } from './push/pushControl'
import { runtime } from './runtime'

/**
 * One bite: the hand to the mouth and the chomp straight away, the "+N Fat" when the
 * authority answers. Every click, tap, the EAT button and Auto Eat come through here.
 * Mid-run your Fat is already spoken for, so there's nothing to eat until you're back.
 */
export function eat() {
  if (push.active) return
  runtime.player.ateAt = performance.now()
  sfx.chomp()
  actions.eat()
}
