import { store } from './store'
import { t } from '../i18n'
import { showToast } from './ui'
import { resetStore } from './store'
import { showApp } from './auth'

export async function loadRecoveryKeyStatus(): Promise<void> {
  const hash = await window.electronAPI.vault.get('recoveryKeyHash')
  const statusText = document.getElementById('recoveryKeyStatusText') as HTMLSpanElement
  const displayBox = document.getElementById('recoveryKeyDisplayBox') as HTMLDivElement
  if (hash) {
    statusText.textContent = t('recoveryKeyStatus_set')
    displayBox.style.display = 'none'
  } else {
    statusText.textContent = t('recoveryKeyStatus_unset')
    displayBox.style.display = 'none'
  }
}

export async function generateRecoveryKeyFromSettings(): Promise<void> {
  if (!store.currentPassword) { showToast(t('toast_enterAppFailed')); return }
  const result = await window.electronAPI.recovery.generate(store.currentPassword)
  if (result.success && result.words) {
    const display = document.getElementById('settingsRecoveryKeyDisplay') as HTMLParagraphElement
    const displayBox = document.getElementById('recoveryKeyDisplayBox') as HTMLDivElement
    display.textContent = result.words
    displayBox.style.display = 'block'
    const statusText = document.getElementById('recoveryKeyStatusText') as HTMLSpanElement
    statusText.textContent = t('recoveryKeyStatus_set')
    showToast(t('toast_recoveryKeyGenerated'))
  } else {
    showToast(result.error || t('error_generateFailed'))
  }
}

export async function copySettingsRecoveryKey(): Promise<void> {
  const display = document.getElementById('settingsRecoveryKeyDisplay') as HTMLParagraphElement
  const words = display.textContent || ''
  if (!words) return
  await navigator.clipboard.writeText(words)
  showToast(t('toast_recoveryKeyCopied'))
}

// ===== Forgot Password =====
export function showForgotPasswordModal(): void {
  ;(document.getElementById('forgotPasswordModal') as HTMLDivElement).classList.add('active')
}

export function closeForgotPasswordModal(): void {
  ;(document.getElementById('forgotPasswordModal') as HTMLDivElement).classList.remove('active')
}

export function showResetWithQuestion(): void {
  closeForgotPasswordModal()
  showResetModal()
}

export function showResetWithoutQuestion(): void {
  closeForgotPasswordModal()
  ;(document.getElementById('hardResetModal') as HTMLDivElement).classList.add('active')
  ;(document.getElementById('hardResetText') as HTMLInputElement).value = ''
  ;(document.getElementById('hardResetError') as HTMLParagraphElement).textContent = ''
  const btn = document.getElementById('hardResetBtn') as HTMLButtonElement
  btn.disabled = true
  btn.style.opacity = '0.5'
}

// ===== Recovery Key Reset =====
export function showRecoveryKeyRecoverModal(): void {
  closeForgotPasswordModal()
  store.verifiedRecoveryKey = ''
  store.newRecoveryKeyWords = ''
  ;(document.getElementById('recoveryKeyModal') as HTMLDivElement).classList.add('active')
  ;(document.getElementById('recoveryKeyStep1') as HTMLDivElement).style.display = 'block'
  ;(document.getElementById('recoveryKeyStep2') as HTMLDivElement).style.display = 'none'
  ;(document.getElementById('recoveryKeyStep3') as HTMLDivElement).style.display = 'none'
  ;(document.getElementById('recoveryKeyInput') as HTMLTextAreaElement).value = ''
  ;(document.getElementById('recoveryNewPassword') as HTMLInputElement).value = ''
  ;(document.getElementById('recoveryConfirmPassword') as HTMLInputElement).value = ''
  ;(document.getElementById('recoveryNewPasswordError') as HTMLParagraphElement).textContent = ''
  ;(document.getElementById('newRecoveryKeyDisplay') as HTMLParagraphElement).textContent = ''
  const fill = document.getElementById('recoveryStrengthFill') as HTMLDivElement
  if (fill) fill.className = 'strength-fill'
}

export function closeRecoveryKeyModal(): void {
  ;(document.getElementById('recoveryKeyModal') as HTMLDivElement).classList.remove('active')
  store.verifiedRecoveryKey = ''
  store.newRecoveryKeyWords = ''
}

export async function verifyRecoveryKey(): Promise<void> {
  const words = (document.getElementById('recoveryKeyInput') as HTMLTextAreaElement).value.trim()
  const errorEl = document.getElementById('recoveryKeyError') as HTMLParagraphElement
  if (!words) { if (errorEl) errorEl.textContent = t('error_recoveryKeyEmpty'); return }
  const valid = await window.electronAPI.recovery.verify(words)
  if (!valid) { if (errorEl) errorEl.textContent = t('error_recoveryKeyInvalid'); return }
  store.verifiedRecoveryKey = words
  if (errorEl) errorEl.textContent = ''
  ;(document.getElementById('recoveryKeyStep1') as HTMLDivElement).style.display = 'none'
  ;(document.getElementById('recoveryKeyStep2') as HTMLDivElement).style.display = 'block'
}

