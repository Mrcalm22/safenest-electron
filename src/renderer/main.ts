import type { PasswordEntry, ImportItem } from '../types'

const LOCK_TIMEOUT = 5 * 60 * 1000
const SYSTEM_CATEGORIES: Record<string, string> = {
  work: '工作', personal: '个人', finance: '金融', social: '社交', other: '其他'
}

let currentPassword = ''
let passwords: PasswordEntry[] = []
let currentCategory = 'all'
let editingId: string | null = null
let lockTimer: ReturnType<typeof setInterval> | null = null
let lockCountdown = LOCK_TIMEOUT
let failedAttempts = 0
let importPreviewData: ImportItem[] = []
let customCategories: { id: string; name: string }[] = []
let batchMode = false
let selectedItems = new Set<string>()
let securityQuestion: string | null = null
let securityAnswer: string | null = null
let exportMode: 'all' | 'batch' = 'all'
let viewMode: 'grid' | 'list' = 'grid'

async function init() {
  await loadTheme()
  await loadCustomCategories()
  await loadSecurityQuestion()
  const hasData = await window.electronAPI.vault.has('passwordVault')
  const setupMode = document.getElementById('setupMode') as HTMLDivElement
  const unlockMode = document.getElementById('unlockMode') as HTMLDivElement
  if (hasData) {
    setupMode.style.display = 'none'
    unlockMode.style.display = 'block'
  } else {
    setupMode.style.display = 'block'
    unlockMode.style.display = 'none'
  }
}

async function login() {
  const isSetup = (document.getElementById('setupMode') as HTMLDivElement).style.display !== 'none'
  const errorEl = document.getElementById('loginError') as HTMLParagraphElement
  errorEl.textContent = ''

  if (isSetup) {
    const pwd = (document.getElementById('masterPassword') as HTMLInputElement).value
    const confirm = (document.getElementById('confirmPassword') as HTMLInputElement).value
    if (pwd.length < 8) { errorEl.textContent = '主密码至少需要8位'; return }
    if (pwd !== confirm) { errorEl.textContent = '两次输入的密码不一致'; return }
    currentPassword = pwd
    const result = await window.electronAPI.vault.setup(pwd)
    if (result.success) {
      passwords = []
      await showApp()
      showSecuritySetupModal()
    } else {
      errorEl.textContent = '创建失败，请重试'
    }
  } else {
    const pwd = (document.getElementById('unlockPassword') as HTMLInputElement).value
    const result = await window.electronAPI.vault.unlock(pwd)
    if (result.success && result.passwords !== null) {
      currentPassword = pwd
      passwords = result.passwords
      if (result.migrated) showToast('数据已自动升级到新版加密格式')
      await showApp()
    } else {
      failedAttempts++
      const attemptCount = document.getElementById('attemptCount') as HTMLSpanElement
      attemptCount.textContent = String(failedAttempts + 1)
      if (failedAttempts >= 5) {
        errorEl.textContent = '错误次数过多，请30秒后再试'
        const btn = document.querySelector('.btn-primary') as HTMLButtonElement
        btn.disabled = true
        setTimeout(() => {
          failedAttempts = 0
          attemptCount.textContent = '1'
          btn.disabled = false
          errorEl.textContent = ''
        }, 30000)
      } else {
        errorEl.textContent = '密码错误，请重试'
      }
    }
  }
}

async function showApp() {
  (document.getElementById('loginScreen') as HTMLDivElement).style.display = 'none'
  ;(document.getElementById('appContainer') as HTMLDivElement).style.display = 'block'
  await loadCustomCategories()
  renderFilterTags()
  renderCategorySelect()
  startLockTimer()
  renderPasswords()
}

function lock() {
  currentPassword = ''
  passwords = []
  stopLockTimer()

  // Close all modals
  document.querySelectorAll('.modal-overlay.active').forEach(el => el.classList.remove('active'))

  ;(document.getElementById('appContainer') as HTMLDivElement).style.display = 'none'
  ;(document.getElementById('loginScreen') as HTMLDivElement).style.display = 'flex'
  ;(document.getElementById('unlockMode') as HTMLDivElement).style.display = 'block'
  ;(document.getElementById('setupMode') as HTMLDivElement).style.display = 'none'
  ;(document.getElementById('unlockPassword') as HTMLInputElement).value = ''
  ;(document.getElementById('loginError') as HTMLParagraphElement).textContent = ''
  failedAttempts = 0
}

async function saveToStorage() {
  if (!currentPassword) return
  const encrypted = await window.electronAPI.crypto.encryptVault(passwords, currentPassword)
  await window.electronAPI.vault.set('passwordVault', JSON.stringify(encrypted))
}

// ===== Category Management =====
async function loadCustomCategories() {
  const stored = await window.electronAPI.settings.get('safenest_categories')
  if (stored) {
    try { customCategories = JSON.parse(stored) } catch { customCategories = [] }
  }
}

async function saveCustomCategories() {
  await window.electronAPI.settings.set('safenest_categories', JSON.stringify(customCategories))
}

function getAllCategories(): Record<string, string> {
  return { ...SYSTEM_CATEGORIES, ...Object.fromEntries(customCategories.map(c => [c.id, c.name])) }
}

function getCategoryName(catId: string): string {
  return getAllCategories()[catId] || catId || '其他'
}

function showAddCategoryModal() {
  (document.getElementById('newCategoryName') as HTMLInputElement).value = ''
  ;(document.getElementById('categoryError') as HTMLParagraphElement).textContent = ''
  renderCategoryManagement()
  ;(document.getElementById('categoryModal') as HTMLDivElement).classList.add('active')
}

function closeCategoryModal() {
  ;(document.getElementById('categoryModal') as HTMLDivElement).classList.remove('active')
}

function renderCategoryManagement() {
  const container = document.getElementById('customCategories') as HTMLDivElement
  if (customCategories.length === 0) {
    container.innerHTML = '<span style="color:var(--text-secondary);font-size:0.85rem;">暂无自定义分类</span>'
  } else {
    container.innerHTML = customCategories.map(cat =>
      `<span class="tag" style="display:inline-flex;align-items:center;gap:6px;padding-right:8px;">\n        ${escapeHtml(cat.name)}\n        <span style="cursor:pointer;font-size:1.1rem;color:var(--danger);" onclick="deleteCategory('${cat.id}')">×</span>\n      </span>`
    ).join('')
  }
}

async function addNewCategory() {
  const name = (document.getElementById('newCategoryName') as HTMLInputElement).value.trim()
  const errorEl = document.getElementById('categoryError') as HTMLParagraphElement
  if (!name) { errorEl.textContent = '请输入分类名称'; return }
  if (name.length > 10) { errorEl.textContent = '分类名称最多10个字符'; return }
  if (Object.values(SYSTEM_CATEGORIES).includes(name) || customCategories.some(c => c.name === name)) {
    errorEl.textContent = '该分类名称已存在'; return
  }
  const newCat = { id: 'custom_' + Date.now().toString(36), name }
  customCategories.push(newCat)
  await saveCustomCategories()
  renderCategoryManagement()
  renderFilterTags()
  renderCategorySelect()
  ;(document.getElementById('newCategoryName') as HTMLInputElement).value = ''
  errorEl.textContent = ''
  showToast('分类添加成功')
}

