// --- DATA ---
let INVENTORY = []; // Loaded from Firebase
let SUPPLIERS = [];
let POS_CART = JSON.parse(localStorage.getItem('posCart')) || [];
let currentView = localStorage.getItem('currentView') || 'list';
let HISTORY = JSON.parse(localStorage.getItem('stockHistory')) || [];
let LANG = localStorage.getItem('lang') || 'en';

let SETTINGS = {
    name: localStorage.getItem('storeName') || 'StockOp'
};

let SHIFT_DATA = JSON.parse(localStorage.getItem('shiftData')) || {
    active: false,
    startTime: null,
    lastActivity: null,
    actions: []
};

// Check if URL contains ?reset=true or ?clear=1
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('reset') === 'true') {
    localStorage.clear();
    window.location.href = window.location.pathname; // reloads clean without query
}

// Add a button: "Clear Local Data / Reset App"
function resetApp() {
    if (confirm("Are you sure? This will wipe all data and reset the app.")) {
        localStorage.clear();
        sessionStorage.clear();
        location.reload();
    }
}

// --- INIT ---
window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'dark') toggleTheme();

    /* Security Warning Console */
    if (window.console) {
        console.log('%cSTOP!', 'color: red; font-size: 50px; font-weight: bold; text-shadow: 2px 2px black;');
        console.log('%cThis is a browser feature intended for developers. Use of this console may allow attackers to steal your information.', 'font-size: 20px;');
    }

    if (location.protocol.startsWith('http')) {
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
    }

    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });

    // --- Firebase Auth State Listener ---
    // This is the master controller. The app only loads data once the user is logged in
    // AND their store context is loaded.
    onAuthStateChanged((user) => {
        if (user) {
            // User is signed in — load their store context first
            loadUserStore((storeInfo) => {
                if (!storeInfo) {
                    if (window.isRegistering) return; // Wait for registration to complete

                    // Edge case: legacy account without a store. Log them out so they aren't stuck!
                    logoutUser().catch(console.error);
                    return;
                }

                // Store context loaded — now show the app
                document.getElementById('auth-screen').style.display = 'none';
                hideLoader();

                // Apply role-based UI visibility
                applyRoleVisibility(currentUserRole);

                // Load store settings from cloud
                loadStoreSettings((settings) => {
                    if (settings && settings.name) {
                        SETTINGS.name = settings.name;
                        localStorage.setItem('storeName', settings.name);
                        document.title = settings.name;
                        document.getElementById('store-name-display').innerText = settings.name;
                    }
                    if (settings && settings.storeCode && currentUserRole === 'owner') {
                        document.getElementById('display-store-code').textContent = settings.storeCode;
                    }
                });

                document.title = SETTINGS.name;
                document.getElementById('store-name-display').innerText = SETTINGS.name;

                renderShiftUI();

                // Start listening for real-time inventory updates
                listenToInventory((items) => {
                    INVENTORY = items;
                    if (currentView === 'list') render();
                    if (currentView === 'dashboard') renderDashboard();
                    if (currentView === 'pos') renderPOS();
                });

                // Listen to suppliers
                listenToSuppliers((sups) => {
                    SUPPLIERS = sups;
                    updateSupplierDropdown();
                    if (currentView === 'suppliers') renderSuppliers();
                });

                // Load team members (owner only)
                if (currentUserRole === 'owner') {
                    getStoreMembers((members) => {
                        renderTeamMembers(members);
                    });
                }

                lucide.createIcons();

                // Apply saved language on load
                if (LANG) {
                    document.getElementById('inp-lang').value = LANG;
                    setTimeout(() => applyTranslations(LANG), 100);
                }
                
                // Apply saved view
                setTimeout(() => switchView(currentView), 150);

                setupEventListeners(deferredPrompt);
            });
        } else {
            // User is signed out — show auth screen
            document.getElementById('auth-screen').style.display = 'flex';
            lucide.createIcons();
            hideLoader();
        }
    });

    // --- Auth Screen Event Listeners ---
    document.getElementById('show-register').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('register-form').classList.remove('hidden');
        document.getElementById('auth-error').textContent = '';
    });
    document.getElementById('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('register-form').classList.add('hidden');
        document.getElementById('login-form').classList.remove('hidden');
        document.getElementById('auth-error').textContent = '';
    });
    
    document.getElementById('btn-back-to-login').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('register-form').classList.add('hidden');
        document.getElementById('login-form').classList.remove('hidden');
        document.getElementById('auth-error').textContent = '';
    });

    // Toggle "Join a Store" section on registration
    document.getElementById('reg-join-toggle').addEventListener('change', (e) => {
        const joinSection = document.getElementById('reg-join-section');
        const storeNameGroup = document.getElementById('reg-store-name-group');
        if (e.target.checked) {
            joinSection.classList.remove('hidden');
            storeNameGroup.classList.add('hidden');
        } else {
            joinSection.classList.add('hidden');
            storeNameGroup.classList.remove('hidden');
        }
    });

    document.getElementById('btn-login').addEventListener('click', () => {
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        if (!email || !pass) { 
            document.getElementById('auth-error').style.color = 'var(--danger)';
            document.getElementById('auth-error').textContent = 'Please fill all fields'; 
            return; 
        }
        document.getElementById('btn-login').disabled = true;
        document.getElementById('btn-login').textContent = 'Signing in...';
        loginUser(email, pass).catch(err => {
            document.getElementById('auth-error').style.color = 'var(--danger)';
            document.getElementById('auth-error').textContent = getFriendlyErrorMessage(err);
            document.getElementById('btn-login').disabled = false;
            document.getElementById('btn-login').textContent = 'Sign In';
        });
    });

    document.getElementById('forgot-pwd').addEventListener('click', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        if (!email) {
            document.getElementById('auth-error').style.color = 'var(--danger)';
            document.getElementById('auth-error').textContent = 'Please enter your email above to reset your password.';
            return;
        }
        document.getElementById('auth-error').style.color = 'var(--text-muted)';
        document.getElementById('auth-error').textContent = 'Sending reset link...';
        resetPassword(email).then(() => {
            document.getElementById('auth-error').style.color = 'var(--success)';
            document.getElementById('auth-error').textContent = 'Password reset link sent to your email!';
        }).catch(err => {
            document.getElementById('auth-error').style.color = 'var(--danger)';
            document.getElementById('auth-error').textContent = getFriendlyErrorMessage(err);
        });
    });

    document.getElementById('btn-register').addEventListener('click', () => {
        const isJoining = document.getElementById('reg-join-toggle').checked;
        const storeName = document.getElementById('reg-store-name').value;
        const storeCode = document.getElementById('reg-store-code').value;
        const email = document.getElementById('reg-email').value;
        const pass = document.getElementById('reg-password').value;

        if (!email || !pass) { document.getElementById('auth-error').textContent = 'Please fill all fields'; return; }
        if (!isJoining && !storeName) { document.getElementById('auth-error').textContent = 'Please enter a store name'; return; }
        if (isJoining && !storeCode) { document.getElementById('auth-error').textContent = 'Please enter the store code'; return; }
        if (pass.length < 6) { document.getElementById('auth-error').textContent = 'Password must be at least 6 characters'; return; }

        document.getElementById('btn-register').disabled = true;
        document.getElementById('btn-register').textContent = 'Creating account...';

        window.isRegistering = true; // Prevent the auth listener from logging them out instantly

        registerUser(email, pass).then(() => {
            if (isJoining) {
                // Employee joining an existing store
                return joinStoreByCode(storeCode, email).then((result) => {
                    SETTINGS.name = result.storeName;
                    localStorage.setItem('storeName', result.storeName);
                });
            } else {
                // Owner creating a new store
                return createStore(storeName, email).then(() => {
                    SETTINGS.name = storeName;
                    localStorage.setItem('storeName', storeName);
                });
            }
        }).then(() => {
            // Once the store is successfully created/joined, reload the page to cleanly load the app
            window.location.reload();
        }).catch(err => {
            window.isRegistering = false;
            document.getElementById('auth-error').textContent = getFriendlyErrorMessage(err);
            document.getElementById('btn-register').disabled = false;
            document.getElementById('btn-register').textContent = 'Create Account';
        });
    });
});

