import type { PasswordEntry, ImportItem } from '../../types'

export const store = {
  currentPassword: '',
  passwords: [] as PasswordEntry[],
  currentCategory: 'all',
  editingId: null as string | null,
  lockTimer: null as ReturnType<typeof setInterval> | null,
  lockCountdown: 5 * 60 * 1000,
  failedAttempts: 0,
  importPreviewData: [] as ImportItem[],
  customCategories: [] as { id: string; name: string }[],
  batchMode: false,
  selectedItems: new Set<string>(),
  securityQuestion: null as string | null,
  securityAnswer: null as string | null,
  exportMode: 'all' as 'all' | 'batch',
  viewMode: 'grid' as 'grid' | 'list',
  resetCountdownTimer: null as ReturnType<typeof setInterval> | null,
  resetCountdownValue: 5,
  verifiedRecoveryKey: '',
  newRecoveryKeyWords: '',
  listScrollTop: 0
}

export function resetStore(): void {
  store.currentPassword = ''
  store.passwords = []
  store.currentCategory = 'all'
  store.editingId = null
  store.lockTimer = null
  store.lockCountdown = 5 * 60 * 1000
  store.failedAttempts = 0
  store.importPreviewData = []
  store.customCategories = []
  store.batchMode = false
  store.selectedItems.clear()
  store.securityQuestion = null
  store.securityAnswer = null
  store.exportMode = 'all'
  store.viewMode = 'grid'
  store.resetCountdownTimer = null
  store.resetCountdownValue = 5
  store.verifiedRecoveryKey = ''
  store.newRecoveryKeyWords = ''
  store.listScrollTop = 0
}
