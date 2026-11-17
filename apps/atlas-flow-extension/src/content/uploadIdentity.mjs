/**
 * Descoberta de identidade de upload (fonte de verdade para testes).
 * pageSensor.js deve espelhar estas regras no DOM real.
 *
 * Regra de card: o botão com o nome pode ser só um filho interno.
 * Expande ao contêiner exclusivo do asset (inclui imagem irmã),
 * sem subir a um ancestral que englobe vários assets.
 */

/**
 * @param {unknown} id
 * @returns {boolean}
 */
export function isLegitimateMediaId(id) {
  if (typeof id !== 'string') return false
  const value = id.trim()
  if (!value) return false
  if (value === '_gd' || value.startsWith('_')) return false
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return true
  }
  if (/^[a-zA-Z0-9-]{20,}$/.test(value) && !/[{}[\]"'=]/.test(value)) {
    return true
  }
  return false
}

/**
 * @param {unknown} tag
 * @returns {boolean}
 */
export function isExcludedAssetTag(tag) {
  const value = String(tag || '').toUpperCase()
  return (
    value === 'SCRIPT' ||
    value === 'STYLE' ||
    value === 'NOSCRIPT' ||
    value === 'META' ||
    value === 'LINK' ||
    value === 'TEMPLATE' ||
    value === 'HEAD'
  )
}

/**
 * @param {string|null|undefined} url
 * @returns {string|null}
 */
export function sanitizeMediaUrl(url) {
  if (!url || typeof url !== 'string') return null
  try {
    const parsed = new URL(url, 'https://flow.google.com')
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url.split('?')[0].slice(0, 160)
  }
}

/**
 * @param {{ tag?: string, attrs?: Record<string, string|null|undefined>, href?: string|null, src?: string|null }} node
 * @returns {{ id: string, source: string } | null}
 */
export function extractMediaIdentityFromNode(node) {
  if (!node || isExcludedAssetTag(node.tag)) return null
  const attrs = node.attrs || {}
  for (const key of ['data-media-id', 'data-asset-id', 'data-tile-id', 'data-entity-id']) {
    const value = attrs[key]
    if (isLegitimateMediaId(value)) return { id: String(value).trim(), source: key }
  }
  if (isLegitimateMediaId(attrs['data-id'])) {
    return { id: String(attrs['data-id']).trim(), source: 'data-id' }
  }

  const hrefOrSrc = String(attrs.href || attrs.src || node.href || node.src || '')
  if (hrefOrSrc) {
    const mediaPath = hrefOrSrc.match(
      /\/(?:media|asset|assets|file|ingredient|image)s?\/([a-zA-Z0-9_-]{6,})/i,
    )
    if (mediaPath && isLegitimateMediaId(mediaPath[1])) {
      return { id: mediaPath[1], source: 'url_path' }
    }
  }
  return null
}

/**
 * @param {string|null|undefined} name
 * @returns {string}
 */
export function fileNameStem(name) {
  return String(name || '')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '')
}

/**
 * @param {string} label
 * @param {string} fileName
 * @param {string} stem
 */