function hideLoader() {
    const loader = document.getElementById('global-loader');
    if (loader && loader.style.display !== 'none') {
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 400);
    }
}

// Helper to convert ugly Firebase JSON errors into clean text
function getFriendlyErrorMessage(err) {
    if (!err) return "An unknown error occurred.";
    let msg = err.message || err.toString();
    
    // Try to parse if it's a raw JSON dump from the REST API
    if (msg.startsWith('{')) {
        try {
            const parsed = JSON.parse(msg);
            if (parsed.error && parsed.error.message) {
                msg = parsed.error.message;
            }
        } catch(e) {}
    }
    
    const code = err.code || msg;
    
    if (code.includes('INVALID_LOGIN_CREDENTIALS') || code.includes('auth/invalid-login-credentials') || code.includes('auth/wrong-password') || code.includes('auth/user-not-found')) {
        return "Invalid email or password.";
    }
    if (code.includes('auth/email-already-in-use')) return "This email is already registered. Please sign in.";
    if (code.includes('auth/weak-password')) return "Password should be at least 6 characters.";
    if (code.includes('auth/invalid-email')) return "Please enter a valid email address.";
    if (code.includes('auth/network-request-failed')) return "Network error. Please check your internet connection.";
    if (code.includes('auth/too-many-requests')) return "Too many failed attempts. Please try again later.";
    
    // Remove the "Firebase: " prefix if it exists
    if (msg.startsWith("Firebase: ")) {
        msg = msg.replace("Firebase: ", "").split(" (auth")[0];
    }
    
    // Fallback if it's still a massive JSON string or object
    if (msg.length > 100) return "An error occurred. Please check your details and try again.";
    
    return msg;
}

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

    // Bottom Nav Actions
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = e.currentTarget.dataset.view;
            switchView(view);
        });
    });

    const notifBtn = document.getElementById('enable-notifs-btn');
    notifBtn.addEventListener('click', requestNotifPermission);
    if ('Notification' in window && Notification.permission === 'granted') {
        notifBtn.classList.add('hidden');
    }

    // Search Bar
    document.getElementById('search-bar').querySelector('.btn-icon').addEventListener('click', toggleSearch); // Back btn
    document.getElementById('search-input').addEventListener('input', render);
    document.querySelector('.clear-search').addEventListener('click', clearSearch);
    document.querySelector('.mic-btn').addEventListener('click', startVoice);

    // Sort
    document.getElementById('sort-select').addEventListener('change', render);

    // Shift Bar - Manual button removed.
    // document.getElementById('shift-btn').addEventListener('click', toggleShift);

    // FAB — no PIN check needed, user is already authenticated
    document.querySelector('.fab').addEventListener('click', () => openAddModal());

    // List Delegation
    document.getElementById('list').addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const id = parseInt(target.dataset.id);

        if (action === 'edit') {
            openModal(id);
        } else if (action === 'dec') {
            mod(id, -1);
        } else if (action === 'inc') {
            mod(id, 1);
        }
    });

    // Modals - Setup (simplified, no PIN)
    document.getElementById('welcome-modal').querySelector('.btn-save').addEventListener('click', completeSetup);

    // Modals - Settings
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

    // Paste from Excel
    document.getElementById('btn-paste-data').addEventListener('click', () => {
        document.getElementById('paste-modal').classList.remove('hidden');
        document.getElementById('paste-data-input').value = '';
    });
    document.getElementById('paste-cancel').addEventListener('click', () => document.getElementById('paste-modal').classList.add('hidden'));
    document.getElementById('paste-import').addEventListener('click', importPastedData);

    // Logout
    document.getElementById('btn-logout').addEventListener('click', async () => {
        if (confirm('Sign out of StockOp?')) {
            if (SHIFT_DATA.active) {
                await finalizeShift(true).promise; // Wait for auto end and save shift
            }
            logoutUser();
            location.reload();
        }
    });

    const historyBtn = Array.from(settingsModal.querySelectorAll('.btn-outline')).find(b => b.textContent.includes('Stock History'));
    if (historyBtn) historyBtn.addEventListener('click', showHistory);
    
    document.getElementById('btn-shift-reports').addEventListener('click', openShiftReports);
    document.getElementById('btn-close-shift-reports').addEventListener('click', () => document.getElementById('shift-reports-modal').classList.add('hidden'));


    // Modals - Item
    document.getElementById('btn-delete').addEventListener('click', deleteItem);
    document.getElementById('modal').querySelector('.btn-cancel').addEventListener('click', closeModal);
    document.getElementById('modal').querySelector('.btn-save').addEventListener('click', saveItem);

    // Modals - Report
    document.getElementById('btn-export-pdf').addEventListener('click', () => downloadPDF(false));
    document.getElementById('btn-export-csv').addEventListener('click', downloadCSV);
    document.getElementById('btn-end-shift-inline').addEventListener('click', () => {
        document.getElementById('report-modal').classList.remove('hidden');
        lucide.createIcons();
    });
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

    if (!name) return showToast('Please enter a store name', 'error');

    SETTINGS.name = name;
    localStorage.setItem('storeName', name);
    saveStoreSettings({ name: name });

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