async function deleteCategory(catId: string) {
  if (!confirm('删除此分类后，使用该分类的密码将显示为"其他"。确定删除吗？')) return
  customCategories = customCategories.filter(c => c.id !== catId)
  await saveCustomCategories()
  renderCategoryManagement()
  renderFilterTags()
  renderCategorySelect()
  passwords.forEach(p => { if (p.category === catId) p.category = 'other' })
  await saveToStorage()
  renderPasswords()
}

function renderFilterTags() {
  const container = document.getElementById('filterTags') as HTMLDivElement
  const allCats = getAllCategories()
  let html = `<span class="tag ${currentCategory === 'all' ? 'active' : ''}" data-category="all" onclick="filterCategory('all')">全部</span>`
  for (const [id, name] of Object.entries(allCats)) {
    html += `<span class="tag ${currentCategory === id ? 'active' : ''}" data-category="${id}" onclick="filterCategory('${id}')">${name}</span>`
  }
  html += `<span class="tag" style="background:transparent;border-style:dashed;" onclick="showAddCategoryModal()" title="添加自定义分类">+</span>`
  container.innerHTML = html
}

function renderCategorySelect() {
  const select = document.getElementById('entryCategory') as HTMLSelectElement
  const allCats = getAllCategories()
  let html = ''
  for (const [id, name] of Object.entries(allCats)) {
    html += `<option value="${id}">${name}</option>`
  }
  select.innerHTML = html
}

// ===== Password Management =====
function renderPasswords() {
  const grid = document.getElementById("passwordGrid") as HTMLDivElement
  const search = (document.getElementById("searchInput") as HTMLInputElement).value.toLowerCase()
  const empty = document.getElementById("emptyState") as HTMLDivElement

  let filtered = passwords
  if (currentCategory !== "all") filtered = filtered.filter(p => p.category === currentCategory)
  if (search) filtered = filtered.filter(p => p.title.toLowerCase().includes(search) || p.username.toLowerCase().includes(search))

  updateBatchToolbar(filtered)

  if (filtered.length === 0) {
    grid.innerHTML = ""
    grid.className = viewMode === "list" ? "password-list" : "password-grid"
    empty.style.display = "block"
    return
  }
  empty.style.display = "none"

  if (viewMode === "list") {
    grid.className = "password-list"
    grid.innerHTML = renderListView(filtered)
  } else {
    grid.className = "password-grid"
    grid.innerHTML = renderGridView(filtered)
  }
}

function renderGridView(filtered: PasswordEntry[]): string {
  return filtered.map(p => {
    const isSelected = selectedItems.has(p.id)
    const clickHandler = batchMode ? `toggleSelectItem('${p.id}')` : `togglePassword('${p.id}')`
    const checkbox = batchMode ? `<input type="checkbox" class="card-checkbox" ${isSelected ? "checked" : ""} onclick="event.stopPropagation(); toggleSelectItem('${p.id}')">` : ""
    const userCopy = p.username ? `<button class="copy-btn" onclick="event.stopPropagation(); copyText('${escapeJs(p.username)}')">复制</button>` : ""
    const notesField = p.notes ? `<div class="card-field"><label>备注</label><div class="field-text" style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px">${escapeHtml(p.notes)}</div></div>` : ""
    const deleteBtn = !batchMode ? `<button class="card-btn danger" onclick="event.stopPropagation(); deleteEntry('${p.id}')">删除</button>` : ""
    return `<div class="password-card ${isSelected ? "selected" : ""}" onclick="${clickHandler}">
      ${checkbox}
      <div class="card-header">
        <div class="card-title">${escapeHtml(p.title)}</div>
        <span class="card-category">${getCategoryName(p.category)}</span>
      </div>
      <div class="card-field">
        <label>用户名</label>
        <div class="card-field-value">
          <span class="field-text">${escapeHtml(p.username) || "-"}</span>
          ${userCopy}
        </div>
      </div>
      <div class="card-field">
        <label>密码</label>
        <div class="card-field-value">
          <span class="field-text ${p.showPassword ? "" : "field-masked"}" id="pwd-${p.id}">
            ${p.showPassword ? escapeHtml(p.password) : "••••••••"}
          </span>
          <button class="copy-btn" onclick="event.stopPropagation(); copyText('${escapeJs(p.password)}')">复制</button>
        </div>
      </div>
      ${notesField}
      ${renderLogInfo(p)}
      <div class="card-actions">
        <button class="card-btn" onclick="event.stopPropagation(); copyEntry('${p.id}')">📋 复制</button>
        <button class="card-btn" onclick="event.stopPropagation(); editEntry('${p.id}')">编辑</button>
        ${deleteBtn}
      </div>
    </div>`
  }).join("")
}

function renderListView(filtered: PasswordEntry[]): string {
  let html = `<div class="list-header">
    <span class="list-col list-col-title">网站/应用</span>
    <span class="list-col list-col-category">分类</span>
    <span class="list-col list-col-username">用户名</span>
    <span class="list-col list-col-password">密码</span>
    <span class="list-col list-col-actions">操作</span>
  </div>`

  html += filtered.map(p => {
    const isSelected = selectedItems.has(p.id)
    const clickHandler = batchMode ? `toggleSelectItem('${p.id}')` : `togglePassword('${p.id}')`
    const checkbox = batchMode ? `<input type="checkbox" class="list-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleSelectItem('${p.id}')">` : ''
    const deleteBtn = !batchMode ? `<button class="copy-btn danger" onclick="event.stopPropagation(); deleteEntry('${p.id}')">删除</button>` : ''
    return `<div class="password-list-item ${isSelected ? 'selected' : ''}" onclick="${clickHandler}">
      ${checkbox}
      <span class="list-col list-col-title">${escapeHtml(p.title)}</span>
      <span class="list-col list-col-category"><span class="card-category">${getCategoryName(p.category)}</span></span>
      <span class="list-col list-col-username">${escapeHtml(p.username) || '-'}</span>
      <span class="list-col list-col-password"><span class="field-text ${p.showPassword ? '' : 'field-masked'}" id="pwd-${p.id}">${p.showPassword ? escapeHtml(p.password) : '••••••••'}</span></span>
      <span class="list-col list-col-actions">
        <button class="copy-btn" onclick="event.stopPropagation(); copyText('${escapeJs(p.password)}')">复制密码</button>
        <button class="copy-btn" onclick="event.stopPropagation(); editEntry('${p.id}')">编辑</button>
        ${deleteBtn}
      </span>
    </div>`
  }).join('')

  return html
}

function togglePassword(id: string) {
  const entry = passwords.find(p => p.id === id)
  if (entry) { entry.showPassword = !entry.showPassword; renderPasswords() }
}

function filterCategory(cat: string) {
  currentCategory = cat
  document.querySelectorAll('.tag').forEach(t => t.classList.remove('active'))
  const el = document.querySelector(`[data-category="${cat}"]`)
  if (el) el.classList.add('active')
  renderPasswords()
}

// ===== View Mode =====
function toggleViewMode() {
  viewMode = viewMode === 'grid' ? 'list' : 'grid'
  renderPasswords()
  updateViewModeIcon()
  showToast(viewMode === 'grid' ? '已切换到网格视图' : '已切换到列表视图')
}

