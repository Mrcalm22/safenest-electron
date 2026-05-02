import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  vault: {
    get: (key: string) => ipcRenderer.invoke('vault-get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('vault-set', key, value),
    remove: (key: string) => ipcRenderer.invoke('vault-remove', key),
    has: (key: string) => ipcRenderer.invoke('vault-has', key),
    unlock: (password: string) => ipcRenderer.invoke('vault:unlock', password),
    setup: (password: string) => ipcRenderer.invoke('vault:setup', password),
    changePassword: (currentPassword: string, newPassword: string) => ipcRenderer.invoke('vault:changePassword', currentPassword, newPassword),
    reset: () => ipcRenderer.invoke('vault:reset')
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('setting-get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('setting-set', key, value),
    remove: (key: string) => ipcRenderer.invoke('setting-remove', key)
  },
  crypto: {
    hashPassword: (password: string) => ipcRenderer.invoke('crypto:hashPassword', password),
    verifyPassword: (password: string, hash: string) => ipcRenderer.invoke('crypto:verifyPassword', password, hash),
    encryptVault: (passwords: unknown[], password: string) => ipcRenderer.invoke('crypto:encryptVault', passwords, password),
    decryptVault: (stored: unknown, password: string) => ipcRenderer.invoke('crypto:decryptVault', stored, password),
    generatePassword: (length: number, options?: object) => ipcRenderer.invoke('crypto:generatePassword', length, options),
    generatePassphrase: (wordCount: number) => ipcRenderer.invoke('crypto:generatePassphrase', wordCount),
    estimateStrength: (password: string) => ipcRenderer.invoke('crypto:estimateStrength', password),
    clearKey: () => ipcRenderer.invoke('crypto:clearKey')
  },
  data: {
    export: (passwords: unknown[]) => ipcRenderer.invoke('data:export', passwords)
  },
  recovery: {
    generate: (password: string) => ipcRenderer.invoke('recovery:generate', password),
    verify: (words: string) => ipcRenderer.invoke('recovery:verify', words),
    changePassword: (words: string, newPassword: string) => ipcRenderer.invoke('recovery:changePassword', words, newPassword)
  }
})
