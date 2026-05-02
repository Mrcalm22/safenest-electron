const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'safenest.db');
let db;

function initDatabase() {
    db = new DatabaseSync(dbPath);
    db.exec(`
        CREATE TABLE IF NOT EXISTS vault (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);
    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    `);
}

ipcMain.handle('vault-get', (event, key) => {
    try {
        const row = db.prepare('SELECT value FROM vault WHERE key = ?').get(key);
        return row ? row.value : null;
    } catch (e) {
        return null;
    }
});

ipcMain.handle('vault-set', (event, key, value) => {
    try {
        db.prepare('INSERT OR REPLACE INTO vault (key, value) VALUES (?, ?)').run(key, value);
        return true;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('vault-remove', (event, key) => {
    try {
        db.prepare('DELETE FROM vault WHERE key = ?').run(key);
        return true;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('vault-has', (event, key) => {
    try {
        const row = db.prepare('SELECT 1 FROM vault WHERE key = ?').get(key);
        return !!row;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('setting-get', (event, key) => {
    try {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        return row ? row.value : null;
    } catch (e) {
        return null;
    }
});

ipcMain.handle('setting-set', (event, key, value) => {
    try {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
        return true;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('setting-remove', (event, key) => {
    try {
        db.prepare('DELETE FROM settings WHERE key = ?').run(key);
        return true;
    } catch (e) {
        return false;
    }
});

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        titleBarStyle: 'hiddenInset',
        show: false
    });

    win.loadFile('index.html');
    win.once('ready-to-show', () => { win.show(); });
}

app.whenReady().then(() => {
    initDatabase();
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (db) db.close();
    if (process.platform !== 'darwin') app.quit();
});
