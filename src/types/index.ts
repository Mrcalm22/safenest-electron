/**
 * SafeNest Type Definitions
 * Core types shared across main, preload, and renderer processes
 */

export interface PasswordEntry {
  id: string
  title: string
  category: string
  username: string
  password: string
  notes: string
  showPassword?: boolean
  createdAt: number
  updatedAt: number
  totpSecret?: string
}

export interface EncryptedVault {
  version: string
  salt: number[]
  iv: number[]
  data: number[]
}

export interface StoredVault {
  version: string
  salt: number[]
  data: EncryptedPayload
}

export interface EncryptedPayload {
  iv: number[]
  data: number[]
}

export interface Category {
  id: string
  name: string
}

export interface ExportData {
  version: string
  exportedAt: string
  entries: PasswordEntry[]
}

export interface ImportItem {
  title: string
  username: string
  password: string
  category: string
  notes: string
  selected: boolean
  valid: boolean
  conflict: boolean
  conflictAction: 'skip' | 'overwrite' | 'import'
  existingId: string | null
}

// IPC API Types
export interface VaultAPI {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<boolean>
  remove(key: string): Promise<boolean>
  has(key: string): Promise<boolean>
  unlock(password: string): Promise<{ success: boolean; passwords: PasswordEntry[] | null; migrated: boolean }>
  setup(password: string): Promise<{ success: boolean }>
  changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }>
  reset(): Promise<{ success: boolean }>
}

export interface SettingsAPI {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<boolean>
  remove(key: string): Promise<boolean>
}

export interface CryptoAPI {
  hashPassword(password: string): Promise<string>
  verifyPassword(password: string, hash: string): Promise<boolean>
  encryptVault(passwords: PasswordEntry[], password: string): Promise<StoredVault>
  decryptVault(stored: StoredVault, password: string): Promise<PasswordEntry[] | null>
  generatePassword(length: number, options?: object): Promise<string>
  generatePassphrase(wordCount: number): Promise<string>
  estimateStrength(password: string): Promise<{ score: number; label: string }>
  clearKey(): Promise<void>
}

export interface DataAPI {
  export(passwords: PasswordEntry[]): Promise<string>
}

export interface RecoveryKeyAPI {
  generate(password: string): Promise<{ success: boolean; words?: string; error?: string }>
  verify(words: string): Promise<boolean>
  changePassword(words: string, newPassword: string): Promise<{ success: boolean; newWords?: string; error?: string }>
}

export interface ElectronAPI {
  vault: VaultAPI
  settings: SettingsAPI
  crypto: CryptoAPI
  data: DataAPI
  recovery: RecoveryKeyAPI
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
