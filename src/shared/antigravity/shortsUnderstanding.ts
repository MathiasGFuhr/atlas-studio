import type { ShortsEditorialContext, ShortsProfile } from '../shorts'
import type { AudioFeatureAnalysis } from '../shorts/audioFeatures'
import { summarizeAudioEvents } from '../shorts/audioFeatures'
import type { VideoUnderstanding } from '../shorts/videoUnderstanding'
import { contentLanguagePromptBlock } from '../shortsLanguage'

export const VIDEO_UNDERSTANDING_SCHEMA = {
  type: 'object',
  properties: {
    language: { type: 'string', description: 'ISO do idioma falado/cantado (de, en, pt-BR...)' },
    contentType: { type: 'string', description: 'Tipo: live concert, studio performance, narrative documentary, etc.' },
    structure: { type: 'string', description: 'Estrutura temporal do vídeo' },
    majorMoments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          time: { type: 'number' },
          label: { type: 'string' },
        },
        required: ['time', 'label'],
      },
    },
    visualHighlights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          time: { type: 'number' },
          detail: { type: 'string' },
        },
        required: ['time', 'detail'],
      },
    },
    audioHighlights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          time: { type: 'number' },
          detail: { type: 'string' },
        },
        required: ['time', 'detail'],
      },
    },
    narrativeArc: { type: 'string' },
  },
  required: ['contentType', 'structure'],
}

