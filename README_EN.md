
> [中文版](README.md)

# SafeNest

A secure, local-first password manager built with **Electron + TypeScript + Vite**.

All your passwords are encrypted with **AES-256-GCM** and stored locally in an **SQLite** database. No cloud, no accounts, no data leaves your machine.

---

## Features

- **AES-256-GCM encryption** with Argon2id password hashing
- **Recovery key** system (12-word passphrase) for password recovery without data loss
- **Security question** based reset
- **Hard reset** to clear all local data for a fresh start
- **Password generator** (random + Diceware passphrase)
- **Batch select**, delete, export
- **Grid / list** dual view mode
- **Theme** system
- **Import / export** (Markdown, JSON, CSV)
- **5-minute auto-lock** timer
- **Virtual scrolling**: auto-enabled in list view when >50 items, preventing DOM overload
- **Debounced search**: 200ms delay before filtering, reducing redundant renders

## Screenshots

<p align="center">
  <img src="docs/screenshots/login.png" alt="Login Screen" width="720">
  <br><em>Login / Unlock — supports initial setup and master password unlock</em>
</p>

<p align="center">
  <img src="docs/screenshots/grid-view.png" alt="Grid View" width="720">
  <br><em>Grid View — card layout with category tags at a glance</em>
</p>

<p align="center">
  <img src="docs/screenshots/list-view.png" alt="List View" width="720">
  <br><em>List View — compact layout with virtual scrolling (auto-enabled above 50 items)</em>
</p>

<p align="center">
  <img src="docs/screenshots/add-entry.png" alt="Add Entry" width="720">
  <br><em>Add / Edit Entry — built-in password generator with strength checker</em>
</p>

<p align="center">
  <img src="docs/screenshots/filter-category.png" alt="Category Filter" width="720">
  <br><em>Category Filter — quickly filter by Work, Personal, Finance, etc.</em>
</p>

<p align="center">
  <img src="docs/screenshots/batch-mode.png" alt="Batch Mode" width="720">
  <br><em>Batch Mode — multi-select entries for bulk export or delete</em>
</p>

<p align="center">
  <img src="docs/screenshots/dark-theme.png" alt="Dark Theme" width="720">
  <br><em>Dark Theme — 6 themes to choose from</em>
</p>

<p align="center">
  <img src="docs/screenshots/settings.png" alt="Settings" width="720">
  <br><em>Settings — change master password, security question, generate recovery key</em>
</p>

---

## Architecture

SafeNest follows Electron's security best practices: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. All cryptographic operations run in the **Main Process** (Node.js), protected from the renderer. The renderer only communicates via a type-safe `contextBridge` API.

![Architecture](docs/safenest-arch-en.png)

---

## User Flow

![User Flow](docs/safenest-user-flow-en.png)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron 41 |
| Build Tool | Vite + electron-vite |
| Language | TypeScript (strict) |
| Database | node:sqlite (DatabaseSync) |
| Crypto | Node.js crypto (AES-256-GCM, scrypt, randomBytes) |
| Password Hash | @node-rs/argon2 (Argon2id) |

---

## Security Design

- **Master password** is hashed with Argon2id (memoryCost: 65536, timeCost: 3, parallelism: 4)
- **Encryption key** is derived from password via scrypt
- **Vault data** is encrypted with AES-256-GCM (includes auth tag)
- **Memory clearing**: sensitive Buffer/Uint8Array data is explicitly zeroed after use (`buffer.fill(0)`)
- **Recovery key**: encrypts the master password (not the data directly), allowing password reset while preserving all entries
- **No network requests** for password checking -- fully offline

---

## Development

```bash
# Install dependencies
npm install

# Dev mode
npm run dev

# Build
npm run build

# Type check
npx tsc --noEmit
```

---

## License

MIT

---
