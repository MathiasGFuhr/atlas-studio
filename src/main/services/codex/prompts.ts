import path from 'node:path'

/**
 * Prompts mínimos — a skill no cwd/workspace é a autoridade.
 * Não embutir o SKILL.md inteiro aqui.
 */

export function buildGeneratePrompt(input: {
  nicheName: string
  language: string
  topic: string
  skillRelativeHint: string
  memoryNotes: string
  durationMinutes?: number
}): string {
  const durationLine =
    input.durationMinutes != null
      ? `\nDuração aproximada de referência: ${input.durationMinutes} minutos.`
      : ''

  return `Use a skill existente neste workspace como autoridade editorial.
Skill a seguir: ${input.skillRelativeHint}
Nicho: ${input.nicheName}

Tema:
${input.topic}

Idioma final:
${input.language}
${durationLine}

Consulte os roteiros anteriores disponibilizados abaixo para evitar repetição estrutural, lexical ou narrativa (hooks, arquitetura, transições, encerramento, frases e ritmo).

Roteiros anteriores (somente referência — não modificar esses arquivos):
${input.memoryNotes}

Execute o workflow completo definido pela skill.
Entregue somente o roteiro final completo, no idioma ${input.language}.
Sem prefácios, sem meta-comentários, sem JSON.`
}

export function buildAdjustPrompt(input: {
  nicheName: string
  language: string
  topic: string
  title: string
  instruction: string
  currentScript: string
  skillRelativeHint: string
  memoryNotes: string
}): string {
  return `Esta é uma REVISÃO do roteiro já existente. Não é geração de episódio novo.

Use a skill existente neste workspace apenas como autoridade editorial de qualidade (tom, rigor factual, linguagem).
Skill de referência: ${input.skillRelativeHint}
Nicho: ${input.nicheName}
Tema (não alterar): ${input.topic}
Título (não alterar, a menos que a instrução peça isso explicitamente): ${input.title}

Idioma OBRIGATÓRIO de saída: ${input.language}
Ignore o idioma padrão do nicho. Não traduza. Não mude o idioma.

PROIBIDO:
- criar um novo episódio, dossiê, ledger ou pasta de roteiro
- executar o fluxo completo de geração da skill (pesquisa + arquitetura nova + arquivo novo)
- gravar arquivos no disco
- inventar fatos
- mudar o título a partir de headings do texto

Faça somente a revisão pedida sobre o texto abaixo.
Preserve fatos, tema, identidade editorial e informações corretas.
Entregue somente o roteiro completo atualizado, no idioma ${input.language}.
Sem prefácios, sem meta-comentários, sem JSON.

Instrução de revisão:
${input.instruction}

Contexto editorial (não copiar padrões; não gerar episódio novo):
${input.memoryNotes}

Roteiro atual a revisar:
---
${input.currentScript}
---`
}

export function extractTitle(content: string, fallbackTopic: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  for (const line of lines.slice(0, 8)) {
    const cleaned = line
      .replace(/^#+\s*/, '')
      .replace(/^\d+\.\s*/, '')
      .replace(/^\*\*|\*\*$/g, '')
      .trim()
    if (cleaned.length > 8 && cleaned.length < 120 && !/^abertura$/i.test(cleaned)) {
      if (!/^(roteiro|script|opening|abertura)\b/i.test(cleaned)) {
        return cleaned
      }
    }
  }

  return fallbackTopic.length > 80 ? `${fallbackTopic.slice(0, 77)}...` : fallbackTopic
}

export function estimateDuration(content: string): number {
  const words = content.split(/\s+/).filter(Boolean).length
  return Math.max(8, Math.min(40, Math.round(words / 140)))
}

/** Raiz do projeto editorial (pai de /roteiros ou da skill). */
export function resolveProjectRoot(skillPath: string, scriptsPath?: string | null): string {
  const scripts = scriptsPath?.trim()
  if (scripts) {
    const resolved = path.resolve(scripts)
    const base = path.basename(resolved).toLowerCase()
    if (base === 'roteiros' || base === 'scripts') {
      return path.dirname(resolved)
    }
    return resolved
  }
  return path.dirname(path.resolve(skillPath))
}
