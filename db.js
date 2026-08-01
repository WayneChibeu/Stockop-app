// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyC3CQc4wc6MepUhZzBK9W9dd2J1IJHxuJM",
    authDomain: "stockop-71ac1.firebaseapp.com",
    projectId: "stockop-71ac1",
    storageBucket: "stockop-71ac1.firebasestorage.app",
    messagingSenderId: "572000723523",
    appId: "1:572000723523:web:b575b409e33c1fda9d6af6",
    measurementId: "G-23XZMXJXV9"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();

// --- GLOBAL STATE ---
let currentUserId = null;
let currentStoreId = null;
let currentUserRole = null; // "owner" or "employee"

// --- AUTHENTICATION ---

function loginUser(email, password) {
    return auth.signInWithEmailAndPassword(email, password);
}

function registerUser(email, password) {
    return auth.createUserWithEmailAndPassword(email, password);
}

function logoutUser() {
    return auth.signOut();
}

// Send password reset email
function resetPassword(email) {
    return auth.sendPasswordResetEmail(email);
}

// Listen for auth state changes
function onAuthStateChanged(callback) {
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUserId = user.uid;
        } else {
            currentUserId = null;
            currentStoreId = null;
            currentUserRole = null;
        }
        callback(user);
    });
}

// --- STORE MANAGEMENT ---

// Generate a random 6-character store code like "WYN-482"
function generateStoreCode() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O to avoid confusion
    const digits = '0123456789';
    let code = '';
    for (let i = 0; i < 3; i++) code += letters.charAt(Math.floor(Math.random() * letters.length));
    code += '-';
    for (let i = 0; i < 3; i++) code += digits.charAt(Math.floor(Math.random() * digits.length));
    return code;
}