export function checkRecoveryPasswordStrength(): void {
  const pwd = (document.getElementById('recoveryNewPassword') as HTMLInputElement).value
  const fill = document.getElementById('recoveryStrengthFill') as HTMLDivElement
  if (!fill) return
  let score = 0
  if (pwd.length >= 8) score++
  if (pwd.length >= 12) score++
  if (/[A-Z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  fill.className = 'strength-fill'
  if (score <= 2) fill.classList.add('strength-weak')
  else if (score <= 4) fill.classList.add('strength-medium')
  else fill.classList.add('strength-strong')
}

export async function changePasswordWithRecoveryKey(): Promise<void> {
  const newPwd = (document.getElementById('recoveryNewPassword') as HTMLInputElement).value
  const confirmPwd = (document.getElementById('recoveryConfirmPassword') as HTMLInputElement).value
  const errorEl = document.getElementById('recoveryNewPasswordError') as HTMLParagraphElement
  errorEl.textContent = ''
  if (newPwd.length < 8) { errorEl.textContent = t('error_newPasswordTooShort'); return }
  if (newPwd !== confirmPwd) { errorEl.textContent = t('error_passwordMismatch'); return }
  if (!store.verifiedRecoveryKey) { errorEl.textContent = t('error_recoveryExpired'); return }

  const result = await window.electronAPI.recovery.changePassword(store.verifiedRecoveryKey, newPwd)
  if (result.success && result.newWords) {
    store.newRecoveryKeyWords = result.newWords
    store.currentPassword = newPwd
    ;(document.getElementById('newRecoveryKeyDisplay') as HTMLParagraphElement).textContent = result.newWords
    ;(document.getElementById('recoveryKeyStep2') as HTMLDivElement).style.display = 'none'
    ;(document.getElementById('recoveryKeyStep3') as HTMLDivElement).style.display = 'block'
    showToast(t('toast_passwordResetSuccess'))
  } else {
    errorEl.textContent = result.error || t('error_resetFailed')
  }
}

export async function copyNewRecoveryKey(): Promise<void> {
  if (!store.newRecoveryKeyWords) return
  await navigator.clipboard.writeText(store.newRecoveryKeyWords)
  showToast(t('toast_newRecoveryKeyCopied'))
}

export async function finishRecoveryKeyReset(): Promise<void> {
  closeRecoveryKeyModal()
  store.verifiedRecoveryKey = ''
  store.newRecoveryKeyWords = ''
  const storedRaw = await window.electronAPI.vault.get('passwordVault')
  if (storedRaw) {
    const stored = JSON.parse(storedRaw)
    const decrypted = await window.electronAPI.crypto.decryptVault(stored, store.currentPassword)
    if (decrypted) {
      store.passwords = decrypted
      await showApp()
      return
    }
  }
  showToast(t('toast_enterAppFailed'))
  lock()
}

// ===== Hard Reset =====
export function closeHardResetModal(): void {
  ;(document.getElementById('hardResetModal') as HTMLDivElement).classList.remove('active')
}

export function checkHardResetText(): void {
  const text = (document.getElementById('hardResetText') as HTMLInputElement).value.trim()
  const btn = document.getElementById('hardResetBtn') as HTMLButtonElement
  const valid = text === 'DELETE ALL DATA'
  btn.disabled = !valid
  btn.style.opacity = valid ? '1' : '0.5'
}

export async function confirmHardReset(): Promise<void> {
  const errorEl = document.getElementById('hardResetError') as HTMLParagraphElement
  errorEl.textContent = ''
  const text = (document.getElementById('hardResetText') as HTMLInputElement).value.trim()
  if (text !== 'DELETE ALL DATA') { errorEl.textContent = t('error_confirmTextIncorrect'); return }

  const result = await window.electronAPI.vault.reset()
  if (result.success) {
    closeHardResetModal()
    resetStore()
    ;(document.getElementById('setupMode') as HTMLDivElement).style.display = 'block'
    ;(document.getElementById('unlockMode') as HTMLDivElement).style.display = 'none'
    ;(document.getElementById('masterPassword') as HTMLInputElement).value = ''
    ;(document.getElementById('confirmPassword') as HTMLInputElement).value = ''
    ;(document.getElementById('unlockPassword') as HTMLInputElement).value = ''
    ;(document.getElementById('loginError') as HTMLParagraphElement).textContent = ''
    showToast(t('toast_dataCleared'))
  } else {
    errorEl.textContent = t('error_clearFailed')
  }
}

// ===== Reset Modal =====
export function showResetModal(): void {
  const questionBox = document.getElementById('resetVerifyQuestionBox') as HTMLDivElement
  const textBox = document.getElementById('resetVerifyTextBox') as HTMLDivElement
  const questionText = document.getElementById('resetVerifyQuestionText') as HTMLParagraphElement
  const answerInput = document.getElementById('resetVerifyAnswer') as HTMLInputElement
  const textInput = document.getElementById('resetVerifyText') as HTMLInputElement
  const errorEl = document.getElementById('resetVerifyError') as HTMLParagraphElement
  const confirmBtn = document.getElementById('resetConfirmBtn') as HTMLButtonElement

  answerInput.value = ''
  textInput.value = ''
  errorEl.textContent = ''

  if (store.securityQuestion) {
    questionBox.style.display = 'block'
    textBox.style.display = 'none'
    questionText.textContent = store.securityQuestion
    confirmBtn.disabled = true
    confirmBtn.style.opacity = '0.5'
  } else {
    questionBox.style.display = 'none'
    textBox.style.display = 'block'
    confirmBtn.disabled = true
    confirmBtn.style.opacity = '0.5'
  }

  ;(document.getElementById('resetVerifyModal') as HTMLDivElement).classList.add('active')
}

export function closeResetVerifyModal(): void {
  ;(document.getElementById('resetVerifyModal') as HTMLDivElement).classList.remove('active')
}

export function checkResetText(): void {
  const text = (document.getElementById('resetVerifyText') as HTMLInputElement).value.trim()
  const btn = document.getElementById('resetConfirmBtn') as HTMLButtonElement
  const valid = text === 'DELETE ALL DATA'
  btn.disabled = !valid
  btn.style.opacity = valid ? '1' : '0.5'
}

export function checkResetAnswer(): void {
  const answer = (document.getElementById('resetVerifyAnswer') as HTMLInputElement).value.trim()
  const btn = document.getElementById('resetConfirmBtn') as HTMLButtonElement
  btn.disabled = !answer
  btn.style.opacity = answer ? '1' : '0.5'
}

export async function checkResetVerify(): Promise<void> {
  const errorEl = document.getElementById('resetVerifyError') as HTMLParagraphElement
  errorEl.textContent = ''

  if (store.securityQuestion) {
    const answer = (document.getElementById('resetVerifyAnswer') as HTMLInputElement).value.trim()
    if (!answer) { errorEl.textContent = t('error_answerRequired'); return }
    const encoder = new TextEncoder()
    const answerHash = await crypto.subtle.digest('SHA-256', encoder.encode(answer.toLowerCase()))
    const answerHex = Array.from(new Uint8Array(answerHash)).map(b => b.toString(16).padStart(2, '0')).join('')
    if (answerHex !== store.securityAnswer) { errorEl.textContent = t('error_wrongAnswer'); return }
  } else {
    const text = (document.getElementById('resetVerifyText') as HTMLInputElement).value.trim()
    if (text !== 'DELETE ALL DATA') { errorEl.textContent = t('error_confirmTextIncorrect'); return }
  }

  closeResetVerifyModal()
  ;(document.getElementById('resetEntryCount') as HTMLSpanElement).textContent = String(store.passwords.length)
  ;(document.getElementById('resetModal') as HTMLDivElement).classList.add('active')

  store.resetCountdownValue = 5
  const finalBtn = document.getElementById('finalResetBtn') as HTMLButtonElement
  finalBtn.disabled = true
  finalBtn.textContent = t('resetFinal_button_countdown', { count: String(store.resetCountdownValue) })

  if (store.resetCountdownTimer) clearInterval(store.resetCountdownTimer)
  store.resetCountdownTimer = setInterval(() => {
    store.resetCountdownValue--
    if (store.resetCountdownValue > 0) {
      finalBtn.textContent = t('resetFinal_button_countdown', { count: String(store.resetCountdownValue) })
    } else {
      finalBtn.disabled = false
      finalBtn.textContent = t('resetFinal_button_confirm')
      if (store.resetCountdownTimer) { clearInterval(store.resetCountdownTimer); store.resetCountdownTimer = null }
    }
  }, 1000)
}

export function closeResetModal(): void {
  ;(document.getElementById('resetModal') as HTMLDivElement).classList.remove('active')
  if (store.resetCountdownTimer) { clearInterval(store.resetCountdownTimer); store.resetCountdownTimer = null }
}

export async function confirmReset(): Promise<void> {
  if (store.resetCountdownTimer) { clearInterval(store.resetCountdownTimer); store.resetCountdownTimer = null }
  await window.electronAPI.vault.remove('passwordVault')
  await window.electronAPI.vault.remove('passwordHash')
  await window.electronAPI.vault.remove('safenest_security_question')
  await window.electronAPI.vault.remove('safenest_security_answer')
  resetStore()
  closeResetModal()
  ;(document.getElementById('setupMode') as HTMLDivElement).style.display = 'block'
  ;(document.getElementById('unlockMode') as HTMLDivElement).style.display = 'none'
  ;(document.getElementById('masterPassword') as HTMLInputElement).value = ''
  ;(document.getElementById('confirmPassword') as HTMLInputElement).value = ''
  ;(document.getElementById('unlockPassword') as HTMLInputElement).value = ''
  ;(document.getElementById('loginError') as HTMLParagraphElement).textContent = ''
  showToast(t('toast_dataReset'))
}

// Forward declaration to avoid circular dependency with auth
let lockFn: () => void = () => {}
export function setLockFn(fn: () => void) { lockFn = fn }
function lock() { lockFn() }
