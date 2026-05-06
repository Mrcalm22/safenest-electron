import { t } from '../i18n'
import type { PasswordEntry } from '../../types'

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
  showToast(t('toast_copied'))
}

export function showToast(msg: string): void {
  const toast = document.getElementById('toast') as HTMLDivElement
  toast.textContent = msg
  toast.classList.add('show')
  setTimeout(() => toast.classList.remove('show'), 2000)
}

export function escapeHtml(str: string): string {
  if (!str) return ''
  return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] || m))
}

export function escapeJs(str: string): string {
  if (!str) return ''
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"')
}

export function renderLogInfo(entry: PasswordEntry): string {
  const created = entry.createdAt ? formatDateTime(entry.createdAt) : t('date_unknown')
  const updated = entry.updatedAt && entry.updatedAt !== entry.createdAt ? ` · ${t('log_updated')} ${formatDateTime(entry.updatedAt)}` : ''
  return `<div class="log-info">${t('log_created')} ${created}${updated}</div>`
}

export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}
