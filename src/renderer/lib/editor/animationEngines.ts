/**
 * Engines de animação instalados no Atlas.
 * Presets scrubbable: `animationsCatalog`. Aqui ficam as libs runtime.
 */
import gsap from 'gsap'
import { animate as animeAnimate, createTimeline, stagger, utils } from 'animejs'
import { animate as motionAnimate, spring } from 'motion'

export const animationEngines = {
  gsap,
  anime: {
    animate: animeAnimate,
    createTimeline,
    stagger: stagger ?? utils.stagger,
    utils,
  },
  motion: {
    animate: motionAnimate,
    spring,
  },
} as const

export type AnimationEngineName = keyof typeof animationEngines
