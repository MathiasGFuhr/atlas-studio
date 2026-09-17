import { CHANNEL_VIDEOS_CHANGED_EVENT } from '@shared/channelVideos'

export function notifyVideosChanged() {
  window.dispatchEvent(new Event(CHANNEL_VIDEOS_CHANGED_EVENT))
}

export function onVideosChanged(listener: () => void) {
  window.addEventListener(CHANNEL_VIDEOS_CHANGED_EVENT, listener)
  return () => window.removeEventListener(CHANNEL_VIDEOS_CHANGED_EVENT, listener)
}