export function labelMatchesFile(label, fileName, stem) {
  const normalized = String(label || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  const compact = normalized.replace(/\s+/g, '')
  const file = String(fileName || '').toLowerCase()
  const fileHit =
    Boolean(file) && (normalized.includes(file) || compact.includes(file.replace(/\s+/g, '')))
  const stemHit = Boolean(stem) && compact.includes(stem)
  return { fileHit, stemHit, matched: fileHit || stemHit }
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function extractAssetFileNameHints(text) {
  const matches = String(text || '').match(
    /[a-z0-9][a-z0-9_-]*\.(?:png|jpe?g|webp|gif|heic|heif|mp4|mov|webm|m4v)/gi,
  )
  if (!matches) return []
  return [...new Set(matches.map((item) => item.toLowerCase()))]
}

/**
 * Multi-asset = referências DIFERENTES no mesmo contêiner.
 * Várias ocorrências do MESMO nome (rótulo + tooltip) NÃO são multi-asset.
 * Filho com nome + irmão IMG do mesmo arquivo NÃO são multi-asset.
 *
 * @param {{
 *   fileName: string,
 *   stem?: string,
 *   fileNames?: string[],
 *   mediaIds?: string[],
 *   foreignChildAssetCount?: number,
 *   childAssetCount?: number,
 * }} node
 */
export function classifyMultiAsset(node) {
  const fileName = String(node.fileName || '')
  const stem = node.stem || fileNameStem(fileName)
  const fileNames = [...new Set((node.fileNames || []).map((item) => String(item).toLowerCase()))]
  const ourNames = fileNames.filter((name) => labelMatchesFile(name, fileName, stem).matched)
  const otherNames = fileNames.filter((name) => !labelMatchesFile(name, fileName, stem).matched)
  const mediaIds = (node.mediaIds || []).filter(isLegitimateMediaId)
  // NÃO usar childAssetCount legado (contava nome+img do mesmo asset).
  const foreignChildAssetCount = Number(node.foreignChildAssetCount || 0)

  if (otherNames.length >= 1) {
    return {
      multi: true,
      reason: 'distinct_foreign_filenames',
      ourNames,
      otherNames,
      mediaIds,
      foreignChildAssetCount,
      detail: `Nomes distintos no contêiner: ours=${ourNames.join(',')} other=${otherNames.join(',')}`,
    }
  }

  if (foreignChildAssetCount > 0 && ourNames.length >= 1) {
    return {
      multi: true,
      reason: 'foreign_asset_child',
      ourNames,
      otherNames,
      mediaIds,
      foreignChildAssetCount,
      detail: `Há ${foreignChildAssetCount} filho(s) com nome/ID de outro asset.`,
    }
  }

  return {
    multi: false,
    reason: null,
    ourNames,
    otherNames,
    mediaIds,
    foreignChildAssetCount,
    detail:
      ourNames.length > 1
        ? 'Várias ocorrências do mesmo nome (ex.: card+tooltip) — um asset.'
        : 'Sem nomes estrangeiros; partes do mesmo card (nome+img) permitidas.',
  }
}

/**
 * Escolhe o contêiner exclusivo do asset na cadeia folha→raiz.
 * Para ao encontrar ancestral com referências DIFERENTES.
 *
 * @param {{
 *   fileName: string,
 *   stem?: string,
 *   chain: Array<{
 *     key: string,
 *     tag?: string,
 *     fileNames?: string[],
 *     mediaIds?: string[],
 *     foreignChildAssetCount?: number,
 *     childAssetCount?: number,
 *     label?: string,
 *   }>
 * }} input
 */
export function selectExclusiveAssetCard(input) {
  const fileName = String(input.fileName || '')
  const stem = input.stem || fileNameStem(fileName)
  const chain = Array.isArray(input.chain) ? input.chain : []
  if (chain.length === 0) return null

  let selected = chain[0]
  for (let index = 0; index < chain.length; index += 1) {
    const node = chain[index]
    const mediaIds = (Array.isArray(node.mediaIds) ? node.mediaIds : []).filter(isLegitimateMediaId)
    const classification = classifyMultiAsset({
      fileName,
      stem,
      fileNames: node.fileNames,
      mediaIds,
      foreignChildAssetCount: node.foreignChildAssetCount || 0,
    })

    if (classification.multi) {
      return {
        card: selected,
        stoppedAt: node.key,
        reason: 'multi_asset_ancestor',
        multiReason: classification.reason,
        multiDetail: classification.detail,
        classification,
      }
    }

    selected = node
    if (mediaIds.length === 1) {
      return {
        card: selected,
        stoppedAt: node.key,
        reason: 'exclusive_with_unique_id',
        classification,
      }
    }
  }

  return {
    card: selected,
    stoppedAt: selected.key,
    reason: 'exclusive_top',
  }
}

/**
 * Resolve identidade a partir de cards exclusivos (não de ancestrais multi-asset).
 *
 * @param {{
 *   fileName: string,
 *   cards?: Array<{
 *     key: string,
 *     label?: string,
 *     tag?: string,
 *     scopedNodes?: Array<{ tag?: string, attrs?: Record<string, string|null|undefined>, href?: string|null, src?: string|null }>,
 *     scopedIdentities?: Array<{ id: string, source?: string, tag?: string }>,
 *   }>,
 *   foreignNodes?: Array<{ tag?: string, label?: string, attrs?: Record<string, string|null|undefined> }>,
 *   multiAssetAncestorIds?: string[],
 * }} input
 */
export function resolveUploadIdentity(input) {
  const fileName = String(input.fileName || '')
  const stem = fileNameStem(fileName)
  const rejected = []
  const itemEvidence = []
  const acceptedIds = []

  for (const ancestorId of input.multiAssetAncestorIds || []) {
    rejected.push({
      reason: 'multi_asset_ancestor_ignored',
      key: ancestorId,
    })
  }

  for (const node of input.foreignNodes || []) {
    if (isExcludedAssetTag(node.tag)) {
      rejected.push({
        reason: 'excluded_tag',
        tag: node.tag,
        label: String(node.label || '').slice(0, 80),
      })
      continue
    }
    const extracted = extractMediaIdentityFromNode(node)
    if (!extracted && node.attrs?.['data-id'] === '_gd') {
      rejected.push({ reason: 'non_media_data_id', tag: node.tag, dataId: '_gd' })
    } else if (extracted) {
      rejected.push({
        reason: 'foreign_identity_ignored',
        tag: node.tag,
        id: extracted.id,
        source: extracted.source,
        label: String(node.label || '').slice(0, 80),
      })
    }
  }

  for (const card of input.cards || []) {
    if (isExcludedAssetTag(card.tag)) {
      rejected.push({ reason: 'excluded_asset_item_tag', tag: card.tag })
      continue
    }
    const label = String(card.label || '')
    const match = labelMatchesFile(label, fileName, stem)
    if (!match.matched) {
      rejected.push({
        reason: 'label_not_matched',
        label: label.slice(0, 80),
        key: card.key,
      })
      continue
    }

    /** @type {Array<{ id: string, source: string, tag?: string }>} */
    const scoped = []
    for (const entry of card.scopedIdentities || []) {
      if (isLegitimateMediaId(entry.id)) {
        scoped.push({
          id: String(entry.id).trim(),
          source: entry.source || 'scoped',
          tag: entry.tag,
        })
      } else {
        rejected.push({ reason: 'illegitimate_scoped_id', id: entry.id, tag: entry.tag })
      }
    }
    for (const node of card.scopedNodes || []) {
      if (isExcludedAssetTag(node.tag)) {
        rejected.push({ reason: 'excluded_scoped_tag', tag: node.tag })
        continue
      }
      const extracted = extractMediaIdentityFromNode(node)
      if (extracted) scoped.push({ ...extracted, tag: node.tag })
      else if (node.attrs?.['data-id']) {
        rejected.push({
          reason: 'non_media_data_id',
          tag: node.tag,
          dataId: String(node.attrs['data-id']).slice(0, 40),
        })
      }
    }

    const unique = [...new Set(scoped.map((entry) => entry.id))]
    itemEvidence.push({
      key: card.key || null,
      label: label.slice(0, 120),
      tag: card.tag || null,
      fileHit: match.fileHit,
      stemHit: match.stemHit,
      scopedMediaIds: scoped.map((entry) => ({
        id: entry.id,
        source: entry.source,
        tag: entry.tag || null,
      })),
      uniqueCount: unique.length,
    })
    if (unique.length === 1) acceptedIds.push(unique[0])
  }

  const uniqueAccepted = [...new Set(acceptedIds)]
  const withIdCount = itemEvidence.reduce(
    (sum, item) => sum + (item.uniqueCount > 0 ? item.uniqueCount : 0),
    0,
  )

  const evidence = {
    fileName,
    stem,
    assetItemCount: itemEvidence.length,
    withIdCount,
    items: itemEvidence,
    rejected: rejected.slice(0, 20),
    detailsTried: false,
    note: 'IDs apenas no card exclusivo do nome. Botão interno pode expandir a irmãos; ancestral multi-asset rejeitado.',
  }

  if (uniqueAccepted.length === 1 && itemEvidence.some((item) => item.uniqueCount === 1)) {
    return {
      ok: true,
      certainty: 'accepted',
      uploadState: 'uploaded_bound_evidence',
      flowMediaId: uniqueAccepted[0],
      error: null,
      evidence,
    }
  }

  if (itemEvidence.length >= 1) {
    return {
      ok: false,
      certainty: 'may_have_sent',
      uploadState: 'upload_uncertain_needs_reconcile',
      flowMediaId: null,
      error: 'UPLOAD_IDENTITY_UNCERTAIN',
      evidence,
      note: 'Nome no card exclusivo, sem identidade inequívoca. Detalhes/passivo podem seguir.',
    }
  }

  return {
    ok: false,
    certainty: 'may_have_sent',
    uploadState: 'upload_uncertain_needs_reconcile',
    flowMediaId: null,
    error: 'ASSET_ITEM_NOT_FOUND',
    evidence,
  }
}