// checkAdmin is now a pass-through since we use Firebase Auth
function checkAdmin(action) {
    action();
}

function toggleTheme() {
    isDark = !isDark;
    document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.getElementById('theme-btn').innerHTML = isDark ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>';
    lucide.createIcons();
    showToast(isDark ? 'Dark Mode Active' : 'Light Mode Active');
}


let isDark = false;

function openSettings() {
    document.getElementById('inp-store-name').value = SETTINGS.name;
    document.getElementById('settings-modal').classList.remove('hidden');
    lucide.createIcons();
}

function saveSettings() {
    const n = document.getElementById('inp-store-name').value;

    if (n) {
        SETTINGS.name = n;
        localStorage.setItem('storeName', n);
        document.getElementById('store-name-display').innerText = n;
        document.title = n;
        saveStoreSettings({ name: n });
    }

    document.getElementById('settings-modal').classList.add('hidden');
    showToast('Settings Saved', 'success');
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

function importPastedData() {
    try {
        const text = document.getElementById('paste-data-input').value.trim();
        if (!text) { showToast('Nothing to import', 'error'); return; }

        const rows = text.split('\n');
        let addedCount = 0;
        let nextId = INVENTORY.length ? Math.max(...INVENTORY.map(i => i.id)) + 1 : 1;

        for (let i = 0; i < rows.length; i++) {
            if (!rows[i].trim()) continue;

            // Split by tab (from Excel/Sheets copy-paste) or comma (fallback)
            const cols = rows[i].includes('\t')
                ? rows[i].split('\t').map(c => c.trim())
                : rows[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/["\r]/g, '').trim());

            const item = {
                id: nextId++,
                name: cols[0] || 'Unknown',
                sku: cols[1] || '',
                cat: cols[2] || 'Other',
                price: parseFloat(cols[3]) || 0,
                count: parseInt(cols[4]) || 0,
                cost: parseFloat(cols[5]) || 0,
                expiry: cols[6] || ''
            };

            if (item.name !== 'Unknown') {
                saveItemToDB(item);
                addedCount++;
            }
        }

        showToast(`${addedCount} Items Imported to Cloud!`, 'success');
        document.getElementById('paste-modal').classList.add('hidden');
        document.getElementById('settings-modal').classList.add('hidden');
    } catch (err) {
        console.error(err);
        showToast('Error parsing data', 'error');
    }
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
    const list = document.getElementById('list');
    list.innerHTML = '';
    let displayedCount = 0;

    if (INVENTORY.length === 0 && document.getElementById('search-input').value === '') {
        list.innerHTML = `
            <div class="empty-state" style="padding: 60px 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0; animation: fadeIn 0.4s ease forwards;">
                <div style="width: 80px; height: 80px; background: var(--bg-input); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 24px; color: var(--text-muted);">
                    <i data-lucide="inbox" style="width: 40px; height: 40px;"></i>
                </div>
                <h3 style="margin: 0 0 8px; font-size: 18px; color: var(--text-main);">Your store is empty</h3>
                <p style="margin: 0 0 24px; font-size: 14px; max-width: 250px; line-height: 1.5;">Start building your inventory by tapping the + button below.</p>
            </div>
        `;
        lucide.createIcons();
    } else if (INVENTORY.length === 0) {
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
        if (currentUserRole !== 'employee' && i.cost && i.price > i.cost) {
            const margin = Math.round(((i.price - i.cost) / i.price) * 100);
            profitHtml = `<span class="badge badge-profit">${margin}% margin</span>`;
        }

        let skuHtml = i.sku ? `<span class="sku">Code: ${escapeHtml(i.sku)}</span>` : '';

        // Use data attributes for delegation
        row.innerHTML = `
            <div class="info" data-action="edit" data-id="${i.id}" style="cursor:pointer;" title="Tap to Edit">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span class="name">${escapeHtml(i.name)} ${expBadge} ${lowBadge}</span>
                    <i data-lucide="edit-3" style="width:14px; color:var(--text-muted); opacity:0.6;"></i>
                </div>
                ${skuHtml}
                <div class="meta">
                    <span class="badge">${escapeHtml(i.cat)}</span>
                    <span class="price-tag">KSh ${i.price}</span>
                    ${profitHtml}
                </div>
            </div>
            <div class="stepper" style="display:flex; align-items:center; gap:8px;">
                <button class="btn-icon" style="height:32px; width:32px; padding:0; justify-content:center; border-color:var(--primary); color:var(--primary)" data-action="cart" data-id="${i.id}" title="Add to POS Cart">
                    <i data-lucide="shopping-cart" style="width:16px; height:16px;"></i>
                </button>
                <div style="display:flex; align-items:center; border:1px solid var(--border-color); border-radius:8px; overflow:hidden; height:32px;">
                    <button class="step-btn minus" data-action="dec" data-id="${i.id}" style="border:none; width:32px; height:100%; border-radius:0;">
                        <i data-lucide="minus" style="width:14px; height:14px;"></i>
                    </button>
                    <div class="count-val" data-action="edit" data-id="${i.id}" style="display:flex; align-items:center; justify-content:center; width:36px; height:100%; border-left:1px solid var(--border-color); border-right:1px solid var(--border-color); font-size:14px;">
                        ${i.count}
                    </div>
                    <button class="step-btn plus" data-action="inc" data-id="${i.id}" style="border:none; width:32px; height:100%; border-radius:0;">
                        <i data-lucide="plus" style="width:14px; height:14px;"></i>
                    </button>
                </div>
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
        updateItemCountInDB(id, i.count + d);
        // We don't render() here, because the Firebase listener will trigger a render automatically
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
        document.getElementById('inp-supplier').value = i.supplier || '';
        document.getElementById('inp-price').value = i.price;
        document.getElementById('inp-cost').value = i.cost || '';
        document.getElementById('inp-count').value = i.count;
        document.getElementById('inp-expiry').value = i.expiry;
        if (currentUserRole !== 'employee') {
            del.classList.remove('hidden');
        } else {
            del.classList.add('hidden');
        }
    } else {
        document.getElementById('edit-id').value = '';
        document.getElementById('inp-name').value = '';
        document.getElementById('inp-sku').value = '';
        document.getElementById('inp-cat').value = '';
        document.getElementById('inp-supplier').value = '';
        document.getElementById('inp-price').value = '';
        document.getElementById('inp-cost').value = '';
        document.getElementById('inp-count').value = 0;
        document.getElementById('inp-expiry').value = '';
        del.classList.add('hidden');
    }

    const costGroup = document.getElementById('inp-cost').closest('.form-group');
    if (costGroup) {
        costGroup.style.display = (currentUserRole === 'employee') ? 'none' : 'block';
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
        supplier: document.getElementById('inp-supplier').value || '',
        price: parseFloat(document.getElementById('inp-price').value) || 0,
        cost: parseFloat(document.getElementById('inp-cost').value) || 0,
        count: parseInt(document.getElementById('inp-count').value) || 0,
        expiry: document.getElementById('inp-expiry').value
    };
    const isEdit = !!id;
    if (isEdit) {
        logHistory('edited', item.name, `Count: ${item.count}, Price: KSh ${item.price}`);
    } else {
        logHistory('added', item.name, `Count: ${item.count}, Price: KSh ${item.price}`);
    }
    saveItemToDB(item);
    showToast('Item Saved to Cloud', 'success');
    closeModal();
};
window.deleteItem = () => {
    if (confirm('Delete?')) {
        const id = document.getElementById('edit-id').value;
        const item = INVENTORY.find(i => i.id == id);
        logHistory('deleted', item ? item.name : 'Unknown item');
        deleteItemFromDB(id);
        showToast('Item Deleted from Cloud', 'error'); closeModal();
    }
};
// --- AUTONOMOUS SHIFT LOGIC ---
function finalizeShift(isManual) {
    if (!SHIFT_DATA.active) return;
    
    const endTime = isManual ? new Date().toISOString() : new Date(SHIFT_DATA.lastActivity).toISOString();
    
    const reportData = {
        employeeEmail: firebase.auth().currentUser.email,
        startTime: SHIFT_DATA.startTime,
        endTime: endTime,
        actions: SHIFT_DATA.actions,
        inventoryValue: INVENTORY.reduce((sum, i) => sum + (i.count * i.price), 0)
    };
    
    // Clear Local
    SHIFT_DATA.active = false;
    SHIFT_DATA.startTime = null;
    SHIFT_DATA.lastActivity = null;
    SHIFT_DATA.actions = [];
    localStorage.setItem('shiftData', JSON.stringify(SHIFT_DATA));
    
    // Save to Cloud and return the promise and data
    const promise = saveShiftReport(reportData).catch(console.error);
    return { promise, reportData };
}

function checkShiftTimeout() {
    if (!SHIFT_DATA.active) return;
    const now = Date.now();
    const timeoutMs = 12 * 60 * 60 * 1000; // 12 hours
    if (SHIFT_DATA.lastActivity && (now - SHIFT_DATA.lastActivity > timeoutMs)) {
        finalizeShift(false);
        showToast('Shift ended due to inactivity.', 'info');
        renderShiftUI();
    }
}

// Run the check every minute
setInterval(checkShiftTimeout, 60000);

function registerShiftActivity() {
    checkShiftTimeout();
    if (!SHIFT_DATA.active) {
        // Auto-start
        SHIFT_DATA.active = true;
        SHIFT_DATA.startTime = new Date().toISOString();
        SHIFT_DATA.actions = [];
        showToast('Shift Auto-Started', 'success');
    }
    SHIFT_DATA.lastActivity = Date.now();
    localStorage.setItem('shiftData', JSON.stringify(SHIFT_DATA));
    renderShiftUI();
}

function renderShiftUI() {
    const status = document.getElementById('shift-status');
    const t = TRANSLATIONS[LANG];

    if (SHIFT_DATA.active) {
        status.style.display = 'flex';
        updateShiftTimer();
    } else {
        status.style.display = 'none';
    }
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
        const { reportData } = finalizeShift(true);
        downloadPDF(true, reportData);
        
        document.getElementById('report-modal').classList.add('hidden');
        showToast('Shift Ended & Report Saved', 'success');
        renderShiftUI();
    }
};

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
window.downloadPDF = async (isShiftReport = false, pastReport = null) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const t = TRANSLATIONS[LANG];

    doc.setFontSize(18);
    doc.text(SETTINGS.name + (isShiftReport ? ' - Shift Report' : ' - Stock Report'), 14, 20);

    doc.setFontSize(10);
    doc.text('Generated: ' + new Date().toLocaleString(), 14, 28);

    if (isShiftReport) {
        // If pastReport is provided (from cloud), use it. Otherwise use current global SHIFT_DATA (fallback).
        const sTime = pastReport ? pastReport.startTime : SHIFT_DATA.startTime;
        const eTime = pastReport ? pastReport.endTime : new Date().toISOString();
        const actions = pastReport ? pastReport.actions : SHIFT_DATA.actions;
        const emp = pastReport ? pastReport.employeeEmail : (firebase.auth().currentUser ? firebase.auth().currentUser.email : '');

        if (emp) doc.text('Employee: ' + emp, 14, 34);
        if (sTime) doc.text('Shift Started: ' + new Date(sTime).toLocaleString(), 14, 40);
        doc.text('Shift Ended: ' + new Date(eTime).toLocaleString(), 14, 46);

        // Shift Activity Table
        doc.setFontSize(12);
        doc.text('Shift Activity Summary', 14, 56);
        doc.autoTable({
            head: [['Time', 'Action', 'Item', 'Details']],
            body: actions.map(a => [new Date(a.time).toLocaleTimeString(), a.action, a.item, a.details]),
            startY: 61
        });

        if (!pastReport) { // Only show final inventory state for current live shift
            doc.addPage();
            doc.setFontSize(12);
            doc.text('Final Inventory State', 14, 20);
            doc.autoTable({ head: [['Item', 'SKU', 'Category', 'Count', 'Price', 'Value']], body: INVENTORY.map(i => [i.name, i.sku || '-', i.cat, i.count, 'KSh ' + i.price, 'KSh ' + (i.count * i.price)]), startY: 25 });
        }
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

// --- VIEWS & NAVIGATION ---
function switchView(viewId) {
    currentView = viewId;
    localStorage.setItem('currentView', viewId);
    
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(btn => {
        if (btn.dataset.view === viewId) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Hide all containers
    const containers = ['list', 'dashboard-view', 'pos-view', 'suppliers-view'];
    containers.forEach(c => document.getElementById(c).classList.add('hidden'));

    // Show selected container
    if (viewId === 'list') {
        document.getElementById('list').classList.remove('hidden');
        document.getElementById('main-fab').classList.remove('hidden');
        document.getElementById('sort-select').parentElement.classList.remove('hidden');
        document.getElementById('tabs').classList.remove('hidden');
        const statsBanner = document.getElementById('stats-banner');
        if (statsBanner) statsBanner.classList.remove('hidden');
        render();
    } else {
        document.getElementById('main-fab').classList.add('hidden');
        document.getElementById('sort-select').parentElement.classList.add('hidden');
        document.getElementById('tabs').classList.add('hidden');
        const statsBanner = document.getElementById('stats-banner');
        if (statsBanner) statsBanner.classList.add('hidden');
        
        if (viewId === 'dashboard') {
            document.getElementById('dashboard-view').classList.remove('hidden');
            renderDashboard();
        } else if (viewId === 'pos') {
            document.getElementById('pos-view').classList.remove('hidden');
            renderPOS();
        } else if (viewId === 'suppliers') {
            document.getElementById('suppliers-view').classList.remove('hidden');
            renderSuppliers();
        }
    }
}

// --- SUPPLIERS LOGIC ---
window.updateSupplierDropdown = () => {
    const dropdown = document.getElementById('inp-supplier');
    if (!dropdown) return;
    const currentVal = dropdown.value;
    dropdown.innerHTML = '<option value="">-- No Supplier --</option>';
    SUPPLIERS.forEach(s => {
        dropdown.innerHTML += `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`;
    });
    dropdown.value = currentVal;
};

window.renderSuppliers = () => {
    const list = document.getElementById('suppliers-list');
    list.innerHTML = '';
    if (SUPPLIERS.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:13px; margin:40px 0">No suppliers added yet.</p>';
        return;
    }
    SUPPLIERS.forEach(s => {
        const card = document.createElement('div');
        card.className = 'supplier-card';
        card.innerHTML = `
            <div class="supplier-info">
                <h4>${escapeHtml(s.name)}</h4>
                <p><i data-lucide="phone" style="width:12px"></i> ${escapeHtml(s.phone || 'N/A')}</p>
                <p><i data-lucide="mail" style="width:12px"></i> ${escapeHtml(s.email || 'N/A')}</p>
            </div>
            <button class="btn-icon edit-supplier-btn" style="color:var(--primary); border-color:var(--primary)">
                <i data-lucide="edit-3"></i>
            </button>
        `;
        card.querySelector('.edit-supplier-btn').addEventListener('click', () => openSupplierModal(s.id));
        list.appendChild(card);
    });
    lucide.createIcons();
};

window.openSupplierModal = (id) => {
    const modal = document.getElementById('supplier-modal');
    const delBtn = document.getElementById('btn-delete-supplier');
    if (id) {
        const s = SUPPLIERS.find(x => x.id == id);
        document.getElementById('edit-supplier-id').value = s.id;
        document.getElementById('inp-supp-name').value = s.name;
        document.getElementById('inp-supp-phone').value = s.phone || '';
        document.getElementById('inp-supp-email').value = s.email || '';
        document.getElementById('inp-supp-notes').value = s.notes || '';
        document.getElementById('supplier-modal-title').innerText = 'Edit Supplier';
        if (currentUserRole !== 'employee') delBtn.classList.remove('hidden');
        else delBtn.classList.add('hidden');
    } else {
        document.getElementById('edit-supplier-id').value = '';
        document.getElementById('inp-supp-name').value = '';
        document.getElementById('inp-supp-phone').value = '';
        document.getElementById('inp-supp-email').value = '';
        document.getElementById('inp-supp-notes').value = '';
        document.getElementById('supplier-modal-title').innerText = 'Add Supplier';
        delBtn.classList.add('hidden');
    }
    modal.classList.remove('hidden');
};

document.getElementById('btn-add-supplier').addEventListener('click', () => openSupplierModal());

document.getElementById('btn-save-supplier').addEventListener('click', () => {
    const id = document.getElementById('edit-supplier-id').value;
    const s = {
        id: id || Date.now().toString(),
        name: document.getElementById('inp-supp-name').value,
        phone: document.getElementById('inp-supp-phone').value,
        email: document.getElementById('inp-supp-email').value,
        notes: document.getElementById('inp-supp-notes').value
    };
    if (!s.name) return showToast('Name required', 'error');
    
    saveSupplierToDB(s).then(() => {
        showToast('Supplier Saved', 'success');
        document.getElementById('supplier-modal').classList.add('hidden');
    }).catch(e => showToast(e.message, 'error'));
});

document.getElementById('btn-delete-supplier').addEventListener('click', () => {
    if (confirm('Delete this supplier?')) {
        const id = document.getElementById('edit-supplier-id').value;
        deleteSupplierFromDB(id).then(() => {
            showToast('Supplier Deleted', 'error');
            document.getElementById('supplier-modal').classList.add('hidden');
        }).catch(e => showToast(e.message, 'error'));
    }
});

// --- POS LOGIC ---
window.renderPOS = () => {
    // POS Cart rendering
    const list = document.getElementById('pos-cart-items');
    list.innerHTML = '';
    let totalItems = 0;
    let totalVal = 0;
    
    if (POS_CART.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:13px; margin:40px 0">Cart is empty.<br>Scan an item or use Inventory view to add.</p>';
    } else {
        POS_CART.forEach((cItem, index) => {
            totalItems += cItem.qty;
            totalVal += (cItem.qty * cItem.price);
            const row = document.createElement('div');
            row.style = 'display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid var(--border-color);';
            row.innerHTML = `
                <div>
                    <div style="font-weight:600; font-size:14px">${escapeHtml(cItem.name)}</div>
                    <div style="color:var(--text-muted); font-size:12px">KSh ${cItem.price} &times; ${cItem.qty} = <strong>KSh ${cItem.qty * cItem.price}</strong></div>
                </div>
                <div style="display:flex; align-items:center; border:1px solid var(--border-color); border-radius:8px; overflow:hidden; height:32px;">
                    <button class="step-btn minus" style="border:none; width:32px; height:100%; border-radius:0;"><i data-lucide="minus" style="width:14px; height:14px;"></i></button>
                    <div class="count-val" style="display:flex; align-items:center; justify-content:center; width:36px; height:100%; border-left:1px solid var(--border-color); border-right:1px solid var(--border-color); font-size:14px;">${cItem.qty}</div>
                    <button class="step-btn plus" style="border:none; width:32px; height:100%; border-radius:0;"><i data-lucide="plus" style="width:14px; height:14px;"></i></button>
                </div>
            `;
            
            row.querySelector('.minus').addEventListener('click', () => window.modCart(index, -1));
            row.querySelector('.plus').addEventListener('click', () => window.modCart(index, 1));
            
            list.appendChild(row);
        });
    }
    
    document.getElementById('pos-total-items').innerText = totalItems;
    document.getElementById('pos-total-val').innerText = 'KSh ' + totalVal.toLocaleString();
    lucide.createIcons();
};

window.modCart = (index, delta) => {
    if (index >= 0 && index < POS_CART.length) {
        POS_CART[index].qty += delta;
        // Verify inventory limits
        const dbItem = INVENTORY.find(i => i.id == POS_CART[index].id);
        if (dbItem && POS_CART[index].qty > dbItem.count) {
            POS_CART[index].qty = dbItem.count; // Max out at available inventory
            showToast('Not enough stock available', 'error');
        }
        if (POS_CART[index].qty <= 0) {
            POS_CART.splice(index, 1);
        }
        localStorage.setItem('posCart', JSON.stringify(POS_CART));
        renderPOS();
    }
};

window.addToCart = (id) => {
    const item = INVENTORY.find(i => i.id == id);
    if (!item) return;
    if (item.count <= 0) return showToast('Item out of stock', 'error');
    
    const exist = POS_CART.find(c => c.id == id);
    if (exist) {
        if (exist.qty < item.count) {
            exist.qty += 1;
            showToast('Added to Cart', 'success');
        } else {
            showToast('Not enough stock available', 'error');
        }
    } else {
        POS_CART.push({ id: item.id, name: item.name, price: item.price, qty: 1 });
        showToast('Added to Cart', 'success');
    }
    localStorage.setItem('posCart', JSON.stringify(POS_CART));
    if (currentView === 'pos') renderPOS();
};

document.getElementById('btn-custom-item').addEventListener('click', () => {
    const name = prompt("Enter custom item name:", "Custom Item");
    if (!name) return;
    const priceStr = prompt("Enter custom item price:", "0");
    if (!priceStr) return;
    
    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 0) return showToast("Invalid price", "error");
    
    POS_CART.push({
        id: 'custom_' + Date.now(),
        name: name,
        price: price,
        qty: 1
    });
    
    localStorage.setItem('posCart', JSON.stringify(POS_CART));
    renderPOS();
    showToast("Added custom item", "success");
});

let LAST_RECEIPT = null;

document.getElementById('btn-checkout').addEventListener('click', () => {
    if (POS_CART.length === 0) return showToast('Cart is empty', 'error');
    
    const totalVal = POS_CART.reduce((s, i) => s + (i.qty * i.price), 0);
    const btn = document.getElementById('btn-checkout');
    btn.disabled = true;
    btn.textContent = 'Processing...';
    
    processCheckout(POS_CART, totalVal).then(() => {
        btn.disabled = false;
        btn.textContent = 'Checkout';
        
        // Log the checkout as an activity (this auto-starts a shift if one isn't active)
        logHistory('Checkout', `${POS_CART.length} items`, `KSh ${totalVal}`);
        
        // Save receipt data before clearing cart
        LAST_RECEIPT = { items: [...POS_CART], total: totalVal, date: new Date().toLocaleString() };
        
        document.getElementById('checkout-modal').classList.remove('hidden');
        
        // Check for Low Stock for Emails
        const lowItems = [];
        POS_CART.forEach(c => {
            const dbItem = INVENTORY.find(i => i.id == c.id);
            if (dbItem && (dbItem.count - c.qty) <= 0) {
                lowItems.push(dbItem.name);
            }
        });
        if (lowItems.length > 0) {
            sendLowStockEmail(lowItems);
        }
        
        POS_CART = []; // Clear cart
        localStorage.setItem('posCart', JSON.stringify(POS_CART));
        if (currentView === 'pos') renderPOS();
    }).catch(e => {
        btn.disabled = false;
        btn.textContent = 'Checkout';
        showToast(e.message, 'error');
    });
});

document.getElementById('btn-checkout-done').addEventListener('click', () => {
    document.getElementById('checkout-modal').classList.add('hidden');
});

document.getElementById('btn-print-receipt').addEventListener('click', () => {
    if (!LAST_RECEIPT) return showToast('No receipt found', 'error');
    if (!window.jspdf || !window.jspdf.jsPDF) return showToast('PDF Library not loaded', 'error');
    
    const doc = new window.jspdf.jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a5'
    });
    
    const pw = doc.internal.pageSize.width;
    const margin = 12;
    
    // Header bar
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 0, pw, 28, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(SETTINGS.name || "My Store", pw / 2, 13, { align: 'center' });
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("SALES RECEIPT", pw / 2, 21, { align: 'center' });
    
    // Meta info
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    doc.text("Date: " + LAST_RECEIPT.date, margin, 38);
    doc.text("Receipt #: " + Date.now().toString(36).toUpperCase(), pw - margin, 38, { align: 'right' });
    
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(margin, 42, pw - margin, 42);
    
    // Items table
    const tableData = LAST_RECEIPT.items.map(i => [
        i.name,
        i.qty.toString(),
        "KSh " + i.price.toLocaleString(),
        "KSh " + (i.price * i.qty).toLocaleString()
    ]);
    
    doc.autoTable({
        startY: 46,
        margin: { left: margin, right: margin },
        head: [['Item', 'Qty', 'Price', 'Subtotal']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [243, 244, 246], textColor: [50, 50, 50], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9, textColor: [30, 30, 30] },
        alternateRowStyles: { fillColor: [250, 250, 252] },
        columnStyles: {
            0: { halign: 'left' },
            1: { halign: 'center', cellWidth: 16 },
            2: { halign: 'right', cellWidth: 28 },
            3: { halign: 'right', cellWidth: 30 }
        }
    });
    
    let finalY = doc.lastAutoTable.finalY + 4;
    
    // Total box
    doc.setFillColor(243, 244, 246);
    doc.roundedRect(pw - margin - 60, finalY, 60, 14, 2, 2, 'F');
    
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("TOTAL", pw - margin - 55, finalY + 9);
    
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("KSh " + LAST_RECEIPT.total.toLocaleString(), pw - margin - 3, finalY + 9, { align: 'right' });
    
    finalY += 24;
    
    // Footer
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, finalY, pw - margin, finalY);
    finalY += 8;
    
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.text("Thank you for your business!", pw / 2, finalY, { align: 'center' });
    
    doc.setFontSize(7);
    doc.text("Powered by StockOp", pw / 2, finalY + 6, { align: 'center' });
    
    doc.save("Receipt_" + Date.now() + ".pdf");
    
    setTimeout(() => {
        document.getElementById('checkout-modal').classList.add('hidden');
    }, 500);
});

// --- EMAIL ALERTS LOGIC ---
window.sendLowStockEmail = (itemNames) => {
    // Requires EmailJS initialization
    // For this to work in production, owner needs to configure EmailJS keys.
    // Assuming a placeholder setup for now:
    try {
        emailjs.init("YOUR_PUBLIC_KEY"); // Placeholder
        const templateParams = {
            to_name: SETTINGS.name + " Owner",
            message: "The following items have just run out of stock during checkout:\n\n" + itemNames.join("\n"),
            reply_to: "no-reply@stockop.app"
        };
        
        emailjs.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', templateParams)
            .then(function(response) {
                console.log('Email sent!', response.status, response.text);
            }, function(error) {
                console.log('Email failed...', error);
            });
    } catch (e) {
        console.warn('EmailJS not configured yet:', e);
    }
};

function renderDashboard() {
    if (currentView !== 'dashboard') return;

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

    registerShiftActivity(); // Record activity to maintain/start shift

    if (SHIFT_DATA.active) {
        SHIFT_DATA.actions.push(entry);
        localStorage.setItem('shiftData', JSON.stringify(SHIFT_DATA));
    }
}

function showHistory() {
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

window.openShiftReports = () => {
    document.getElementById('settings-modal').classList.add('hidden');
    document.getElementById('shift-reports-modal').classList.remove('hidden');
    
    getShiftReports((reports) => {
        const list = document.getElementById('shift-reports-list');
        if (!reports.length) {
            list.innerHTML = `<p style="color:var(--text-muted); text-align:center">No shift reports found.</p>`;
            return;
        }
        list.innerHTML = '';
        reports.forEach(r => {
            const start = r.startTime ? new Date(r.startTime).toLocaleString() : 'Unknown';
            const end = r.endTime ? new Date(r.endTime).toLocaleString() : 'Unknown';
            const emp = r.employeeEmail || 'Unknown';
            
            const card = document.createElement('div');
            card.style = 'background:var(--bg-input); border-radius:8px; padding:12px; cursor:pointer';
            card.innerHTML = `
                <div style="font-weight:700; margin-bottom:4px">${emp}</div>
                <div style="font-size:11px; color:var(--text-muted)"><i data-lucide="calendar" style="width:12px; vertical-align:middle"></i> ${start} - ${end}</div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px">
                    <span style="font-size:11px; font-weight:600; color:var(--primary)"><i data-lucide="download" style="width:12px; vertical-align:middle"></i> Download PDF</span>
                    <span style="font-size:12px; font-weight:700; color:var(--success)">${r.actions ? r.actions.length : 0} Actions</span>
                </div>
            `;
            card.addEventListener('click', () => downloadPastReport(r));
            list.appendChild(card);
        });
        lucide.createIcons();
    });
};

window.downloadPastReport = (reportData) => {
    try {
        downloadPDF(true, reportData);
        showToast("Generating PDF...", "success");
    } catch(err) {
        console.error("Failed to parse past report", err);
        showToast("Error generating PDF", "error");
    }
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
        dataExport: 'Data Export',
        dangerZone: 'Danger Zone',
        factoryReset: 'Factory Reset App',
        deleteStore: 'Delete Store (Irreversible)',
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
        dataExport: 'Hamisha Data',
        dangerZone: 'Eneo la Hatari',
        factoryReset: 'Futa Programu',
        deleteStore: 'Futa Duka (Haiwezi Kurejeshwa)',
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

// --- SCANNER LOGIC ---
let html5QrcodeScanner = null;
let currentScanTarget = ''; // 'search' or 'sku'

window.openScanner = (target) => {
    currentScanTarget = target;
    document.getElementById('scanner-modal').classList.remove('hidden');
    
    if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 150} }, false);
    }
    
    html5QrcodeScanner.render((decodedText, decodedResult) => {
        if (currentScanTarget === 'search') {
            document.getElementById('search-input').value = decodedText;
            document.getElementById('search-bar').classList.remove('hidden');
            render();
        } else if (currentScanTarget === 'sku') {
            document.getElementById('inp-sku').value = decodedText;
        }
        showToast('Barcode Scanned!', 'success');
        closeScanner();
    }, (error) => {
        // ignore errors
    });
};

window.closeScanner = () => {
    document.getElementById('scanner-modal').classList.add('hidden');
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().catch(e => console.error(e));
        html5QrcodeScanner = null;
    }
};

['login', 'reg'].forEach(prefix => {
    const btn = document.getElementById(`btn-toggle-${prefix}-pwd`);
    const inp = document.getElementById(`${prefix}-password`);
    if (btn && inp) {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (inp.type === 'password') {
                inp.type = 'text';
                btn.innerHTML = '<i data-lucide="eye-off" style="width:18px; color:var(--text-muted)"></i>';
            } else {
                inp.type = 'password';
                btn.innerHTML = '<i data-lucide="eye" style="width:18px; color:var(--text-muted)"></i>';
            }
            lucide.createIcons();
        });
    }
});

function applyRoleVisibility(role) {
    document.querySelectorAll('.owner-only').forEach(el => {
        el.style.display = (role === 'owner') ? '' : 'none';
    });
    document.querySelectorAll('.employee-only').forEach(el => {
        el.style.display = (role === 'employee') ? '' : 'none';
    });
}

function renderTeamMembers(members) {
    const list = document.getElementById('team-members-list');
    if(!list) return;
    list.innerHTML = '';
    members.forEach(m => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'space-between';
        div.style.padding = '8px 0';
        div.style.borderBottom = '1px solid var(--border-color)';
        
        let roleBadge = m.role === 'owner' 
            ? '<span class="badge" style="background:var(--primary); color:white">Owner</span>'
            : '<span class="badge">Employee</span>';
            
        let removeBtn = '';
        
        div.innerHTML = `
            <div>
                <div style="font-size:14px; font-weight:600">${escapeHtml(m.email)}</div>
                <div style="margin-top:4px">${roleBadge}</div>
            </div>
        `;
        
        if (m.role !== 'owner') {
            const kickBtn = document.createElement('button');
            kickBtn.className = 'btn-icon';
            kickBtn.style = 'color:var(--danger); border-color:var(--danger); height:28px';
            kickBtn.innerHTML = '<i data-lucide="trash-2" style="width:14px"></i>';
            kickBtn.addEventListener('click', () => window.kickMember(m.uid));
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            div.appendChild(kickBtn);
        }
        
        list.appendChild(div);
    });
    lucide.createIcons();
}

window.kickMember = (uid) => {
    if(confirm('Remove this employee from the store?')) {
        removeStoreMember(uid).then(() => showToast('Employee removed', 'success'))
        .catch(e => showToast(e.message, 'error'));
    }
};

document.getElementById('btn-copy-code').addEventListener('click', () => {
    const code = document.getElementById('display-store-code').textContent;
    if (code && code !== '---') {
        navigator.clipboard.writeText(code);
        showToast('Store code copied!', 'success');
    }
});

document.getElementById('btn-regen-code').addEventListener('click', () => {
    if(confirm('Generate a new store code? The old one will stop working for new joins.')){
        regenerateStoreCode().then((newCode) => {
            document.getElementById('display-store-code').textContent = newCode;
            showToast('Code regenerated', 'success');
        }).catch(e => showToast(e.message, 'error'));
    }
});

// --- GLOBAL EVENT DELEGATION FOR INVENTORY LIST ---
document.getElementById('list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    const info = e.target.closest('.info[data-action="edit"]');
    const countVal = e.target.closest('.count-val[data-action="edit"]');

    if (btn) {
        const id = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-action');
        if (action === 'inc') window.mod(id, 1);
        if (action === 'dec') window.mod(id, -1);
        if (action === 'cart') window.addToCart(id);
    } else if (info || countVal) {
        const id = (info || countVal).getAttribute('data-id');
        window.openModal(id);
    }
});

// --- SPEECH RECOGNITION (Search by Voice) ---
const micBtn = document.querySelector('.mic-btn');
if (micBtn) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;

        micBtn.addEventListener('click', () => {
            micBtn.style.color = 'var(--danger)'; // Turn red while listening
            recognition.start();
            showToast('Listening...', 'success');
        });

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            const searchInput = document.getElementById('search-input');
            searchInput.value = transcript;
            // Trigger the input event to run search/render
            searchInput.dispatchEvent(new Event('input'));
            micBtn.style.color = 'var(--primary)';
        };

        recognition.onerror = (e) => {
            micBtn.style.color = 'var(--primary)';
            showToast('Mic error: ' + e.error, 'error');
        };

        recognition.onend = () => {
            micBtn.style.color = 'var(--primary)';
        };
    } else {
        micBtn.addEventListener('click', () => {
            showToast('Voice search is not supported in this browser.', 'error');
        });
    }
}

// --- CSP-SAFE EVENT BINDINGS ---
document.getElementById('btn-cancel-supplier').addEventListener('click', () => {
    document.getElementById('supplier-modal').classList.add('hidden');
});

document.getElementById('btn-scan-search').addEventListener('click', () => openScanner('search'));
document.getElementById('btn-scan-sku').addEventListener('click', () => openScanner('sku'));
document.getElementById('btn-cancel-scanner').addEventListener('click', () => closeScanner());

const scannerCancel2 = document.getElementById('btn-cancel-scanner-2');
if (scannerCancel2) scannerCancel2.addEventListener('click', () => closeScanner());

document.getElementById('btn-reset-app').addEventListener('click', (e) => {
    e.preventDefault();
    resetApp();
});

const btnDeleteStore = document.getElementById('btn-delete-store');
if (btnDeleteStore) {
    btnDeleteStore.addEventListener('click', async () => {
        const confirmText = prompt('WARNING: This will permanently wipe all inventory, sales, shifts, and members from the cloud. This cannot be undone.\n\nType "DELETE" to confirm:');
        if (confirmText === 'DELETE') {
            btnDeleteStore.disabled = true;
            btnDeleteStore.textContent = 'Deleting...';
            try {
                await deleteStorePermanently();
                alert('Store successfully deleted from servers.');
                localStorage.clear();
                sessionStorage.clear();
                location.reload();
            } catch (err) {
                console.error(err);
                alert('Failed to delete store: ' + err);
                btnDeleteStore.disabled = false;
                btnDeleteStore.textContent = TRANSLATIONS[LANG].deleteStore || 'Delete Store (Irreversible)';
            }
        } else if (confirmText !== null) {
            alert('Confirmation failed. Store was not deleted.');
        }
    });
}

document.getElementById('btn-clear-cart').addEventListener('click', () => {
    if (POS_CART.length === 0) return;
    if (confirm('Are you sure you want to clear all items from the cart?')) {
        POS_CART.length = 0;
        localStorage.removeItem('posCart');
        renderPOS();
        showToast('Cart cleared', 'success');
    }
});
