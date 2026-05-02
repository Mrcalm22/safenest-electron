        // ===== Configuration =====
        const LOCK_TIMEOUT = 5 * 60 * 1000;
        const PBKDF2_ITERATIONS = 600000;
        const DATA_VERSION = '1';

        // ===== State =====
        let masterKey = null;
        let currentSalt = null;  // 保存当前使用的 salt，确保一致性
        let passwords = [];
        let currentCategory = 'all';
        let editingId = null;
        let lockTimer = null;
        let lockCountdown = LOCK_TIMEOUT;
        let failedAttempts = 0;
        let importPreviewData = []; // 存储待导入的数据
        let tempExportPassword = null; // 临时存储导出验证通过的密码
        let customCategories = []; // 自定义分类列表
        let batchMode = false; // 批量选择模式
        let selectedItems = new Set(); // 选中的条目ID
        let securityQuestion = null; // 二次验证问题
        let securityAnswer = null; // 二次验证答案哈希

        // 系统分类（固定）
        const SYSTEM_CATEGORIES = {
            work: '工作',
            personal: '个人',
            finance: '金融',
            social: '社交',
            other: '其他'
        };

        // ===== Crypto Utilities =====
        async function deriveKey(password, salt) {
            const encoder = new TextEncoder();
            const keyMaterial = await crypto.subtle.importKey(
                'raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']
            );
            return crypto.subtle.deriveKey(
                { name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
                keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
            );
        }

        async function encryptData(data, key) {
            const encoder = new TextEncoder();
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv }, key, encoder.encode(JSON.stringify(data))
            );
            return {
                iv: Array.from(iv),
                data: Array.from(new Uint8Array(encrypted))
            };
        }

        async function decryptData(encryptedObj, key) {
            try {
                const iv = new Uint8Array(encryptedObj.iv);
                const data = new Uint8Array(encryptedObj.data);
                const decrypted = await crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: iv }, key, data
                );
                return JSON.parse(new TextDecoder().decode(decrypted));
            } catch (e) {
                return null;
            }
        }

        // ===== Category Management =====
        async function loadCustomCategories() {
            const stored = await window.electronAPI.settings.get('safenest_categories');
            if (stored) {
                try {
                    customCategories = JSON.parse(stored);
                } catch (e) {
                    customCategories = [];
                }
            }
        }

        async function saveCustomCategories() {
            await window.electronAPI.settings.set('safenest_categories', JSON.stringify(customCategories));
        }

        function getAllCategories() {
            const cats = { ...SYSTEM_CATEGORIES };
            customCategories.forEach(cat => {
                cats[cat.id] = cat.name;
            });
            return cats;
        }

        function getCategoryName(catId) {
            const allCats = getAllCategories();
            return allCats[catId] || catId || '其他';
        }

        function showAddCategoryModal() {
            document.getElementById('newCategoryName').value = '';
            document.getElementById('categoryError').textContent = '';
            renderCategoryManagement();
            document.getElementById('categoryModal').classList.add('active');
        }

        function closeCategoryModal() {
            document.getElementById('categoryModal').classList.remove('active');
        }

        function renderCategoryManagement() {
            const customContainer = document.getElementById('customCategories');
            if (customCategories.length === 0) {
                customContainer.innerHTML = '<span style="color:var(--text-secondary);font-size:0.85rem;">暂无自定义分类</span>';
            } else {
                customContainer.innerHTML = customCategories.map(cat => `
                    <span class="tag" style="display:inline-flex;align-items:center;gap:6px;padding-right:8px;">
                        ${escapeHtml(cat.name)}
                        <span style="cursor:pointer;font-size:1.1rem;color:var(--danger);" onclick="deleteCategory('${cat.id}')">×</span>
                    </span>
                `).join('');
            }
        }

        async function addNewCategory() {
            const name = document.getElementById('newCategoryName').value.trim();
            const errorEl = document.getElementById('categoryError');

            if (!name) {
                errorEl.textContent = '请输入分类名称';
                return;
            }

            if (name.length > 10) {
                errorEl.textContent = '分类名称最多10个字符';
                return;
            }

            // Check for duplicates in system categories
            if (Object.values(SYSTEM_CATEGORIES).includes(name)) {
                errorEl.textContent = '该分类名称已存在';
                return;
            }

            // Check for duplicates in custom categories
            if (customCategories.some(c => c.name === name)) {
                errorEl.textContent = '该分类名称已存在';
                return;
            }

            const newCat = {
                id: 'custom_' + Date.now().toString(36),
                name: name
            };

            customCategories.push(newCat);
            await saveCustomCategories();
            renderCategoryManagement();
            renderFilterTags();
            renderCategorySelect();
            document.getElementById('newCategoryName').value = '';
            errorEl.textContent = '';
            showToast('分类添加成功');
        }

        async function deleteCategory(catId) {
            if (!confirm('删除此分类后，使用该分类的密码将显示为"其他"。确定删除吗？')) return;

            customCategories = customCategories.filter(c => c.id !== catId);
            await saveCustomCategories();
            renderCategoryManagement();
            renderFilterTags();
            renderCategorySelect();

            // Update passwords that used this category
            passwords.forEach(p => {
                if (p.category === catId) {
                    p.category = 'other';
                }
            });
            saveToStorage();
            renderPasswords();
        }

        function renderFilterTags() {
            const container = document.getElementById('filterTags');
            const allCats = getAllCategories();

            let html = `<span class="tag ${currentCategory === 'all' ? 'active' : ''}" data-category="all" onclick="filterCategory('all')">全部</span>`;

            for (const [id, name] of Object.entries(allCats)) {
                html += `<span class="tag ${currentCategory === id ? 'active' : ''}" data-category="${id}" onclick="filterCategory('${id}')">${name}</span>`;
            }

            html += `<span class="tag" style="background:transparent;border-style:dashed;" onclick="showAddCategoryModal()" title="添加自定义分类">+</span>`;
            container.innerHTML = html;
        }

        function renderCategorySelect() {
            const select = document.getElementById('entryCategory');
            const allCats = getAllCategories();

            let html = '';
            for (const [id, name] of Object.entries(allCats)) {
                html += `<option value="${id}">${name}</option>`;
            }
            select.innerHTML = html;
        }

        // ===== Storage =====
        async function saveToStorage() {
            if (!masterKey || !currentSalt) return;

            const encrypted = await encryptData(passwords, masterKey);
            const newStored = {
                version: DATA_VERSION,
                salt: Array.from(currentSalt),
                data: encrypted
            };
            await window.electronAPI.vault.set('passwordVault', JSON.stringify(newStored));
        }

        async function loadFromStorage(password) {
            const stored = await window.electronAPI.vault.get('passwordVault');
            if (!stored) return null;

            try {
                const parsed = JSON.parse(stored);
                currentSalt = new Uint8Array(parsed.salt);
                masterKey = await deriveKey(password, currentSalt);
                const decrypted = await decryptData(parsed.data, masterKey);
                return decrypted;
            } catch (e) {
                return null;
            }
        }

        async function hasStoredData() {
            return await window.electronAPI.vault.has('passwordVault');
        }

        // ===== Reset Functions =====
        function showResetModal() {
            document.getElementById('resetModal').classList.add('active');
        }

        function closeResetModal() {
            document.getElementById('resetModal').classList.remove('active');
        }

        async function confirmReset() {
            await window.electronAPI.vault.remove('passwordVault');
            await window.electronAPI.vault.remove('safenest_security_question');
            await window.electronAPI.vault.remove('safenest_security_answer');
            masterKey = null;
            currentSalt = null;
            passwords = [];
            failedAttempts = 0;
            securityQuestion = null;
            securityAnswer = null;
            batchMode = false;
            selectedItems.clear();
            closeResetModal();

            document.getElementById('setupMode').style.display = 'block';
            document.getElementById('unlockMode').style.display = 'none';
            document.getElementById('masterPassword').value = '';
            document.getElementById('confirmPassword').value = '';
            document.getElementById('unlockPassword').value = '';
            document.getElementById('loginError').textContent = '';

            showToast('系统已重置，请创建新主密码');
        }

        // ===== Theme Functions =====
        async function loadTheme() {
            const savedTheme = await window.electronAPI.settings.get('safenest_theme') || '';
            await setTheme(savedTheme, false);
        }

        function getCurrentTheme() {
            return document.documentElement.getAttribute('data-theme') || '';
        }

        async function setTheme(theme, save = true) {
            if (theme) {
                document.documentElement.setAttribute('data-theme', theme);
            } else {
                document.documentElement.removeAttribute('data-theme');
            }
            if (save) {
                await window.electronAPI.settings.set('safenest_theme', theme);
            }
            updateThemeDropdown();
        }

        function toggleThemeDropdown() {
            document.getElementById('themeDropdown').classList.toggle('active');
        }

        function updateThemeDropdown() {
            const current = getCurrentTheme();
            document.querySelectorAll('.theme-option').forEach(opt => {
                opt.classList.remove('active');
            });
            const activeOption = document.querySelector(`.theme-option[data-theme="${current}"]`);
            if (activeOption) {
                activeOption.classList.add('active');
            }
        }

        // ===== UI Functions =====
        async function init() {
            await loadTheme();
            await loadCustomCategories();
            loadSecurityQuestion();
            if (await hasStoredData()) {
                document.getElementById('setupMode').style.display = 'none';
                document.getElementById('unlockMode').style.display = 'block';
            }
        }

        async function login() {
            const isSetup = document.getElementById('setupMode').style.display !== 'none';
            const errorEl = document.getElementById('loginError');
            errorEl.textContent = '';

            if (isSetup) {
                const pwd = document.getElementById('masterPassword').value;
                const confirm = document.getElementById('confirmPassword').value;

                if (pwd.length < 8) {
                    errorEl.textContent = '主密码至少需要8位';
                    return;
                }
                if (pwd !== confirm) {
                    errorEl.textContent = '两次输入的密码不一致';
                    return;
                }

                currentSalt = crypto.getRandomValues(new Uint8Array(16));
                masterKey = await deriveKey(pwd, currentSalt);
                passwords = [];
                await saveToStorage();
                await showApp();
                showSecuritySetupModal(); // 首次创建，提示设置安全验证
            } else {
                const pwd = document.getElementById('unlockPassword').value;
                const decrypted = await loadFromStorage(pwd);

                if (decrypted === null) {
                    failedAttempts++;
                    document.getElementById('attemptCount').textContent = failedAttempts + 1;

                    if (failedAttempts >= 5) {
                        errorEl.textContent = '错误次数过多，请30秒后再试';
                        document.querySelector('.btn-primary').disabled = true;
                        setTimeout(() => {
                            failedAttempts = 0;
                            document.getElementById('attemptCount').textContent = '1';
                            document.querySelector('.btn-primary').disabled = false;
                            errorEl.textContent = '';
                        }, 30000);
                    } else {
                        errorEl.textContent = '密码错误，请重试';
                    }
                    return;
                }

                passwords = decrypted || [];
                await showApp();
            }
        }

        async function showApp() {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('appContainer').style.display = 'block';
            await loadCustomCategories();
            renderFilterTags();
            renderCategorySelect();
            startLockTimer();
            renderPasswords();
        }

        function lock() {
            masterKey = null;
            currentSalt = null;
            passwords = [];
            stopLockTimer();
            document.getElementById('appContainer').style.display = 'none';
            document.getElementById('loginScreen').style.display = 'flex';
            document.getElementById('unlockMode').style.display = 'block';
            document.getElementById('setupMode').style.display = 'none';
            document.getElementById('unlockPassword').value = '';
            document.getElementById('loginError').textContent = '';
            failedAttempts = 0;
        }

        // ===== Lock Timer =====
        function startLockTimer() {
            lockCountdown = LOCK_TIMEOUT;
            updateTimerDisplay();

            lockTimer = setInterval(() => {
                lockCountdown -= 1000;
                updateTimerDisplay();

                if (lockCountdown <= 0) {
                    lock();
                }
            }, 1000);

            ['mousedown', 'keydown', 'touchstart'].forEach(event => {
                document.addEventListener(event, resetLockTimer, { passive: true });
            });
        }

        function stopLockTimer() {
            if (lockTimer) {
                clearInterval(lockTimer);
                lockTimer = null;
            }
        }

        function resetLockTimer() {
            lockCountdown = LOCK_TIMEOUT;
            updateTimerDisplay();
        }

        function updateTimerDisplay() {
            const minutes = Math.floor(lockCountdown / 60000);
            const seconds = Math.floor((lockCountdown % 60000) / 1000);
            const text = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            document.getElementById('timerText').textContent = text;

            const timerEl = document.getElementById('lockTimer');
            if (lockCountdown < 60000) {
                timerEl.classList.add('warning');
            } else {
                timerEl.classList.remove('warning');
            }
        }

        // ===== Password Management =====
        function renderPasswords() {
            const grid = document.getElementById('passwordGrid');
            const search = document.getElementById('searchInput').value.toLowerCase();
            const empty = document.getElementById('emptyState');

            let filtered = passwords;

            if (currentCategory !== 'all') {
                filtered = filtered.filter(p => p.category === currentCategory);
            }

            if (search) {
                filtered = filtered.filter(p =>
                    p.title.toLowerCase().includes(search) ||
                    p.username.toLowerCase().includes(search)
                );
            }

            // 更新批量工具栏
            updateBatchToolbar(filtered);

            if (filtered.length === 0) {
                grid.innerHTML = '';
                empty.style.display = 'block';
                return;
            }

            empty.style.display = 'none';

            grid.innerHTML = filtered.map(p => {
                const isSelected = selectedItems.has(p.id);
                return `
                <div class="password-card ${isSelected ? 'selected' : ''}" onclick="${batchMode ? `toggleSelectItem('${p.id}')` : `togglePassword('${p.id}')`}">
                    ${batchMode ? `<input type="checkbox" class="card-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleSelectItem('${p.id}')">` : ''}
                    <div class="card-header">
                        <div class="card-title">${escapeHtml(p.title)}</div>
                        <span class="card-category">${getCategoryName(p.category)}</span>
                    </div>
                    <div class="card-field">
                        <label>用户名</label>
                        <div class="card-field-value">
                            <span class="field-text">${escapeHtml(p.username) || '-'}</span>
                            ${p.username ? `<button class="copy-btn" onclick="event.stopPropagation(); copyText('${escapeJs(p.username)}')">复制</button>` : ''}
                        </div>
                    </div>
                    <div class="card-field">
                        <label>密码</label>
                        <div class="card-field-value">
                            <span class="field-text ${p.showPassword ? '' : 'field-masked'}" id="pwd-${p.id}">
                                ${p.showPassword ? escapeHtml(p.password) : '••••••••'}
                            </span>
                            <button class="copy-btn" onclick="event.stopPropagation(); copyText('${escapeJs(p.password)}')">复制</button>
                        </div>
                    </div>
                    ${p.notes ? `<div class="card-field"><label>备注</label><div class="field-text" style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px">${escapeHtml(p.notes)}</div></div>` : ''}
                    ${renderLogInfo(p)}
                    <div class="card-actions">
                        <button class="card-btn" onclick="event.stopPropagation(); copyEntry('${p.id}')">📋 复制</button>
                        <button class="card-btn" onclick="event.stopPropagation(); editEntry('${p.id}')">编辑</button>
                        ${!batchMode ? `<button class="card-btn danger" onclick="event.stopPropagation(); deleteEntry('${p.id}')">删除</button>` : ''}
                    </div>
                </div>`;
            }).join('');
        }

        // ===== Batch Operations =====
        function toggleBatchMode() {
            batchMode = !batchMode;
            if (!batchMode) {
                selectedItems.clear();
            }
            renderPasswords();
            showToast(batchMode ? '已开启批量选择模式，点击卡片选择' : '已退出批量模式');
        }

        function updateBatchToolbar(filteredItems) {
            const toolbar = document.getElementById('batchToolbar');

            if (batchMode) {
                toolbar.style.display = 'flex';
                const count = selectedItems.size;
                document.getElementById('batchCount').textContent = `已选择 ${count} 条`;
                document.getElementById('batchDeleteBtn').disabled = count === 0;

                // 更新全选复选框状态
                const selectAll = document.getElementById('selectAllBatch');
                if (filteredItems.length > 0) {
                    const allSelected = filteredItems.every(p => selectedItems.has(p.id));
                    const someSelected = filteredItems.some(p => selectedItems.has(p.id));
                    selectAll.checked = allSelected;
                    selectAll.indeterminate = someSelected && !allSelected;
                } else {
                    selectAll.checked = false;
                    selectAll.indeterminate = false;
                }
            } else {
                toolbar.style.display = 'none';
            }
        }

        function toggleSelectItem(id) {
            if (selectedItems.has(id)) {
                selectedItems.delete(id);
            } else {
                selectedItems.add(id);
            }
            renderPasswords();
        }

        function toggleSelectAllBatch() {
            const selectAll = document.getElementById('selectAllBatch').checked;
            let filtered = passwords;

            if (currentCategory !== 'all') {
                filtered = filtered.filter(p => p.category === currentCategory);
            }

            const search = document.getElementById('searchInput').value.toLowerCase();
            if (search) {
                filtered = filtered.filter(p =>
                    p.title.toLowerCase().includes(search) ||
                    p.username.toLowerCase().includes(search)
                );
            }

            if (selectAll) {
                filtered.forEach(p => selectedItems.add(p.id));
            } else {
                filtered.forEach(p => selectedItems.delete(p.id));
            }
            renderPasswords();
        }

        function cancelBatchSelection() {
            batchMode = false;
            selectedItems.clear();
            renderPasswords();
        }

        function showBatchDeleteVerify() {
            if (selectedItems.size === 0) return;

            document.getElementById('batchDeletePassword').value = '';
            document.getElementById('batchDeleteAnswer').value = '';
            document.getElementById('batchDeleteError').textContent = '';

            // 显示安全问题
            const questionEl = document.getElementById('batchDeleteQuestion');
            const questionContainer = document.getElementById('securityQuestionDisplay');
            if (securityQuestion) {
                questionEl.textContent = securityQuestion;
                questionContainer.style.display = 'block';
            } else {
                questionContainer.style.display = 'none';
            }

            document.getElementById('batchDeleteVerifyModal').classList.add('active');
        }

        function closeBatchDeleteVerify() {
            document.getElementById('batchDeleteVerifyModal').classList.remove('active');
        }

        async function confirmBatchDelete() {
            const password = document.getElementById('batchDeletePassword').value;
            const answer = document.getElementById('batchDeleteAnswer').value;
            const errorEl = document.getElementById('batchDeleteError');

            if (!password) {
                errorEl.textContent = '请输入主密码';
                return;
            }

            // 验证主密码
            try {
                const testKey = await deriveKey(password, currentSalt);
                const stored = await window.electronAPI.vault.get('passwordVault');
                const parsed = JSON.parse(stored);
                const decrypted = await decryptData(parsed.data, testKey);

                if (decrypted === null) {
                    errorEl.textContent = '主密码错误';
                    return;
                }
            } catch (e) {
                errorEl.textContent = '主密码验证失败';
                return;
            }

            // 验证二次验证答案
            if (securityQuestion) {
                if (!answer) {
                    errorEl.textContent = '请输入安全验证答案';
                    return;
                }
                const encoder = new TextEncoder();
                const answerHash = await crypto.subtle.digest('SHA-256', encoder.encode(answer.toLowerCase().trim()));
                const answerHex = Array.from(new Uint8Array(answerHash)).map(b => b.toString(16).padStart(2, '0')).join('');
                if (answerHex !== securityAnswer) {
                    errorEl.textContent = '安全验证答案错误';
                    return;
                }
            }

            // 执行批量删除
            const count = selectedItems.size;
            passwords = passwords.filter(p => !selectedItems.has(p.id));
            selectedItems.clear();
            batchMode = false;

            await saveToStorage();
            closeBatchDeleteVerify();
            renderPasswords();
            showToast(`已删除 ${count} 条记录`);
        }

        // ===== Security Question Functions =====
        function showSecuritySetupModal() {
            document.getElementById('setupSecurityQuestion').value = '';
            document.getElementById('setupSecurityAnswer').value = '';
            document.getElementById('securitySetupError').textContent = '';
            document.getElementById('securitySetupModal').classList.add('active');
        }

        async function saveSecuritySetup() {
            const question = document.getElementById('setupSecurityQuestion').value.trim();
            const answer = document.getElementById('setupSecurityAnswer').value.trim();
            const errorEl = document.getElementById('securitySetupError');

            if (!question) {
                errorEl.textContent = '请输入验证问题';
                return;
            }
            if (!answer) {
                errorEl.textContent = '请输入答案';
                return;
            }

            // 计算答案哈希
            const encoder = new TextEncoder();
            const answerHash = await crypto.subtle.digest('SHA-256', encoder.encode(answer.toLowerCase()));
            securityAnswer = Array.from(new Uint8Array(answerHash)).map(b => b.toString(16).padStart(2, '0')).join('');
            securityQuestion = question;

            // 保存到 localStorage
            await window.electronAPI.vault.set('safenest_security_question', question);
            await window.electronAPI.vault.set('safenest_security_answer', securityAnswer);

            document.getElementById('securitySetupModal').classList.remove('active');
            showToast('安全验证已设置');
        }

        async function loadSecurityQuestion() {
            const question = await window.electronAPI.vault.get('safenest_security_question');
            const answer = await window.electronAPI.vault.get('safenest_security_answer');
            if (question && answer) {
                securityQuestion = question;
                securityAnswer = answer;
            }
        }

        // 长按/右键菜单触发批量模式
        document.addEventListener('contextmenu', function(e) {
            const card = e.target.closest('.password-card');
            if (card && document.getElementById('appContainer').style.display === 'block') {
                e.preventDefault();
                if (!batchMode) {
                    batchMode = true;
                    renderPasswords();
                    showToast('已开启批量选择模式');
                }
            }
        });

        function togglePassword(id) {
            const entry = passwords.find(p => p.id === id);
            if (entry) {
                entry.showPassword = !entry.showPassword;
                renderPasswords();
            }
        }

        function filterCategory(cat) {
            currentCategory = cat;
            document.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
            document.querySelector(`[data-category="${cat}"]`).classList.add('active');
            renderPasswords();
        }

        // ===== Modal Functions =====
        function showAddModal() {
            editingId = null;
            document.getElementById('modalTitle').textContent = '添加密码';
            document.getElementById('entryTitle').value = '';
            document.getElementById('entryCategory').value = 'work';
            document.getElementById('entryUsername').value = '';
            document.getElementById('entryPassword').value = '';
            document.getElementById('entryNotes').value = '';
            document.getElementById('strengthFill').className = 'strength-fill';
            document.getElementById('editModal').classList.add('active');
        }

        function editEntry(id) {
            const entry = passwords.find(p => p.id === id);
            if (!entry) return;

            editingId = id;
            document.getElementById('modalTitle').textContent = '编辑密码';
            document.getElementById('entryTitle').value = entry.title;
            document.getElementById('entryCategory').value = entry.category;
            document.getElementById('entryUsername').value = entry.username;
            document.getElementById('entryPassword').value = entry.password;
            document.getElementById('entryNotes').value = entry.notes || '';
            checkStrength();
            document.getElementById('editModal').classList.add('active');
        }

        async function saveEntry() {
            const title = document.getElementById('entryTitle').value.trim();
            const password = document.getElementById('entryPassword').value;

            if (!title || !password) {
                showToast('请填写必填项');
                return;
            }

            const now = Date.now();
            const entry = {
                id: editingId || Date.now().toString(36),
                title: title,
                category: document.getElementById('entryCategory').value,
                username: document.getElementById('entryUsername').value.trim(),
                password: password,
                notes: document.getElementById('entryNotes').value.trim(),
                showPassword: false,
                createdAt: editingId ? passwords.find(p => p.id === editingId)?.createdAt : now,
                updatedAt: now
            };

            if (editingId) {
                const idx = passwords.findIndex(p => p.id === editingId);
                if (idx !== -1) passwords[idx] = entry;
            } else {
                passwords.push(entry);
            }

            await saveToStorage();
            closeModal();
            renderPasswords();
            showToast('保存成功');
        }

        async function deleteEntry(id) {
            if (!confirm('确定要删除这个密码吗？此操作不可恢复。')) return;
            passwords = passwords.filter(p => p.id !== id);
            await saveToStorage();
            renderPasswords();
            showToast('已删除');
        }

        function closeModal() {
            document.getElementById('editModal').classList.remove('active');
        }

        // ===== Password Generator =====
        function generatePassword() {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
            let pwd = '';
            for (let i = 0; i < 16; i++) {
                pwd += chars[Math.floor(Math.random() * chars.length)];
            }
            document.getElementById('entryPassword').value = pwd;
            checkStrength();
        }

        function checkStrength() {
            const pwd = document.getElementById('entryPassword').value;
            const fill = document.getElementById('strengthFill');

            let score = 0;
            if (pwd.length >= 8) score++;
            if (pwd.length >= 12) score++;
            if (/[A-Z]/.test(pwd)) score++;
            if (/[0-9]/.test(pwd)) score++;
            if (/[^A-Za-z0-9]/.test(pwd)) score++;

            fill.className = 'strength-fill';
            if (score <= 2) fill.classList.add('strength-weak');
            else if (score <= 4) fill.classList.add('strength-medium');
            else fill.classList.add('strength-strong');
        }

        // ===== Import/Export =====
        async function exportData() {
            if (passwords.length === 0) {
                showToast('没有可导出的数据');
                return;
            }

            // 显示密码验证弹窗
            document.getElementById('exportVerifyPassword').value = '';
            document.getElementById('exportVerifyError').textContent = '';
            document.getElementById('exportVerifyModal').classList.add('active');
        }

        function closeExportVerifyModal() {
            document.getElementById('exportVerifyModal').classList.remove('active');
            tempExportPassword = null;
        }

        async function confirmExportVerify() {
            const password = document.getElementById('exportVerifyPassword').value;
            const errorEl = document.getElementById('exportVerifyError');

            if (!password) {
                errorEl.textContent = '请输入主密码';
                return;
            }

            // 验证密码是否正确
            try {
                const testKey = await deriveKey(password, currentSalt);
                const stored = await window.electronAPI.vault.get('passwordVault');
                const parsed = JSON.parse(stored);
                const decrypted = await decryptData(parsed.data, testKey);

                if (decrypted === null) {
                    errorEl.textContent = '密码错误，请重试';
                    return;
                }

                // 密码验证通过
                tempExportPassword = password;
                closeExportVerifyModal();
                showExportMarkdownModal();
            } catch (e) {
                errorEl.textContent = '验证失败，请重试';
            }
        }

        function showExportMarkdownModal() {
            const markdown = generateMarkdownExport();
            document.getElementById('exportMarkdownTextarea').value = markdown;
            document.getElementById('exportMarkdownModal').classList.add('active');
        }

        function closeExportMarkdownModal() {
            document.getElementById('exportMarkdownModal').classList.remove('active');
            tempExportPassword = null;
        }

        function generateMarkdownExport() {
            const date = new Date().toLocaleString('zh-CN');
            let markdown = `# SafeNest 密码导出\n\n`;
            markdown += `> 导出时间：${date}\n`;
            markdown += `> 条目数量：${passwords.length}\n\n`;
            markdown += `---\n\n`;

            passwords.forEach((entry, index) => {
                markdown += `## ${index + 1}. ${entry.title}\n\n`;
                markdown += `- **名称**：${entry.title}\n`;
                markdown += `- **分类**：${getCategoryName(entry.category)}\n`;
                markdown += `- **用户**：${entry.username || '(空)'}\n`;
                markdown += `- **密码**：${entry.password}\n`;
                markdown += `- **备注**：${entry.notes || '(无)'}\n`;
                markdown += `- **创建时间**：${entry.createdAt ? formatDateTime(entry.createdAt) : '未知'}\n`;
                markdown += `- **修改时间**：${entry.updatedAt ? formatDateTime(entry.updatedAt) : '未知'}\n\n`;
                markdown += `---\n\n`;
            });

            markdown += `## 导入说明\n\n`;
            markdown += `此文件可以通过 SafeNest 的导入功能重新导入。导入时会检测名称冲突并提供处理选项。\n`;

            return markdown;
        }

        function downloadMarkdownExport() {
            const markdown = document.getElementById('exportMarkdownTextarea').value;
            const blob = new Blob([markdown], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `safenest_export_${new Date().toISOString().slice(0,10)}.md`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('已开始下载');
        }

        // ===== Utilities =====
        async function copyText(text) {
            await navigator.clipboard.writeText(text);
            showToast('已复制');
        }

        function showToast(msg) {
            const toast = document.getElementById('toast');
            toast.textContent = msg;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2000);
        }

        function escapeHtml(str) {
            if (!str) return '';
            return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
        }

        function escapeJs(str) {
            if (!str) return '';
            return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
        }

        // ===== Log Info =====
        function renderLogInfo(entry) {
            const created = entry.createdAt ? formatDateTime(entry.createdAt) : '未知';
            const updated = entry.updatedAt && entry.updatedAt !== entry.createdAt
                ? ` · 修改于 ${formatDateTime(entry.updatedAt)}` : '';
            return `<div class="log-info">
                创建于 ${created}${updated}
            </div>`;
        }

        function formatDateTime(timestamp) {
            const date = new Date(timestamp);
            return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
        }

        // ===== Copy Entry =====
        async function copyEntry(id) {
            const entry = passwords.find(p => p.id === id);
            if (!entry) return;

            const newEntry = {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                title: entry.title + ' (复制)',
                category: entry.category,
                username: entry.username,
                password: entry.password,
                notes: entry.notes ? entry.notes + ' (从原条目复制)' : '从原条目复制',
                showPassword: false,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            passwords.push(newEntry);
            await saveToStorage();
            renderPasswords();
            showToast('已复制条目');
        }

        // ===== Import Functions =====
        function showImportPreviewModal() {
            document.getElementById('importPreviewModal').classList.add('active');
            importPreviewData = [];
            document.getElementById('importPreviewContainer').style.display = 'none';
            document.getElementById('importEmptyState').style.display = 'block';
            document.getElementById('confirmImportBtn').disabled = true;
            document.getElementById('importFile').value = '';
            document.getElementById('selectAllImport').checked = true;
        }

        function closeImportPreviewModal() {
            document.getElementById('importPreviewModal').classList.remove('active');
            importPreviewData = [];
        }

        async function handleImportFile(event) {
            const file = event.target.files[0];
            if (!file) return;

            const extension = file.name.split('.').pop().toLowerCase();
            const reader = new FileReader();

            reader.onload = function(e) {
                const content = e.target.result;
                try {
                    let parsed = [];

                    if (extension === 'md' || extension === 'markdown') {
                        parsed = parseMarkdownImport(content);
                    } else if (extension === 'json') {
                        parsed = parseJSONImport(content);
                    } else if (extension === 'xml') {
                        parsed = parseXMLImport(content);
                    } else if (extension === 'csv') {
                        parsed = parseCSVImport(content);
                    } else {
                        // Try auto detect
                        parsed = tryAutoDetect(content);
                    }

                    if (parsed.length === 0) {
                        showToast('未能识别有效数据');
                        return;
                    }

                    // 检测重复并设置冲突处理选项
                    importPreviewData = parsed.map(item => {
                        const existing = passwords.find(p => p.title === item.title);
                        return {
                            ...item,
                            selected: true,
                            valid: !!(item.title && item.password),
                            conflict: existing ? true : false,
                            conflictAction: existing ? 'skip' : 'none', // skip, overwrite, import
                            existingId: existing ? existing.id : null
                        };
                    });

                    renderImportPreview();
                } catch (err) {
                    showToast('文件解析失败: ' + err.message);
                }
            };

            reader.readAsText(file);
        }

        function tryAutoDetect(content) {
            // Try Markdown first (check for ## header pattern)
            if (content.includes('## ') && content.includes('**名称**')) {
                try {
                    return parseMarkdownImport(content);
                } catch (e) {}
            }

            // Try JSON first
            try {
                return parseJSONImport(content);
            } catch (e) {}

            // Try XML
            try {
                return parseXMLImport(content);
            } catch (e) {}

            // Try CSV
            try {
                return parseCSVImport(content);
            } catch (e) {}

            return [];
        }

        function parseMarkdownImport(content) {
            const entries = [];
            // Split by ## headers
            const sections = content.split(/##\s+/);

            for (const section of sections) {
                const lines = section.trim().split('\n');
                if (lines.length < 2) continue;

                const entry = {
                    title: '',
                    username: '',
                    password: '',
                    category: 'other',
                    notes: ''
                };

                // Try to extract title from first line (number. title pattern)
                const titleMatch = lines[0].match(/^\d+\.\s*(.+)$/);
                if (titleMatch) {
                    entry.title = titleMatch[1].trim();
                }

                // Extract fields from bullet points
                for (const line of lines) {
                    const trimmed = line.trim();

                    // 名称/标题
                    const nameMatch = trimmed.match(/[-*]\s*\*\*名称\*\*[:：]?\s*(.+)/);
                    if (nameMatch) entry.title = nameMatch[1].trim();

                    const titleMatch2 = trimmed.match(/[-*]\s*\*\*标题\*\*[:：]?\s*(.+)/);
                    if (titleMatch2) entry.title = titleMatch2[1].trim();

                    // 分类
                    const catMatch = trimmed.match(/[-*]\s*\*\*分类\*\*[:：]?\s*(.+)/);
                    if (catMatch) {
                        const catName = catMatch[1].trim();
                        const catMap = { '工作': 'work', '个人': 'personal', '金融': 'finance', '社交': 'social', '其他': 'other' };
                        entry.category = catMap[catName] || 'other';
                    }

                    // 用户
                    const userMatch = trimmed.match(/[-*]\s*\*\*用户\*\*[:：]?\s*(.+)/);
                    if (userMatch) {
                        const userVal = userMatch[1].trim();
                        entry.username = userVal === '(空)' ? '' : userVal;
                    }

                    const usernameMatch = trimmed.match(/[-*]\s*\*\*用户名\*\*[:：]?\s*(.+)/);
                    if (usernameMatch) {
                        const userVal = usernameMatch[1].trim();
                        entry.username = userVal === '(空)' ? '' : userVal;
                    }

                    // 密码
                    const passMatch = trimmed.match(/[-*]\s*\*\*密码\*\*[:：]?\s*(.+)/);
                    if (passMatch) entry.password = passMatch[1].trim();

                    // 备注
                    const notesMatch = trimmed.match(/[-*]\s*\*\*备注\*\*[:：]?\s*(.+)/);
                    if (notesMatch) {
                        const notesVal = notesMatch[1].trim();
                        entry.notes = notesVal === '(无)' ? '' : notesVal;
                    }
                }

                if (entry.title) {
                    entries.push(entry);
                }
            }

            return entries;
        }

        function parseJSONImport(content) {
            const data = JSON.parse(content);
            if (Array.isArray(data)) {
                return data.map(normalizeEntry);
            } else if (data.passwords && Array.isArray(data.passwords)) {
                return data.passwords.map(normalizeEntry);
            } else if (data.data && Array.isArray(data.data)) {
                return data.data.map(normalizeEntry);
            }
            return [];
        }

        function parseXMLImport(content) {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(content, 'text/xml');
            const entries = [];

            // Try different XML structures
            let items = xmlDoc.querySelectorAll('password, entry, item, record');
            if (items.length === 0) {
                items = xmlDoc.querySelectorAll('root > *');
            }

            items.forEach(item => {
                const entry = {};
                item.childNodes.forEach(child => {
                    if (child.nodeType === 1) {
                        entry[child.nodeName.toLowerCase()] = child.textContent;
                    }
                });

                // Also check attributes
                if (item.attributes) {
                    for (let i = 0; i < item.attributes.length; i++) {
                        const attr = item.attributes[i];
                        entry[attr.name.toLowerCase()] = attr.value;
                    }
                }

                entries.push(normalizeEntry(entry));
            });

            return entries;
        }

        function parseCSVImport(content) {
            const lines = content.split('\n').filter(l => l.trim());
            if (lines.length < 2) return [];

            const headers = parseCSVLine(lines[0]);
            const entries = [];

            for (let i = 1; i < lines.length; i++) {
                const values = parseCSVLine(lines[i]);
                const entry = {};
                headers.forEach((h, idx) => {
                    entry[h.toLowerCase().trim()] = values[idx] || '';
                });
                entries.push(normalizeEntry(entry));
            }

            return entries;
        }

        function parseCSVLine(line) {
            const result = [];
            let current = '';
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        current += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            result.push(current.trim());
            return result;
        }

        function normalizeEntry(entry) {
            // Map various field names to standard format
            const fieldMap = {
                title: ['title', 'name', 'site', 'website', 'app', '应用', '网站', '名称'],
                username: ['username', 'user', 'login', 'account', '用户名', '账号', '账户'],
                password: ['password', 'pwd', 'pass', '密码', '口令'],
                category: ['category', 'type', 'tag', '分类', '类别', '标签'],
                notes: ['notes', 'note', 'comment', 'description', '备注', '说明', '描述']
            };

            const normalized = {
                title: '',
                username: '',
                password: '',
                category: 'other',
                notes: ''
            };

            const entryLower = {};
            for (const key in entry) {
                entryLower[key.toLowerCase()] = entry[key];
            }

            for (const [standard, aliases] of Object.entries(fieldMap)) {
                for (const alias of aliases) {
                    if (entryLower[alias] !== undefined) {
                        normalized[standard] = entryLower[alias];
                        break;
                    }
                }
            }

            // Normalize category - check system categories first
            const catMap = {
                'work': ['work', 'job', 'business', '工作', '办公'],
                'personal': ['personal', 'private', '个人', '私人'],
                'finance': ['finance', 'bank', 'money', 'financial', '金融', '银行', '财务'],
                'social': ['social', 'socialmedia', '社交', '社交'],
                'other': ['other', 'others', 'misc', '其他', '其它', '其他']
            };

            const rawCat = (normalized.category || '').toString().toLowerCase();
            let found = false;
            for (const [stdCat, aliases] of Object.entries(catMap)) {
                if (aliases.includes(rawCat)) {
                    normalized.category = stdCat;
                    found = true;
                    break;
                }
            }

            // Check custom categories
            if (!found) {
                for (const customCat of customCategories) {
                    if (customCat.name.toLowerCase() === rawCat ||
                        customCat.id.toLowerCase() === rawCat) {
                        normalized.category = customCat.id;
                        found = true;
                        break;
                    }
                }
            }

            // Keep original category name if no match found (will be treated as new custom category)
            if (!found && normalized.category) {
                // Check if we need to create a new custom category
                const existingCustom = customCategories.find(c =>
                    c.name.toLowerCase() === normalized.category.toLowerCase()
                );
                if (existingCustom) {
                    normalized.category = existingCustom.id;
                }
                // Otherwise, keep the original value and handle in import
            }

            return normalized;
        }

        function renderImportPreview() {
            const container = document.getElementById('importPreviewContainer');
            const emptyState = document.getElementById('importEmptyState');
            const tbody = document.getElementById('importPreviewBody');
            const stats = document.getElementById('importStats');

            if (importPreviewData.length === 0) {
                container.style.display = 'none';
                emptyState.style.display = 'block';
                document.getElementById('confirmImportBtn').disabled = true;
                return;
            }

            container.style.display = 'block';
            emptyState.style.display = 'none';

            const validCount = importPreviewData.filter(i => i.valid && i.selected).length;
            const totalCount = importPreviewData.length;
            const conflictCount = importPreviewData.filter(i => i.conflict).length;

            stats.innerHTML = `
                共识别 <strong>${totalCount}</strong> 条记录，
                有效 <strong>${importPreviewData.filter(i => i.valid).length}</strong> 条，
                选中 <strong>${validCount}</strong> 条待导入
                ${conflictCount > 0 ? `，其中 <strong style="color:var(--warning)">${conflictCount}</strong> 条名称重复` : ''}
            `;

            tbody.innerHTML = importPreviewData.map((item, idx) => {
                const conflictStyle = item.conflict ? 'style="background:rgba(212,168,75,0.1)"' : '';
                const rowClass = item.selected ? 'selected' : '';
                const disabledAttr = !item.valid ? 'disabled' : '';

                // 冲突处理选项
                let conflictCell = '<td>-</td>';
                if (item.conflict) {
                    const actions = [
                        { value: 'skip', label: '不导入' },
                        { value: 'overwrite', label: '覆盖' },
                        { value: 'import', label: '导入' }
                    ];
                    conflictCell = `<td>
                        <select onchange="setConflictAction(${idx}, this.value)" style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:0.8rem;">
                            ${actions.map(a => `<option value="${a.value}" ${item.conflictAction === a.value ? 'selected' : ''}>${a.label}</option>`).join('')}
                        </select>
                    </td>`;
                }

                return `
                    <tr class="${rowClass}" ${conflictStyle} ${!item.valid ? 'style="opacity:0.5"' : ''}>
                        <td><input type="checkbox" ${item.selected ? 'checked' : ''} ${disabledAttr} onchange="toggleImportItem(${idx})"></td>
                        <td>${escapeHtml(item.title) || '<span style="color:var(--danger)">(必填)</span>'}${item.conflict ? ' <span style="color:var(--warning);font-size:0.75rem;">[重复]</span>' : ''}</td>
                        <td>${escapeHtml(item.username) || '-'}</td>
                        <td>${getCategoryName(item.category)}</td>
                        <td>${escapeHtml(item.notes?.substring(0, 30) || '')}${item.notes?.length > 30 ? '...' : ''}</td>
                        ${conflictCell}
                    </tr>
                `;
            }).join('');

            document.getElementById('confirmImportBtn').disabled = validCount === 0;
        }

        function setConflictAction(idx, action) {
            importPreviewData[idx].conflictAction = action;
            // 如果选择覆盖或导入为新条目，自动选中
            if (action !== 'skip' && !importPreviewData[idx].selected) {
                importPreviewData[idx].selected = true;
            }
            renderImportPreview();
        }

        function toggleImportItem(idx) {
            importPreviewData[idx].selected = !importPreviewData[idx].selected;
            renderImportPreview();
        }

        function toggleSelectAllImport() {
            const checked = document.getElementById('selectAllImport').checked;
            importPreviewData.forEach(item => {
                if (item.valid) item.selected = checked;
            });
            renderImportPreview();
        }

        async function confirmImport() {
            const toImport = importPreviewData.filter(i => i.selected && i.valid && i.conflictAction !== 'skip');
            if (toImport.length === 0) return;

            const now = Date.now();

            for (const item of toImport) {
                const entryData = {
                    title: item.title,
                    category: item.category,
                    username: item.username,
                    password: item.password,
                    notes: item.notes,
                    showPassword: false,
                    updatedAt: now
                };

                if (item.conflict && item.conflictAction === 'overwrite') {
                    // 覆盖现有条目
                    const existingIdx = passwords.findIndex(p => p.id === item.existingId);
                    if (existingIdx !== -1) {
                        entryData.id = item.existingId;
                        entryData.createdAt = passwords[existingIdx].createdAt;
                        passwords[existingIdx] = entryData;
                    }
                } else {
                    // 导入为新条目（或者原本就没有冲突的）
                    entryData.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
                    entryData.createdAt = now;
                    passwords.push(entryData);
                }
            }

            await saveToStorage();
            renderPasswords();
            closeImportPreviewModal();
            showToast(`成功导入 ${toImport.length} 条记录`);
        }

        // Close modals on outside click
        const _editModalEl = document.getElementById('editModal'); if (_editModalEl) _editModalEl.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeModal();
        });
        const _dataModalEl = document.getElementById('dataModal'); if (_dataModalEl) _dataModalEl.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeDataModal();
        });
        const _resetModalEl = document.getElementById('resetModal'); if (_resetModalEl) _resetModalEl.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeResetModal();
        });
        const _importPreviewModalEl = document.getElementById('importPreviewModal'); if (_importPreviewModalEl) _importPreviewModalEl.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeImportPreviewModal();
        });
        const _exportVerifyModalEl = document.getElementById('exportVerifyModal'); if (_exportVerifyModalEl) _exportVerifyModalEl.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeExportVerifyModal();
        });
        const _exportMarkdownModalEl = document.getElementById('exportMarkdownModal'); if (_exportMarkdownModalEl) _exportMarkdownModalEl.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeExportMarkdownModal();
        });
        const _categoryModalEl = document.getElementById('categoryModal'); if (_categoryModalEl) _categoryModalEl.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeCategoryModal();
        });
        const _batchDeleteVerifyModalEl = document.getElementById('batchDeleteVerifyModal'); if (_batchDeleteVerifyModalEl) _batchDeleteVerifyModalEl.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeBatchDeleteVerify();
        });

        // Close theme dropdown when clicking outside
        document.addEventListener('click', function(e) {
            const switcher = document.querySelector('.theme-switcher');
            if (switcher && !switcher.contains(e.target)) {
                const dropdown = document.getElementById('themeDropdown');
                if (dropdown) dropdown.classList.remove('active');
            }
        });

        // Initialize
        (async () => { await init(); })();
