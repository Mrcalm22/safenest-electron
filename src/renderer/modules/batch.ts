import { store } from './store'
import { t } from '../i18n'
import { showToast } from './ui'
import { saveToStorage } from './vault'
import { renderPasswords } from './render'

export function toggleBatchMode(): void {
  store.batchMode = !store.batchMode
  if (!store.batchMode) store.selectedItems.clear()
  renderPasswords()
  showToast(store.batchMode ? t('toast_batchModeOn') : t('toast_batchModeOff'))
}

export function toggleSelectItem(id: string): void {
  if (store.selectedItems.has(id)) store.selectedItems.delete(id)
  else store.selectedItems.add(id)

  // Incremental DOM update instead of full re-render
  const card = document.querySelector(`.password-card[onclick*="'${id}'"]`) ||
    document.querySelector(`.password-list-item[onclick*="'${id}'"]`)
  if (card) {
    card.classList.toggle('selected', store.selectedItems.has(id))
    const checkbox = card.querySelector('input[type="checkbox"]') as HTMLInputElement | null
    if (checkbox) checkbox.checked = store.selectedItems.has(id)
  }

  // Update toolbar counts
  let filtered = store.passwords
  if (store.currentCategory !== 'all') filtered = filtered.filter(p => p.category === store.currentCategory)
  const search = (document.getElementById('searchInput') as HTMLInputElement).value.toLowerCase()
  if (search) filtered = filtered.filter(p => p.title.toLowerCase().includes(search) || p.username.toLowerCase().includes(search))
  updateBatchToolbar(filtered)
}

export function toggleSelectAllBatch(): void {
  const selectAll = (document.getElementById('selectAllBatch') as HTMLInputElement).checked
  let filtered = store.passwords
  if (store.currentCategory !== 'all') filtered = filtered.filter(p => p.category === store.currentCategory)
  const search = (document.getElementById('searchInput') as HTMLInputElement).value.toLowerCase()
  if (search) filtered = filtered.filter(p => p.title.toLowerCase().includes(search) || p.username.toLowerCase().includes(search))
  if (selectAll) filtered.forEach(p => store.selectedItems.add(p.id))
  else filtered.forEach(p => store.selectedItems.delete(p.id))
  renderPasswords()
}

export function cancelBatchSelection(): void {
  store.batchMode = false
  store.selectedItems.clear()
  renderPasswords()
}

export function showBatchExportVerify(): void {
  if (store.selectedItems.size === 0) return
  store.exportMode = 'batch'
  showExportVerify()
}

export function showBatchDeleteVerify(): void {
  if (store.selectedItems.size === 0) return
  ;(document.getElementById('batchDeletePassword') as HTMLInputElement).value = ''
  ;(document.getElementById('batchDeleteAnswer') as HTMLInputElement).value = ''
  ;(document.getElementById('batchDeleteError') as HTMLParagraphElement).textContent = ''
  const questionEl = document.getElementById('batchDeleteQuestion') as HTMLParagraphElement
  const questionContainer = document.getElementById('securityQuestionDisplay') as HTMLDivElement
  if (store.securityQuestion) { questionEl.textContent = store.securityQuestion; questionContainer.style.display = 'block' }
  else { questionContainer.style.display = 'none' }
  ;(document.getElementById('batchDeleteVerifyModal') as HTMLDivElement).classList.add('active')
}

export function closeBatchDeleteVerify(): void {
  ;(document.getElementById('batchDeleteVerifyModal') as HTMLDivElement).classList.remove('active')
}

export async function confirmBatchDelete(): Promise<void> {
  const password = (document.getElementById('batchDeletePassword') as HTMLInputElement).value
  const answer = (document.getElementById('batchDeleteAnswer') as HTMLInputElement).value
  const errorEl = document.getElementById('batchDeleteError') as HTMLParagraphElement
  if (!password) { errorEl.textContent = t('error_passwordRequired'); return }

  const isValid = await window.electronAPI.crypto.verifyPassword(password, await window.electronAPI.vault.get('passwordHash') || '')
  if (!isValid) { errorEl.textContent = t('error_wrongMasterPassword'); return }

  if (store.securityQuestion) {
    if (!answer) { errorEl.textContent = t('error_answerRequired'); return }
    const encoder = new TextEncoder()
    const answerHash = await crypto.subtle.digest('SHA-256', encoder.encode(answer.toLowerCase().trim()))
    const answerHex = Array.from(new Uint8Array(answerHash)).map(b => b.toString(16).padStart(2, '0')).join('')
    if (answerHex !== store.securityAnswer) { errorEl.textContent = t('error_wrongAnswer'); return }
  }

  store.passwords = store.passwords.filter(p => !store.selectedItems.has(p.id))
  store.selectedItems.clear()
  store.batchMode = false
  await saveToStorage()
  closeBatchDeleteVerify()
  renderPasswords()
  showToast(t('toast_deleted'))
}

// Forward declaration to avoid circular dependency with importExport
let showExportVerifyFn: () => void = () => {}
export function setShowExportVerifyFn(fn: () => void) { showExportVerifyFn = fn }
function showExportVerify() { showExportVerifyFn() }
