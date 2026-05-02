# SafeNest

一款基于 **Electron + TypeScript + Vite** 构建的安全、本地优先的密码管理器。

所有密码均采用 **AES-256-GCM** 加密，并存储在本地 **SQLite** 数据库中。无需云端，无需账户，数据绝不离机。

---

## 功能特性

- **AES-256-GCM 加密**，配合 Argon2id 密码哈希
- **恢复密钥** 系统（12 词助记词），可在不丢失数据的情况下重置密码
- **安全问题** 重置方式
- **硬重置**，彻底清除本地数据以重新开始
- **密码生成器**（随机密码 + Diceware 短语）
- **批量选择**、删除、导出
- **网格 / 列表** 双视图模式
- **主题** 系统
- **导入 / 导出**（Markdown、JSON、CSV）
- **5 分钟自动锁定** 计时器

---

## 技术架构

SafeNest 遵循 Electron 安全最佳实践：`contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。所有加密操作均在 **主进程**（Node.js）中运行，与渲染进程隔离。渲染进程仅通过类型安全的 `contextBridge` API 进行通信。

![架构图](docs/safenest-arch.png)

---

## 用户流程

![用户流程图](docs/safenest-user-flow.png)

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 41 |
| 构建工具 | Vite + electron-vite |
| 语言 | TypeScript（严格模式）|
| 数据库 | node:sqlite（DatabaseSync）|
| 加密 | Node.js crypto（AES-256-GCM、scrypt、randomBytes）|
| 密码哈希 | @node-rs/argon2（Argon2id）|

---

## 安全设计

- **主密码** 使用 Argon2id 哈希（memoryCost: 65536，timeCost: 3，parallelism: 4）
- **加密密钥** 通过 scrypt 从密码派生
- **保险库数据** 使用 AES-256-GCM 加密（包含认证标签）
- **内存清零**：敏感的 Buffer/Uint8Array 数据在使用后显式清零（`buffer.fill(0)`）
- **恢复密钥**：加密主密码本身（而非直接加密数据），允许在保留所有条目的前提下重置密码
- **无网络请求** 用于密码检查 —— 完全离线运行

---

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 类型检查
npx tsc --noEmit
```

---

## 许可证

MIT

---

> [English Version](README_EN.md)
