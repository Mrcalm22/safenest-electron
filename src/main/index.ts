import { app } from 'electron'
import { initDatabase, closeDatabase } from './database'
import { registerIpcHandlers } from './ipc-handlers'
import { createWindow } from './window-manager'

app.whenReady().then(() => {
  initDatabase()
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (require('electron').BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
