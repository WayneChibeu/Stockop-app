// --- DATA ---
let INVENTORY = JSON.parse(localStorage.getItem('inventory')) || [];
let HISTORY = JSON.parse(localStorage.getItem('stockHistory')) || [];
let LANG = localStorage.getItem('lang') || 'en';

let SETTINGS = {
    name: localStorage.getItem('storeName') || 'StockOp',
    pin: localStorage.getItem('storePin') || '0000',
    secQ: localStorage.getItem('secQ') || 'What is your mother\'s maiden name?',
    secA: localStorage.getItem('secA') || ''
};

let SHIFT_DATA = JSON.parse(localStorage.getItem('shiftData')) || {
    active: false,
    startTime: null,
    actions: []
};

// --- INIT ---
window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'dark') toggleTheme();

    /* Security Warning Console */
    if (window.console) {
        console.log('%cSTOP!', 'color: red; font-size: 50px; font-weight: bold; text-shadow: 2px 2px black;');
        console.log('%cThis is a browser feature intended for developers. Use of this console may allow attackers to steal your information.', 'font-size: 20px;');
    }


    if (!localStorage.getItem('isSetup')) {
        document.getElementById('welcome-modal').classList.remove('hidden');
    } else {
        document.title = SETTINGS.name;
        document.getElementById('store-name-display').innerText = SETTINGS.name;
    }

    renderShiftUI();

    if (location.protocol.startsWith('http')) {
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
    }

    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });

    const unlockTime = parseInt(localStorage.getItem('lockoutUntil')) || 0;
    if (Date.now() < unlockTime) startLockout(unlockTime - Date.now());

    render();
    lucide.createIcons();

    // Apply saved language on load
    if (LANG) {
        document.getElementById('inp-lang').value = LANG;
        setTimeout(() => applyTranslations(LANG), 100);
    }

    setupEventListeners(deferredPrompt);
});

function setupEventListeners(deferredPrompt) {
    // Header Actions
    document.getElementById('theme-btn').addEventListener('click', toggleTheme);
    document.getElementById('settings-btn').addEventListener('click', openSettings);
    document.getElementById('search-btn').addEventListener('click', () => {
        const sBar = document.getElementById('search-bar');
        const sInp = document.getElementById('search-input');
        sBar.classList.remove('hidden');
        sInp.focus();
    });
    document.getElementById('install-btn').addEventListener('click', () => {
        if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; }
        else { document.getElementById('install-help-modal').classList.remove('hidden'); }
    });
    document.getElementById('install-help-modal').querySelector('.btn-save').addEventListener('click', () => {
        document.getElementById('install-help-modal').classList.add('hidden');
    });

    // Dashboard Actions
    document.getElementById('view-toggle-btn').addEventListener('click', toggleView);
    document.getElementById('enable-notifs-btn').addEventListener('click', requestNotifPermission);

    // Search Bar
    document.getElementById('search-bar').querySelector('.btn-icon').addEventListener('click', toggleSearch); // Back btn
    document.getElementById('search-input').addEventListener('input', render);
    document.querySelector('.clear-search').addEventListener('click', clearSearch);
    document.querySelector('.mic-btn').addEventListener('click', startVoice);

    // Sort
    document.getElementById('sort-select').addEventListener('change', render);

    // Shift Bar
    document.getElementById('shift-btn').addEventListener('click', toggleShift);

    // FAB
    document.querySelector('.fab').addEventListener('click', () => checkAdmin(openAddModal));

    // List Delegation
    document.getElementById('list').addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const id = parseInt(target.dataset.id);

        if (action === 'edit') {
            checkAdmin(() => openModal(id));
        } else if (action === 'dec') {
            mod(id, -1);
        } else if (action === 'inc') {
            mod(id, 1);
        }
    });

    // Modals - Setup
    document.getElementById('welcome-modal').querySelector('.btn-save').addEventListener('click', completeSetup);
    document.getElementById('setup-q-select').addEventListener('change', (e) => toggleCustom('setup', e.target.value));

    // Modals - Settings
    document.getElementById('inp-q-select').addEventListener('change', (e) => toggleCustom('inp', e.target.value));
    document.getElementById('settings-modal').querySelector('.btn-delete').addEventListener('click', factoryReset);
    document.getElementById('settings-modal').querySelector('.btn-cancel').addEventListener('click', () => document.getElementById('settings-modal').classList.add('hidden'));
    document.getElementById('settings-modal').querySelector('.btn-save').addEventListener('click', saveSettings);
    document.getElementById('inp-lang').addEventListener('change', (e) => setLang(e.target.value));

    // Settings - Data
    const settingsModal = document.getElementById('settings-modal');
    // Find buttons by text content or structure since they don't have IDs
    const backupBtn = Array.from(settingsModal.querySelectorAll('.btn-outline')).find(b => b.textContent.includes('Export Backup'));
    if (backupBtn) backupBtn.addEventListener('click', backupData);

    const importBtn = Array.from(settingsModal.querySelectorAll('.btn-outline')).find(b => b.textContent.includes('Import Backup'));
    if (importBtn) importBtn.addEventListener('click', () => document.getElementById('import-file').click());

    document.getElementById('import-file').addEventListener('change', importData);

    const historyBtn = Array.from(settingsModal.querySelectorAll('.btn-outline')).find(b => b.textContent.includes('History'));
    if (historyBtn) historyBtn.addEventListener('click', showHistory);


    // Modals - Item
    document.getElementById('btn-delete').addEventListener('click', deleteItem);
    document.getElementById('modal').querySelector('.btn-cancel').addEventListener('click', closeModal);
    document.getElementById('modal').querySelector('.btn-save').addEventListener('click', saveItem);

    // Modals - Pin
    document.getElementById('pin-modal').querySelector('.btn-save').addEventListener('click', verifyPin);
    document.getElementById('pin-modal').querySelector('.btn-cancel').addEventListener('click', closePin);
    document.querySelector('[data-t="forgotPin"]').addEventListener('click', recoverPinFlow);

    // Modals - Recovery
    document.getElementById('recovery-modal').querySelector('.btn-cancel').addEventListener('click', () => document.getElementById('recovery-modal').classList.add('hidden'));
    document.getElementById('recovery-modal').querySelector('.btn-save').addEventListener('click', verifyRecovery);

    // Modals - Report
    document.getElementById('report-modal').querySelectorAll('.btn-save')[0].addEventListener('click', () => downloadPDF(false));
    document.getElementById('report-modal').querySelector('.btn-outline').addEventListener('click', downloadCSV);
    document.getElementById('btn-finish-shift-final').addEventListener('click', confirmEndShift);
    document.getElementById('report-modal').querySelector('.btn-cancel').addEventListener('click', () => document.getElementById('report-modal').classList.add('hidden'));

    // Modals - History
    document.getElementById('history-modal').querySelector('.btn-delete').addEventListener('click', clearHistory);
    document.getElementById('history-modal').querySelector('.btn-save').addEventListener('click', () => document.getElementById('history-modal').classList.add('hidden'));
}

