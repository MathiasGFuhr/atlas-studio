export const PRODUCT_TOUR_REPLAY_EVENT = 'atlas-replay-product-tour'
export const PRODUCT_TOUR_ACTIVE_EVENT = 'atlas-product-tour-active'

export function requestProductTourReplay() {
  window.dispatchEvent(new Event(PRODUCT_TOUR_REPLAY_EVENT))
}

export function setProductTourActive(active: boolean) {
  window.dispatchEvent(new CustomEvent(PRODUCT_TOUR_ACTIVE_EVENT, { detail: { active } }))
}