// Create a new store (called when owner registers)
function createStore(storeName, userEmail) {
    const user = auth.currentUser;
    if (!user) return Promise.reject(new Error("Not authenticated"));
    const uid = user.uid;
    
    const storeCode = generateStoreCode();
    const storeId = db.collection('stores').doc().id; // auto-generate ID

    const batch = db.batch();

    // 1. Create the store info doc
    const storeInfoRef = db.collection('stores').doc(storeId);
    batch.set(storeInfoRef, {
        name: storeName,
        ownerId: uid,
        storeCode: storeCode,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 2. Add the owner as a member
    const memberRef = db.collection('stores').doc(storeId).collection('members').doc(uid);
    batch.set(memberRef, {
        email: userEmail,
        role: 'owner',
        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 3. Save the storeId in the user's own doc for quick lookup
    const userRef = db.collection('users').doc(uid);
    batch.set(userRef, {
        storeId: storeId,
        role: 'owner'
    });

    return batch.commit().then(() => {
        currentUserId = uid;
        currentStoreId = storeId;
        currentUserRole = 'owner';
        return { storeId, storeCode };
    });
}

// Join an existing store by store code (called when employee registers)
function joinStoreByCode(code, userEmail) {
    const user = auth.currentUser;
    if (!user) return Promise.reject(new Error("Not authenticated"));
    const uid = user.uid;

    // Search for a store with this code
    return db.collection('stores').where('storeCode', '==', code.toUpperCase().trim()).get().then((snapshot) => {
        if (snapshot.empty) {
            throw new Error('Invalid store code. Please check and try again.');
        }

        const storeDoc = snapshot.docs[0];
        const storeId = storeDoc.id;

        const batch = db.batch();

        // 1. Add user as employee member
        const memberRef = db.collection('stores').doc(storeId).collection('members').doc(uid);
        batch.set(memberRef, {
            email: userEmail,
            role: 'employee',
            joinedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 2. Save storeId in user's own doc
        const userRef = db.collection('users').doc(uid);
        batch.set(userRef, {
            storeId: storeId,
            role: 'employee'
        });

        return batch.commit().then(() => {
            currentUserId = uid;
            currentStoreId = storeId;
            currentUserRole = 'employee';
            return { storeId, storeName: storeDoc.data().name };
        });
    });
}

// Load which store the current user belongs to (called after login)
function loadUserStore(callback) {
    if (!currentUserId) return;

    db.collection('users').doc(currentUserId).get().then((doc) => {
        if (doc.exists && doc.data().storeId) {
            currentStoreId = doc.data().storeId;
            currentUserRole = doc.data().role;
            callback({ storeId: currentStoreId, role: currentUserRole });
        } else {
            // User exists in Auth but has no store yet (edge case)
            callback(null);
        }
    }).catch((err) => {
        console.error("Error loading user store:", err);
        callback(null);
    });
}

// --- STORE-SCOPED INVENTORY ---
// All inventory now lives under stores/{storeId}/inventory

function getStoreInventoryRef() {
    if (!currentStoreId) {
        console.error("No store loaded!");
        return null;
    }
    return db.collection('stores').doc(currentStoreId).collection('inventory');
}

// 1. Listen for Real-Time Updates
function listenToInventory(onUpdateCallback) {
    const ref = getStoreInventoryRef();
    if (!ref) return;

    ref.onSnapshot((snapshot) => {
        const items = [];
        snapshot.forEach((doc) => {
            items.push({
                id: parseInt(doc.id),
                ...doc.data()
            });
        });
        onUpdateCallback(items);
    }, (error) => {
        console.error("Error listening to inventory:", error);
    });
}

// 2. Add or Edit Item
function saveItemToDB(item) {
    const ref = getStoreInventoryRef();
    if (!ref) return Promise.reject("No store");
    const docId = item.id.toString();
    return ref.doc(docId).set(item);
}

// 3. Delete Item (owner only — enforced by Firestore rules too)
function deleteItemFromDB(id) {
    const ref = getStoreInventoryRef();
    if (!ref) return Promise.reject("No store");
    const docId = id.toString();
    return ref.doc(docId).delete();
}

// 4. Update Count (for +/- buttons)
function updateItemCountInDB(id, newCount) {
    const ref = getStoreInventoryRef();
    if (!ref) return Promise.reject("No store");
    const docId = id.toString();
    return ref.doc(docId).update({ count: newCount });
}

// --- STORE SETTINGS ---

function saveStoreSettings(settings) {
    if (!currentStoreId) return Promise.reject("No store");
    return db.collection('stores').doc(currentStoreId).update({
        name: settings.name
    });
}

function loadStoreSettings(callback) {
    if (!currentStoreId) return;
    db.collection('stores').doc(currentStoreId).get().then((doc) => {
        if (doc.exists) {
            callback({ name: doc.data().name, storeCode: doc.data().storeCode });
        }
    });
}

// --- TEAM MANAGEMENT (Owner only) ---

// Get all members of the current store
function getStoreMembers(callback) {
    if (!currentStoreId) return;
    db.collection('stores').doc(currentStoreId).collection('members')
        .onSnapshot((snapshot) => {
            const members = [];
            snapshot.forEach((doc) => {
                members.push({ uid: doc.id, ...doc.data() });
            });
            callback(members);
        });
}

// Remove a member from the store (owner only)
function removeStoreMember(userId) {
    if (!currentStoreId || currentUserRole !== 'owner') return Promise.reject("Not authorized");

    const batch = db.batch();

    // Remove from store members
    batch.delete(db.collection('stores').doc(currentStoreId).collection('members').doc(userId));

    // Clear the user's storeId reference
    batch.update(db.collection('users').doc(userId), {
        storeId: firebase.firestore.FieldValue.delete(),
        role: firebase.firestore.FieldValue.delete()
    });

    return batch.commit();
}

// Regenerate the store code (invalidates the old one)
function regenerateStoreCode() {
    if (!currentStoreId || currentUserRole !== 'owner') return Promise.reject("Not authorized");
    const newCode = generateStoreCode();
    return db.collection('stores').doc(currentStoreId).update({
        storeCode: newCode
    }).then(() => newCode);
}

// Delete a collection in batches of 500
async function deleteCollection(collectionRef) {
    let snapshot = await collectionRef.limit(500).get();
    while (snapshot.size > 0) {
        const batch = db.batch();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        snapshot = await collectionRef.limit(500).get();
    }
}

// Completely wipe a store and all its data (Owner only)
async function deleteStorePermanently() {
    if (!currentStoreId || currentUserRole !== 'owner') return Promise.reject("Not authorized");
    const storeRef = db.collection('stores').doc(currentStoreId);
    
    // 1. Delete all subcollections
    await deleteCollection(storeRef.collection('inventory'));
    await deleteCollection(storeRef.collection('sales'));
    await deleteCollection(storeRef.collection('shift_reports'));
    await deleteCollection(storeRef.collection('suppliers'));
    await deleteCollection(storeRef.collection('members'));
    
    // 2. Delete the main store document
    await storeRef.delete();
    
    // 3. Clear the owner's storeId reference
    const userId = firebase.auth().currentUser.uid;
    await db.collection('users').doc(userId).update({
        storeId: firebase.firestore.FieldValue.delete(),
        role: firebase.firestore.FieldValue.delete()
    });
}

// --- CLOUD SHIFT REPORTS ---

function saveShiftReport(reportData) {
    if (!currentStoreId) return Promise.reject("No store");
    return db.collection('stores').doc(currentStoreId).collection('shift_reports').add({
        ...reportData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

function getShiftReports(callback) {
    if (!currentStoreId) {
        callback([]);
        return;
    }
    
    // We fetch all for owner, or filter for employee
    let query = db.collection('stores').doc(currentStoreId).collection('shift_reports').orderBy('createdAt', 'desc').limit(50);
    
    if (currentUserRole !== 'owner') {
        const userEmail = firebase.auth().currentUser.email;
        query = db.collection('stores').doc(currentStoreId).collection('shift_reports')
            .where('employeeEmail', '==', userEmail)
            .orderBy('createdAt', 'desc')
            .limit(50);
    }

    query.onSnapshot((snapshot) => {
        const reports = [];
        snapshot.forEach((doc) => {
            reports.push({ id: doc.id, ...doc.data() });
        });
        callback(reports);
    }, (err) => {
        console.error("Error fetching shift reports", err);
        // Fallback if index is missing (since where + orderBy requires an index in Firestore)
        if (err.code === 'failed-precondition' || (err.message && err.message.toLowerCase().includes('index'))) {
            // Simple fetch without orderBy, sort locally
            let fbQuery = db.collection('stores').doc(currentStoreId).collection('shift_reports');
            if (currentUserRole !== 'owner') {
                fbQuery = fbQuery.where('employeeEmail', '==', firebase.auth().currentUser.email);
            }
            
            fbQuery.onSnapshot(snap => {
                let r = [];
                snap.forEach(d => r.push({ id: d.id, ...d.data() }));
                r.sort((a,b) => (b.startTime > a.startTime ? 1 : -1));
                callback(r);
            }, (fbErr) => {
                console.error("Fallback error", fbErr);
                callback([]);
            });
        } else {
            callback([]);
        }
    });
}

// --- SUPPLIERS ---
function saveSupplierToDB(supplier) {
    if (!currentStoreId) return Promise.reject("No store");
    return db.collection('stores').doc(currentStoreId).collection('suppliers').doc(supplier.id.toString()).set(supplier);
}

function deleteSupplierFromDB(id) {
    if (!currentStoreId) return Promise.reject("No store");
    return db.collection('stores').doc(currentStoreId).collection('suppliers').doc(id.toString()).delete();
}

function listenToSuppliers(callback) {
    if (!currentStoreId) return;
    db.collection('stores').doc(currentStoreId).collection('suppliers').onSnapshot(snap => {
        const suppliers = [];
        snap.forEach(doc => suppliers.push(doc.data()));
        callback(suppliers);
    });
}

// --- POS / CHECKOUT ---
function processCheckout(cartItems, totalValue) {
    if (!currentStoreId) return Promise.reject("No store");
    
    const batch = db.batch();
    const inventoryRef = db.collection('stores').doc(currentStoreId).collection('inventory');
    
    // Deduct stock for each item in cart (unless it's a custom POS item)
    cartItems.forEach(item => {
        if (!item.id.toString().startsWith('custom_')) {
            const docRef = inventoryRef.doc(item.id.toString());
            batch.update(docRef, { count: firebase.firestore.FieldValue.increment(-item.qty) });
        }
    });
    
    // Save Sales Receipt
    const saleRef = db.collection('stores').doc(currentStoreId).collection('sales').doc();
    batch.set(saleRef, {
        items: cartItems.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price })),
        totalValue: totalValue,
        employeeEmail: firebase.auth().currentUser ? firebase.auth().currentUser.email : 'Unknown',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    return batch.commit();
}
