import { store } from './store'
import { t } from '../i18n'
import { escapeHtml, escapeJs, renderLogInfo, showToast } from './ui'
import { getAllCategories, getCategoryName } from './categories'
import { saveToStorage } from './vault'
import type { PasswordEntry } from '../../types'

const LIST_ITEM_HEIGHT = 64
const LIST_HEADER_HEIGHT = 40
const VIRTUAL_BUFFER = 5
const VIRTUAL_THRESHOLD = 50

export function renderPasswords(): void {
  const grid = document.getElementById('passwordGrid') as HTMLDivElement
  const search = (document.getElementById('searchInput') as HTMLInputElement).value.toLowerCase()
  const empty = document.getElementById('emptyState') as HTMLDivElement

  let filtered = store.passwords
  if (store.currentCategory !== 'all') filtered = filtered.filter(p => p.category === store.currentCategory)
  if (search) filtered = filtered.filter(p => p.title.toLowerCase().includes(search) || p.username.toLowerCase().includes(search))

  updateBatchToolbar(filtered)

  if (filtered.length === 0) {
    grid.innerHTML = ''
    grid.className = store.viewMode === 'list' ? 'password-list' : 'password-grid'
    empty.style.display = 'block'
    return
  }
  empty.style.display = 'none'

  if (store.viewMode === 'list') {
    grid.className = 'password-list'
    if (filtered.length > VIRTUAL_THRESHOLD) {
      renderVirtualList(grid, filtered)
    } else {
      grid.innerHTML = renderListView(filtered)
    }
  } else {
    grid.className = 'password-grid'
    grid.innerHTML = renderGridView(filtered)
  }
}

function renderVirtualList(grid: HTMLDivElement, filtered: PasswordEntry[]): void {
  const totalHeight = LIST_HEADER_HEIGHT + filtered.length * LIST_ITEM_HEIGHT
  const scrollTop = grid.scrollTop
  const containerHeight = grid.clientHeight

  let startIndex = Math.floor((scrollTop - LIST_HEADER_HEIGHT) / LIST_ITEM_HEIGHT)
  startIndex = Math.max(0, startIndex - VIRTUAL_BUFFER)

  let endIndex = Math.ceil((scrollTop + containerHeight - LIST_HEADER_HEIGHT) / LIST_ITEM_HEIGHT)
  endIndex = Math.min(filtered.length, endIndex + VIRTUAL_BUFFER)

  const visibleItems = filtered.slice(startIndex, endIndex)
  const topSpacer = startIndex * LIST_ITEM_HEIGHT
  const bottomSpacer = (filtered.length - endIndex) * LIST_ITEM_HEIGHT

  const itemsHtml = visibleItems.map((p, i) => renderListItem(p, true, i === visibleItems.length - 1)).join('')

  grid.innerHTML = `<div style="min-height:${totalHeight}px;">
    <div class="list-header">
      <span class="list-col list-col-title">${t('list_header_website')}</span>
      <span class="list-col list-col-category">${t('list_header_category')}</span>
      <span class="list-col list-col-username">${t('list_header_username')}</span>
      <span class="list-col list-col-password">${t('list_header_password')}</span>
      <span class="list-col list-col-actions">${t('list_header_actions')}</span>
    </div>
    <div style="height:${topSpacer}px;"></div>
    ${itemsHtml}
    <div style="height:${bottomSpacer}px;"></div>
  </div>`
}

export function renderGridView(filtered: PasswordEntry[]): string {
  return filtered.map(p => {
    const isSelected = store.selectedItems.has(p.id)
    const clickHandler = store.batchMode ? `toggleSelectItem('${p.id}')` : `togglePassword('${p.id}')`
    const checkbox = store.batchMode ? `<input type="checkbox" class="card-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleSelectItem('${p.id}')">` : ''
    const userCopy = p.username ? `<button class="copy-btn" onclick="event.stopPropagation(); copyText('${escapeJs(p.username)}')">${t('card_copyButton')}</button>` : ''
    const notesField = p.notes ? `<div class="card-field"><label>${t('card_label_notes')}</label><div class="field-text" style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px">${escapeHtml(p.notes)}</div></div>` : ''
    const deleteBtn = !store.batchMode ? `<button class="card-btn danger" onclick="event.stopPropagation(); deleteEntry('${p.id}')">${t('card_delete')}</button>` : ''
    return `<div class="password-card ${isSelected ? 'selected' : ''}" onclick="${clickHandler}">
      ${checkbox}
      <div class="card-header">
        <div class="card-title">${escapeHtml(p.title)}</div>
        <span class="card-category">${getCategoryName(p.category)}</span>
      </div>
      <div class="card-field">
        <label>${t('card_label_username')}</label>
        <div class="card-field-value">
          <span class="field-text">${escapeHtml(p.username) || '-'}</span>
          ${userCopy}
        </div>
      </div>
      <div class="card-field">
        <label>${t('card_label_password')}</label>
        <div class="card-field-value">
          <span class="field-text ${p.showPassword ? '' : 'field-masked'}" id="pwd-${p.id}">
            ${p.showPassword ? escapeHtml(p.password) : '••••••••'}
          </span>
          <button class="copy-btn" onclick="event.stopPropagation(); copyText('${escapeJs(p.password)}')">${t('card_copyButton')}</button>
        </div>
      </div>
      ${notesField}
      ${renderLogInfo(p)}
      <div class="card-actions">
        <button class="card-btn" onclick="event.stopPropagation(); copyEntry('${p.id}')">📋 ${t('card_copyEntry')}</button>
        <button class="card-btn" onclick="event.stopPropagation(); editEntry('${p.id}')">${t('card_edit')}</button>
        ${deleteBtn}
      </div>
    </div>`
  }).join('')
}

