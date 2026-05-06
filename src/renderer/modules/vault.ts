import { store } from './store'

export async function saveToStorage(): Promise<void> {
  if (!store.currentPassword) return
  const encrypted = await window.electronAPI.crypto.encryptVault(store.passwords, store.currentPassword)
  await window.electronAPI.vault.set('passwordVault', JSON.stringify(encrypted))
}