function updateViewModeIcon() {
  const icon = document.getElementById('viewModeIcon') as unknown as SVGElement
  if (!icon) return
  if (viewMode === 'grid') {
    icon.innerHTML = '<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>'
    icon.parentElement?.setAttribute('title', '切换为列表视图')
  } else {
    icon.innerHTML = '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>'
    icon.parentElement?.setAttribute('title', '切换为网格视图')
  }
}

// ===== Batch Operations =====
function toggleBatchMode() {
  batchMode = !batchMode
  if (!batchMode) selectedItems.clear()
  renderPasswords()
  showToast(batchMode ? '已开启批量选择模式，点击卡片选择' : '已退出批量模式')
}

function updateBatchToolbar(filtered: PasswordEntry[]) {
  const toolbar = document.getElementById('batchToolbar') as HTMLDivElement
  if (batchMode) {
    toolbar.style.display = 'flex'
    const count = selectedItems.size
    ;(document.getElementById('batchCount') as HTMLSpanElement).textContent = `已选择 ${count} 条`
    ;(document.getElementById('batchDeleteBtn') as HTMLButtonElement).disabled = count === 0
    ;(document.getElementById('batchExportBtn') as HTMLButtonElement).disabled = count === 0
    const selectAll = document.getElementById('selectAllBatch') as HTMLInputElement
    if (filtered.length > 0) {
      const allSelected = filtered.every(p => selectedItems.has(p.id))
      const someSelected = filtered.some(p => selectedItems.has(p.id))
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

function toggleSelectItem(id: string) {
  if (selectedItems.has(id)) selectedItems.delete(id)
  else selectedItems.add(id)
  renderPasswords()
}

function toggleSelectAllBatch() {
  const selectAll = (document.getElementById('selectAllBatch') as HTMLInputElement).checked
  let filtered = passwords
  if (currentCategory !== 'all') filtered = filtered.filter(p => p.category === currentCategory)
  const search = (document.getElementById('searchInput') as HTMLInputElement).value.toLowerCase()
  if (search) filtered = filtered.filter(p => p.title.toLowerCase().includes(search) || p.username.toLowerCase().includes(search))
  if (selectAll) filtered.forEach(p => selectedItems.add(p.id))
  else filtered.forEach(p => selectedItems.delete(p.id))
  renderPasswords()
}

function cancelBatchSelection() { batchMode = false; selectedItems.clear(); renderPasswords() }

function showBatchExportVerify() {
  if (selectedItems.size === 0) return
  exportMode = 'batch'
  showExportVerify()
}

function showBatchDeleteVerify() {
  if (selectedItems.size === 0) return
  ;(document.getElementById('batchDeletePassword') as HTMLInputElement).value = ''
  ;(document.getElementById('batchDeleteAnswer') as HTMLInputElement).value = ''
  ;(document.getElementById('batchDeleteError') as HTMLParagraphElement).textContent = ''
  const questionEl = document.getElementById('batchDeleteQuestion') as HTMLParagraphElement
  const questionContainer = document.getElementById('securityQuestionDisplay') as HTMLDivElement
  if (securityQuestion) { questionEl.textContent = securityQuestion; questionContainer.style.display = 'block' }
  else { questionContainer.style.display = 'none' }
  ;(document.getElementById('batchDeleteVerifyModal') as HTMLDivElement).classList.add('active')
}

function closeBatchDeleteVerify() {
  ;(document.getElementById('batchDeleteVerifyModal') as HTMLDivElement).classList.remove('active')
}

async function confirmBatchDelete() {
  const password = (document.getElementById('batchDeletePassword') as HTMLInputElement).value
  const answer = (document.getElementById('batchDeleteAnswer') as HTMLInputElement).value
  const errorEl = document.getElementById('batchDeleteError') as HTMLParagraphElement
  if (!password) { errorEl.textContent = '请输入主密码'; return }

  const isValid = await window.electronAPI.crypto.verifyPassword(password, await window.electronAPI.vault.get('passwordHash') || '')
  if (!isValid) { errorEl.textContent = '主密码错误'; return }

  if (securityQuestion) {
    if (!answer) { errorEl.textContent = '请输入安全验证答案'; return }
    const encoder = new TextEncoder()
    const answerHash = await crypto.subtle.digest('SHA-256', encoder.encode(answer.toLowerCase().trim()))
    const answerHex = Array.from(new Uint8Array(answerHash)).map(b => b.toString(16).padStart(2, '0')).join('')
    if (answerHex !== securityAnswer) { errorEl.textContent = '安全验证答案错误'; return }
  }

  const count = selectedItems.size
  passwords = passwords.filter(p => !selectedItems.has(p.id))
  selectedItems.clear()
  batchMode = false
  await saveToStorage()
  closeBatchDeleteVerify()
  renderPasswords()
  showToast(`已删除 ${count} 条记录`)
}

// ===== Security Question =====
function showSecuritySetupModal() {
  ;(document.getElementById('setupSecurityQuestion') as HTMLInputElement).value = ''
  ;(document.getElementById('setupSecurityAnswer') as HTMLInputElement).value = ''
  ;(document.getElementById('securitySetupError') as HTMLParagraphElement).textContent = ''
  ;(document.getElementById('securitySetupModal') as HTMLDivElement).classList.add('active')
}

async function saveSecuritySetup() {
  const question = (document.getElementById('setupSecurityQuestion') as HTMLInputElement).value.trim()
  const answer = (document.getElementById('setupSecurityAnswer') as HTMLInputElement).value.trim()
  const errorEl = document.getElementById('securitySetupError') as HTMLParagraphElement
  if (!question) { errorEl.textContent = '请输入验证问题'; return }
  if (!answer) { errorEl.textContent = '请输入答案'; return }

  const encoder = new TextEncoder()
  const answerHash = await crypto.subtle.digest('SHA-256', encoder.encode(answer.toLowerCase()))
  const answerHex = Array.from(new Uint8Array(answerHash)).map(b => b.toString(16).padStart(2, '0')).join('')
  securityAnswer = answerHex
  securityQuestion = question
  await window.electronAPI.vault.set('safenest_security_question', question)
  await window.electronAPI.vault.set('safenest_security_answer', answerHex)
  ;(document.getElementById('securitySetupModal') as HTMLDivElement).classList.remove('active')
  showToast('安全验证已设置')
}

async function loadSecurityQuestion() {
  const question = await window.electronAPI.vault.get('safenest_security_question')
  const answer = await window.electronAPI.vault.get('safenest_security_answer')
  if (question && answer) { securityQuestion = question; securityAnswer = answer }
}

// ===== Modal Functions =====
function showAddModal() {
  editingId = null
  ;(document.getElementById('modalTitle') as HTMLHeadingElement).textContent = '添加密码'
  ;(document.getElementById('entryTitle') as HTMLInputElement).value = ''
  ;(document.getElementById('entryCategory') as HTMLSelectElement).value = 'work'
  ;(document.getElementById('entryUsername') as HTMLInputElement).value = ''
  ;(document.getElementById('entryPassword') as HTMLInputElement).value = ''
  ;(document.getElementById('entryNotes') as HTMLInputElement).value = ''
  ;(document.getElementById('strengthFill') as HTMLDivElement).className = 'strength-fill'
  ;(document.getElementById('editModal') as HTMLDivElement).classList.add('active')
}

function editEntry(id: string) {
  const entry = passwords.find(p => p.id === id)
  if (!entry) return
  editingId = id
  ;(document.getElementById('modalTitle') as HTMLHeadingElement).textContent = '编辑密码'
  ;(document.getElementById('entryTitle') as HTMLInputElement).value = entry.title
  ;(document.getElementById('entryCategory') as HTMLSelectElement).value = entry.category
  ;(document.getElementById('entryUsername') as HTMLInputElement).value = entry.username
  ;(document.getElementById('entryPassword') as HTMLInputElement).value = entry.password
  ;(document.getElementById('entryNotes') as HTMLInputElement).value = entry.notes || ''
  checkStrength()
  ;(document.getElementById('editModal') as HTMLDivElement).classList.add('active')
}

async function saveEntry() {
  const title = (document.getElementById('entryTitle') as HTMLInputElement).value.trim()
  const password = (document.getElementById('entryPassword') as HTMLInputElement).value
  if (!title || !password) { showToast('请填写必填项'); return }

  const now = Date.now()
  const entry: PasswordEntry = {
    id: editingId || Date.now().toString(36),
    title,
    category: (document.getElementById('entryCategory') as HTMLSelectElement).value,
    username: (document.getElementById('entryUsername') as HTMLInputElement).value.trim(),
    password,
    notes: (document.getElementById('entryNotes') as HTMLInputElement).value.trim(),
    showPassword: false,
    createdAt: editingId ? (passwords.find(p => p.id === editingId)?.createdAt || now) : now,
    updatedAt: now
  }

  if (editingId) {
    const idx = passwords.findIndex(p => p.id === editingId)
    if (idx !== -1) passwords[idx] = entry
  } else {
    passwords.push(entry)
  }
  await saveToStorage()
  closeModal()
  renderPasswords()
  showToast('保存成功')
}

async function deleteEntry(id: string) {
  if (!confirm('确定要删除这个密码吗？此操作不可恢复。')) return
  passwords = passwords.filter(p => p.id !== id)
  await saveToStorage()
  renderPasswords()
  showToast('已删除')
}

function closeModal() { (document.getElementById('editModal') as HTMLDivElement).classList.remove('active') }

// ===== Password Generator =====
async function generatePasswordUI() {
  const pwd = await window.electronAPI.crypto.generatePassword(16)
  ;(document.getElementById('entryPassword') as HTMLInputElement).value = pwd
  checkStrength()
}

function checkStrength() {
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

// ===== Import / Export =====
async function exportData() {
  if (passwords.length === 0) { showToast('没有可导出的数据'); return }
  exportMode = 'all'
  showExportVerify()
}

function showExportVerify() {
  ;(document.getElementById('exportVerifyPassword') as HTMLInputElement).value = ''
  ;(document.getElementById('exportVerifyError') as HTMLParagraphElement).textContent = ''
  ;(document.getElementById('exportVerifyModal') as HTMLDivElement).classList.add('active')
}

function closeExportVerifyModal() {
  ;(document.getElementById('exportVerifyModal') as HTMLDivElement).classList.remove('active')
}

async function confirmExportVerify() {
  const password = (document.getElementById('exportVerifyPassword') as HTMLInputElement).value
  const errorEl = document.getElementById('exportVerifyError') as HTMLParagraphElement
  if (!password) { errorEl.textContent = '请输入主密码'; return }

  const hashStr = await window.electronAPI.vault.get('passwordHash')
  if (!hashStr) { errorEl.textContent = '无法验证'; return }

  const valid = await window.electronAPI.crypto.verifyPassword(password, hashStr)
  if (!valid) { errorEl.textContent = '密码错误'; return }

  closeExportVerifyModal()

  const entriesToExport = exportMode === 'batch'
    ? passwords.filter(p => selectedItems.has(p.id))
    : passwords

  if (entriesToExport.length === 0) { showToast('没有可导出的数据'); return }

  const markdown = await generateMarkdownExport(entriesToExport)
  ;(document.getElementById('exportMarkdownTextarea') as HTMLTextAreaElement).value = markdown
  ;(document.getElementById('exportMarkdownModal') as HTMLDivElement).classList.add('active')
}

async function generateMarkdownExport(entries: PasswordEntry[]): Promise<string> {
  const date = new Date().toLocaleString('zh-CN')
  let markdown = `# SafeNest 密码导出\n\n`
  markdown += `> 导出时间：${date}\n`
  markdown += `> 条目数量：${entries.length}\n\n`
  markdown += `---\n\n`
  entries.forEach((entry, index) => {
    markdown += `## ${index + 1}. ${entry.title}\n\n`
    markdown += `- **名称**：${entry.title}\n`
    markdown += `- **分类**：${getCategoryName(entry.category)}\n`
    markdown += `- **用户**：${entry.username || '(空)'}\n`
    markdown += `- **密码**：${entry.password}\n`
    markdown += `- **备注**：${entry.notes || '(无)'}\n`
    markdown += `- **创建时间**：${entry.createdAt ? formatDateTime(entry.createdAt) : '未知'}\n`
    markdown += `- **修改时间**：${entry.updatedAt ? formatDateTime(entry.updatedAt) : '未知'}\n\n`
    markdown += `---\n\n`
  })
  markdown += `## 导入说明\n\n`
  markdown += `此文件可以通过 SafeNest 的导入功能重新导入。导入时会检测名称冲突并提供处理选项。\n`
  return markdown
}

function closeExportMarkdownModal() {
  ;(document.getElementById('exportMarkdownModal') as HTMLDivElement).classList.remove('active')
}

function downloadMarkdownExport() {
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
  showToast('已开始下载')
}

function showImportPreviewModal() {
  ;(document.getElementById('importPreviewModal') as HTMLDivElement).classList.add('active')
  importPreviewData = []
  ;(document.getElementById('importPreviewContainer') as HTMLDivElement).style.display = 'none'
  ;(document.getElementById('importEmptyState') as HTMLDivElement).style.display = 'block'
  ;(document.getElementById('confirmImportBtn') as HTMLButtonElement).disabled = true
  ;(document.getElementById('importFile') as HTMLInputElement).value = ''
  ;(document.getElementById('selectAllImport') as HTMLInputElement).checked = true
}

function closeImportPreviewModal() {
  ;(document.getElementById('importPreviewModal') as HTMLDivElement).classList.remove('active')
  importPreviewData = []
}

async function handleImportFile(event: Event) {
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

    if (parsed.length === 0) { showToast('未能识别有效数据'); return }
    importPreviewData = parsed.map(item => {
      const existing = passwords.find(p => p.title === item.title)
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
    showToast('文件解析失败: ' + (err instanceof Error ? err.message : String(err)))
  }
}

function tryAutoDetect(content: string) {
  if (content.includes('## ') && content.includes('**名称**')) { try { return parseMarkdownImport(content) } catch {} }
  try { return parseJSONImport(content) } catch {}
  try { return parseCSVImport(content) } catch {}
  return []
}

function parseMarkdownImport(content: string) {
  const entries: Array<{ title: string; username: string; password: string; category: string; notes: string }> = []
  const sections = content.split(/##\s+/)
  for (const section of sections) {
    const lines = section.trim().split('\n')
    if (lines.length < 2) continue
    const entry = { title: '', username: '', password: '', category: 'other', notes: '' }
    const titleMatch = lines[0].match(/^\d+\.\s*(.+)$/)
    if (titleMatch) entry.title = titleMatch[1].trim()
    for (const line of lines) {
      const trimmed = line.trim()
      const nameMatch = trimmed.match(/[-*]\s*\*\*名称\*\*[:：]?\s*(.+)/)
      if (nameMatch) entry.title = nameMatch[1].trim()
      const catMatch = trimmed.match(/[-*]\s*\*\*分类\*\*[:：]?\s*(.+)/)
      if (catMatch) {
        const catMap: Record<string, string> = { '工作': 'work', '个人': 'personal', '金融': 'finance', '社交': 'social', '其他': 'other' }
        entry.category = catMap[catMatch[1].trim()] || 'other'
      }
      const userMatch = trimmed.match(/[-*]\s*\*\*用户\*\*[:：]?\s*(.+)/)
      if (userMatch) entry.username = userMatch[1].trim() === '(空)' ? '' : userMatch[1].trim()
      const passMatch = trimmed.match(/[-*]\s*\*\*密码\*\*[:：]?\s*(.+)/)
      if (passMatch) entry.password = passMatch[1].trim()
      const notesMatch = trimmed.match(/[-*]\s*\*\*备注\*\*[:：]?\s*(.+)/)
      if (notesMatch) entry.notes = notesMatch[1].trim() === '(无)' ? '' : notesMatch[1].trim()
    }
    if (entry.title) entries.push(entry)
  }
  return entries
}

function parseJSONImport(content: string) {
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

function parseCSVImport(content: string) {
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

function renderImportPreview() {
  const container = document.getElementById('importPreviewContainer') as HTMLDivElement
  const emptyState = document.getElementById('importEmptyState') as HTMLDivElement
  const tbody = document.getElementById('importPreviewBody') as HTMLTableSectionElement
  const stats = document.getElementById('importStats') as HTMLDivElement

  if (importPreviewData.length === 0) {
    container.style.display = 'none'
    emptyState.style.display = 'block'
    ;(document.getElementById('confirmImportBtn') as HTMLButtonElement).disabled = true
    return
  }
  container.style.display = 'block'
  emptyState.style.display = 'none'

  const validCount = importPreviewData.filter(i => i.valid && i.selected).length
  const totalCount = importPreviewData.length
  const conflictCount = importPreviewData.filter(i => i.conflict).length

  stats.innerHTML = `共识别 <strong>${totalCount}</strong> 条记录，有效 <strong>${importPreviewData.filter(i => i.valid).length}</strong> 条，选中 <strong>${validCount}</strong> 条待导入${conflictCount > 0 ? `，其中 <strong style="color:var(--warning)">${conflictCount}</strong> 条名称重复` : ''}`

  tbody.innerHTML = importPreviewData.map((item, idx) => {
    const conflictStyle = item.conflict ? 'style="background:rgba(212,168,75,0.1)"' : ''
    const rowClass = item.selected ? 'selected' : ''
    const disabledAttr = !item.valid ? 'disabled' : ''
    let conflictCell = '<td>-</td>'
    if (item.conflict) {
      conflictCell = `<td><select onchange="setConflictAction(${idx}, this.value)" style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:0.8rem;"><option value="skip" ${item.conflictAction === 'skip' ? 'selected' : ''}>不导入</option><option value="overwrite" ${item.conflictAction === 'overwrite' ? 'selected' : ''}>覆盖</option><option value="import" ${item.conflictAction === 'import' ? 'selected' : ''}>导入</option></select></td>`
    }
    return `<tr class="${rowClass}" ${conflictStyle} ${!item.valid ? 'style="opacity:0.5"' : ''}><td><input type="checkbox" ${item.selected ? 'checked' : ''} ${disabledAttr} onchange="toggleImportItem(${idx})"></td><td>${escapeHtml(item.title) || '<span style="color:var(--danger)">(必填)</span>'}${item.conflict ? ' <span style="color:var(--warning);font-size:0.75rem;">[重复]</span>' : ''}</td><td>${escapeHtml(item.username) || '-'}</td><td>${getCategoryName(item.category)}</td><td>${escapeHtml(item.notes?.substring(0, 30) || '')}${item.notes && item.notes.length > 30 ? '...' : ''}</td>${conflictCell}</tr>`
  }).join('')

  ;(document.getElementById('confirmImportBtn') as HTMLButtonElement).disabled = validCount === 0
}

function setConflictAction(idx: number, action: 'skip' | 'overwrite' | 'import') {
  importPreviewData[idx].conflictAction = action
  if (action !== 'skip' && !importPreviewData[idx].selected) importPreviewData[idx].selected = true
  renderImportPreview()
}

function toggleImportItem(idx: number) {
  importPreviewData[idx].selected = !importPreviewData[idx].selected
  renderImportPreview()
}

function toggleSelectAllImport() {
  const checked = (document.getElementById('selectAllImport') as HTMLInputElement).checked
  importPreviewData.forEach(i => { if (i.valid) i.selected = checked })
  renderImportPreview()
}

async function confirmImport() {
  const items = importPreviewData.filter(i => i.selected && i.valid && i.conflictAction !== 'skip')
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
      const idx = passwords.findIndex(p => p.id === item.existingId)
      if (idx !== -1) passwords[idx] = { ...entry, id: item.existingId, createdAt: passwords[idx].createdAt }
    } else {
      passwords.push(entry)
    }
  }
  await saveToStorage()
  closeImportPreviewModal()
  renderPasswords()
  showToast(`成功导入 ${items.length} 条记录`)
}

// ===== Reset =====
let resetCountdownTimer: ReturnType<typeof setInterval> | null = null
let resetCountdownValue = 5

function showResetModal() {
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

  if (securityQuestion) {
    questionBox.style.display = 'block'
    textBox.style.display = 'none'
    questionText.textContent = securityQuestion
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

function closeResetVerifyModal() {
  ;(document.getElementById('resetVerifyModal') as HTMLDivElement).classList.remove('active')
}

function checkResetText() {
  const text = (document.getElementById('resetVerifyText') as HTMLInputElement).value.trim()
  const btn = document.getElementById('resetConfirmBtn') as HTMLButtonElement
  const valid = text === 'DELETE ALL DATA'
  btn.disabled = !valid
  btn.style.opacity = valid ? '1' : '0.5'
}

function checkResetAnswer() {
  const answer = (document.getElementById('resetVerifyAnswer') as HTMLInputElement).value.trim()
  const btn = document.getElementById('resetConfirmBtn') as HTMLButtonElement
  btn.disabled = !answer
  btn.style.opacity = answer ? '1' : '0.5'
}

async function checkResetVerify() {
  const errorEl = document.getElementById('resetVerifyError') as HTMLParagraphElement
  errorEl.textContent = ''

  if (securityQuestion) {
    const answer = (document.getElementById('resetVerifyAnswer') as HTMLInputElement).value.trim()
    if (!answer) { errorEl.textContent = '请输入安全验证答案'; return }
    const encoder = new TextEncoder()
    const answerHash = await crypto.subtle.digest('SHA-256', encoder.encode(answer.toLowerCase()))
    const answerHex = Array.from(new Uint8Array(answerHash)).map(b => b.toString(16).padStart(2, '0')).join('')
    if (answerHex !== securityAnswer) { errorEl.textContent = '安全验证答案错误'; return }
  } else {
    const text = (document.getElementById('resetVerifyText') as HTMLInputElement).value.trim()
    if (text !== 'DELETE ALL DATA') { errorEl.textContent = '确认文本不正确'; return }
  }

  closeResetVerifyModal()
  ;(document.getElementById('resetEntryCount') as HTMLSpanElement).textContent = String(passwords.length)
  ;(document.getElementById('resetModal') as HTMLDivElement).classList.add('active')

  resetCountdownValue = 5
  const finalBtn = document.getElementById('finalResetBtn') as HTMLButtonElement
  finalBtn.disabled = true
  finalBtn.textContent = `确认重置系统 (${resetCountdownValue})`

  if (resetCountdownTimer) clearInterval(resetCountdownTimer)
  resetCountdownTimer = setInterval(() => {
    resetCountdownValue--
    if (resetCountdownValue > 0) {
      finalBtn.textContent = `确认重置系统 (${resetCountdownValue})`
    } else {
      finalBtn.disabled = false
      finalBtn.textContent = '确认重置系统'
      if (resetCountdownTimer) { clearInterval(resetCountdownTimer); resetCountdownTimer = null }
    }
  }, 1000)
}

function closeResetModal() {
  ;(document.getElementById('resetModal') as HTMLDivElement).classList.remove('active')
  if (resetCountdownTimer) { clearInterval(resetCountdownTimer); resetCountdownTimer = null }
}

async function confirmReset() {
  if (resetCountdownTimer) { clearInterval(resetCountdownTimer); resetCountdownTimer = null }
  await window.electronAPI.vault.remove('passwordVault')
  await window.electronAPI.vault.remove('passwordHash')
  await window.electronAPI.vault.remove('safenest_security_question')
  await window.electronAPI.vault.remove('safenest_security_answer')
  currentPassword = ''
  passwords = []
  failedAttempts = 0
  securityQuestion = null
  securityAnswer = null
  batchMode = false
  selectedItems.clear()
  closeResetModal()
  ;(document.getElementById('setupMode') as HTMLDivElement).style.display = 'block'
  ;(document.getElementById('unlockMode') as HTMLDivElement).style.display = 'none'
  ;(document.getElementById('masterPassword') as HTMLInputElement).value = ''
  ;(document.getElementById('confirmPassword') as HTMLInputElement).value = ''
  ;(document.getElementById('unlockPassword') as HTMLInputElement).value = ''
  ;(document.getElementById('loginError') as HTMLParagraphElement).textContent = ''
  showToast('系统已重置，请创建新主密码')
}

// ===== Theme =====
async function loadTheme() {
  const savedTheme = await window.electronAPI.settings.get('safenest_theme') || ''
  await setTheme(savedTheme, false)
}

function getCurrentTheme(): string {
  return document.documentElement.getAttribute('data-theme') || ''
}

async function setTheme(theme: string, save = true) {
  if (theme) document.documentElement.setAttribute('data-theme', theme)
  else document.documentElement.removeAttribute('data-theme')
  if (save) await window.electronAPI.settings.set('safenest_theme', theme)
  updateThemeDropdown()
}

function toggleThemeDropdown() {
  document.getElementById('themeDropdown')?.classList.toggle('active')
}

function updateThemeDropdown() {
  const current = getCurrentTheme()
  document.querySelectorAll('.theme-option').forEach(opt => opt.classList.remove('active'))
  const activeOption = document.querySelector(`.theme-option[data-theme="${current}"]`)
  if (activeOption) activeOption.classList.add('active')
}

// ===== Lock Timer =====
function startLockTimer() {
  lockCountdown = LOCK_TIMEOUT
  updateTimerDisplay()
  lockTimer = setInterval(() => {
    lockCountdown -= 1000
    updateTimerDisplay()
    if (lockCountdown <= 0) lock()
  }, 1000)
  ;['mousedown', 'keydown', 'touchstart'].forEach(event => {
    document.addEventListener(event, resetLockTimer, { passive: true })
  })
}

function stopLockTimer() {
  if (lockTimer) { clearInterval(lockTimer); lockTimer = null }
}

function resetLockTimer() { lockCountdown = LOCK_TIMEOUT; updateTimerDisplay() }

function updateTimerDisplay() {
  const minutes = Math.floor(lockCountdown / 60000)
  const seconds = Math.floor((lockCountdown % 60000) / 1000)
  const text = `${minutes}:${seconds.toString().padStart(2, '0')}`
  ;(document.getElementById('timerText') as HTMLSpanElement).textContent = text
  const timerEl = document.getElementById('lockTimer') as HTMLSpanElement
  if (lockCountdown < 60000) timerEl.classList.add('warning')
  else timerEl.classList.remove('warning')
}

// ===== Utilities =====
async function copyText(text: string) {
  await navigator.clipboard.writeText(text)
  showToast('已复制')
}

function showToast(msg: string) {
  const toast = document.getElementById('toast') as HTMLDivElement
  toast.textContent = msg
  toast.classList.add('show')
  setTimeout(() => toast.classList.remove('show'), 2000)
}

function escapeHtml(str: string): string {
  if (!str) return ''
  return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] || m))
}

function escapeJs(str: string): string {
  if (!str) return ''
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"')
}

function renderLogInfo(entry: PasswordEntry): string {
  const created = entry.createdAt ? formatDateTime(entry.createdAt) : '未知'
  const updated = entry.updatedAt && entry.updatedAt !== entry.createdAt ? ` · 修改于 ${formatDateTime(entry.updatedAt)}` : ''
  return `<div class="log-info">创建于 ${created}${updated}</div>`
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

async function copyEntry(id: string) {
  const entry = passwords.find(p => p.id === id)
  if (!entry) return
  const newEntry: PasswordEntry = {
    ...entry,
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    title: entry.title + ' (复制)',
    notes: entry.notes ? entry.notes + ' (从原条目复制)' : '从原条目复制',
    showPassword: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  passwords.push(newEntry)
  await saveToStorage()
  renderPasswords()
  showToast('已复制条目')
}

// ===== Settings =====
function showSettingsModal() {
  ;(document.getElementById('settingsVerifyPassword') as HTMLInputElement).value = ''
  ;(document.getElementById('settingsVerifyError') as HTMLParagraphElement).textContent = ''
  ;(document.getElementById('settingsVerifySection') as HTMLDivElement).style.display = 'block'
  ;(document.getElementById('settingsContentSection') as HTMLDivElement).style.display = 'none'
  ;(document.getElementById('settingsModal') as HTMLDivElement).classList.add('active')
}

function closeSettingsModal() {
  ;(document.getElementById('settingsModal') as HTMLDivElement).classList.remove('active')
}

async function verifySettingsPassword() {
  const password = (document.getElementById('settingsVerifyPassword') as HTMLInputElement).value
  const errorEl = document.getElementById('settingsVerifyError') as HTMLParagraphElement
  if (!password) { errorEl.textContent = '请输入主密码'; return }

  const hashStr = await window.electronAPI.vault.get('passwordHash')
  if (!hashStr) { errorEl.textContent = '无法获取密码哈希'; return }

  const valid = await window.electronAPI.crypto.verifyPassword(password, hashStr)
  if (!valid) { errorEl.textContent = '主密码错误'; return }

  // Show settings content
  ;(document.getElementById('settingsVerifySection') as HTMLDivElement).style.display = 'none'
  ;(document.getElementById('settingsContentSection') as HTMLDivElement).style.display = 'block'

  // Pre-fill current question if exists
  const currentQuestionBox = document.getElementById('settingsCurrentQuestionBox') as HTMLDivElement
  const currentQuestionText = document.getElementById('settingsCurrentQuestionText') as HTMLSpanElement
  if (securityQuestion) {
    currentQuestionText.textContent = securityQuestion
    currentQuestionBox.style.display = 'block'
  } else {
    currentQuestionBox.style.display = 'none'
  }

  // Clear inputs
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

function checkSettingsNewPasswordStrength() {
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

async function changeMasterPassword() {
  const currentPwd = (document.getElementById('settingsCurrentPassword') as HTMLInputElement).value
  const newPwd = (document.getElementById('settingsNewPassword') as HTMLInputElement).value
  const confirmPwd = (document.getElementById('settingsConfirmPassword') as HTMLInputElement).value
  const errorEl = document.getElementById('settingsPasswordError') as HTMLParagraphElement
  errorEl.textContent = ''

  if (!currentPwd) { errorEl.textContent = '请输入当前主密码'; return }
  if (newPwd.length < 8) { errorEl.textContent = '新主密码至少需要8位'; return }
  if (newPwd !== confirmPwd) { errorEl.textContent = '两次输入的新密码不一致'; return }
  if (newPwd === currentPwd) { errorEl.textContent = '新密码不能与当前密码相同'; return }

  const result = await window.electronAPI.vault.changePassword(currentPwd, newPwd)
  if (result.success) {
    currentPassword = newPwd
    ;(document.getElementById('settingsCurrentPassword') as HTMLInputElement).value = ''
    ;(document.getElementById('settingsNewPassword') as HTMLInputElement).value = ''
    ;(document.getElementById('settingsConfirmPassword') as HTMLInputElement).value = ''
    ;(document.getElementById('settingsStrengthFill') as HTMLDivElement).className = 'strength-fill'
    showToast('主密码修改成功')
  } else {
    errorEl.textContent = result.error || '修改失败'
  }
}

async function changeSecurityQuestion() {
  const newQuestion = (document.getElementById('settingsNewQuestion') as HTMLInputElement).value.trim()
  const newAnswer = (document.getElementById('settingsNewAnswer') as HTMLInputElement).value.trim()
  const confirmAnswer = (document.getElementById('settingsConfirmAnswer') as HTMLInputElement).value.trim()
  const errorEl = document.getElementById('settingsQuestionError') as HTMLParagraphElement
  errorEl.textContent = ''

  if (!newQuestion) { errorEl.textContent = '请输入新验证问题'; return }
  if (!newAnswer) { errorEl.textContent = '请输入答案'; return }
  if (newAnswer !== confirmAnswer) { errorEl.textContent = '两次输入的答案不一致'; return }

  const encoder = new TextEncoder()
  const answerHash = await crypto.subtle.digest('SHA-256', encoder.encode(newAnswer.toLowerCase()))
  const answerHex = Array.from(new Uint8Array(answerHash)).map(b => b.toString(16).padStart(2, '0')).join('')

  securityQuestion = newQuestion
  securityAnswer = answerHex
  await window.electronAPI.vault.set('safenest_security_question', newQuestion)
  await window.electronAPI.vault.set('safenest_security_answer', answerHex)

  // Update UI
  const currentQuestionBox = document.getElementById('settingsCurrentQuestionBox') as HTMLDivElement
  const currentQuestionText = document.getElementById('settingsCurrentQuestionText') as HTMLSpanElement
  currentQuestionText.textContent = newQuestion
  currentQuestionBox.style.display = 'block'

  ;(document.getElementById('settingsNewQuestion') as HTMLInputElement).value = ''
  ;(document.getElementById('settingsNewAnswer') as HTMLInputElement).value = ''
  ;(document.getElementById('settingsConfirmAnswer') as HTMLInputElement).value = ''
  showToast('安全验证问题已修改')
}

// ===== Recovery Key & Forgot Password =====
let verifiedRecoveryKey = ''
let newRecoveryKeyWords = ''

async function loadRecoveryKeyStatus() {
  const hash = await window.electronAPI.vault.get('recoveryKeyHash')
  const statusText = document.getElementById('recoveryKeyStatusText') as HTMLSpanElement
  const displayBox = document.getElementById('recoveryKeyDisplayBox') as HTMLDivElement
  if (hash) {
    statusText.textContent = '已设置恢复密钥'
    displayBox.style.display = 'none'
  } else {
    statusText.textContent = '未设置恢复密钥'
    displayBox.style.display = 'none'
  }
}

async function generateRecoveryKeyFromSettings() {
  if (!currentPassword) { showToast('请先登录'); return }
  const result = await window.electronAPI.recovery.generate(currentPassword)
  if (result.success && result.words) {
    const display = document.getElementById('settingsRecoveryKeyDisplay') as HTMLParagraphElement
    const displayBox = document.getElementById('recoveryKeyDisplayBox') as HTMLDivElement
    display.textContent = result.words
    displayBox.style.display = 'block'
    const statusText = document.getElementById('recoveryKeyStatusText') as HTMLSpanElement
    statusText.textContent = '已设置恢复密钥'
    showToast('恢复密钥已生成，请妥善保存')
  } else {
    showToast(result.error || '生成失败')
  }
}

async function copySettingsRecoveryKey() {
  const display = document.getElementById('settingsRecoveryKeyDisplay') as HTMLParagraphElement
  const words = display.textContent || ''
  if (!words) return
  await navigator.clipboard.writeText(words)
  showToast('已复制恢复密钥')
}

function showForgotPasswordModal() {
  ;(document.getElementById('forgotPasswordModal') as HTMLDivElement).classList.add('active')
}

function closeForgotPasswordModal() {
  ;(document.getElementById('forgotPasswordModal') as HTMLDivElement).classList.remove('active')
}

function showResetWithQuestion() {
  closeForgotPasswordModal()
  showResetModal()
}

function showResetWithoutQuestion() {
  closeForgotPasswordModal()
  ;(document.getElementById('hardResetModal') as HTMLDivElement).classList.add('active')
  ;(document.getElementById('hardResetText') as HTMLInputElement).value = ''
  ;(document.getElementById('hardResetError') as HTMLParagraphElement).textContent = ''
  const btn = document.getElementById('hardResetBtn') as HTMLButtonElement
  btn.disabled = true
  btn.style.opacity = '0.5'
}

function showRecoveryKeyRecoverModal() {
  closeForgotPasswordModal()
  verifiedRecoveryKey = ''
  newRecoveryKeyWords = ''
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

function closeRecoveryKeyModal() {
  ;(document.getElementById('recoveryKeyModal') as HTMLDivElement).classList.remove('active')
  verifiedRecoveryKey = ''
  newRecoveryKeyWords = ''
}

async function verifyRecoveryKey() {
  const words = (document.getElementById('recoveryKeyInput') as HTMLTextAreaElement).value.trim()
  const errorEl = document.getElementById('recoveryKeyError') as HTMLParagraphElement
  if (!words) { if (errorEl) errorEl.textContent = '请输入恢复密钥'; return }
  const valid = await window.electronAPI.recovery.verify(words)
  if (!valid) { if (errorEl) errorEl.textContent = '恢复密钥不正确'; return }
  verifiedRecoveryKey = words
  if (errorEl) errorEl.textContent = ''
  ;(document.getElementById('recoveryKeyStep1') as HTMLDivElement).style.display = 'none'
  ;(document.getElementById('recoveryKeyStep2') as HTMLDivElement).style.display = 'block'
}

function checkRecoveryPasswordStrength() {
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

async function changePasswordWithRecoveryKey() {
  const newPwd = (document.getElementById('recoveryNewPassword') as HTMLInputElement).value
  const confirmPwd = (document.getElementById('recoveryConfirmPassword') as HTMLInputElement).value
  const errorEl = document.getElementById('recoveryNewPasswordError') as HTMLParagraphElement
  errorEl.textContent = ''
  if (newPwd.length < 8) { errorEl.textContent = '新密码至少需要8位'; return }
  if (newPwd !== confirmPwd) { errorEl.textContent = '两次输入的密码不一致'; return }
  if (!verifiedRecoveryKey) { errorEl.textContent = '恢复密钥验证已过期，请重新开始'; return }

  const result = await window.electronAPI.recovery.changePassword(verifiedRecoveryKey, newPwd)
  if (result.success && result.newWords) {
    newRecoveryKeyWords = result.newWords
    currentPassword = newPwd
    ;(document.getElementById('newRecoveryKeyDisplay') as HTMLParagraphElement).textContent = result.newWords
    ;(document.getElementById('recoveryKeyStep2') as HTMLDivElement).style.display = 'none'
    ;(document.getElementById('recoveryKeyStep3') as HTMLDivElement).style.display = 'block'
    showToast('密码重置成功，请保存新的恢复密钥')
  } else {
    errorEl.textContent = result.error || '重置失败'
  }
}

async function copyNewRecoveryKey() {
  if (!newRecoveryKeyWords) return
  await navigator.clipboard.writeText(newRecoveryKeyWords)
  showToast('已复制新的恢复密钥')
}

async function finishRecoveryKeyReset() {
  closeRecoveryKeyModal()
  verifiedRecoveryKey = ''
  newRecoveryKeyWords = ''
  const storedRaw = await window.electronAPI.vault.get('passwordVault')
  if (storedRaw) {
    const stored = JSON.parse(storedRaw)
    const decrypted = await window.electronAPI.crypto.decryptVault(stored, currentPassword)
    if (decrypted) {
      passwords = decrypted
      await showApp()
      return
    }
  }
  showToast('进入应用失败，请重新解锁')
  lock()
}

function closeHardResetModal() {
  ;(document.getElementById('hardResetModal') as HTMLDivElement).classList.remove('active')
}

function checkHardResetText() {
  const text = (document.getElementById('hardResetText') as HTMLInputElement).value.trim()
  const btn = document.getElementById('hardResetBtn') as HTMLButtonElement
  const valid = text === 'DELETE ALL DATA'
  btn.disabled = !valid
  btn.style.opacity = valid ? '1' : '0.5'
}

async function confirmHardReset() {
  const errorEl = document.getElementById('hardResetError') as HTMLParagraphElement
  errorEl.textContent = ''
  const text = (document.getElementById('hardResetText') as HTMLInputElement).value.trim()
  if (text !== 'DELETE ALL DATA') { errorEl.textContent = '确认文本不正确'; return }

  const result = await window.electronAPI.vault.reset()
  if (result.success) {
    closeHardResetModal()
    currentPassword = ''
    passwords = []
    failedAttempts = 0
    securityQuestion = null
    securityAnswer = null
    batchMode = false
    selectedItems.clear()
    ;(document.getElementById('setupMode') as HTMLDivElement).style.display = 'block'
    ;(document.getElementById('unlockMode') as HTMLDivElement).style.display = 'none'
    ;(document.getElementById('masterPassword') as HTMLInputElement).value = ''
    ;(document.getElementById('confirmPassword') as HTMLInputElement).value = ''
    ;(document.getElementById('unlockPassword') as HTMLInputElement).value = ''
    ;(document.getElementById('loginError') as HTMLParagraphElement).textContent = ''
    showToast('所有数据已清空，请重新初始化')
  } else {
    errorEl.textContent = '清空失败，请重试'
  }
}

// ===== Context Menu =====
document.addEventListener('contextmenu', function (e) {
  const card = (e.target as HTMLElement).closest('.password-card')
  if (card && (document.getElementById('appContainer') as HTMLDivElement).style.display === 'block') {
    e.preventDefault()
    if (!batchMode) { batchMode = true; renderPasswords(); showToast('已开启批量选择模式') }
  }
})

// ===== Init =====
init()

// Expose functions for HTML onclick handlers
Object.assign(window, {
  login,
  showResetModal, closeResetModal, closeResetVerifyModal, confirmReset, checkResetText, checkResetAnswer, checkResetVerify,
  toggleThemeDropdown, setTheme,
  showAddModal, editEntry, saveEntry, deleteEntry, closeModal,
  copyEntry, copyText, togglePassword,
  filterCategory, renderPasswords,
  showAddCategoryModal, closeCategoryModal, addNewCategory, deleteCategory,
  generatePassword: generatePasswordUI, checkStrength,
  exportData, showExportVerify, closeExportVerifyModal, confirmExportVerify, closeExportMarkdownModal, downloadMarkdownExport,
  showImportPreviewModal, closeImportPreviewModal, handleImportFile,
  toggleImportItem, setConflictAction, toggleSelectAllImport, confirmImport,
  showBatchDeleteVerify, closeBatchDeleteVerify, confirmBatchDelete,
  showBatchExportVerify,
  toggleBatchMode, toggleSelectItem, toggleSelectAllBatch, cancelBatchSelection,
  showSecuritySetupModal, saveSecuritySetup, lock,
  showSettingsModal, closeSettingsModal, verifySettingsPassword,
  changeMasterPassword, checkSettingsNewPasswordStrength, changeSecurityQuestion,
  toggleViewMode,
  showForgotPasswordModal, closeForgotPasswordModal, showResetWithQuestion, showResetWithoutQuestion,
  showRecoveryKeyRecoverModal, closeRecoveryKeyModal, verifyRecoveryKey,
  checkRecoveryPasswordStrength, changePasswordWithRecoveryKey, copyNewRecoveryKey, finishRecoveryKeyReset,
  closeHardResetModal, checkHardResetText, confirmHardReset,
  generateRecoveryKeyFromSettings, copySettingsRecoveryKey
})
