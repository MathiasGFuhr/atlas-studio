import { channelRepository } from '../../repositories/channelRepository'
import { projectRepository } from '../../repositories/projectRepository'
import { settingsRepository } from '../../repositories/settingsRepository'
import {
  preferenceFromSettings,
  resolveWorkspaceCapabilities,
  type WorkspaceCapabilities,
} from '../../../shared/workspaceCapabilities'

export function getWorkspaceCapabilities(): WorkspaceCapabilities {
  const settings = settingsRepository.get()
  return resolveWorkspaceCapabilities(
    {
      historyPresent:
        channelRepository.existsOfType('history') || projectRepository.existsOfType('history'),
      musicPresent: channelRepository.existsOfType('music') || projectRepository.existsOfType('music'),
    },
    preferenceFromSettings(settings),
  )
}
