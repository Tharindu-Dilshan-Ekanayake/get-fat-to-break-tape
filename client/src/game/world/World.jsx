import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'

import { useGame } from '../../store/game'
import { useQuality } from '../../store/quality'
import { asToyInstance, BlockSet, disposeBlocks, PropBuilder } from '../blocks'
import { glowTime } from '../glow'
import { createToyMaterial, sharedMaterials, toyTime } from '../materials'
import { buildNeonTrims, buildRunway, createGroundGeometry, createGroundMap } from './ground'
import { buildEggStands } from './eggs'
import { buildFoodCourts } from './foodCourts'
import { buildGarden } from './garden'
import { buildLawnCurbs } from './lawns'
import { lobbyPalette } from './palette'
import { buildPortalFrame } from './portalFrame'
import { buildPushZone } from './pushZone'
import { createPaintedSigns } from './signs'
import { buildFoodHut, buildStands, buildStatue, buildTownSquare } from './structures'
import { buildTerrain } from './terrain'
import { buildWaterfall } from './waterfall'

/**
 * The static lobby, "Snack Town": ground plane, every box (mountains, trees, the Food
 * Courts' restaurants, the food shop's hut, the champion's square, stands, the statue,
 * lawns' kerbs, the runway's chevrons) in one InstancedMesh, and every non-box prop
 * (round plinths and flower beds, the egg stands' wings, the statue's body, the giant
 * foods on the roofs and the hut's counter...) merged into one mesh. Three draw calls
 * for the whole environment.
 *
 * Built once per world: World 1 is the bright day town, World 2 the same town by night
 * as a neon diner in space (palette.js). Stepping through the portal changes the world
 * behind a fade to black, and the lobby is rebuilt in the other palette then (the old
 * one disposed). Quality only decides tree density and detail at build time, and
 * whether the result casts/receives realtime shadows.
 */
export function World() {
  const shadows = useQuality((s) => s.settings.shadows === 'realtime')
  const world = useGame((s) => s.profile.world)
  const [signs, setSigns] = useState([])

  // Drives every animated toy-material style (water...).
  useFrame((state) => {
    toyTime.value = state.clock.elapsedTime
    glowTime.value = state.clock.elapsedTime
  })

  useEffect(() => {
    let made = []
    let cancelled = false
    const dispose = (list) => {
      for (const sign of list) {
        sign.geometry.dispose()
        sign.material.dispose()
        sign.texture.dispose()
      }
    }
    createPaintedSigns(useQuality.getState().settings.maxTexture).then((list) => {
      if (cancelled) {
        dispose(list)
        return
      }
      made = list
      setSigns(list)
    })
    return () => {
      cancelled = true
      dispose(made)
    }
  }, [])

  const { blocks, ground, props } = useMemo(() => {
    performance.mark('pp:world-start')
    const { decorDensity, maxTexture } = useQuality.getState().settings
    const palette = lobbyPalette(world)
    const set = new BlockSet()
    buildTerrain(set, { treeDensity: decorDensity, palette })
    buildLawnCurbs(set, palette)
    buildRunway(set, palette)
    buildNeonTrims(set, palette)
    // LOW leaves out the small stuff: jars, knobs, cups' straws, bulbs, a few flowers.
    const detail = decorDensity >= 0.75
    const propBuilder = new PropBuilder()
    buildFoodCourts(set, propBuilder, { detail, palette })
    buildFoodHut(set, propBuilder, { detail, palette })
    buildTownSquare(set, propBuilder, { detail, palette })
    buildGarden(set, propBuilder, { detail, palette })
    buildPushZone(set, { world })
    buildStands(set)
    buildStatue(set, propBuilder, { palette })
    buildPortalFrame(set)
    buildWaterfall(set, palette)
    buildEggStands(set, propBuilder)

    const map = createGroundMap(maxTexture, palette)
    const groundMaterial = createToyMaterial({ instanced: false, vertexColors: false, map, studScale: 2 })

    performance.mark('pp:world-end')
    return {
      blocks: set.build(sharedMaterials().blocks),
      props: asToyInstance(propBuilder.build(), sharedMaterials().toy),
      ground: { geometry: createGroundGeometry(), material: groundMaterial, map },
    }
  }, [world])

  // Frees the last world's lobby when it's rebuilt (and this one on unmount).
  useEffect(
    () => () => {
      disposeBlocks(blocks)
      props.geometry.dispose()
      props.dispose()
      ground.geometry.dispose()
      ground.material.dispose()
      ground.map.dispose()
    },
    [blocks, ground, props],
  )

  return (
    <>
      <mesh geometry={ground.geometry} material={ground.material} receiveShadow={shadows} />
      <primitive object={blocks} castShadow={shadows} receiveShadow={shadows} />
      <primitive object={props} castShadow={shadows} receiveShadow={shadows} />
      {signs.map((sign) => (
        <mesh key={sign.texture.uuid} geometry={sign.geometry} material={sign.material} position={sign.position} rotation={sign.rotation} renderOrder={1} />
      ))}
    </>
  )
}

export default World
