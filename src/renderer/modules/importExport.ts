import { store } from './store'
import { t, getLang } from '../i18n'
import { showToast, escapeHtml, formatDateTime } from './ui'
import { saveToStorage } from './vault'
import { renderPasswords, renderImportPreview } from './render'
import { getCategoryName, getSystemCategories } from './categories'
import { setShowExportVerifyFn } from './batch'
import type { PasswordEntry } from '../../types'

export async function exportData(): Promise<void> {
  if (store.passwords.length === 0) { showToast(t('toast_noDataToExport')); return }
  store.exportMode = 'all'
  showExportVerify()
}

export function showExportVerify(): void {
  ;(document.getElementById('exportVerifyPassword') as HTMLInputElement).value = ''
  ;(document.getElementById('exportVerifyError') as HTMLParagraphElement).textContent = ''
  ;(document.getElementById('exportVerifyModal') as HTMLDivElement).classList.add('active')
}

export function closeExportVerifyModal(): void {
  ;(document.getElementById('exportVerifyModal') as HTMLDivElement).classList.remove('active')
}

export async function confirmExportVerify(): Promise<void> {
  const password = (document.getElementById('exportVerifyPassword') as HTMLInputElement).value
  const errorEl = document.getElementById('exportVerifyError') as HTMLParagraphElement
  if (!password) { errorEl.textContent = t('error_passwordRequired'); return }

  const hashStr = await window.electronAPI.vault.get('passwordHash')
  if (!hashStr) { errorEl.textContent = t('error_verificationFailed'); return }

  const valid = await window.electronAPI.crypto.verifyPassword(password, hashStr)
  if (!valid) { errorEl.textContent = t('error_wrongMasterPassword'); return }

  closeExportVerifyModal()

  const entriesToExport = store.exportMode === 'batch'
    ? store.passwords.filter(p => store.selectedItems.has(p.id))
    : store.passwords

  if (entriesToExport.length === 0) { showToast(t('toast_noDataToExport')); return }

  const markdown = await generateMarkdownExport(entriesToExport)
  ;(document.getElementById('exportMarkdownTextarea') as HTMLTextAreaElement).value = markdown
  ;(document.getElementById('exportMarkdownModal') as HTMLDivElement).classList.add('active')
}

export async function generateMarkdownExport(entries: PasswordEntry[]): Promise<string> {
  const localeMap: Record<string, string> = { 'zh-CN': 'zh-CN', 'en': 'en-US', 'de': 'de-DE' }
  const date = new Date().toLocaleString(localeMap[getLang()] || 'zh-CN')
  let markdown = `# ${t('export_title')}\n\n`
  markdown += `> ${t('export_time')}：${date}\n`
  markdown += `> ${t('export_count')}：${entries.length}\n\n`
  markdown += `---\n\n`
  entries.forEach((entry, index) => {
    markdown += `## ${index + 1}. ${entry.title}\n\n`
    markdown += `- **${t('export_field_title')}**：${entry.title}\n`
    markdown += `- **${t('export_field_category')}**：${getCategoryName(entry.category)}\n`
    markdown += `- **${t('export_field_username')}**：${entry.username || t('export_empty')}\n`
    markdown += `- **${t('export_field_password')}**：${entry.password}\n`
    markdown += `- **${t('export_field_notes')}**：${entry.notes || t('export_none')}\n`
    markdown += `- **${t('export_field_created')}**：${entry.createdAt ? formatDateTime(entry.createdAt) : t('date_unknown')}\n`
    markdown += `- **${t('export_field_updated')}**：${entry.updatedAt ? formatDateTime(entry.updatedAt) : t('date_unknown')}\n\n`
    markdown += `---\n\n`
  })
  markdown += `## ${t('export_instructions')}\n\n`
  markdown += `${t('export_instructions_desc')}\n`
  return markdown
}

export function closeExportMarkdownModal(): void {
  ;(document.getElementById('exportMarkdownModal') as HTMLDivElement).classList.remove('active')
}

