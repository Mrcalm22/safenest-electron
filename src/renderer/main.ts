import { store } from './modules/store'
import { t, loadLang } from './i18n'
import * as ui from './modules/ui'
import * as categories from './modules/categories'
import * as render from './modules/render'
import * as auth from './modules/auth'
import * as entries from './modules/entries'
import * as batch from './modules/batch'
import * as importExport from './modules/importExport'
import * as lockTimer from './modules/lockTimer'
import * as recovery from './modules/recovery'
import * as settings from './modules/settings'

// Wire circular dependencies
lockTimer.setOnLockCallback(auth.lock)
recovery.setLockFn(auth.lock)

async function init() {
  await loadLang()
  settings.updateLangButtons()
  await settings.loadTheme()
  await categories.loadCustomCategories()
  await auth.loadSecurityQuestion()
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

// Context menu handler
document.addEventListener('contextmenu', function (e) {
  const card = (e.target as HTMLElement).closest('.password-card')
  if (card && (document.getElementById('appContainer') as HTMLDivElement).style.display === 'block') {
    e.preventDefault()
    if (!store.batchMode) { store.batchMode = true; render.renderPasswords(); ui.showToast(t('toast_batchModeOn')) }
  }
})

init()

// Debounced search input
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
const searchInput = document.getElementById('searchInput') as HTMLInputElement | null
if (searchInput) {
  searchInput.addEventListener('input', () => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => render.renderPasswords(), 200)
  })
}

// Expose functions for HTML onclick handlers
Object.assign(window, {
  login: auth.login,
  showResetModal: recovery.showResetModal,
  closeResetModal: recovery.closeResetModal,
  closeResetVerifyModal: recovery.closeResetVerifyModal,
  confirmReset: recovery.confirmReset,
  checkResetText: recovery.checkResetText,
  checkResetAnswer: recovery.checkResetAnswer,
  checkResetVerify: recovery.checkResetVerify,
  toggleThemeDropdown: settings.toggleThemeDropdown,
  toggleLanguageDropdown: settings.toggleLanguageDropdown,
  setTheme: settings.setTheme,
  showAddModal: entries.showAddModal,
  editEntry: entries.editEntry,
  saveEntry: entries.saveEntry,
  deleteEntry: entries.deleteEntry,
  closeModal: entries.closeModal,
  copyEntry: render.copyEntry,
  copyText: ui.copyText,
  togglePassword: render.togglePassword,
  filterCategory: render.filterCategory,
  renderPasswords: render.renderPasswords,
  showAddCategoryModal: categories.showAddCategoryModal,
  closeCategoryModal: categories.closeCategoryModal,
  addNewCategory: categories.addNewCategory,
  deleteCategory: categories.deleteCategory,
  generatePassword: entries.generatePasswordUI,
  checkStrength: entries.checkStrength,
  exportData: importExport.exportData,
  showExportVerify: importExport.showExportVerify,
  closeExportVerifyModal: importExport.closeExportVerifyModal,
  confirmExportVerify: importExport.confirmExportVerify,
  closeExportMarkdownModal: importExport.closeExportMarkdownModal,
  downloadMarkdownExport: importExport.downloadMarkdownExport,
  showImportPreviewModal: importExport.showImportPreviewModal,
  closeImportPreviewModal: importExport.closeImportPreviewModal,
  handleImportFile: importExport.handleImportFile,
  toggleImportItem: importExport.toggleImportItem,
  setConflictAction: importExport.setConflictAction,
  toggleSelectAllImport: importExport.toggleSelectAllImport,
  confirmImport: importExport.confirmImport,
  showBatchDeleteVerify: batch.showBatchDeleteVerify,
  closeBatchDeleteVerify: batch.closeBatchDeleteVerify,
  confirmBatchDelete: batch.confirmBatchDelete,
  showBatchExportVerify: batch.showBatchExportVerify,
  toggleBatchMode: batch.toggleBatchMode,
  toggleSelectItem: batch.toggleSelectItem,
  toggleSelectAllBatch: batch.toggleSelectAllBatch,
  cancelBatchSelection: batch.cancelBatchSelection,
  showSecuritySetupModal: auth.showSecuritySetupModal,
  saveSecuritySetup: auth.saveSecuritySetup,
  lock: auth.lock,
  showSettingsModal: settings.showSettingsModal,
  closeSettingsModal: settings.closeSettingsModal,
  verifySettingsPassword: settings.verifySettingsPassword,
  changeMasterPassword: settings.changeMasterPassword,
  checkSettingsNewPasswordStrength: settings.checkSettingsNewPasswordStrength,
  changeSecurityQuestion: settings.changeSecurityQuestion,
  toggleViewMode: render.toggleViewMode,
  showForgotPasswordModal: recovery.showForgotPasswordModal,
  closeForgotPasswordModal: recovery.closeForgotPasswordModal,
  showResetWithQuestion: recovery.showResetWithQuestion,
  showResetWithoutQuestion: recovery.showResetWithoutQuestion,
  showRecoveryKeyRecoverModal: recovery.showRecoveryKeyRecoverModal,
  closeRecoveryKeyModal: recovery.closeRecoveryKeyModal,
  verifyRecoveryKey: recovery.verifyRecoveryKey,
  checkRecoveryPasswordStrength: recovery.checkRecoveryPasswordStrength,
  changePasswordWithRecoveryKey: recovery.changePasswordWithRecoveryKey,
  copyNewRecoveryKey: recovery.copyNewRecoveryKey,
  finishRecoveryKeyReset: recovery.finishRecoveryKeyReset,
  closeHardResetModal: recovery.closeHardResetModal,
  checkHardResetText: recovery.checkHardResetText,
  confirmHardReset: recovery.confirmHardReset,
  generateRecoveryKeyFromSettings: recovery.generateRecoveryKeyFromSettings,
  copySettingsRecoveryKey: recovery.copySettingsRecoveryKey,
  switchLanguage: settings.switchLanguage
})