function toggleCustom(prefix, val) {
    const customInp = document.getElementById(prefix + '-q-custom');
    if (val === 'custom') customInp.classList.remove('hidden');
    else customInp.classList.add('hidden');
}

function completeSetup() {
    const name = document.getElementById('setup-name').value;
    const pin = document.getElementById('setup-pin').value;
    const qSelect = document.getElementById('setup-q-select').value;
    const qCustom = document.getElementById('setup-q-custom').value;
    const ans = document.getElementById('setup-ans').value;

    if (!name || !pin || !ans) return showToast('Please fill all fields', 'error');
    if (pin.length < 4) return showToast('PIN must be 4 digits', 'error');

    const finalQ = (qSelect === 'custom') ? qCustom : qSelect;
    if (!finalQ) return showToast('Please enter a question', 'error');

    localStorage.setItem('isSetup', 'true');
    SETTINGS.name = name; localStorage.setItem('storeName', name);
    SETTINGS.pin = pin; localStorage.setItem('storePin', pin);
    SETTINGS.secQ = finalQ; localStorage.setItem('secQ', finalQ);
    SETTINGS.secA = ans; localStorage.setItem('secA', ans);

    document.title = name;
    document.getElementById('store-name-display').innerText = name;
    document.getElementById('welcome-modal').classList.add('hidden');
    showToast('Welcome to ' + name + '!', 'success');
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    let color = type === 'success' ? 'var(--success)' : (type === 'error' ? 'var(--danger)' : 'var(--primary)');
    let icon = type === 'success' ? 'check-circle' : (type === 'error' ? 'alert-octagon' : 'info');

    // XSS FIX: Use DOM creation instead of innerHTML for message
    const iconEl = document.createElement('i');
    iconEl.setAttribute('data-lucide', icon);
    iconEl.style.width = '18px';
    iconEl.style.color = color;

    toast.appendChild(iconEl);
    toast.appendChild(document.createTextNode(' ' + msg));

    container.appendChild(toast);
    lucide.createIcons();
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

let attempts = 0; let lastAdminTime = 0; const LOCKOUT_DURATION = 30000;
let isDark = false;
function toggleTheme() {
    isDark = !isDark;
    document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.getElementById('theme-btn').innerHTML = isDark ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>';
    lucide.createIcons();
    showToast(isDark ? 'Dark Mode Active' : 'Light Mode Active');
}

function checkAdmin(action) {
    if (Date.now() - lastAdminTime < 120000) { lastAdminTime = Date.now(); action(); return; }
    callbackAction = action;
    document.getElementById('inp-pin-attempt').value = '';
    document.getElementById('pin-error').innerText = '';
    document.getElementById('pin-modal').classList.remove('hidden');
    document.getElementById('inp-pin-attempt').focus();
}

function verifyPin() {
    const val = document.getElementById('inp-pin-attempt').value;
    if (val === SETTINGS.pin) {
        attempts = 0; lastAdminTime = Date.now();
        document.getElementById('pin-modal').classList.add('hidden');
        if (callbackAction) callbackAction();
    } else {
        attempts++; document.getElementById('pin-error').innerText = `Wrong PIN! Attempt ${attempts}/3`;
        document.getElementById('inp-pin-attempt').value = '';
        if (attempts >= 3) { document.getElementById('pin-modal').classList.add('hidden'); startLockout(LOCKOUT_DURATION); }
    }
}

function startLockout(duration) {
    const until = Date.now() + duration; localStorage.setItem('lockoutUntil', until);
    const overlay = document.getElementById('lockout-screen'); overlay.classList.remove('hidden');
    const txt = document.getElementById('lock-timer');
    const interval = setInterval(() => {
        const left = Math.ceil((until - Date.now()) / 1000);
        txt.innerText = left;
        if (left <= 0) { clearInterval(interval); overlay.classList.add('hidden'); attempts = 0; }
    }, 1000);
}

function recoverPinFlow(e) {
    if (e) e.preventDefault();
    document.getElementById('pin-modal').classList.add('hidden');
    document.getElementById('rec-question-display').innerText = SETTINGS.secQ;
    document.getElementById('recovery-modal').classList.remove('hidden');
    document.getElementById('inp-rec-attempt').value = '';
}

function verifyRecovery() {
    const ans = document.getElementById('inp-rec-attempt').value;
    if (SETTINGS.secA && ans.toLowerCase() === SETTINGS.secA.toLowerCase()) {
        SETTINGS.pin = '0000'; localStorage.setItem('storePin', '0000');
        showToast('PIN reset to 0000', 'success');
        document.getElementById('recovery-modal').classList.add('hidden');
    } else {
        showToast('Incorrect Answer', 'error');
    }
}
function closePin() { document.getElementById('pin-modal').classList.add('hidden'); }

function openSettings() {
    checkAdmin(() => {
        document.getElementById('inp-store-name').value = SETTINGS.name;
        document.getElementById('inp-ans').value = SETTINGS.secA;
        const select = document.getElementById('inp-q-select');
        const custom = document.getElementById('inp-q-custom');
        let isStandard = false;
        for (let opt of select.options) {
            if (opt.value === SETTINGS.secQ) { select.value = SETTINGS.secQ; isStandard = true; break; }
        }
        if (!isStandard) { select.value = 'custom'; custom.classList.remove('hidden'); custom.value = SETTINGS.secQ; }
        else { custom.classList.add('hidden'); }
        document.getElementById('settings-modal').classList.remove('hidden');
        lucide.createIcons();
    });
}

function saveSettings() {
    const n = document.getElementById('inp-store-name').value;
    const p = document.getElementById('inp-admin-pin').value;
    const qSelect = document.getElementById('inp-q-select').value;
    const qCustom = document.getElementById('inp-q-custom').value;
    const ans = document.getElementById('inp-ans').value;

    const finalQ = (qSelect === 'custom') ? qCustom : qSelect;

    if (n) { SETTINGS.name = n; localStorage.setItem('storeName', n); document.getElementById('store-name-display').innerText = n; document.title = n; }
    if (p) { SETTINGS.pin = p; localStorage.setItem('storePin', p); }
    if (finalQ) { SETTINGS.secQ = finalQ; localStorage.setItem('secQ', finalQ); }
    if (ans) { SETTINGS.secA = ans; localStorage.setItem('secA', ans); }

    document.getElementById('settings-modal').classList.add('hidden');
    lastAdminTime = 0; showToast('Settings Saved. Session Locked.', 'success');
}

function factoryReset() {
    if (confirm('ARE YOU SURE? This will wipe all data and reset the app to new.')) {
        localStorage.clear();
        location.reload();
    }
}

// --- BACKUP & RESTORE ---
function backupData() {
    const data = {
        inventory: INVENTORY,
        settings: {
            storeName: SETTINGS.name,
            storePin: SETTINGS.pin,
            secQ: SETTINGS.secQ,
            secA: SETTINGS.secA,
            theme: localStorage.getItem('theme')
        },
        exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stockop_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup downloaded!', 'success');
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.inventory && Array.isArray(data.inventory)) {
                const cleanInv = data.inventory.map(i => ({
                    id: Number(i.id) || 0,
                    name: i.name.substring(0, 50),
                    sku: (i.sku || '').substring(0, 20),
                    cat: (i.cat || 'Other').substring(0, 30),
                    price: Math.abs(parseFloat(i.price) || 0),
                    cost: Math.abs(parseFloat(i.cost) || 0),
                    count: Math.floor(Math.abs(Number(i.count) || 0)),
                    expiry: i.expiry || ''
                })).filter(i => i.name && i.price >= 0); // Basic validity check

                localStorage.setItem('inventory', JSON.stringify(cleanInv));
            }
            if (data.settings) {
                localStorage.setItem('storeName', (data.settings.storeName || 'StockOp').substring(0, 30));
                localStorage.setItem('storePin', data.settings.storePin || '0000');
                localStorage.setItem('secQ', data.settings.secQ || '');
                localStorage.setItem('secA', data.settings.secA || '');
                if (data.settings.theme) localStorage.setItem('theme', data.settings.theme);
                localStorage.setItem('isSetup', 'true');
            }
            showToast('Backup restored! Reloading...', 'success');
            setTimeout(() => location.reload(), 1500);
        } catch (err) {
            showToast('Invalid backup file', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// --- SECURITY UTILS ---
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function sanitizeCSV(text) {
    if (!text) return '';
    let val = String(text);
    // Prevent formula injection
    if (/^[=+\-@]/.test(val)) {
        val = "'" + val;
    }
    return val.replace(/"/g, '""'); // Escape quotes
}

// --- RENDER ---
let activeCat = 'All'; let callbackAction = null;
function render() {
    const list = document.getElementById('list'); list.innerHTML = '';

    if (INVENTORY.length === 0) {
        const t = TRANSLATIONS[LANG];
        list.innerHTML = `
            <div class="empty-state">
                <i data-lucide="package-open" style="width:48px; height:48px; margin-bottom:12px; opacity:0.5"></i>
                <p>${t.noItems}</p>
                <p style="font-size:12px">${t.tapToAdd}</p>
            </div>
        `;
        lucide.createIcons();
        document.getElementById('tabs').innerHTML = '';
        document.getElementById('total-value').innerText = 'KSh 0';
        return;
    }

    const cats = ['All', ...new Set(INVENTORY.map(i => i.cat))].sort();
    const tabsContainer = document.getElementById('tabs');
    tabsContainer.innerHTML = '';
    cats.forEach(c => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${c === activeCat ? 'active' : ''}`;
        btn.textContent = c;
        btn.onclick = () => setActiveCat(c); // Safe closure
        tabsContainer.appendChild(btn);
    });

    document.getElementById('cat-list').innerHTML = cats.filter(c => c !== 'All').map(c => `<option value="${escapeHtml(c)}">`).join('');

    let total = 0, val = 0;
    const q = document.getElementById('search-input').value.toLowerCase();

    let filtered = INVENTORY.filter(i => activeCat === 'All' || i.cat === activeCat);
    if (q) filtered = filtered.filter(i => (i.name + i.cat + (i.sku || '')).toLowerCase().includes(q));

    // Dynamic sorting
    const sortBy = document.getElementById('sort-select').value;
    filtered.sort((a, b) => {
        switch (sortBy) {
            case 'name': return a.name.localeCompare(b.name);
            case 'count-asc': return a.count - b.count;
            case 'count-desc': return b.count - a.count;
            case 'price-asc': return a.price - b.price;
            case 'price-desc': return b.price - a.price;
            case 'expiry': return (a.expiry || 'z').localeCompare(b.expiry || 'z');
            case 'category': return a.cat.localeCompare(b.cat);
            default: return 0;
        }
    });

    filtered.forEach(i => {
        total += i.count; val += (i.count * (i.price || 0));
        const row = document.createElement('div'); row.className = `item-card`;

        let expBadge = '';
        if (i.expiry) {
            const today = new Date().toISOString().split('T')[0];
            if (i.expiry <= today) expBadge = `<span class="badge badge-exp">EXPIRED</span>`;
        }

        // Low Stock Alert
        let lowBadge = '';
        if (i.count > 0 && i.count < 10) lowBadge = `<span class="badge badge-low">LOW</span>`;
        if (i.count === 0) lowBadge = `<span class="badge badge-exp">OUT</span>`;

        // Profit Margin
        let profitHtml = '';
        if (i.cost && i.price > i.cost) {
            const margin = Math.round(((i.price - i.cost) / i.price) * 100);
            profitHtml = `<span class="badge badge-profit">${margin}% margin</span>`;
        }

        let skuHtml = i.sku ? `<span class="sku">Code: ${escapeHtml(i.sku)}</span>` : '';

        // Use data attributes for delegation
        row.innerHTML = `
            <div class="info" data-action="edit" data-id="${i.id}">
                <span class="name">${escapeHtml(i.name)} ${expBadge} ${lowBadge}</span>
                ${skuHtml}
                <div class="meta">
                    <span class="badge">${escapeHtml(i.cat)}</span>
                    <span class="price-tag">KSh ${i.price}</span>
                    ${profitHtml}
                </div>
            </div>
            <div class="stepper">
                <button class="step-btn minus" data-action="dec" data-id="${i.id}">
                    <i data-lucide="minus"></i>
                </button>
                <div class="count-val" data-action="edit" data-id="${i.id}">
                    ${i.count}
                </div>
                <button class="step-btn plus" data-action="inc" data-id="${i.id}">
                    <i data-lucide="plus"></i>
                </button>
            </div>`;

        list.appendChild(row);
    });
    document.getElementById('total-value').innerText = 'KSh ' + val.toLocaleString();
    document.getElementById('rep-count').innerText = total; document.getElementById('rep-value').innerText = 'KSh ' + val.toLocaleString();
    lucide.createIcons();
}
window.setActiveCat = c => { activeCat = c; render(); };
window.mod = (id, d) => {
    const i = INVENTORY.find(x => x.id == id);
    if (i && i.count + d >= 0) {
        i.count += d;
        localStorage.setItem('inventory', JSON.stringify(INVENTORY));
        render();
    }
};

window.openAddModal = () => openModal();
window.openModal = (id) => {
    const m = document.getElementById('modal'); m.classList.remove('hidden');
    const del = document.getElementById('btn-delete');
    if (id) {
        const i = INVENTORY.find(x => x.id == id);
        document.getElementById('edit-id').value = i.id;
        document.getElementById('inp-name').value = i.name;
        document.getElementById('inp-sku').value = i.sku || '';
        document.getElementById('inp-cat').value = i.cat;
        document.getElementById('inp-price').value = i.price;
        document.getElementById('inp-cost').value = i.cost || '';
        document.getElementById('inp-count').value = i.count;
        document.getElementById('inp-expiry').value = i.expiry;
        del.classList.remove('hidden');
    } else {
        document.getElementById('edit-id').value = '';
        document.getElementById('inp-name').value = '';
        document.getElementById('inp-sku').value = '';
        document.getElementById('inp-cat').value = '';
        document.getElementById('inp-price').value = '';
        document.getElementById('inp-cost').value = '';
        document.getElementById('inp-count').value = 0;
        document.getElementById('inp-expiry').value = '';
        del.classList.add('hidden');
    }
};
window.closeModal = () => document.getElementById('modal').classList.add('hidden');
window.saveItem = () => {
    const id = document.getElementById('edit-id').value;
    const item = {
        id: id ? parseInt(id) : (INVENTORY.length ? Math.max(...INVENTORY.map(i => i.id)) + 1 : 1),
        name: document.getElementById('inp-name').value,
        sku: document.getElementById('inp-sku').value || '',
        cat: document.getElementById('inp-cat').value || 'Other',
        price: parseFloat(document.getElementById('inp-price').value) || 0,
        cost: parseFloat(document.getElementById('inp-cost').value) || 0,
        count: parseInt(document.getElementById('inp-count').value) || 0,
        expiry: document.getElementById('inp-expiry').value
    };
    const isEdit = !!id;
    if (isEdit) {
        INVENTORY[INVENTORY.findIndex(i => i.id == id)] = item;
        logHistory('edited', item.name, `Count: ${item.count}, Price: KSh ${item.price}`);
    } else {
        INVENTORY.unshift(item);
        logHistory('added', item.name, `Count: ${item.count}, Price: KSh ${item.price}`);
    }
    localStorage.setItem('inventory', JSON.stringify(INVENTORY));
    showToast('Item Saved', 'success');
    closeModal(); render();
};
window.deleteItem = () => {
    if (confirm('Delete?')) {
        const id = document.getElementById('edit-id').value;
        const item = INVENTORY.find(i => i.id == id);
        logHistory('deleted', item ? item.name : 'Unknown item');
        INVENTORY = INVENTORY.filter(i => i.id != id);
        localStorage.setItem('inventory', JSON.stringify(INVENTORY));
        showToast('Item Deleted', 'error'); closeModal(); render();
    }
};
window.toggleShift = () => {
    if (!SHIFT_DATA.active) {
        SHIFT_DATA.active = true;
        SHIFT_DATA.startTime = new Date().toISOString();
        SHIFT_DATA.actions = [];
        localStorage.setItem('shiftData', JSON.stringify(SHIFT_DATA));
        showToast('Shift Started', 'success');
        renderShiftUI();
    } else {
        document.getElementById('report-modal').classList.remove('hidden');
        lucide.createIcons();
    }
};

function renderShiftUI() {
    const btn = document.getElementById('shift-btn');
    const status = document.getElementById('shift-status');
    const finalBtn = document.getElementById('btn-finish-shift-final');
    const t = TRANSLATIONS[LANG];

    if (SHIFT_DATA.active) {
        btn.innerHTML = `<i data-lucide="check-circle" style="width:16px"></i> <span data-t="finishShift">${t.finishShift}</span>`;
        btn.className = 'btn btn-save';
        status.style.display = 'block';
        if (finalBtn) finalBtn.style.display = 'flex';
        updateShiftTimer();
    } else {
        btn.innerHTML = `<i data-lucide="play" style="width:16px"></i> <span data-t="startShift">${t.startShift}</span>`;
        btn.className = 'btn btn-save';
        status.style.display = 'none';
        if (finalBtn) finalBtn.style.display = 'none';
    }
    lucide.createIcons();
}

let shiftInterval = null;
function updateShiftTimer() {
    if (shiftInterval) clearInterval(shiftInterval);
    if (!SHIFT_DATA.active) return;

    const timerEl = document.getElementById('shift-timer');
    shiftInterval = setInterval(() => {
        const now = new Date();
        const start = new Date(SHIFT_DATA.startTime);
        const diff = new Date(now - start);
        const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
        const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
        timerEl.innerText = `${h}:${m}:${s}`;
    }, 1000);
}

window.confirmEndShift = () => {
    if (confirm(TRANSLATIONS[LANG].confirmEndShift)) {
        // Download final report
        downloadPDF(true); // Flag to indicate shift report

        SHIFT_DATA.active = false;
        SHIFT_DATA.startTime = null;
        SHIFT_DATA.actions = [];
        localStorage.setItem('shiftData', JSON.stringify(SHIFT_DATA));

        document.getElementById('report-modal').classList.add('hidden');
        showToast('Shift Ended & Report Downloaded', 'success');
        renderShiftUI();
    }
};

window.endShift = () => { document.getElementById('report-modal').classList.remove('hidden'); lucide.createIcons(); };

window.toggleSearch = () => {
    const sBar = document.getElementById('search-bar');
    const sInp = document.getElementById('search-input');
    if (sBar.classList.contains('hidden')) {
        sBar.classList.remove('hidden');
        sInp.focus();
    } else {
        sBar.classList.add('hidden');
        sInp.value = '';
        render();
    }
};
window.clearSearch = () => {
    const sInp = document.getElementById('search-input');
    sInp.value = '';
    sInp.focus();
    render();
};
window.startVoice = () => {
    const sInp = document.getElementById('search-input');
    if (!('webkitSpeechRecognition' in window)) return showToast('Voice not supported', 'error');
    const r = new webkitSpeechRecognition();
    r.lang = 'en-US';
    r.start();
    r.onresult = e => {
        sInp.value = e.results[0][0].transcript;
        render();
    }
};

// --- REPORTS ---
window.downloadPDF = async (isShiftReport = false) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const t = TRANSLATIONS[LANG];

    doc.setFontSize(18);
    doc.text(SETTINGS.name + (isShiftReport ? ' - Shift Report' : ' - Stock Report'), 14, 20);

    doc.setFontSize(10);
    doc.text('Date: ' + new Date().toLocaleString(), 14, 28);

    if (isShiftReport && SHIFT_DATA.startTime) {
        doc.text('Shift Started: ' + new Date(SHIFT_DATA.startTime).toLocaleString(), 14, 34);
        doc.text('Shift Ended: ' + new Date().toLocaleString(), 14, 40);

        // Shift Activity Table
        doc.setFontSize(12);
        doc.text('Shift Activity Summary', 14, 50);
        doc.autoTable({
            head: [['Time', 'Action', 'Item', 'Details']],
            body: SHIFT_DATA.actions.map(a => [new Date(a.time).toLocaleTimeString(), a.action, a.item, a.details]),
            startY: 55
        });

        doc.addPage();
        doc.setFontSize(12);
        doc.text('Final Inventory State', 14, 20);
        doc.autoTable({ head: [['Item', 'SKU', 'Category', 'Count', 'Price', 'Value']], body: INVENTORY.map(i => [i.name, i.sku || '-', i.cat, i.count, 'KSh ' + i.price, 'KSh ' + (i.count * i.price)]), startY: 25 });
    } else {
        doc.autoTable({ head: [['Item', 'SKU', 'Category', 'Count', 'Price', 'Value']], body: INVENTORY.map(i => [i.name, i.sku || '-', i.cat, i.count, 'KSh ' + i.price, 'KSh ' + (i.count * i.price)]), startY: 35 });
    }

    doc.save(isShiftReport ? `shift_report_${new Date().getTime()}.pdf` : 'stockop_report.pdf');
    showToast('PDF Downloaded', 'success');
};

window.downloadCSV = () => {
    const headers = ['Name', 'SKU', 'Category', 'Price', 'Count', 'Value', 'Expiry'];
    const rows = INVENTORY.map(i => [
        `"${sanitizeCSV(i.name)}"`,
        `"${sanitizeCSV(i.sku || '')}"`,
        `"${sanitizeCSV(i.cat)}"`,
        i.price,
        i.count,
        i.count * i.price,
        sanitizeCSV(i.expiry || '')
    ]);
    let csv = headers.join(',') + '\n';
    rows.forEach(r => csv += r.join(',') + '\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stockop_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV Downloaded', 'success');
};

// --- DASHBOARD & NOTIFICATIONS ---
let isDashboard = false;
function toggleView() {
    isDashboard = !isDashboard;
    const list = document.getElementById('list');
    const dash = document.getElementById('dashboard-view');
    const fab = document.querySelector('.fab');
    const sort = document.getElementById('sort-select').parentElement; // Sort container
    const tabs = document.getElementById('tabs');
    const btnIcon = document.getElementById('view-toggle-btn').querySelector('i');

    if (isDashboard) {
        list.classList.add('hidden');
        dash.classList.remove('hidden');
        fab.classList.add('hidden');
        sort.classList.add('hidden');
        tabs.classList.add('hidden');
        btnIcon.setAttribute('data-lucide', 'list');
        renderDashboard();
    } else {
        list.classList.remove('hidden');
        dash.classList.add('hidden');
        fab.classList.remove('hidden');
        sort.classList.remove('hidden');
        tabs.classList.remove('hidden');
        btnIcon.setAttribute('data-lucide', 'layout-dashboard');
        render();
    }
    lucide.createIcons();
}

function renderDashboard() {
    if (!isDashboard) return;

    // Aggregates
    const totalVal = INVENTORY.reduce((sum, i) => sum + (i.count * i.price), 0);
    const totalItems = INVENTORY.reduce((sum, i) => sum + i.count, 0);
    const lowStock = INVENTORY.filter(i => i.count < 10).length;

    document.getElementById('dash-total-val').innerText = 'KSh ' + totalVal.toLocaleString();
    document.getElementById('dash-total-items').innerText = totalItems;
    document.getElementById('dash-low-stock').innerText = lowStock;

    // Chart Data
    const cats = {};
    INVENTORY.forEach(i => {
        if (!cats[i.cat]) cats[i.cat] = 0;
        cats[i.cat] += (i.count * i.price);
    });

    // Sort by value desc
    const sortedCats = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 5); // Top 5
    const maxVal = sortedCats.length ? sortedCats[0][1] : 1;

    const chartHtml = sortedCats.map(([cat, val]) => {
        const pct = (val / maxVal) * 100;
        return `
            <div class="chart-bar">
                <div class="chart-label"><span>${escapeHtml(cat)}</span><span>KSh ${val.toLocaleString()}</span></div>
                <div class="bar-bg"><div class="bar-fill" style="width:${pct}%"></div></div>
            </div>
        `;
    }).join('');

    document.getElementById('dash-chart').innerHTML = chartHtml || '<p style="text-align:center;color:var(--text-muted);font-size:12px">No data</p>';

    // Check Notifications
    checkNotifications(lowStock);
}

function requestNotifPermission() {
    if (!('Notification' in window)) return showToast('Not supported', 'error');
    Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
            showToast('Alerts Enabled', 'success');
            document.getElementById('enable-notifs-btn').classList.add('hidden');
            renderDashboard(); // Trigger check
        } else {
            showToast('Permission Denied', 'error');
        }
    });
}

function checkNotifications(lowCount) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (lowCount === 0) return;

    const lastNotif = parseInt(localStorage.getItem('lastNotifTime')) || 0;
    const now = Date.now();
    // Debounce: Only notify once per hour
    if (now - lastNotif > 3600000) {
        new Notification('Stock Alert', {
            body: `${lowCount} items are running low on stock!`,
            icon: 'https://unpkg.com/lucide-static@0.419.0/icons/package-alert.svg'
        });
        localStorage.setItem('lastNotifTime', now);
    }
}

// --- STOCK HISTORY ---
function logHistory(action, itemName, details = '') {
    const entry = {
        time: new Date().toISOString(),
        action: action,
        item: itemName,
        details: details
    };
    HISTORY.unshift(entry);
    if (HISTORY.length > 100) HISTORY = HISTORY.slice(0, 100); // Keep last 100
    localStorage.setItem('stockHistory', JSON.stringify(HISTORY));

    if (SHIFT_DATA.active) {
        SHIFT_DATA.actions.push(entry);
        localStorage.setItem('shiftData', JSON.stringify(SHIFT_DATA));
    }
}

window.showHistory = () => {
    document.getElementById('settings-modal').classList.add('hidden');
    const list = document.getElementById('history-list');
    if (HISTORY.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted); text-align:center">No history recorded yet.</p>';
    } else {
        list.innerHTML = HISTORY.map(h => {
            const date = new Date(h.time).toLocaleString();
            const icon = h.action === 'added' ? 'plus-circle' : (h.action === 'deleted' ? 'trash-2' : 'edit-3');
            const color = h.action === 'added' ? 'var(--success)' : (h.action === 'deleted' ? 'var(--danger)' : 'var(--primary)');
            return `<div style="padding:8px 0; border-bottom:1px solid var(--border-color); display:flex; align-items:flex-start; gap:8px">
                        <i data-lucide="${icon}" style="width:16px; flex-shrink:0; color:${color}"></i>
                        <div><strong>${escapeHtml(h.item)}</strong> <span style="color:var(--text-muted)">${h.action}</span>
                        ${h.details ? `<div style="font-size:11px; color:var(--text-muted)">${escapeHtml(h.details)}</div>` : ''}
                        <div style="font-size:10px; color:var(--text-muted)">${date}</div></div>
                    </div>`;
        }).join('');
    }
    document.getElementById('history-modal').classList.remove('hidden');
    lucide.createIcons();
};

window.clearHistory = () => {
    if (confirm('Clear all history?')) {
        HISTORY = [];
        localStorage.removeItem('stockHistory');
        showToast('History cleared', 'success');
        document.getElementById('history-modal').classList.add('hidden');
    }
};

// --- LANGUAGE ---
const TRANSLATIONS = {
    en: {
        search: 'Search item...',
        totalValue: 'TOTAL VALUE',
        finishShift: 'Finish Shift',
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        storeSettings: 'Store Settings',
        storeInfo: 'Store Info',
        storeName: 'Store Name',
        adminPin: 'Change Admin PIN',
        security: 'Security',
        securityQ: 'Update Security Question',
        answer: 'Update Answer',
        dataManagement: 'Data Management',
        exportBackup: 'Export Backup',
        importBackup: 'Import Backup',
        preferences: 'Preferences',
        language: 'Language',
        viewHistory: 'View Stock History',
        dangerZone: 'Danger Zone',
        factoryReset: 'Factory Reset App',
        saveSettings: 'Save Settings',
        adminLocked: 'Admin Locked',
        enterPin: 'Enter PIN to Unlock',
        unlock: 'Unlock',
        forgotPin: 'Forgot PIN?',
        itemDetails: 'Item Details',
        itemName: 'Item Name',
        itemCode: 'Item Code / SKU',
        category: 'Category',
        sellingPrice: 'Selling Price',
        costPrice: 'Cost Price',
        count: 'Count',
        expiry: 'Expiry',
        shiftComplete: 'Shift Complete',
        items: 'Items',
        value: 'Value',
        downloadPdf: 'Download PDF',
        downloadCsv: 'Download CSV',
        close: 'Close',
        stockHistory: 'Stock History',
        clearHistory: 'Clear History',
        noHistory: 'No history recorded yet.',
        langChanged: 'Language changed to English',
        sortName: 'Sort: Name',
        sortCountUp: 'Sort: Count ↑',
        sortCountDown: 'Sort: Count ↓',
        sortPriceUp: 'Sort: Price ↑',
        sortPriceDown: 'Sort: Price ↓',
        sortExpiry: 'Sort: Expiry',
        sortCategory: 'Sort: Category',
        noItems: 'No items found.',
        tapToAdd: 'Tap the + button to add stock.',
        startShift: 'Start Shift',
        shiftActive: 'Shift Active',
        confirmEndShift: 'Are you sure you want to end your shift? This will generate a final report and reset shift counters.',
        shiftDuration: 'Shift Duration'
    },
    sw: {
        search: 'Tafuta bidhaa...',
        totalValue: 'THAMANI JUMLA',
        finishShift: 'Maliza Zamu',
        save: 'Hifadhi',
        cancel: 'Ghairi',
        delete: 'Futa',
        storeSettings: 'Mipangilio ya Duka',
        storeInfo: 'Maelezo ya Duka',
        storeName: 'Jina la Duka',
        adminPin: 'Badilisha PIN',
        security: 'Usalama',
        securityQ: 'Sasisha Swali la Usalama',
        answer: 'Sasisha Jibu',
        dataManagement: 'Usimamizi wa Data',
        exportBackup: 'Hifadhi Nakala',
        importBackup: 'Rejesha Nakala',
        preferences: 'Mapendeleo',
        language: 'Lugha',
        viewHistory: 'Tazama Historia',
        dangerZone: 'Eneo la Hatari',
        factoryReset: 'Futa Programu',
        saveSettings: 'Hifadhi Mipangilio',
        adminLocked: 'Admin Imefungwa',
        enterPin: 'Ingiza PIN kufungua',
        unlock: 'Fungua',
        forgotPin: 'Umesahau PIN?',
        itemDetails: 'Maelezo ya Bidhaa',
        itemName: 'Jina la Bidhaa',
        itemCode: 'Nambari ya Bidhaa',
        category: 'Kategoria',
        sellingPrice: 'Bei ya Kuuza',
        costPrice: 'Bei ya Kununua',
        count: 'Idadi',
        expiry: 'Tarehe ya Kuisha',
        shiftComplete: 'Zamu Imekamilika',
        items: 'Bidhaa',
        value: 'Thamani',
        downloadPdf: 'Pakua PDF',
        downloadCsv: 'Pakua CSV',
        close: 'Funga',
        stockHistory: 'Historia ya Bidhaa',
        clearHistory: 'Futa Historia',
        noHistory: 'Hakuna historia bado.',
        langChanged: 'Lugha imebadilika kuwa Kiswahili',
        sortName: 'Panga: Jina',
        sortCountUp: 'Panga: Idadi ↑',
        sortCountDown: 'Panga: Idadi ↓',
        sortPriceUp: 'Panga: Bei ↑',
        sortPriceDown: 'Panga: Bei ↓',
        sortExpiry: 'Panga: Muda',
        sortCategory: 'Panga: Kategoria',
        noItems: 'Hakuna bidhaa.',
        tapToAdd: 'Bonyeza + kuongeza bidhaa.',
        startShift: 'Anza Zamu',
        shiftActive: 'Zamu Inaendelea',
        confirmEndShift: 'Je, una uhakika unataka kumaliza zamu yako? Hii itatengeneza ripoti ya mwisho na kufuta kumbukumbu za zamu hii.',
        shiftDuration: 'Muda wa Zamu'
    }
};

function applyTranslations(lang) {
    const t = TRANSLATIONS[lang];

    // Translate elements with data-t attribute
    document.querySelectorAll('[data-t]').forEach(el => {
        const key = el.getAttribute('data-t');
        if (t[key]) el.innerText = t[key];
    });

    // Translate placeholders with data-t-placeholder attribute
    document.querySelectorAll('[data-t-placeholder]').forEach(el => {
        const key = el.getAttribute('data-t-placeholder');
        if (t[key]) el.placeholder = t[key];
    });

    // Specific UI elements that need extra care
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.options[0].text = t.sortName;
        sortSelect.options[1].text = t.sortCountUp;
        sortSelect.options[2].text = t.sortCountDown;
        sortSelect.options[3].text = t.sortPriceUp;
        sortSelect.options[4].text = t.sortPriceDown;
        sortSelect.options[5].text = t.sortExpiry;
        sortSelect.options[6].text = t.sortCategory;
    }

    // Re-render for list-based translations (empty state)
    render();
    // Refresh icons
    lucide.createIcons();
}

window.setLang = (lang) => {
    LANG = lang;
    localStorage.setItem('lang', lang);
    applyTranslations(lang);
    showToast(TRANSLATIONS[lang].langChanged, 'success');
};
