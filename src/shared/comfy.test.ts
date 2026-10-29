import { describe, expect, it } from 'vitest'
import {
  buildComfySceneWorkflow,
  COMFY_DOWNLOAD_SUBDIR,
  comfyOutputTrimSeconds,
  comfyRunpodProxyUrl,
  detectComfyWorkflowMapping,
  estimateComfyTiming,
  formatComfyDuration,
  jobsToSubmit,
  normalizeComfyBaseUrl,
  sceneOutputFileName,
  normalizeComfyConfig,
  parseComfyWorkflow,
  pickComfyVideoOutput,
  pickRunpodComfyPod,
  planComfyScenes,
  podIdFromComfyUrl,
  type ComfyApiWorkflow,
  type ComfyJobStatus,
} from './comfy'

/** Os nós que importam do `video_ltx2_3_ia2v.json` (LTX 2.3, imagem + áudio → vídeo). */
function ltxWorkflow(): ComfyApiWorkflow {
  return {
    '269': { inputs: { image: 'cactus_man.png' }, class_type: 'LoadImage', _meta: { title: 'Carregar Imagem' } },
    '276': { inputs: { audio: 'ltx_23_audio.mp3' }, class_type: 'LoadAudio', _meta: { title: 'Carregar Áudio' } },
    '341': {
      inputs: { filename_prefix: 'video/LTX_2.3_ia2v', format: 'auto', codec: 'auto', video: ['340:312', 0] },
      class_type: 'SaveVideo',
      _meta: { title: 'Salvar Vídeo' },
    },
    '340:285': { inputs: { noise_seed: 42 }, class_type: 'RandomNoise', _meta: { title: 'Ruído Aleatório' } },
    '340:286': { inputs: { noise_seed: 225158785956033 }, class_type: 'RandomNoise', _meta: { title: 'Ruído Aleatório' } },
    '340:314': {
      inputs: { text: 'pc game, console game, video game, cartoon, childish, ugly', clip: ['340:318', 0] },
      class_type: 'CLIPTextEncode',
      _meta: { title: 'Codificação de Texto CLIP (Prompt)' },
    },
    '340:319': { inputs: { value: 'The fuzzy cactus creature…' }, class_type: 'PrimitiveStringMultiline', _meta: { title: 'Prompt' } },
    '340:331': { inputs: { value: 9 }, class_type: 'PrimitiveFloat', _meta: { title: 'Duration' } },
    '340:323': { inputs: { value: 24 }, class_type: 'PrimitiveInt', _meta: { title: 'Frame Rate' } },
    '340:305': { inputs: { value: false }, class_type: 'PrimitiveBoolean', _meta: { title: 'Switch to Text to Video?' } },
    '340:346': {
      inputs: { prompt: ['340:319', 0], 'sampling_mode.seed': 0 },
      class_type: 'TextGenerateLTX2Prompt',
      _meta: { title: 'TextGenerateLTX2Prompt' },
    },
    '340:349': { inputs: { value: true }, class_type: 'PrimitiveBoolean', _meta: { title: 'Boolean (Enable Prompt Enhance)' } },
  }
}

describe('parseComfyWorkflow', () => {
  it('aceita o formato API', () => {
    expect(Object.keys(parseComfyWorkflow(JSON.stringify(ltxWorkflow())))).toContain('340:319')
  })

  it('recusa o workflow normal e JSON inválido com mensagem clara', () => {
    expect(() => parseComfyWorkflow(JSON.stringify({ nodes: [], links: [] }))).toThrow('Export (API)')
    expect(() => parseComfyWorkflow('{')).toThrow('JSON válido')
    expect(() => parseComfyWorkflow(JSON.stringify({ a: 1 }))).toThrow('formato API')
  })
})

describe('detectComfyWorkflowMapping', () => {
  it('encontra os nós do workflow LTX pelo tipo e pelo título', () => {
    expect(detectComfyWorkflowMapping(ltxWorkflow())).toEqual({
      imageNode: '269',
      audioNode: '276',
      promptNode: '340:319',
      promptField: 'value',
      durationNode: '340:331',
      saveNode: '341',
      seedNodes: [
        { node: '340:285', field: 'noise_seed' },
        { node: '340:286', field: 'noise_seed' },
      ],
      enhanceNode: '340:349',
    })
  })

  it('avisa quando falta um nó obrigatório', () => {
    const workflow = ltxWorkflow()
    delete workflow['276']
    expect(() => detectComfyWorkflowMapping(workflow)).toThrow('LoadAudio')
    const noDuration = ltxWorkflow()
    noDuration['340:331']._meta = { title: 'Tempo' }
    expect(() => detectComfyWorkflowMapping(noDuration)).toThrow('Duration')
  })
})