export function buildVideoUnderstandingPrompt(input: {
  profile: ShortsProfile
  duration: number
  fileName: string
  mediaPath: string | null
  watchedVideo: boolean
  keyframeIndex?: Array<{ time: number; path: string }>
  audio?: AudioFeatureAnalysis | null
  transcriptPreview?: string
  editorial?: ShortsEditorialContext
}): string {
  const profileLabel = input.profile === 'music' ? 'MÚSICA' : 'HISTÓRIA'
  const mediaRules = input.watchedVideo && input.mediaPath
    ? [
        `Há um proxy de análise em: ${input.mediaPath}`,
        'ASSISTA e OUÇA esse arquivo. Não escolha cortes ainda.',
        'Observe performance, cenas, luz, plateia, edição, dinâmica musical/narrativa.',
        'Se não entender a letra, descreva a performance sem inventar tema político/social.',
      ]
    : [
        'Você NÃO recebeu o vídeo completo. Não diga que assistiu ao vídeo.',
        'Use frames-chave, áudio local e transcrição para compreender a estrutura.',
        input.keyframeIndex?.length
          ? `Frames representativos:\n${input.keyframeIndex.map((item) => `  ${item.time.toFixed(1)}s → ${item.path}`).join('\n')}`
          : 'Sem frames extraídos.',
      ]

  const musicAsk =
    input.profile === 'music'
      ? [
          'No perfil Música descreva: cantor, banda, público, luz, solo, refrão, clímax, entrada/saída de instrumentos, emoção da performance.',
        ]
      : [
          'No perfil História descreva: fala, B-roll, texto na tela, revelação, pergunta/resposta, clímax narrativo, unidade de pensamento.',
        ]

  return [
    'Você é editor audiovisual do Atlas Studio. Etapa 1: VideoUnderstanding.',
    `Perfil: ${profileLabel}.`,
    `Arquivo original (não alterar): ${input.fileName}`,
    `videoDuration: ${input.duration.toFixed(1)}`,
    ...mediaRules,
    ...musicAsk,
    'Não invente significado que o conteúdo não mostra.',
    input.transcriptPreview ? `Transcrição (fonte auxiliar):\n${input.transcriptPreview}` : 'Transcrição: (indisponível ou parcial)',
    input.audio ? `Eventos de áudio locais: ${summarizeAudioEvents(input.audio, 20)}` : '',
    input.editorial?.contentLanguage
      ? contentLanguagePromptBlock({
          contentLanguage: input.editorial.contentLanguage,
          languageName: input.editorial.languageName,
        })
      : 'Detecte language a partir do áudio/fala/texto visível.',
    'Não escolha Shorts nesta etapa. Só descreva o vídeo como um todo.',
    'Responda só no JSON do schema.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildCandidateProposalPrompt(input: {
  profile: ShortsProfile
  duration: number
  clipCount: number
  requestedDuration: number
  durationMode: string
  fileName: string
  mediaPath: string | null
  watchedVideo: boolean
  understanding: VideoUnderstanding
  keyframeIndex?: Array<{ time: number; path: string }>
  audioSummary?: string
  transcriptPreview?: string
  localHints?: string
}): string {
  const profileLabel = input.profile === 'music' ? 'MÚSICA' : 'HISTÓRIA'
  const watch = input.watchedVideo && input.mediaPath
    ? `O proxy audiovisual está em ${input.mediaPath}. Use o que você viu/ouviu + a compreensão global.`
    : 'Você não assistiu ao vídeo completo. Combine frames, áudio e transcrição. Não afirme que assistiu ao arquivo original.'

  const profileRules =
    input.profile === 'music'
      ? 'Prefira momentos de performance: refrão, solo, clímax, entrada vocal, plateia, mudança de dinâmica, final. Não escolha só o trecho mais alto.'
      : 'Prefira unidades narrativas: gancho, revelação, pergunta, resposta, clímax, conclusão que funciona sozinha.'

  return [
    'Você é editor de YouTube Shorts do Atlas Studio. Etapa 2: candidatos.',
    `Perfil: ${profileLabel}.`,
    `Arquivo: ${input.fileName}`,
    `videoDuration: ${input.duration.toFixed(1)}`,
    `O usuário pediu ${input.clipCount} Shorts de ~${input.requestedDuration}s (${input.durationMode}). A camada local tenta cumprir a quantidade, mas nunca com cortes repetidos ou quase iguais.`,
    'Rankeie candidatos fortes e temporalmente distintos. Prefira centros diferentes (início, meio, fim).',
    `Devolva um pool grande, cerca de ${Math.max(input.clipCount + 6, input.clipCount * 3)} janelas diferentes. Não decida a quantidade final.`,
    'Não escolha só os melhores no mesmo clímax. Cada candidato precisa ter um núcleo editorial próprio (abertura, virada, clímax, plateia, encerramento).',
    'Não proponha o mesmo momento com alguns segundos de diferença. 00:05–00:50 e 00:11–00:56 são o mesmo Short.',
    'Se o vídeo não tiver material distinto o bastante, devolva menos candidatos fortes. Nunca preencha quantidade com clones.',
    watch,
    'Compreensão global já feita:',
    formatMiniUnderstanding(input.understanding),
    profileRules,
    'Cada candidato precisa de: start, end, type, reason, visualReason, audioReason.',
    'Score dimensions (0-100): openingStrength, standaloneClarity, payoff, visualValue, audioValue, retentionPotential, conclusion, durationFit, originality.',
    'Não invente letra, mensagem política ou fatos que não estejam no trecho.',
    'start >= 0 e end <= videoDuration. Cortes temporalmente distintos; overlap leve só quando o vídeo for curto demais para caber sem cruzar.',
    input.audioSummary ? `Áudio local: ${input.audioSummary}` : '',
    input.transcriptPreview ? `Transcrição auxiliar:\n${input.transcriptPreview}` : '',
    input.localHints ? `Sinais locais (não são a escolha final):\n${input.localHints}` : '',
    input.keyframeIndex?.length
      ? `Frames:\n${input.keyframeIndex.map((item) => `  ${item.time.toFixed(1)}s → ${item.path}`).join('\n')}`
      : '',
    'Responda só no JSON do schema.',
  ]
    .filter(Boolean)
    .join('\n')
}

function formatMiniUnderstanding(value: VideoUnderstanding): string {
  return [
    value.language && `language: ${value.language}`,
    value.contentType && `contentType: ${value.contentType}`,
    value.structure && `structure: ${value.structure}`,
    value.narrativeArc && `narrativeArc: ${value.narrativeArc}`,
  ]
    .filter(Boolean)
    .join('\n')
}

export const SHORTS_CANDIDATE_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          start: { type: 'number' },
          end: { type: 'number' },
          type: { type: 'string' },
          reason: { type: 'string' },
          visualReason: { type: 'string' },
          audioReason: { type: 'string' },
          score: { type: 'integer' },
          dimensions: {
            type: 'object',
            properties: {
              openingStrength: { type: 'integer' },
              standaloneClarity: { type: 'integer' },
              payoff: { type: 'integer' },
              visualValue: { type: 'integer' },
              audioValue: { type: 'integer' },
              retentionPotential: { type: 'integer' },
              conclusion: { type: 'integer' },
              durationFit: { type: 'integer' },
              originality: { type: 'integer' },
            },
          },
        },
        required: ['start', 'end', 'reason'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['candidates'],
}
