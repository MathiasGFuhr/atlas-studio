/** Instruções canônicas dos botões rápidos da tela "Roteiro pronto". */
export const QUICK_ADJUST_INSTRUCTIONS = {
  'Mais emoção':
    'Revise o roteiro atual para aumentar o impacto emocional de forma natural e apropriada ao nicho. Preserve fatos, idioma, tema e estrutura quando funcionarem. Não invente acontecimentos ou emoções.',
  'Mais retenção':
    'Revise o roteiro atual para aumentar a retenção. Preserve todos os fatos, tema, idioma, identidade editorial e informações corretas. Fortaleça o hook quando necessário, melhore progressão, ritmo, curiosidade e transições, elimine redundâncias e trechos lentos. Não transforme o texto em sensacionalismo e não invente informações.',
  'Mais curto':
    'Reduza o roteiro atual mantendo os fatos, argumento, idioma e partes essenciais. Elimine redundâncias e explicações dispensáveis sem destruir contexto ou coerência.',
} as const

export type QuickAdjustLabel = keyof typeof QUICK_ADJUST_INSTRUCTIONS

export function resolveAdjustInstruction(instruction: string): string {
  const trimmed = instruction.trim()
  if (!trimmed) return trimmed
  if (trimmed in QUICK_ADJUST_INSTRUCTIONS) {
    return QUICK_ADJUST_INSTRUCTIONS[trimmed as QuickAdjustLabel]
  }
  return trimmed
}

export function instructionRequestsTitleChange(instruction: string): boolean {
  return /\b(renomeie|mude o t[ií]tulo|altere o t[ií]tulo|troque o t[ií]tulo|novo t[ií]tulo|muda o t[ií]tulo)\b/i.test(
    instruction,
  )
}

export function instructionRequestsLanguageChange(instruction: string): boolean {
  return /\b(traduz(a|ir)?|tradu[çc][aã]o|mude o idioma|altere o idioma|passe (para|pro|pra))\b/i.test(
    instruction,
  )
}
