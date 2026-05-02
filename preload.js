const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    vault: {
        get: (key) => ipcRenderer.invoke('vault-get', key),
        set: (key, value) => ipcRenderer.invoke('vault-set', key, value),
        remove: (key) => ipcRenderer.invoke('vault-remove', key),
        has: (key) => ipcRenderer.invoke('vault-has', key)
    },
    settings: {
        get: (key) => ipcRenderer.invoke('setting-get', key),
        set: (key, value) => ipcRenderer.invoke('setting-set', key, value),
        remove: (key) => ipcRenderer.invoke('setting-remove', key)
    }
});
