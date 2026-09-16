import { getActionDefinition } from '../../../shared/chat/actionCatalog'
import type {
  ChatActionCall,
  ChatActionDefinition,
  ChatActionResult,
  ChatAgentId,
  ChatClientContext,
} from '../../../shared/chat/types'
import type { ProjectType } from '../../../shared/types'

export interface AtlasActionContext {
  conversationId: string
  agent: ChatAgentId
  confirmed: boolean
  client: ChatClientContext
}

export type AtlasActionHandler = (
  input: Record<string, unknown>,
  ctx: AtlasActionContext,
) => Promise<ChatActionResult> | ChatActionResult

export class AtlasActionRegistry {
  private readonly handlers = new Map<string, AtlasActionHandler>()

  register(name: string, handler: AtlasActionHandler): void {
    if (this.handlers.has(name)) {
      throw new Error(`Ação duplicada no registry: ${name}`)
    }
    this.handlers.set(name, handler)
  }

  has(name: string): boolean {
    return this.handlers.has(name)
  }

  listRegistered(): string[] {
    return [...this.handlers.keys()]
  }

  definition(name: string): ChatActionDefinition | undefined {
    return getActionDefinition(name)
  }

  async execute(call: ChatActionCall, ctx: AtlasActionContext): Promise<ChatActionResult> {
    const definition = getActionDefinition(call.name)
    if (!definition) {
      return {
        name: call.name,
        status: 'error',
        title: 'Ação desconhecida',
        error: `A ação "${call.name}" não existe no Atlas.`,
      }
    }

    if (definition.confirmationRequired && !ctx.confirmed) {
      return {
        name: call.name,
        status: 'pending',
        title: 'Confirmação necessária',
        subtitle: definition.description,
      }
    }

    const handler = this.handlers.get(call.name)
    if (!handler) {
      return {
        name: call.name,
        status: 'error',
        title: 'Ação não implementada',
        error: `A ação "${call.name}" ainda não está registrada.`,
      }
    }

    try {
      return await handler(call.input ?? {}, ctx)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao executar a ação.'
      return {
        name: call.name,
        status: 'error',
        title: 'Não foi possível concluir',
        error: message,
      }
    }
  }
}

export function projectNavigatePath(projectType: ProjectType, id: string): string {
  return projectType === 'music' ? `/musica/projetos/${id}` : `/historia/projetos/${id}`
}
