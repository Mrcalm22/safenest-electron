import { store } from './store'
import { t, setLang, getLang, translateDOM, translateAttrs } from '../i18n'
import type { Language } from '../i18n/types'
import { showToast } from './ui'
import { renderPasswords, renderFilterTags, renderCategorySelect, updateBatchToolbar } from './render'
import { renderCategoryManagement } from './categories'
import { loadRecoveryKeyStatus } from './recovery'

export function updateLangButtons(): void {
  const lang = getLang()
  document.querySelectorAll('.lang-btn, .lang-icon').forEach(btn => {
    const el = btn as HTMLButtonElement
    el.classList.toggle('active', el.dataset.lang === lang)
  })
}

export async function switchLanguage(lang: string): Promise<void> {
  if (lang !== 'zh-CN' && lang !== 'en' && lang !== 'de') return
  await setLang(lang as Language)
  translateDOM()
  translateAttrs()
  updateLangButtons()
  renderPasswords()
  renderFilterTags()
  renderCategorySelect()
  renderCategoryManagement()
  updateBatchToolbar(store.passwords)
}

export async function loadTheme(): Promise<void> {
  const savedTheme = await window.electronAPI.settings.get('safenest_theme') || ''
  await setTheme(savedTheme, false)
}

export function getCurrentTheme(): string {
  return document.documentElement.getAttribute('data-theme') || ''
}

export async function setTheme(theme: string, save = true): Promise<void> {
  if (theme) document.documentElement.setAttribute('data-theme', theme)
  else document.documentElement.removeAttribute('data-theme')
  if (save) await window.electronAPI.settings.set('safenest_theme', theme)
  updateThemeDropdown()
}

export function toggleThemeDropdown(): void {
  document.getElementById('themeDropdown')?.classList.toggle('active')
}

export function toggleLanguageDropdown(): void {
  document.getElementById('langDropdown')?.classList.toggle('active')
}

export function updateThemeDropdown(): void {
  const current = getCurrentTheme()
  document.querySelectorAll('.theme-option').forEach(opt => opt.classList.remove('active'))
  const activeOption = document.querySelector(`.theme-option[data-theme="${current}"]`)
  if (activeOption) activeOption.classList.add('active')
}

// ===== Settings Modal =====
export function showSettingsModal(): void {
  ;(document.getElementById('settingsVerifyPassword') as HTMLInputElement).value = ''
  ;(document.getElementById('settingsVerifyError') as HTMLParagraphElement).textContent = ''
  ;(document.getElementById('settingsVerifySection') as HTMLDivElement).style.display = 'block'
  ;(document.getElementById('settingsContentSection') as HTMLDivElement).style.display = 'none'
  ;(document.getElementById('settingsModal') as HTMLDivElement).classList.add('active')
}

export function closeSettingsModal(): void {
  ;(document.getElementById('settingsModal') as HTMLDivElement).classList.remove('active')
}

export async function verifySettingsPassword(): Promise<void> {
  const password = (document.getElementById('settingsVerifyPassword') as HTMLInputElement).value
  const errorEl = document.getElementById('settingsVerifyError') as HTMLParagraphElement
  if (!password) { errorEl.textContent = t('error_passwordRequired'); return }

  const hashStr = await window.electronAPI.vault.get('passwordHash')
  if (!hashStr) { errorEl.textContent = t('error_hashUnavailable'); return }

  const valid = await window.electronAPI.crypto.verifyPassword(password, hashStr)
  if (!valid) { errorEl.textContent = t('error_wrongMasterPassword'); return }

  ;(document.getElementById('settingsVerifySection') as HTMLDivElement).style.display = 'none'
  ;(document.getElementById('settingsContentSection') as HTMLDivElement).style.display = 'block'

  const currentQuestionBox = document.getElementById('settingsCurrentQuestionBox') as HTMLDivElement
  const currentQuestionText = document.getElementById('settingsCurrentQuestionText') as HTMLSpanElement
  if (store.securityQuestion) {
    currentQuestionText.textContent = store.securityQuestion
    currentQuestionBox.style.display = 'block'
  } else {
    currentQuestionBox.style.display = 'none'
  }

  ;(document.getElementById('settingsCurrentPassword') as HTMLInputElement).value = ''
  ;(document.getElementById('settingsNewPassword') as HTMLInputElement).value = ''
  ;(document.getElementById('settingsConfirmPassword') as HTMLInputElement).value = ''
  ;(document.getElementById('settingsPasswordError') as HTMLParagraphElement).textContent = ''
  ;(document.getElementById('settingsStrengthFill') as HTMLDivElement).className = 'strength-fill'
  ;(document.getElementById('settingsNewQuestion') as HTMLInputElement).value = ''
  ;(document.getElementById('settingsNewAnswer') as HTMLInputElement).value = ''
  ;(document.getElementById('settingsConfirmAnswer') as HTMLInputElement).value = ''
  ;(document.getElementById('settingsQuestionError') as HTMLParagraphElement).textContent = ''
  await loadRecoveryKeyStatus()
}