describe('buildComfySceneWorkflow', () => {
  it('preenche a cena, desliga o Prompt Enhance e não altera o modelo', () => {
    const template = ltxWorkflow()
    const mapping = detectComfyWorkflowMapping(template)
    const workflow = buildComfySceneWorkflow(template, mapping, {
      imageName: 'atlas_abc_cena-06.png',
      audioName: 'atlas_abc_cena-06.mp3',
      prompt: 'Cantor no palco, luz quente',
      duration: 22,
      seed: 1000,
      outputPrefix: 'atlas/abc/cena-06',
    })
    expect(workflow['269'].inputs.image).toBe('atlas_abc_cena-06.png')
    expect(workflow['276'].inputs.audio).toBe('atlas_abc_cena-06.mp3')
    expect(workflow['340:319'].inputs.value).toBe('Cantor no palco, luz quente')
    expect(workflow['340:331'].inputs.value).toBe(22)
    expect(workflow['341'].inputs.filename_prefix).toBe('atlas/abc/cena-06')
    expect(workflow['340:285'].inputs.noise_seed).toBe(1000)
    expect(workflow['340:286'].inputs.noise_seed).toBe(1001)
    expect(workflow['340:349'].inputs.value).toBe(false)
    expect(workflow['340:305'].inputs.value).toBe(false)
    expect(workflow['340:314'].inputs.text).toContain('pc game')
    expect(template['340:349'].inputs.value).toBe(true)
    expect(template['269'].inputs.image).toBe('cactus_man.png')
  })
})

describe('jobsToSubmit', () => {
  const job = (sceneNumber: number, status: ComfyJobStatus) => ({ sceneNumber, status })

  it('enche a janela até o limite, na ordem das cenas', () => {
    const jobs = [job(3, 'pending'), job(1, 'pending'), job(2, 'pending'), job(4, 'pending')]
    expect(jobsToSubmit(jobs, 2).map((entry) => entry.sceneNumber)).toEqual([1, 2])
  })

  it('cena baixando ou pronta libera a vaga; enviada ou na fila ocupa', () => {
    const jobs = [
      job(1, 'downloading'),
      job(2, 'queued'),
      job(3, 'queued'),
      job(4, 'uploading'),
      job(5, 'queued'),
      job(6, 'pending'),
      job(7, 'pending'),
    ]
    expect(jobsToSubmit(jobs, 5).map((entry) => entry.sceneNumber)).toEqual([6])
    expect(jobsToSubmit(jobs, 4)).toEqual([])
  })

  it('desconta cenas de outros projetos que já estão no ComfyUI', () => {
    const jobs = [job(1, 'pending'), job(2, 'pending'), job(3, 'pending')]
    expect(jobsToSubmit(jobs, 5, 4).map((entry) => entry.sceneNumber)).toEqual([1])
    expect(jobsToSubmit(jobs, 5, 5)).toEqual([])
  })
})

describe('pickComfyVideoOutput', () => {
  it('prefere o vídeo do nó SaveVideo', () => {
    const outputs = {
      '340:347': { text: ['prompt'] },
      '341': { images: [{ filename: 'cena-06_00001_.mp4', subfolder: 'atlas/abc', type: 'output' }], animated: [true] },
    }
    expect(pickComfyVideoOutput(outputs, '341')).toEqual({
      filename: 'cena-06_00001_.mp4',
      subfolder: 'atlas/abc',
      type: 'output',
    })
  })

  it('sem vídeo retorna null', () => {
    expect(pickComfyVideoOutput({ '9': { images: [{ filename: 'preview.png' }] } }, '341')).toBeNull()
    expect(pickComfyVideoOutput(undefined, '341')).toBeNull()
  })
})

describe('planComfyScenes', () => {
  const ref = (id: string, patch: Partial<{ imagePath: string; audioPath: string; audioDuration: number | null; prompt: string }> = {}) => ({
    id,
    imagePath: `C:/cenas/${id}.png`,
    audioPath: `C:/cenas/${id}.mp3`,
    audioDuration: 21.4,
    prompt: 'Cantando',
    ...patch,
  })

  it('numera pela posição e calcula a duração com a folga', () => {
    const { scenes, problems } = planComfyScenes([ref('a'), ref('b', { audioDuration: 8.2 })], 1)
    expect(problems).toEqual([])
    expect(scenes.map((scene) => [scene.sceneNumber, scene.refId, scene.duration])).toEqual([
      [1, 'a', 22],
      [2, 'b', 9],
    ])
  })

  it('deixa de fora cenas incompletas sem mudar a numeração das outras', () => {
    const { scenes, problems } = planComfyScenes(
      [ref('a'), ref('b', { audioPath: '', audioDuration: null }), ref('c', { prompt: '  ' })],
      1,
    )
    expect(scenes.map((scene) => scene.sceneNumber)).toEqual([1])
    expect(problems).toEqual(['Cena 02: falta áudio', 'Cena 03: falta prompt'])
  })
})

