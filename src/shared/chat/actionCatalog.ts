import type { ChatActionDefinition } from './types'

/** Catálogo oficial das ações do Atlas. Novas capacidades entram aqui. */
export const ATLAS_ACTION_CATALOG: ChatActionDefinition[] = [
  {
    name: 'list_projects',
    description: 'Lista projetos do Atlas. Filtros opcionais: projectType (history|music), query.',
    category: 'projects',
    confirmationRequired: false,
    inputSchema: { projectType: 'history|music?', query: 'string?' },
  },
  {
    name: 'get_project',
    description: 'Obtém um projeto por id ou nome.',
    category: 'projects',
    confirmationRequired: false,
    inputSchema: { id: 'string?', name: 'string?' },
  },
  {
    name: 'create_project',
    description: 'Cria um projeto de História ou Música (mesmo cadastro da interface).',
    category: 'projects',
    confirmationRequired: false,
    inputSchema: {
      name: 'string',
      projectType: 'history|music',
      description: 'string?',
      channelId: 'string?',
    },
  },
  {
    name: 'update_project',
    description: 'Edita nome, descrição ou canal de um projeto.',
    category: 'projects',
    confirmationRequired: false,
    inputSchema: {
      id: 'string?',
      name: 'string?',
      newName: 'string?',
      description: 'string?',
      channelId: 'string?',
    },
  },
  {
    name: 'open_project',
    description: 'Abre a tela do projeto no Atlas (não altera arquivos).',
    category: 'projects',
    confirmationRequired: false,
    inputSchema: { id: 'string?', name: 'string?' },
  },
  {
    name: 'delete_project',
    description:
      'Remove apenas o cadastro do projeto no Atlas. NÃO apaga a pasta física. Sempre exige confirmação.',
    category: 'projects',
    confirmationRequired: true,
    inputSchema: { id: 'string?', name: 'string?' },
  },
  {
    name: 'create_project_folder',
    description: 'Cria a pasta física do projeto na raiz configurada e vincula ao cadastro.',
    category: 'projects',
    confirmationRequired: false,
    inputSchema: { id: 'string?', name: 'string?' },
  },
  {
    name: 'link_project_folder',
    description: 'Abre o seletor nativo para vincular uma pasta existente ao projeto.',
    category: 'projects',
    confirmationRequired: false,
    inputSchema: { id: 'string?', name: 'string?' },
  },
  {
    name: 'open_project_folder',
    description: 'Abre a pasta vinculada no Explorer.',
    category: 'projects',
    confirmationRequired: false,
    inputSchema: { id: 'string?', name: 'string?' },
  },
  {
    name: 'delete_project_files',
    description:
      'Apaga a pasta física do projeto no disco. NUNCA use no lugar de delete_project. Exige confirmação explícita.',
    category: 'projects',
    confirmationRequired: true,
    inputSchema: { id: 'string?', name: 'string?' },
  },
  {
    name: 'list_channels',
    description: 'Lista canais. Filtros: channelType (history|music), query.',
    category: 'channels',
    confirmationRequired: false,
    inputSchema: { channelType: 'history|music?', query: 'string?' },
  },
  {
    name: 'get_channel',
    description: 'Obtém um canal por id ou nome.',
    category: 'channels',
    confirmationRequired: false,
    inputSchema: { id: 'string?', name: 'string?' },
  },
  {
    name: 'create_channel',
    description:
      'Cria um canal. type/channelType: history|music. language (ex. de) vai para a descrição; canais não têm coluna de idioma.',
    category: 'channels',
    confirmationRequired: false,
    inputSchema: {
      name: 'string',
      type: 'history|music?',
      channelType: 'history|music?',
      language: 'string?',
      description: 'string?',
    },
  },
  {
    name: 'update_channel',
    description: 'Edita um canal existente.',
    category: 'channels',
    confirmationRequired: false,
    inputSchema: {
      id: 'string?',
      name: 'string?',
      newName: 'string?',
      description: 'string?',
      youtubeUrl: 'string?',
      channelType: 'history|music?',
    },
  },
  {
    name: 'open_channel',
    description: 'Abre a agenda do canal.',
    category: 'channels',
    confirmationRequired: false,
    inputSchema: { id: 'string?', name: 'string?' },
  },
  {
    name: 'delete_channel',
    description: 'Remove o canal do Atlas. Exige confirmação.',
    category: 'channels',
    confirmationRequired: true,
    inputSchema: { id: 'string?', name: 'string?' },
  },
  {
    name: 'list_tasks',
    description: 'Lista tarefas. Filtros: status (pending|completed), query.',
    category: 'tasks',
    confirmationRequired: false,
    inputSchema: { status: 'pending|completed?', query: 'string?' },
  },
  {
    name: 'get_task',
    description: 'Obtém uma tarefa por id ou título.',
    category: 'tasks',
    confirmationRequired: false,
    inputSchema: { id: 'string?', title: 'string?' },
  },
  {
    name: 'create_task',
    description:
      'Cria uma tarefa. dueDate em AAAA-MM-DD, ou "tomorrow"/"amanha". Pode enviar várias em um array "tasks".',
    category: 'tasks',
    confirmationRequired: false,
    inputSchema: {
      title: 'string',
      description: 'string?',
      dueDate: 'string?',
      priority: 'low|normal|high|urgent?',
      category: 'string?',
      relatedType: 'history|music|channel?',
      relatedId: 'string?',
      tasks: 'array?',
    },
  },
  {
    name: 'update_task',
    description: 'Edita uma tarefa existente.',
    category: 'tasks',
    confirmationRequired: false,
    inputSchema: {
      id: 'string?',
      title: 'string?',
      description: 'string?',
      dueDate: 'string?',
      priority: 'string?',
    },
  },
  {
    name: 'complete_task',
    description: 'Marca a tarefa como concluída.',
    category: 'tasks',
    confirmationRequired: false,
    inputSchema: { id: 'string?', title: 'string?' },
  },
  {
    name: 'reopen_task',
    description: 'Reabre uma tarefa concluída.',
    category: 'tasks',
    confirmationRequired: false,
    inputSchema: { id: 'string?', title: 'string?' },
  },
  {
    name: 'delete_task',
    description: 'Exclui uma tarefa. Exige confirmação.',
    category: 'tasks',
    confirmationRequired: true,
    inputSchema: { id: 'string?', title: 'string?' },
  },
  {
    name: 'list_quick_prompts',
    description: 'Lista prompts rápidos salvos pelo usuário (não os presets de código).',
    category: 'quick_prompts',
    confirmationRequired: false,
    inputSchema: { projectId: 'string?', query: 'string?' },
  },
  {
    name: 'get_quick_prompt',
    description: 'Obtém um prompt rápido por id ou nome.',
    category: 'quick_prompts',
    confirmationRequired: false,
    inputSchema: { id: 'string?', name: 'string?' },
  },
  {
    name: 'save_quick_prompt',
    description: 'Salva um prompt (gerado no chat ou ditado) nos Prompts rápidos reais do Atlas.',
    category: 'quick_prompts',
    confirmationRequired: false,
    inputSchema: { name: 'string', text: 'string', category: 'string?', projectId: 'string?' },
  },
  {
    name: 'create_quick_prompt',
    description: 'Alias de save_quick_prompt.',
    category: 'quick_prompts',
    confirmationRequired: false,
    inputSchema: { name: 'string', text: 'string', category: 'string?', projectId: 'string?' },
  },
  {
    name: 'update_quick_prompt',
    description: 'Edita um prompt rápido salvo.',
    category: 'quick_prompts',
    confirmationRequired: false,
    inputSchema: { id: 'string?', name: 'string?', text: 'string?', category: 'string?' },
  },
  {
    name: 'delete_quick_prompt',
    description: 'Exclui um prompt rápido salvo. Exige confirmação.',
    category: 'quick_prompts',
    confirmationRequired: true,
    inputSchema: { id: 'string?', name: 'string?' },
  },
  {
    name: 'favorite_quick_prompt',
    description: 'Favorita ou desfavorita um prompt (preset ou personalizado) pelo id.',
    category: 'quick_prompts',
    confirmationRequired: false,
    inputSchema: { id: 'string', favorite: 'boolean?' },
  },
  {
    name: 'list_scripts',
    description: 'Lista roteiros. Filtros: projectId, query, nicheId, language.',
    category: 'scripts',
    confirmationRequired: false,
    inputSchema: { projectId: 'string?', query: 'string?', nicheId: 'string?', language: 'string?' },
  },
  {
    name: 'get_script',
    description: 'Obtém um roteiro e um trecho do conteúdo (não o banco inteiro).',
    category: 'scripts',
    confirmationRequired: false,
    inputSchema: { id: 'string?', title: 'string?' },
  },
  {
    name: 'open_script',
    description: 'Abre a tela do roteiro.',
    category: 'scripts',
    confirmationRequired: false,
    inputSchema: { id: 'string?', title: 'string?' },
  },
  {
    name: 'create_script',
    description:
      'Cria um roteiro pelo fluxo oficial de geração (Codex + skill). Requer nicheId, language, topic. Opcional: projectId, durationMinutes.',
    category: 'scripts',
    confirmationRequired: false,
    inputSchema: {
      nicheId: 'string',
      language: 'string',
      topic: 'string',
      projectId: 'string?',
      durationMinutes: 'number?',
    },
  },
  {
    name: 'adjust_script',
    description: 'Pede revisão/ajuste de um roteiro pelo fluxo oficial existente.',
    category: 'scripts',
    confirmationRequired: false,
    inputSchema: { scriptId: 'string', instruction: 'string' },
  },
  {
    name: 'list_niches',
    description: 'Lista nichos/skills disponíveis (necessário para criar roteiro).',
    category: 'scripts',
    confirmationRequired: false,
    inputSchema: { query: 'string?', language: 'string?' },
  },
  {
    name: 'get_current_view',
    description: 'Informa a tela atual do Atlas enviada pelo cliente.',
    category: 'context',
    confirmationRequired: false,
    inputSchema: {},
  },
  {
    name: 'get_current_project',
    description: 'Informa o projeto em contexto, se o usuário marcou “usar contexto do projeto atual”.',
    category: 'context',
    confirmationRequired: false,
    inputSchema: {},
  },
]

const BY_NAME = new Map(ATLAS_ACTION_CATALOG.map((item) => [item.name, item]))

export function getActionDefinition(name: string): ChatActionDefinition | undefined {
  return BY_NAME.get(name)
}

export function actionRequiresConfirmation(name: string): boolean {
  return BY_NAME.get(name)?.confirmationRequired === true
}

export function formatActionCatalogForPrompt(actions = ATLAS_ACTION_CATALOG): string {
  return actions.map((action) => {
    const confirm = action.confirmationRequired ? ' [EXIGE CONFIRMAÇÃO]' : ''
    return `- ${action.name}${confirm}: ${action.description} Entrada: ${JSON.stringify(action.inputSchema)}`
  }).join('\n')
}