function renderListItem(p: PasswordEntry, addGap = false, isLast = false): string {
  const isSelected = store.selectedItems.has(p.id)
  const clickHandler = store.batchMode ? `toggleSelectItem('${p.id}')` : `togglePassword('${p.id}')`
  const checkbox = store.batchMode ? `<input type="checkbox" class="list-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleSelectItem('${p.id}')">` : ''
  const deleteBtn = !store.batchMode ? `<button class="copy-btn danger" onclick="event.stopPropagation(); deleteEntry('${p.id}')">${t('card_delete')}</button>` : ''
  const style = (addGap && !isLast) ? ' style="margin-bottom:8px;"' : ''
  return `<div class="password-list-item ${isSelected ? 'selected' : ''}" onclick="${clickHandler}"${style}>
    ${checkbox}
    <span class="list-col list-col-title">${escapeHtml(p.title)}</span>
    <span class="list-col list-col-category"><span class="card-category">${getCategoryName(p.category)}</span></span>
    <span class="list-col list-col-username">${escapeHtml(p.username) || '-'}</span>
    <span class="list-col list-col-password"><span class="field-text ${p.showPassword ? '' : 'field-masked'}" id="pwd-${p.id}">${p.showPassword ? escapeHtml(p.password) : '••••••••'}</span></span>
    <span class="list-col list-col-actions">
      <button class="copy-btn" onclick="event.stopPropagation(); copyText('${escapeJs(p.password)}')">${t('card_copyPassword')}</button>
      <button class="copy-btn" onclick="event.stopPropagation(); editEntry('${p.id}')">${t('card_edit')}</button>
      ${deleteBtn}
    </span>
  </div>`
}

export function renderListView(filtered: PasswordEntry[]): string {
  return `<div class="list-header">
    <span class="list-col list-col-title">${t('list_header_website')}</span>
    <span class="list-col list-col-category">${t('list_header_category')}</span>
    <span class="list-col list-col-username">${t('list_header_username')}</span>
    <span class="list-col list-col-password">${t('list_header_password')}</span>
    <span class="list-col list-col-actions">${t('list_header_actions')}</span>
  </div>` + filtered.map((p, i, arr) => renderListItem(p, false, i === arr.length - 1)).join('')
}

export function renderFilterTags(): void {
  const container = document.getElementById('filterTags') as HTMLDivElement
  const allCats = getAllCategories()
  let html = `<span class="tag ${store.currentCategory === 'all' ? 'active' : ''}" data-category="all" onclick="filterCategory('all')">${t('category_all')}</span>`
  for (const [id, name] of Object.entries(allCats)) {
    html += `<span class="tag ${store.currentCategory === id ? 'active' : ''}" data-category="${id}" onclick="filterCategory('${id}')">${name}</span>`
  }
  html += `<span class="tag" style="background:transparent;border-style:dashed;" onclick="showAddCategoryModal()" title="${t('category_addCustom')}">+</span>`
  container.innerHTML = html
}

export function renderCategorySelect(): void {
  const select = document.getElementById('entryCategory') as HTMLSelectElement
  const allCats = getAllCategories()
  let html = ''
  for (const [id, name] of Object.entries(allCats)) {
    html += `<option value="${id}">${name}</option>`
  }
  select.innerHTML = html
}

export function updateBatchToolbar(filtered: PasswordEntry[]): void {
  const toolbar = document.getElementById('batchToolbar') as HTMLDivElement
  if (store.batchMode) {
    toolbar.style.display = 'flex'
    const count = store.selectedItems.size
    ;(document.getElementById('batchCount') as HTMLSpanElement).textContent = t('batch_count', { count: String(count) })
    ;(document.getElementById('batchDeleteBtn') as HTMLButtonElement).disabled = count === 0
    ;(document.getElementById('batchExportBtn') as HTMLButtonElement).disabled = count === 0
    const selectAll = document.getElementById('selectAllBatch') as HTMLInputElement
    if (filtered.length > 0) {
      const allSelected = filtered.every(p => store.selectedItems.has(p.id))
      const someSelected = filtered.some(p => store.selectedItems.has(p.id))
      selectAll.checked = allSelected
      selectAll.indeterminate = someSelected && !allSelected
    } else {
      selectAll.checked = false
      selectAll.indeterminate = false
    }
  } else {
    toolbar.style.display = 'none'
  }
}

