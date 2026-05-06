import { store } from './store'
import { t } from '../i18n'
import { escapeHtml, showToast } from './ui'
import { saveToStorage } from './vault'
import { renderFilterTags, renderCategorySelect, renderPasswords } from './render'

export async function loadCustomCategories(): Promise<void> {
  const stored = await window.electronAPI.settings.get('safenest_categories')
  if (stored) {
    try { store.customCategories = JSON.parse(stored) } catch { store.customCategories = [] }
  }
}

export async function saveCustomCategories(): Promise<void> {
  await window.electronAPI.settings.set('safenest_categories', JSON.stringify(store.customCategories))
}

export function getSystemCategories(): Record<string, string> {
  return {
    work: t('category_work'),
    personal: t('category_personal'),
    finance: t('category_finance'),
    social: t('category_social'),
    other: t('category_other')
  }
}

export function getAllCategories(): Record<string, string> {
  return { ...getSystemCategories(), ...Object.fromEntries(store.customCategories.map(c => [c.id, c.name])) }
}

export function getCategoryName(catId: string): string {
  return getAllCategories()[catId] || catId || t('category_other')
}

export function showAddCategoryModal(): void {
  (document.getElementById('newCategoryName') as HTMLInputElement).value = ''
  ;(document.getElementById('categoryError') as HTMLParagraphElement).textContent = ''
  renderCategoryManagement()
  ;(document.getElementById('categoryModal') as HTMLDivElement).classList.add('active')
}

export function closeCategoryModal(): void {
  ;(document.getElementById('categoryModal') as HTMLDivElement).classList.remove('active')
}

export function renderCategoryManagement(): void {
  const container = document.getElementById('customCategories') as HTMLDivElement
  if (store.customCategories.length === 0) {
    container.innerHTML = `<span style="color:var(--text-secondary);font-size:0.85rem;">${t('categoryModal_noCustom')}</span>`
  } else {
    container.innerHTML = store.customCategories.map(cat =>
      `<span class="tag" style="display:inline-flex;align-items:center;gap:6px;padding-right:8px;">\n        ${escapeHtml(cat.name)}\n        <span style="cursor:pointer;font-size:1.1rem;color:var(--danger);" onclick="deleteCategory('${cat.id}')">×</span>\n      </span>`
    ).join('')
  }
}

export async function addNewCategory(): Promise<void> {
  const name = (document.getElementById('newCategoryName') as HTMLInputElement).value.trim()
  const errorEl = document.getElementById('categoryError') as HTMLParagraphElement
  if (!name) { errorEl.textContent = t('error_categoryNameRequired'); return }
  if (name.length > 10) { errorEl.textContent = t('error_categoryNameTooLong'); return }
  if (Object.values(getSystemCategories()).includes(name) || store.customCategories.some(c => c.name === name)) {
    errorEl.textContent = t('error_categoryExists'); return
  }
  const newCat = { id: 'custom_' + Date.now().toString(36), name }
  store.customCategories.push(newCat)
  await saveCustomCategories()
  renderCategoryManagement()
  renderFilterTags()
  renderCategorySelect()
  ;(document.getElementById('newCategoryName') as HTMLInputElement).value = ''
  errorEl.textContent = ''
  showToast(t('toast_categoryAdded'))
}

export async function deleteCategory(catId: string): Promise<void> {
  if (!confirm(t('confirm_deleteCategory'))) return
  store.customCategories = store.customCategories.filter(c => c.id !== catId)
  await saveCustomCategories()
  renderCategoryManagement()
  renderFilterTags()
  renderCategorySelect()
  store.passwords.forEach(p => { if (p.category === catId) p.category = 'other' })
  await saveToStorage()
  renderPasswords()
}