export function downloadMarkdownExport(): void {
  const markdown = (document.getElementById('exportMarkdownTextarea') as HTMLTextAreaElement).value
  const blob = new Blob([markdown], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `safenest_export_${new Date().toISOString().slice(0, 10)}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  showToast(t('toast_downloadStarted'))
}

export function showImportPreviewModal(): void {
  ;(document.getElementById('importPreviewModal') as HTMLDivElement).classList.add('active')
  store.importPreviewData = []
  ;(document.getElementById('importPreviewContainer') as HTMLDivElement).style.display = 'none'
  ;(document.getElementById('importEmptyState') as HTMLDivElement).style.display = 'block'
  ;(document.getElementById('confirmImportBtn') as HTMLButtonElement).disabled = true
  ;(document.getElementById('importFile') as HTMLInputElement).value = ''
  ;(document.getElementById('selectAllImport') as HTMLInputElement).checked = true
}

export function closeImportPreviewModal(): void {
  ;(document.getElementById('importPreviewModal') as HTMLDivElement).classList.remove('active')
  store.importPreviewData = []
}

export async function handleImportFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  const content = await file.text()
  try {
    let parsed: Array<{ title: string; username: string; password: string; category: string; notes: string }> = []
    if (extension === 'md' || extension === 'markdown') parsed = parseMarkdownImport(content)
    else if (extension === 'json') parsed = parseJSONImport(content)
    else if (extension === 'csv') parsed = parseCSVImport(content)
    else parsed = tryAutoDetect(content)

    if (parsed.length === 0) { showToast(t('toast_noValidData')); return }
    store.importPreviewData = parsed.map(item => {
      const existing = store.passwords.find(p => p.title === item.title)
      return {
        ...item,
        selected: true,
        valid: !!(item.title && item.password),
        conflict: !!existing,
        conflictAction: existing ? ('skip' as const) : ('import' as const),
        existingId: existing ? existing.id : null
      }
    })
    renderImportPreview()
  } catch (err) {
    showToast(t('toast_parseFailed', { error: err instanceof Error ? err.message : String(err) }))
  }
}

export function tryAutoDetect(content: string): Array<{ title: string; username: string; password: string; category: string; notes: string }> {
  const titleField = t('export_field_title')
  if (content.includes('## ') && content.includes(`**${titleField}**`)) { try { return parseMarkdownImport(content) } catch {} }
  try { return parseJSONImport(content) } catch {}
  try { return parseCSVImport(content) } catch {}
  return []
}

export function parseMarkdownImport(content: string): Array<{ title: string; username: string; password: string; category: string; notes: string }> {
  const entries: Array<{ title: string; username: string; password: string; category: string; notes: string }> = []
  const sections = content.split(/##\s+/)
  const titleField = t('export_field_title')
  const catField = t('export_field_category')
  const userField = t('export_field_username')
  const passField = t('export_field_password')
  const notesField = t('export_field_notes')
  const emptyMarker = t('export_empty')
  const noneMarker = t('export_none')
  const catMap: Record<string, string> = {}
  const allCats = getSystemCategories()
  for (const [id, name] of Object.entries(allCats)) { catMap[name] = id }
  for (const section of sections) {
    const lines = section.trim().split('\n')
    if (lines.length < 2) continue
    const entry = { title: '', username: '', password: '', category: 'other', notes: '' }
    const titleMatch = lines[0].match(/^\d+\.\s*(.+)$/)
    if (titleMatch) entry.title = titleMatch[1].trim()
    for (const line of lines) {
      const trimmed = line.trim()
      const nameMatch = trimmed.match(new RegExp(`[-*]\s*\*\*${titleField}\*\*[:：]?\s*(.+)`))
      if (nameMatch) entry.title = nameMatch[1].trim()
      const catMatch = trimmed.match(new RegExp(`[-*]\s*\*\*${catField}\*\*[:：]?\s*(.+)`))
      if (catMatch) {
        entry.category = catMap[catMatch[1].trim()] || 'other'
      }
      const userMatch = trimmed.match(new RegExp(`[-*]\s*\*\*${userField}\*\*[:：]?\s*(.+)`))
      if (userMatch) entry.username = userMatch[1].trim() === emptyMarker ? '' : userMatch[1].trim()
      const passMatch = trimmed.match(new RegExp(`[-*]\s*\*\*${passField}\*\*[:：]?\s*(.+)`))
      if (passMatch) entry.password = passMatch[1].trim()
      const notesMatch = trimmed.match(new RegExp(`[-*]\s*\*\*${notesField}\*\*[:：]?\s*(.+)`))
      if (notesMatch) entry.notes = notesMatch[1].trim() === noneMarker ? '' : notesMatch[1].trim()
    }
    if (entry.title) entries.push(entry)
  }
  return entries
}

export function parseJSONImport(content: string): Array<{ title: string; username: string; password: string; category: string; notes: string }> {
  const data = JSON.parse(content)
  const arr = Array.isArray(data) ? data : data.passwords || data.data || []
  return arr.map((item: Record<string, unknown>) => ({
    title: String(item.title || item.name || ''),
    username: String(item.username || item.user || ''),
    password: String(item.password || ''),
    category: String(item.category || 'other'),
    notes: String(item.notes || '')
  }))
}

export function parseCSVImport(content: string): Array<{ title: string; username: string; password: string; category: string; notes: string }> {
  const lines = content.split('\n').filter((l: string) => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map((h: string) => h.trim().toLowerCase())
  const entries: Array<{ title: string; username: string; password: string; category: string; notes: string }> = []
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v: string) => v.trim())
    const entry: Record<string, string> = {}
    headers.forEach((h: string, idx: number) => { entry[h] = values[idx] || '' })
    entries.push({
      title: entry.title || entry.name || '',
      username: entry.username || entry.user || '',
      password: entry.password || '',
      category: entry.category || 'other',
      notes: entry.notes || ''
    })
  }
  return entries
}

export function setConflictAction(idx: number, action: 'skip' | 'overwrite' | 'import'): void {
  store.importPreviewData[idx].conflictAction = action
  if (action !== 'skip' && !store.importPreviewData[idx].selected) store.importPreviewData[idx].selected = true
  renderImportPreview()
}

export function toggleImportItem(idx: number): void {
  store.importPreviewData[idx].selected = !store.importPreviewData[idx].selected
  renderImportPreview()
}

export function toggleSelectAllImport(): void {
  const checked = (document.getElementById('selectAllImport') as HTMLInputElement).checked
  store.importPreviewData.forEach(i => { if (i.valid) i.selected = checked })
  renderImportPreview()
}

export async function confirmImport(): Promise<void> {
  const items = store.importPreviewData.filter(i => i.selected && i.valid && i.conflictAction !== 'skip')
  for (const item of items) {
    const entry: PasswordEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      title: item.title,
      category: item.category,
      username: item.username,
      password: item.password,
      notes: item.notes,
      showPassword: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    if (item.conflictAction === 'overwrite' && item.existingId) {
      const idx = store.passwords.findIndex(p => p.id === item.existingId)
      if (idx !== -1) store.passwords[idx] = { ...entry, id: item.existingId, createdAt: store.passwords[idx].createdAt }
    } else {
      store.passwords.push(entry)
    }
  }
  await saveToStorage()
  closeImportPreviewModal()
  renderPasswords()
  showToast(t('toast_importSuccess', { count: String(items.length) }))
}

// Wire batch.ts setter to our showExportVerify
setShowExportVerifyFn(showExportVerify)