export function updateViewModeIcon(): void {
  const icon = document.getElementById('viewModeIcon') as unknown as SVGElement
  if (!icon) return
  if (store.viewMode === 'grid') {
    icon.innerHTML = '<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>'
    icon.parentElement?.setAttribute('title', t('tooltip_switchToList'))
  } else {
    icon.innerHTML = '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>'
    icon.parentElement?.setAttribute('title', t('tooltip_switchToGrid'))
  }
}

export function renderImportPreview(): void {
  const container = document.getElementById('importPreviewContainer') as HTMLDivElement
  const emptyState = document.getElementById('importEmptyState') as HTMLDivElement
  const tbody = document.getElementById('importPreviewBody') as HTMLTableSectionElement
  const stats = document.getElementById('importStats') as HTMLDivElement

  if (store.importPreviewData.length === 0) {
    container.style.display = 'none'
    emptyState.style.display = 'block'
    ;(document.getElementById('confirmImportBtn') as HTMLButtonElement).disabled = true
    return
  }
  container.style.display = 'block'
  emptyState.style.display = 'none'

  const validCount = store.importPreviewData.filter(i => i.valid && i.selected).length
  const totalCount = store.importPreviewData.length
  const conflictCount = store.importPreviewData.filter(i => i.conflict).length

  const conflictText = conflictCount > 0 ? t('import_conflictSuffix', { count: String(conflictCount) }) : ''
  stats.innerHTML = t('import_stats', {
    total: String(totalCount),
    valid: String(store.importPreviewData.filter(i => i.valid).length),
    selected: String(validCount),
    conflict: conflictText
  })

  tbody.innerHTML = store.importPreviewData.map((item, idx) => {
    const conflictStyle = item.conflict ? 'style="background:rgba(212,168,75,0.1)"' : ''
    const rowClass = item.selected ? 'selected' : ''
    const disabledAttr = !item.valid ? 'disabled' : ''
    let conflictCell = '<td>-</td>'
    if (item.conflict) {
      conflictCell = `<td><select onchange="setConflictAction(${idx}, this.value)" style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:0.8rem;"><option value="skip" ${item.conflictAction === 'skip' ? 'selected' : ''}>${t('import_conflict_skip')}</option><option value="overwrite" ${item.conflictAction === 'overwrite' ? 'selected' : ''}>${t('import_conflict_overwrite')}</option><option value="import" ${item.conflictAction === 'import' ? 'selected' : ''}>${t('import_conflict_import')}</option></select></td>`
    }
    return `<tr class="${rowClass}" ${conflictStyle} ${!item.valid ? 'style="opacity:0.5"' : ''}><td><input type="checkbox" ${item.selected ? 'checked' : ''} ${disabledAttr} onchange="toggleImportItem(${idx})"></td><td>${escapeHtml(item.title) || `<span style="color:var(--danger)">${t('import_required')}</span>`}${item.conflict ? ` <span style="color:var(--warning);font-size:0.75rem;">${t('import_duplicate')}</span>` : ''}</td><td>${escapeHtml(item.username) || '-'}</td><td>${getCategoryName(item.category)}</td><td>${escapeHtml(item.notes?.substring(0, 30) || '')}${item.notes && item.notes.length > 30 ? '...' : ''}</td>${conflictCell}</tr>`
  }).join('')

  ;(document.getElementById('confirmImportBtn') as HTMLButtonElement).disabled = validCount === 0
}

export function togglePassword(id: string): void {
  const entry = store.passwords.find(p => p.id === id)
  if (!entry) return
  entry.showPassword = !entry.showPassword
  const pwdEl = document.getElementById(`pwd-${id}`)
  if (pwdEl) {
    pwdEl.textContent = entry.showPassword ? entry.password : '••••••••'
    pwdEl.classList.toggle('field-masked', !entry.showPassword)
  }
}

export function filterCategory(cat: string): void {
  store.currentCategory = cat
  document.querySelectorAll('.tag').forEach(t => t.classList.remove('active'))
  const el = document.querySelector(`[data-category="${cat}"]`)
  if (el) el.classList.add('active')
  renderPasswords()
}

export function toggleViewMode(): void {
  store.viewMode = store.viewMode === 'grid' ? 'list' : 'grid'
  renderPasswords()
  updateViewModeIcon()
  showToast(store.viewMode === 'grid' ? t('viewMode_grid') : t('viewMode_list'))
}

export async function copyEntry(id: string): Promise<void> {
  const entry = store.passwords.find(p => p.id === id)
  if (!entry) return
  const newEntry: PasswordEntry = {
    ...entry,
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    title: entry.title + ' ' + t('misc_copySuffix'),
    notes: entry.notes ? entry.notes + ' ' + t('misc_copiedFrom') : t('misc_copiedFrom'),
    showPassword: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  store.passwords.push(newEntry)
  await saveToStorage()
  renderPasswords()
  showToast(t('toast_copiedEntry'))
}