describe('comfyOutputTrimSeconds', () => {
  it('corta a folga do Comfy no tempo real do áudio', () => {
    expect(comfyOutputTrimSeconds(22, 21.4)).toBe(21.4)
    expect(comfyOutputTrimSeconds(29, 28.9)).toBe(28.9)
  })

  it('não mexe quando o vídeo já está no tamanho do áudio', () => {
    expect(comfyOutputTrimSeconds(21.4, 21.4)).toBeNull()
    expect(comfyOutputTrimSeconds(21.42, 21.4)).toBeNull()
    expect(comfyOutputTrimSeconds(20.8, 21.4)).toBeNull()
  })

  it('sem duração de áudio não corta', () => {
    expect(comfyOutputTrimSeconds(22, null)).toBeNull()
    expect(comfyOutputTrimSeconds(22, 0)).toBeNull()
  })

  it('sem duração do vídeo ainda tenta cortar no áudio', () => {
    expect(comfyOutputTrimSeconds(null, 17.2)).toBe(17.2)
  })
})

describe('pickRunpodComfyPod', () => {
  it('escolhe o pod ligado na porta 8188', () => {
    const picked = pickRunpodComfyPod(
      [
        { id: 'old', name: 'Parado', desiredStatus: 'EXITED' },
        {
          id: 'cdde0r2vynph2r',
          name: 'ComfyUI',
          desiredStatus: 'RUNNING',
          runtime: { ports: [{ privatePort: 8188, type: 'http' }, { privatePort: 22, type: 'tcp' }] },
        },
      ],
      'old',
    )
    expect(picked).toEqual({ id: 'cdde0r2vynph2r', name: 'ComfyUI', port: 8188 })
    expect(comfyRunpodProxyUrl(picked!.id, picked!.port)).toBe(
      'https://cdde0r2vynph2r-8188.proxy.runpod.net',
    )
  })

  it('assume 8188 quando o pod já está RUNNING mas as portas ainda não vieram', () => {
    expect(
      pickRunpodComfyPod([{ id: 'abc123xyz', name: 'GPU', desiredStatus: 'RUNNING', runtime: null }]),
    ).toEqual({ id: 'abc123xyz', name: 'GPU', port: 8188 })
  })

  it('lê o id da URL antiga do proxy', () => {
    expect(podIdFromComfyUrl('https://cdde0r2vynph2r-8188.proxy.runpod.net/')).toBe('cdde0r2vynph2r')
  })
})

describe('normalizeComfyConfig', () => {
  it('limita a fila e a folga e corrige a URL', () => {
    expect(normalizeComfyConfig({ baseUrl: 'abc-8188.proxy.runpod.net/', queueSize: 50, durationPadding: -2 })).toMatchObject({
      baseUrl: 'https://abc-8188.proxy.runpod.net',
      queueSize: 10,
      durationPadding: 0,
    })
    expect(normalizeComfyConfig(null)).toMatchObject({ queueSize: 5, durationPadding: 1, trimToAudio: false })
    expect(normalizeComfyConfig({ trimToAudio: true }).trimToAudio).toBe(true)
    expect(normalizeComfyBaseUrl('http://localhost:8188//')).toBe('http://localhost:8188')
  })
})

describe('sceneOutputFileName', () => {
  it('grava o vídeo com o mesmo número da imagem e do áudio', () => {
    expect(sceneOutputFileName(1, '.mp4')).toBe('1.mp4')
    expect(sceneOutputFileName(15, '.MP4')).toBe('15.mp4')
  })
})

describe('COMFY_DOWNLOAD_SUBDIR', () => {
  it('é a pasta lipsync dentro do projeto vinculado', () => {
    expect(COMFY_DOWNLOAD_SUBDIR).toBe('lipsync')
  })
})

describe('estimateComfyTiming', () => {
  const job = (status: ComfyJobStatus, updatedAt: string) => ({ status, updatedAt })

  it('estima o restante pela média das cenas prontas', () => {
    const createdAt = '2026-10-28T12:00:00.000Z'
    const timing = estimateComfyTiming(
      { createdAt, updatedAt: createdAt, status: 'running' },
      [
        job('done', '2026-10-28T12:02:00.000Z'),
        job('done', '2026-10-28T12:04:00.000Z'),
        job('queued', createdAt),
        job('pending', createdAt),
      ],
      Date.parse('2026-10-28T12:04:00.000Z'),
    )
    expect(timing.elapsedMs).toBe(4 * 60_000)
    expect(timing.remainingMs).toBe(4 * 60_000)
    expect(formatComfyDuration(timing.elapsedMs)).toBe('4 min')
  })

  it('mostra só o decorrido antes da primeira cena pronta', () => {
    const createdAt = '2026-10-28T12:00:00.000Z'
    const timing = estimateComfyTiming(
      { createdAt, updatedAt: createdAt, status: 'running' },
      [job('queued', createdAt)],
      Date.parse('2026-10-28T12:03:00.000Z'),
    )
    expect(timing.remainingMs).toBeNull()
    expect(formatComfyDuration(timing.elapsedMs)).toBe('3 min')
  })
})
