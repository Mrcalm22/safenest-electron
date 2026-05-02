import { ipcMain } from 'electron'
import {
  vaultGet,
  vaultSet,
  vaultRemove,
  vaultHas,
  settingGet,
  settingSet,
  settingRemove
} from './database'
import {
  hashMasterPassword,
  verifyMasterPassword,
  encryptVault,
  decryptVault,
  decryptLegacyVault,
  generatePassword,
  generatePassphrase,
  estimatePasswordStrength,
  clearMasterKey,
  generateRecoveryKey,
  hashRecoveryKey,
  encryptWithRecoveryKey,
  decryptWithRecoveryKey
} from './crypto-service'
import type { PasswordEntry, StoredVault, ExportData, EncryptedPayload } from '../types'

export function registerIpcHandlers(): void {
  // Vault storage
  ipcMain.handle('vault-get', (_event, key: string) => vaultGet(key))
  ipcMain.handle('vault-set', (_event, key: string, value: string) => vaultSet(key, value))
  ipcMain.handle('vault-remove', (_event, key: string) => vaultRemove(key))
  ipcMain.handle('vault-has', (_event, key: string) => vaultHas(key))

  // Settings storage
  ipcMain.handle('setting-get', (_event, key: string) => settingGet(key))
  ipcMain.handle('setting-set', (_event, key: string, value: string) => settingSet(key, value))
  ipcMain.handle('setting-remove', (_event, key: string) => settingRemove(key))

  // Crypto services
  ipcMain.handle('crypto:hashPassword', async (_event, password: string) => {
    return await hashMasterPassword(password)
  })

  ipcMain.handle('crypto:verifyPassword', async (_event, password: string, hash: string) => {
    return await verifyMasterPassword(password, hash)
  })

  ipcMain.handle('crypto:encryptVault', (_event, passwords: PasswordEntry[], password: string) => {
    return encryptVault(passwords, password)
  })

  ipcMain.handle('crypto:decryptVault', (_event, stored: StoredVault, password: string) => {
    return decryptVault(stored, password)
  })

  // Vault unlock with automatic migration
  ipcMain.handle('vault:unlock', async (_event, password: string) => {
    const storedRaw = vaultGet('passwordVault')
    if (!storedRaw) return { success: false, passwords: null, migrated: false }

    try {
      const stored = JSON.parse(storedRaw)
      if (stored.version === '1') {
        const result = decryptLegacyVault(stored, password)
        if (result) {
          // Migrate to v2
          const newVault = encryptVault(result, password)
          const hash = await hashMasterPassword(password)
          vaultSet('passwordVault', JSON.stringify(newVault))
          vaultSet('passwordHash', hash)
          return { success: true, passwords: result, migrated: true }
        }
        return { success: false, passwords: null, migrated: false }
      }

      const result = decryptVault(stored as StoredVault, password)
      if (result) {
        return { success: true, passwords: result, migrated: false }
      }
      return { success: false, passwords: null, migrated: false }
    } catch {
      return { success: false, passwords: null, migrated: false }
    }
  })

  // Vault setup for first time
  ipcMain.handle('vault:setup', async (_event, password: string) => {
    const hash = await hashMasterPassword(password)
    const newVault = encryptVault([], password)
    vaultSet('passwordVault', JSON.stringify(newVault))
    vaultSet('passwordHash', hash)
    return { success: true }
  })

  ipcMain.handle('crypto:generatePassword', (_event, length: number, options?: object) => {
    return generatePassword(length, options)
  })

  ipcMain.handle('crypto:generatePassphrase', (_event, wordCount: number) => {
    return generatePassphrase(wordCount)
  })

  ipcMain.handle('crypto:estimateStrength', (_event, password: string) => {
    return estimatePasswordStrength(password)
  })

  ipcMain.handle('crypto:clearKey', () => {
    clearMasterKey()
  })

  // Export / Import
  // Change master password
  ipcMain.handle('vault:changePassword', async (_event, currentPassword: string, newPassword: string) => {
    const storedRaw = vaultGet('passwordVault')
    const hashStr = vaultGet('passwordHash')
    if (!storedRaw || !hashStr) return { success: false, error: '没有已存储的数据' }

    const valid = await verifyMasterPassword(currentPassword, hashStr)
    if (!valid) return { success: false, error: '当前密码错误' }

    try {
      const stored = JSON.parse(storedRaw)
      const passwords = decryptVault(stored as StoredVault, currentPassword)
      if (!passwords) return { success: false, error: '解密失败' }

      const newVault = encryptVault(passwords, newPassword)
      const newHash = await hashMasterPassword(newPassword)
      vaultSet('passwordVault', JSON.stringify(newVault))
      vaultSet('passwordHash', newHash)
      return { success: true }
    } catch {
      return { success: false, error: '密码修改失败' }
    }
  })

  ipcMain.handle('data:export', (_event, passwords: PasswordEntry[]) => {
    const data: ExportData = {
      version: '2',
      exportedAt: new Date().toISOString(),
      entries: passwords
    }
    return JSON.stringify(data, null, 2)
  })

  // Recovery Key
  ipcMain.handle('recovery:generate', async (_event, password: string) => {
    try {
      const words = generateRecoveryKey()
      const hash = hashRecoveryKey(words)
      const encrypted = encryptWithRecoveryKey(password, words)
      vaultSet('recoveryKeyHash', hash)
      vaultSet('recoveryKeyData', JSON.stringify(encrypted))
      return { success: true, words }
    } catch (err) {
      return { success: false, error: (err instanceof Error ? err.message : '生成失败') }
    }
  })

  ipcMain.handle('recovery:verify', async (_event, words: string) => {
    const storedHash = vaultGet('recoveryKeyHash')
    if (!storedHash) return false
    return hashRecoveryKey(words) === storedHash
  })

  ipcMain.handle('recovery:changePassword', async (_event, words: string, newPassword: string) => {
    try {
      const storedHash = vaultGet('recoveryKeyHash')
      const storedDataRaw = vaultGet('recoveryKeyData')
      if (!storedHash || !storedDataRaw) return { success: false, error: '未设置恢复密钥' }

      if (hashRecoveryKey(words) !== storedHash) return { success: false, error: '恢复密钥错误' }

      const storedData = JSON.parse(storedDataRaw) as EncryptedPayload
      const oldPassword = decryptWithRecoveryKey(storedData, words)
      if (!oldPassword) return { success: false, error: '恢复密钥解密失败' }

      const storedRaw = vaultGet('passwordVault')
      if (!storedRaw) return { success: false, error: '没有已存储的数据' }

      const stored = JSON.parse(storedRaw)
      const passwords = decryptVault(stored as StoredVault, oldPassword)
      if (!passwords) return { success: false, error: '解密失败' }

      const newVault = encryptVault(passwords, newPassword)
      const newHash = await hashMasterPassword(newPassword)
      vaultSet('passwordVault', JSON.stringify(newVault))
      vaultSet('passwordHash', newHash)

      // Re-generate recovery key data with new password
      const newWords = generateRecoveryKey()
      const newRecoveryHash = hashRecoveryKey(newWords)
      const newEncrypted = encryptWithRecoveryKey(newPassword, newWords)
      vaultSet('recoveryKeyHash', newRecoveryHash)
      vaultSet('recoveryKeyData', JSON.stringify(newEncrypted))

      return { success: true, newWords }
    } catch (err) {
      return { success: false, error: (err instanceof Error ? err.message : '操作失败') }
    }
  })

  // Hard reset - clear all data
  ipcMain.handle('vault:reset', () => {
    vaultRemove('passwordVault')
    vaultRemove('passwordHash')
    vaultRemove('safenest_security_question')
    vaultRemove('safenest_security_answer')
    vaultRemove('recoveryKeyHash')
    vaultRemove('recoveryKeyData')
    vaultRemove('safenest_categories')
    vaultRemove('safenest_theme')
    return { success: true }
  })
}
