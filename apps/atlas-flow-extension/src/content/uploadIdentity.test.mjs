import assert from 'node:assert/strict'
import {
  classifyMultiAsset,
  isLegitimateMediaId,
  resolveUploadIdentity,
  selectExclusiveAssetCard,
} from './uploadIdentity.mjs'

assert.equal(isLegitimateMediaId('_gd'), false)

// Mesmo nome repetido (card + tooltip) NÃO é multi-asset
{
  const c = classifyMultiAsset({
    fileName: 'atlas-ref-b.png',
    fileNames: ['atlas-ref-b.png', 'atlas-ref-b.png'],
    mediaIds: ['2f47b3d1-67d2-40e9-8206-ca8b59b1b0fc'],
    foreignChildAssetCount: 0,
  })
  assert.equal(c.multi, false)
  assert.match(c.detail, /mesmo nome|mesmo card/i)
}

// Nome no botão + ID na IMG irmã (mesmo card) — childAssetCount antigo seria 2; agora não é multi
{
  const c = classifyMultiAsset({
    fileName: 'atlas-ref-b.png',
    fileNames: ['atlas-ref-b.png'],
    mediaIds: ['2f47b3d1-67d2-40e9-8206-ca8b59b1b0fc'],
    // legado: contava botão+img como 2; foreignChildAssetCount deve ser 0
    childAssetCount: 0,
    foreignChildAssetCount: 0,
  })
  assert.equal(c.multi, false)

  const selection = selectExclusiveAssetCard({
    fileName: 'atlas-ref-b.png',
    chain: [
      {
        key: 'button',
        fileNames: ['atlas-ref-b.png'],
        mediaIds: [],
        foreignChildAssetCount: 0,
      },
      {
        key: 'card-b',
        fileNames: ['atlas-ref-b.png', 'atlas-ref-b.png'], // tooltip + label
        mediaIds: ['2f47b3d1-67d2-40e9-8206-ca8b59b1b0fc'],
        foreignChildAssetCount: 0,
        childAssetCount: 2, // se legado errado ainda viesse, classify usa foreign*
      },
      {
        key: 'grid',
        fileNames: ['atlas-ref-a.png', 'atlas-ref-b.png'],
        mediaIds: ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '2f47b3d1-67d2-40e9-8206-ca8b59b1b0fc'],
        foreignChildAssetCount: 1,
      },
    ],
  })
  assert.equal(selection.card.key, 'card-b')
  assert.equal(selection.reason, 'exclusive_with_unique_id')
}

// Nomes distintos / card vizinho → multi e rejeição
{
  const c = classifyMultiAsset({
    fileName: 'atlas-ref-b.png',
    fileNames: ['atlas-ref-a.png', 'atlas-ref-b.png'],
    mediaIds: ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'],
    foreignChildAssetCount: 1,
  })
  assert.equal(c.multi, true)
  assert.equal(c.reason, 'distinct_foreign_filenames')

  const result = resolveUploadIdentity({
    fileName: 'atlas-ref-b.png',
    cards: [
      {
        key: 'card-b',
        label: 'atlas-ref-b.png',
        scopedNodes: [{ tag: 'BUTTON', attrs: {} }],
      },
    ],
    foreignNodes: [
      {
        tag: 'IMG',
        attrs: { 'data-media-id': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
      },
    ],
    multiAssetAncestorIds: ['grid'],
  })
  assert.equal(result.ok, false)
  assert.equal(result.flowMediaId, null)
}

// Associação inequívoca no mesmo card
{
  const mediaId = '2f47b3d1-67d2-40e9-8206-ca8b59b1b0fc'
  const result = resolveUploadIdentity({
    fileName: 'atlas-ref-b.png',
    cards: [
      {
        key: 'card-b',
        label: 'imageatlas-ref-b.pngImage',
        scopedNodes: [
          { tag: 'BUTTON', attrs: {} },
          { tag: 'IMG', attrs: { 'data-media-id': mediaId } },
        ],
      },
    ],
  })
  assert.equal(result.ok, true)
  assert.equal(result.flowMediaId, mediaId)
}

console.log('uploadIdentity.test.mjs OK')
