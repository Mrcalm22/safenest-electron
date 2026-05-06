import { describe, it, expect } from 'vitest'
import { store, resetStore } from '../renderer/modules/store'

describe('store', () => {
  it('has correct initial state', () => {
    expect(store.currentPassword).toBe('')
    expect(store.passwords).toEqual([])
    expect(store.currentCategory).toBe('all')
    expect(store.editingId).toBeNull()
    expect(store.batchMode).toBe(false)
    expect(store.selectedItems.size).toBe(0)
    expect(store.customCategories).toEqual([])
    expect(store.viewMode).toBe('grid')
    expect(store.failedAttempts).toBe(0)
    expect(store.importPreviewData).toEqual([])
    expect(store.securityQuestion).toBeNull()
    expect(store.securityAnswer).toBeNull()
    expect(store.exportMode).toBe('all')
    expect(store.verifiedRecoveryKey).toBe('')
    expect(store.newRecoveryKeyWords).toBe('')
  })
})

describe('resetStore', () => {
  it('resets all mutable state to defaults', () => {
    store.currentPassword = 'secret'
    store.passwords = [{ id: '1', title: 'test', category: 'work', username: 'u', password: 'p', showPassword: false, createdAt: 1, updatedAt: 1 }]
    store.currentCategory = 'work'
    store.editingId = '1'
    store.batchMode = true
    store.selectedItems.add('1')
    store.customCategories = [{ id: 'c1', name: 'custom' }]
    store.viewMode = 'list'
    store.failedAttempts = 3
    store.securityQuestion = 'question'
    store.securityAnswer = 'answer'
    store.verifiedRecoveryKey = 'key'
    store.newRecoveryKeyWords = 'words'

    resetStore()

    expect(store.currentPassword).toBe('')
    expect(store.passwords).toEqual([])
    expect(store.currentCategory).toBe('all')
    expect(store.editingId).toBeNull()
    expect(store.batchMode).toBe(false)
    expect(store.selectedItems.size).toBe(0)
    expect(store.customCategories).toEqual([])
    expect(store.viewMode).toBe('grid')
    expect(store.failedAttempts).toBe(0)
    expect(store.securityQuestion).toBeNull()
    expect(store.securityAnswer).toBeNull()
    expect(store.verifiedRecoveryKey).toBe('')
    expect(store.newRecoveryKeyWords).toBe('')
  })
})
