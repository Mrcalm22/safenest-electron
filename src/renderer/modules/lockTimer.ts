import { store } from './store'

const LOCK_TIMEOUT = 5 * 60 * 1000

let onLockCallback: () => void = () => {}

export function setOnLockCallback(fn: () => void): void {
  onLockCallback = fn
}

export function startLockTimer(): void {
  store.lockCountdown = LOCK_TIMEOUT
  updateTimerDisplay()
  store.lockTimer = setInterval(() => {
    store.lockCountdown -= 1000
    updateTimerDisplay()
    if (store.lockCountdown <= 0) onLockCallback()
  }, 1000)
  ;['mousedown', 'keydown', 'touchstart'].forEach(event => {
    document.addEventListener(event, resetLockTimer, { passive: true })
  })
}

export function stopLockTimer(): void {
  if (store.lockTimer) { clearInterval(store.lockTimer); store.lockTimer = null }
}

export function resetLockTimer(): void {
  store.lockCountdown = LOCK_TIMEOUT
  updateTimerDisplay()
}

export function updateTimerDisplay(): void {
  const minutes = Math.floor(store.lockCountdown / 60000)
  const seconds = Math.floor((store.lockCountdown % 60000) / 1000)
  const text = `${minutes}:${seconds.toString().padStart(2, '0')}`
  ;(document.getElementById('timerText') as HTMLSpanElement).textContent = text
  const timerEl = document.getElementById('lockTimer') as HTMLSpanElement
  if (store.lockCountdown < 60000) timerEl.classList.add('warning')
  else timerEl.classList.remove('warning')
}
