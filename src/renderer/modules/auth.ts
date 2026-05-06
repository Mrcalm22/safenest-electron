import { store } from './store'
import { t } from '../i18n'
import { showToast } from './ui'
import { loadCustomCategories } from './categories'
import { renderPasswords, renderFilterTags, renderCategorySelect } from './render'
import { startLockTimer, stopLockTimer } from './lockTimer'

export async function login(): Promise<void> {
  const isSetup = (document.getElementById('setupMode') as HTMLDivElement).style.display !== 'none'
  const errorEl = document.getElementById('loginError') as HTMLParagraphElement
  errorEl.textContent = ''

  if (isSetup) {
    const pwd = (document.getElementById('masterPassword') as HTMLInputElement).value
    const confirm = (document.getElementById('confirmPassword') as HTMLInputElement).value
    if (pwd.length < 8) { errorEl.textContent = t('error_passwordTooShort'); return }
    if (pwd !== confirm) { errorEl.textContent = t('error_passwordMismatch'); return }
    store.currentPassword = pwd
    const result = await window.electronAPI.vault.setup(pwd)
    if (result.success) {
      store.passwords = []
      await showApp()
      showSecuritySetupModal()
    } else {
      errorEl.textContent = t('error_createFailed')
    }
  } else {
    const pwd = (document.getElementById('unlockPassword') as HTMLInputElement).value
    const result = await window.electronAPI.vault.unlock(pwd)
    if (result.success && result.passwords !== null) {
      store.currentPassword = pwd
      store.passwords = result.passwords
      if (result.migrated) showToast(t('toast_migrated'))
      await showApp()
    } else {
      store.failedAttempts++
      const attemptCount = document.getElementById('attemptCount') as HTMLSpanElement
      attemptCount.textContent = String(store.failedAttempts + 1)
      if (store.failedAttempts >= 5) {
        errorEl.textContent = t('error_tooManyAttempts')
        const btn = document.querySelector('.btn-primary') as HTMLButtonElement
        btn.disabled = true
        setTimeout(() => {
          store.failedAttempts = 0
          attemptCount.textContent = '1'
          btn.disabled = false
          errorEl.textContent = ''
        }, 30000)
      } else {
        errorEl.textContent = t('error_wrongPassword')
      }
    }
  }
}

export async function showApp(): Promise<void> {
  (document.getElementById('loginScreen') as HTMLDivElement).style.display = 'none'
  ;(document.getElementById('appContainer') as HTMLDivElement).style.display = 'block'
  await loadCustomCategories()
  renderFilterTags()
  renderCategorySelect()
  startLockTimer()
  renderPasswords()
}

export function lock(): void {
  store.currentPassword = ''
  store.passwords = []
  stopLockTimer()

  document.querySelectorAll('.modal-overlay.active').forEach(el => el.classList.remove('active'))

  ;(document.getElementById('appContainer') as HTMLDivElement).style.display = 'none'
  ;(document.getElementById('loginScreen') as HTMLDivElement).style.display = 'flex'
  ;(document.getElementById('unlockMode') as HTMLDivElement).style.display = 'block'
  ;(document.getElementById('setupMode') as HTMLDivElement).style.display = 'none'
  ;(document.getElementById('unlockPassword') as HTMLInputElement).value = ''
  ;(document.getElementById('loginError') as HTMLParagraphElement).textContent = ''
  store.failedAttempts = 0
}

// Security question setup
export function showSecuritySetupModal(): void {
  ;(document.getElementById('setupSecurityQuestion') as HTMLInputElement).value = ''
  ;(document.getElementById('setupSecurityAnswer') as HTMLInputElement).value = ''
  ;(document.getElementById('securitySetupError') as HTMLParagraphElement).textContent = ''
  ;(document.getElementById('securitySetupModal') as HTMLDivElement).classList.add('active')
}

export async function saveSecuritySetup(): Promise<void> {
  const question = (document.getElementById('setupSecurityQuestion') as HTMLInputElement).value.trim()
  const answer = (document.getElementById('setupSecurityAnswer') as HTMLInputElement).value.trim()
  const errorEl = document.getElementById('securitySetupError') as HTMLParagraphElement
  if (!question) { errorEl.textContent = t('error_questionRequired'); return }
  if (!answer) { errorEl.textContent = t('error_answerEmpty'); return }

  const encoder = new TextEncoder()
  const answerHash = await crypto.subtle.digest('SHA-256', encoder.encode(answer.toLowerCase()))
  const answerHex = Array.from(new Uint8Array(answerHash)).map(b => b.toString(16).padStart(2, '0')).join('')
  store.securityAnswer = answerHex
  store.securityQuestion = question
  await window.electronAPI.vault.set('safenest_security_question', question)
  await window.electronAPI.vault.set('safenest_security_answer', answerHex)
  ;(document.getElementById('securitySetupModal') as HTMLDivElement).classList.remove('active')
  showToast(t('toast_securitySetup'))
}

export async function loadSecurityQuestion(): Promise<void> {
  const question = await window.electronAPI.vault.get('safenest_security_question')
  const answer = await window.electronAPI.vault.get('safenest_security_answer')
  if (question && answer) { store.securityQuestion = question; store.securityAnswer = answer }
}
