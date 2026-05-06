import { store } from './store'
import { t } from '../i18n'
import { showToast } from './ui'
import { saveToStorage } from './vault'
import { renderPasswords } from './render'
import type { PasswordEntry } from '../../types'

export function showAddModal(): void {
  store.editingId = null
  ;(document.getElementById('modalTitle') as HTMLHeadingElement).textContent = t('addModal_title')
  ;(document.getElementById('entryTitle') as HTMLInputElement).value = ''
  ;(document.getElementById('entryCategory') as HTMLSelectElement).value = 'work'
  ;(document.getElementById('entryUsername') as HTMLInputElement).value = ''
  ;(document.getElementById('entryPassword') as HTMLInputElement).value = ''
  ;(document.getElementById('entryNotes') as HTMLInputElement).value = ''
  ;(document.getElementById('strengthFill') as HTMLDivElement).className = 'strength-fill'
  ;(document.getElementById('editModal') as HTMLDivElement).classList.add('active')
}

export function editEntry(id: string): void {
  const entry = store.passwords.find(p => p.id === id)
  if (!entry) return
  store.editingId = id
  ;(document.getElementById('modalTitle') as HTMLHeadingElement).textContent = t('editModal_title')
  ;(document.getElementById('entryTitle') as HTMLInputElement).value = entry.title
  ;(document.getElementById('entryCategory') as HTMLSelectElement).value = entry.category
  ;(document.getElementById('entryUsername') as HTMLInputElement).value = entry.username
  ;(document.getElementById('entryPassword') as HTMLInputElement).value = entry.password
  ;(document.getElementById('entryNotes') as HTMLInputElement).value = entry.notes || ''
  checkStrength()
  ;(document.getElementById('editModal') as HTMLDivElement).classList.add('active')
}

export async function saveEntry(): Promise<void> {
  const title = (document.getElementById('entryTitle') as HTMLInputElement).value.trim()
  const password = (document.getElementById('entryPassword') as HTMLInputElement).value
  if (!title || !password) { showToast(t('error_fillRequired')); return }

  const now = Date.now()
  const entry: PasswordEntry = {
    id: store.editingId || Date.now().toString(36),
    title,
    category: (document.getElementById('entryCategory') as HTMLSelectElement).value,
    username: (document.getElementById('entryUsername') as HTMLInputElement).value.trim(),
    password,
    notes: (document.getElementById('entryNotes') as HTMLInputElement).value.trim(),
    showPassword: false,
    createdAt: store.editingId ? (store.passwords.find(p => p.id === store.editingId)?.createdAt || now) : now,
    updatedAt: now
  }

  if (store.editingId) {
    const idx = store.passwords.findIndex(p => p.id === store.editingId)
    if (idx !== -1) store.passwords[idx] = entry
  } else {
    store.passwords.push(entry)
  }
  await saveToStorage()
  closeModal()
  renderPasswords()
  showToast(t('toast_saveSuccess'))
}

export async function deleteEntry(id: string): Promise<void> {
  if (!confirm(t('confirm_deleteEntry'))) return
  store.passwords = store.passwords.filter(p => p.id !== id)
  await saveToStorage()
  renderPasswords()
  showToast(t('toast_deleted'))
}

export function closeModal(): void {
  (document.getElementById('editModal') as HTMLDivElement).classList.remove('active')
}

export async function generatePasswordUI(): Promise<void> {
  const pwd = await window.electronAPI.crypto.generatePassword(16)
  ;(document.getElementById('entryPassword') as HTMLInputElement).value = pwd
  checkStrength()
}

export function checkStrength(): void {
  const pwd = (document.getElementById('entryPassword') as HTMLInputElement).value
  const fill = document.getElementById('strengthFill') as HTMLDivElement
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