export function checkSettingsNewPasswordStrength(): void {
  const pwd = (document.getElementById('settingsNewPassword') as HTMLInputElement).value
  const fill = document.getElementById('settingsStrengthFill') as HTMLDivElement
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

export async function changeMasterPassword(): Promise<void> {
  const currentPwd = (document.getElementById('settingsCurrentPassword') as HTMLInputElement).value
  const newPwd = (document.getElementById('settingsNewPassword') as HTMLInputElement).value
  const confirmPwd = (document.getElementById('settingsConfirmPassword') as HTMLInputElement).value
  const errorEl = document.getElementById('settingsPasswordError') as HTMLParagraphElement
  errorEl.textContent = ''

  if (!currentPwd) { errorEl.textContent = t('error_currentPasswordRequired'); return }
  if (newPwd.length < 8) { errorEl.textContent = t('error_newPasswordTooShort'); return }
  if (newPwd !== confirmPwd) { errorEl.textContent = t('error_newPasswordMismatch'); return }
  if (newPwd === currentPwd) { errorEl.textContent = t('error_samePassword'); return }

  const result = await window.electronAPI.vault.changePassword(currentPwd, newPwd)
  if (result.success) {
    store.currentPassword = newPwd
    ;(document.getElementById('settingsCurrentPassword') as HTMLInputElement).value = ''
    ;(document.getElementById('settingsNewPassword') as HTMLInputElement).value = ''
    ;(document.getElementById('settingsConfirmPassword') as HTMLInputElement).value = ''
    ;(document.getElementById('settingsStrengthFill') as HTMLDivElement).className = 'strength-fill'
    showToast(t('toast_passwordChanged'))
  } else {
    errorEl.textContent = result.error || t('error_changeFailed')
  }
}

export async function changeSecurityQuestion(): Promise<void> {
  const newQuestion = (document.getElementById('settingsNewQuestion') as HTMLInputElement).value.trim()
  const newAnswer = (document.getElementById('settingsNewAnswer') as HTMLInputElement).value.trim()
  const confirmAnswer = (document.getElementById('settingsConfirmAnswer') as HTMLInputElement).value.trim()
  const errorEl = document.getElementById('settingsQuestionError') as HTMLParagraphElement
  errorEl.textContent = ''

  if (!newQuestion) { errorEl.textContent = t('error_questionRequired'); return }
  if (!newAnswer) { errorEl.textContent = t('error_answerEmpty'); return }
  if (newAnswer !== confirmAnswer) { errorEl.textContent = t('error_answerMismatch'); return }

  const encoder = new TextEncoder()
  const answerHash = await crypto.subtle.digest('SHA-256', encoder.encode(newAnswer.toLowerCase()))
  const answerHex = Array.from(new Uint8Array(answerHash)).map(b => b.toString(16).padStart(2, '0')).join('')

  store.securityQuestion = newQuestion
  store.securityAnswer = answerHex
  await window.electronAPI.vault.set('safenest_security_question', newQuestion)
  await window.electronAPI.vault.set('safenest_security_answer', answerHex)

  const currentQuestionBox = document.getElementById('settingsCurrentQuestionBox') as HTMLDivElement
  const currentQuestionText = document.getElementById('settingsCurrentQuestionText') as HTMLSpanElement
  currentQuestionText.textContent = newQuestion
  currentQuestionBox.style.display = 'block'

  ;(document.getElementById('settingsNewQuestion') as HTMLInputElement).value = ''
  ;(document.getElementById('settingsNewAnswer') as HTMLInputElement).value = ''
  ;(document.getElementById('settingsConfirmAnswer') as HTMLInputElement).value = ''
  showToast(t('toast_questionChanged'))
}
