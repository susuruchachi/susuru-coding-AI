/**
 * すするCoder
 * lib/firebase.js - Firebase 初期化・認証
 */

// ⚠️ 下記の firebaseConfig を設定してください（FIREBASE_SETUP.md 参照）
const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyBEWlLghxc3qg_QMqNp_Ao_8UKDx7F7S7Q",
    authDomain:        "susuru-ai-coding-system.firebaseapp.com",
    databaseURL:       "https://susuru-ai-coding-system-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId:         "susuru-ai-coding-system",
    storageBucket:     "susuru-ai-coding-system.firebasestorage.app",
    messagingSenderId: "1056616358675",
    appId:             "1:1056616358675:web:1859190a29ea78cbe670e6",
    measurementId:     "G-348M4JVQN9"
};

let _auth = null;
let _db   = null;
let _initialized = false;

function initFirebase() {
    if (_initialized) return;
    try {
        firebase.initializeApp(FIREBASE_CONFIG);
        _auth = firebase.auth();
        _db   = firebase.database();
        _initialized = true;
        console.log('✅ Firebase initialized');
    } catch (e) {
        console.warn('Firebase init skipped:', e.message);
    }
}

/** @returns {boolean} */
function isFirebaseReady() {
    return _initialized && !!_auth && !!_db;
}

/** @returns {firebase.auth.Auth | null} */
function getFirebaseAuth() { return _auth; }

/** @returns {firebase.database.Database | null} */
function getFirebaseDb()   { return _db; }

// ─── window に公開（components.js から window.xxx() で呼ばれるため必須）─────
window.initFirebase    = initFirebase;
window.isFirebaseReady = isFirebaseReady;
window.getFirebaseAuth = getFirebaseAuth;
window.getFirebaseDb   = getFirebaseDb;
