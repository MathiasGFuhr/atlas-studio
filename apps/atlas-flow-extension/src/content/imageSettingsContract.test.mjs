import assert from 'node:assert/strict'
import {
  closedModelMatches,
  flowImageControlPlan,
  labelMatchesFlowControl,
  normalizeFlowImageSettings,
} from './imageSettingsContract.mjs'

const defaults = normalizeFlowImageSettings(null)
assert.equal(defaults.mode, 'image')
assert.equal(defaults.aspectRatio, '16:9')
assert.equal(defaults.modelLabel, 'Nano Banana 2.1')
assert.equal(defaults.reasoning, 'high')
assert.equal(defaults.outputs, 3)

const custom = normalizeFlowImageSettings({
  mode: 'video',
  aspectRatio: '9:16',
  modelKey: 'veo-3',
  reasoning: 'low',
  outputs: 4,
})
assert.equal(custom.mode, 'image')
assert.equal(custom.modelKey, 'nano-banana-2.1')
assert.equal(custom.reasoning, 'low')
assert.equal(custom.outputs, 4)

const plan = flowImageControlPlan({ aspectRatio: '1:1', reasoning: 'medium', outputs: 2 })
assert.equal(plan.aspectLabel, '1:1')
assert.deepEqual(plan.reasoningLabels, ['medio', 'medium'])
assert.deepEqual(plan.outputLabels, ['x2', '×2'])
assert.equal(labelMatchesFlowControl('Médio', plan.reasoningLabels), true)
assert.equal(labelMatchesFlowControl('Vídeo', plan.imageTabLabels), false)
assert.equal(labelMatchesFlowControl('x2', plan.outputLabels), true)

assert.equal(normalizeFlowImageSettings({ modelKey: 'nano-banana-pro' }).modelLabel, 'Nano Banana Pro')
assert.equal(
  normalizeFlowImageSettings({ modelKey: 'nano-banana-2-lite' }).modelLabel,
  'Nano Banana 2 Lite',
)
assert.equal(closedModelMatches('Nano Banana 2.1', 'Nano Banana 2.1'), true)
assert.equal(closedModelMatches('Nano Banana 2.1', 'Nano Banana 2 Lite'), false)
assert.equal(closedModelMatches('Nano Banana 2 Lite', 'Nano Banana 2.1'), false)
assert.equal(
  closedModelMatches('Nano Banana Pro Nano Banana 2 Lite Nano Banana 2.1', 'Nano Banana Pro'),
  false,
)

console.log('imageSettingsContract ok')
