/**
 * Jolly Nobel AI Studio — Firebase Auth Module (js/auth.js)
 * Smart Sign-In: Google + Email/Password
 * Modal appears only when gated features (Brainstorm/Vision AI) are triggered.
 */

// Guard: if module script already called _studioAuthReady before this file loaded,
// capture args and replay below.
window._studioAuthReady = (function() {
    let _queued = null;
    function ready(authInstance, googleProvider, emailPassModule) {
        _queued = [authInstance, googleProvider, emailPassModule];
        // After auth.js fully parses, _studioAuthReady will be replaced and replayed.
    }
    ready._getQueued = () => _queued;
    return ready;
})();


// ─── Sign-In Modal Styles ──────────────────────────────────────────────────
(function injectAuthStyles() {
    if (document.getElementById('_auth_styles')) return;
    const s = document.createElement('style');
    s.id = '_auth_styles';
    s.textContent = `
    /* ── Auth Overlay ── */
    #auth-overlay {
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(6, 11, 24, 0.85);
        backdrop-filter: blur(12px);
        display: flex; align-items: center; justify-content: center;
        opacity: 0; visibility: hidden;
        transition: opacity 0.25s ease, visibility 0.25s ease;
    }
    #auth-overlay.open {
        opacity: 1; visibility: visible;
    }
    #auth-modal {
        background: #0f1929;
        border: 1px solid #1e3a5f;
        border-radius: 20px;
        padding: 36px 32px;
        width: 100%;
        max-width: 400px;
        margin: 16px;
        box-shadow: 0 25px 60px rgba(0,0,0,0.6);
        transform: scale(0.93) translateY(16px);
        transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
        font-family: 'Inter', sans-serif;
    }
    #auth-overlay.open #auth-modal {
        transform: scale(1) translateY(0);
    }
    .auth-lock-icon {
        text-align: center; font-size: 44px; margin-bottom: 12px;
        animation: authPulse 2s ease-in-out infinite;
    }
    @keyframes authPulse {
        0%,100% { filter: drop-shadow(0 0 12px rgba(59,130,246,0.4)); }
        50%      { filter: drop-shadow(0 0 24px rgba(139,92,246,0.7)); }
    }
    .auth-title {
        text-align: center;
        font-size: 1.25rem; font-weight: 700;
        background: linear-gradient(135deg, #60a5fa, #a78bfa);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        margin-bottom: 6px;
    }
    .auth-subtitle {
        text-align: center;
        font-size: 0.8rem; color: #64748b;
        margin-bottom: 24px; line-height: 1.5;
    }
    .auth-google-btn {
        display: flex; align-items: center; justify-content: center; gap: 10px;
        width: 100%; padding: 12px;
        background: #ffffff; color: #1a1a1a;
        border: none; border-radius: 10px;
        font-size: 14px; font-weight: 700;
        cursor: pointer; font-family: 'Inter', sans-serif;
        transition: transform 0.15s, box-shadow 0.15s;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .auth-google-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.4); }
    .auth-google-btn:active { transform: scale(0.97); }
    .auth-google-logo { width: 20px; height: 20px; }
    .auth-divider {
        display: flex; align-items: center; gap: 10px;
        margin: 18px 0; color: #334155; font-size: 12px;
    }
    .auth-divider::before, .auth-divider::after {
        content: ''; flex: 1; height: 1px; background: #1e3a5f;
    }
    .auth-input {
        width: 100%; background: #060b18;
        border: 1px solid #1e3a5f; border-radius: 8px;
        color: #f1f5f9; font-family: 'Inter', sans-serif;
        font-size: 13px; padding: 10px 14px; margin-bottom: 10px;
        outline: none; transition: border-color 0.2s; box-sizing: border-box;
    }
    .auth-input:focus { border-color: #3b82f6; }
    .auth-input::placeholder { color: #475569; }
    .auth-email-btn {
        width: 100%; padding: 11px;
        background: linear-gradient(135deg, #3b82f6, #8b5cf6);
        color: white; border: none; border-radius: 8px;
        font-size: 13px; font-weight: 700; font-family: 'Inter', sans-serif;
        cursor: pointer; transition: opacity 0.2s;
    }
    .auth-email-btn:hover { opacity: 0.88; }
    .auth-toggle {
        text-align: center; margin-top: 10px;
        font-size: 12px; color: #64748b;
    }
    .auth-toggle a { color: #60a5fa; cursor: pointer; text-decoration: none; }
    .auth-toggle a:hover { text-decoration: underline; }
    .auth-error {
        background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3);
        color: #f87171; border-radius: 7px; padding: 9px 12px;
        font-size: 12px; margin-bottom: 10px; display: none;
    }
    .auth-close {
        position: absolute; top: 14px; right: 18px;
        background: none; border: none; color: #475569;
        font-size: 20px; cursor: pointer; line-height: 1;
        transition: color 0.2s;
    }
    .auth-close:hover { color: #f1f5f9; }

    /* ── Nav Auth Button ── */
    #dock-auth-btn {
        display: flex; align-items: center; gap: 6px;
        background: #1a2744; border: 1px solid #1e3a5f;
        color: #f1f5f9; border-radius: 30px;
        padding: 5px 10px 5px 6px; font-size: 12px; font-weight: 600;
        cursor: pointer; font-family: 'Inter', sans-serif;
        transition: all 0.2s; white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    #dock-auth-btn:hover { background: #223060; border-color: #3b82f6; }
    #dock-auth-btn .auth-avatar {
        width: 22px; height: 22px; border-radius: 50%;
        object-fit: cover; border: 1px solid #3b82f6;
    }
    #dock-auth-btn .auth-avatar-letter {
        width: 22px; height: 22px; border-radius: 50%;
        background: linear-gradient(135deg, #3b82f6, #8b5cf6);
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 700; color: white;
    }
    #dock-auth-btn .auth-dropdown {
        position: absolute; top: calc(100% + 6px); right: 0;
        background: #0f1929; border: 1px solid #1e3a5f;
        border-radius: 10px; padding: 6px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        display: none; min-width: 160px; z-index: 100;
    }
    #dock-auth-btn.show-dropdown .auth-dropdown { display: block; }
    .auth-dropdown-item {
        display: block; width: 100%; background: none;
        border: none; color: #94a3b8; font-family: 'Inter', sans-serif;
        font-size: 12px; text-align: left; padding: 8px 12px;
        border-radius: 7px; cursor: pointer; transition: 0.15s;
    }
    .auth-dropdown-item:hover { background: rgba(255,255,255,0.06); color: #f1f5f9; }
    .auth-dropdown-item.danger { color: #f87171; }
    .auth-dropdown-item.danger:hover { background: rgba(239,68,68,0.1); }

    /* ── Loading state ── */
    #auth-overlay .auth-loading {
        display: flex; align-items: center; justify-content: center; gap: 8px;
        padding: 8px; color: #64748b; font-size: 13px;
    }
    .auth-spinner {
        width: 16px; height: 16px;
        border: 2px solid rgba(59,130,246,0.25);
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: authSpin 0.7s linear infinite;
    }
    @keyframes authSpin { to { transform: rotate(360deg); } }

    /* Gated feature lock badge */
    .gated-lock-badge {
        display: inline-block;
        background: rgba(245,158,11,0.15);
        border: 1px solid rgba(245,158,11,0.35);
        color: #fbbf24;
        font-size: 10px; font-weight: 600;
        padding: 1px 6px; border-radius: 5px;
        margin-left: 4px; vertical-align: middle;
    }
    `;
    document.head.appendChild(s);
})();

// ─── Modal HTML ────────────────────────────────────────────────────────────
function _ensureAuthModal() {
    if (document.getElementById('auth-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.innerHTML = `
    <div id="auth-modal" style="position:relative;">
        <button class="auth-close" onclick="window._authCloseModal()">✕</button>
        <div class="auth-lock-icon">🔐</div>
        <div class="auth-title">Sign In Required</div>
        <div class="auth-subtitle" id="auth-modal-reason">
            Yeh feature use karne ke liye please sign in karein.
        </div>
        <div class="auth-error" id="auth-error-msg"></div>
        <!-- Google -->
        <button class="auth-google-btn" id="auth-google-btn" onclick="window._signInWithGoogle()">
            <svg class="auth-google-logo" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
        </button>
        <div class="auth-divider">ya Email se</div>
        <!-- Email form -->
        <div id="auth-email-form">
            <input type="email" class="auth-input" id="auth-email" placeholder="Email address" autocomplete="email">
            <input type="password" class="auth-input" id="auth-password" placeholder="Password (min 6 characters)" autocomplete="current-password">
            <button class="auth-email-btn" id="auth-email-submit-btn" onclick="window._signInWithEmail()">Sign In with Email</button>
            <div class="auth-toggle">
                <span id="auth-toggle-text">Nayi account banana hai? </span>
                <a id="auth-toggle-link" onclick="window._toggleAuthMode()">Sign Up</a>
            </div>
        </div>
        <div style="margin-top:14px; text-align:center;">
            <button onclick="window._authCloseModal()" style="background:none;border:none;color:#475569;font-size:11px;cursor:pointer;font-family:inherit;">
                ✕ Cancel — Guest mode mein continue karein
            </button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
}

// ─── Auth State ────────────────────────────────────────────────────────────
let _authCurrentUser = null;
let _authPendingCallback = null;
let _authMode = 'signin'; // 'signin' | 'signup'

// Called by the page's module script once auth is ready
window._studioAuthReady = function(authInstance, googleProviderInstance, emailPassModule) {
    window._firebaseAuth = authInstance;
    window._googleProvider = googleProviderInstance;
    window._emailPassModule = emailPassModule;

    authInstance.onAuthStateChanged(user => {
        _authCurrentUser = user;
        _renderDockAuthBtn(user);

        if (user) {
            // Update presence with real name
            _updatePresenceWithUser(user);
            // Save user to RTDB users node
            _saveUserToRTDB(user);
            // Close modal if open
            const overlay = document.getElementById('auth-overlay');
            if (overlay && overlay.classList.contains('open')) {
                overlay.classList.remove('open');
                if (_authPendingCallback) {
                    _authPendingCallback();
                    _authPendingCallback = null;
                }
            }
        }
    });
};

// ─── requireSignIn ─────────────────────────────────────────────────────────
// Call this at the start of any gated function
window.requireSignIn = function(reason, callback) {
    if (_authCurrentUser) {
        callback();
        return;
    }
    _authPendingCallback = callback;
    _ensureAuthModal();
    const reasonEl = document.getElementById('auth-modal-reason');
    if (reasonEl) reasonEl.textContent = reason || 'Yeh feature use karne ke liye please sign in karein.';
    const overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.classList.add('open');
};

// ─── Modal close ───────────────────────────────────────────────────────────
window._authCloseModal = function() {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.classList.remove('open');
    _authPendingCallback = null;
};

// ─── Toggle signin/signup mode ─────────────────────────────────────────────
window._toggleAuthMode = function() {
    _authMode = _authMode === 'signin' ? 'signup' : 'signin';
    const toggleText = document.getElementById('auth-toggle-text');
    const toggleLink = document.getElementById('auth-toggle-link');
    const submitBtn  = document.getElementById('auth-email-submit-btn');
    if (_authMode === 'signup') {
        if (toggleText) toggleText.textContent = 'Already have an account? ';
        if (toggleLink) toggleLink.textContent = 'Sign In';
        if (submitBtn)  submitBtn.textContent = 'Create Account';
    } else {
        if (toggleText) toggleText.textContent = 'Nayi account banana hai? ';
        if (toggleLink) toggleLink.textContent = 'Sign Up';
        if (submitBtn)  submitBtn.textContent = 'Sign In with Email';
    }
    _clearAuthError();
};

// ─── Google Sign-In ─────────────────────────────────────────────────────────
window._signInWithGoogle = async function() {
    if (!window._firebaseAuth || !window._googleProvider) {
        _showAuthError('Auth system abhi load ho raha hai, ek second ruko...');
        return;
    }
    const btn = document.getElementById('auth-google-btn');
    if (btn) btn.disabled = true;
    _clearAuthError();
    try {
        const { signInWithPopup } = window._emailPassModule;
        await signInWithPopup(window._firebaseAuth, window._googleProvider);
        // onAuthStateChanged will handle the rest
    } catch (e) {
        _showAuthError(_friendlyError(e));
        if (btn) btn.disabled = false;
    }
};

// ─── Email Sign-In / Sign-Up ────────────────────────────────────────────────
window._signInWithEmail = async function() {
    const email = document.getElementById('auth-email')?.value.trim();
    const pass  = document.getElementById('auth-password')?.value;
    if (!email || !pass) { _showAuthError('Email aur password dono fill karein.'); return; }
    const btn = document.getElementById('auth-email-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Please wait...'; }
    _clearAuthError();
    try {
        const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = window._emailPassModule;
        if (_authMode === 'signup') {
            await createUserWithEmailAndPassword(window._firebaseAuth, email, pass);
        } else {
            await signInWithEmailAndPassword(window._firebaseAuth, email, pass);
        }
    } catch (e) {
        _showAuthError(_friendlyError(e));
        if (btn) { btn.disabled = false; btn.textContent = _authMode === 'signup' ? 'Create Account' : 'Sign In with Email'; }
    }
};

// ─── Sign Out ───────────────────────────────────────────────────────────────
window.signOutUser = async function() {
    if (!window._firebaseAuth) return;
    try {
        await window._firebaseAuth.signOut();
        _authCurrentUser = null;
        _renderDockAuthBtn(null);
    } catch(e) {}
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function _showAuthError(msg) {
    const el = document.getElementById('auth-error-msg');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
}
function _clearAuthError() {
    const el = document.getElementById('auth-error-msg');
    if (el) el.style.display = 'none';
}
function _friendlyError(e) {
    const code = e.code || '';
    if (code.includes('popup-closed')) return 'Sign-in popup band ho gayi. Dobara try karein.';
    if (code.includes('user-not-found')) return 'Yeh email registered nahi hai. Sign Up karein.';
    if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'Password galat hai. Dobara try karein.';
    if (code.includes('email-already-in-use')) return 'Yeh email already registered hai. Sign In karein.';
    if (code.includes('weak-password')) return 'Password kam se kam 6 characters ka hona chahiye.';
    if (code.includes('network-request-failed')) return 'Network error. Internet connection check karein.';
    return e.message || 'Sign-in fail ho gaya. Dobara try karein.';
}

// ─── Dock Auth Button ────────────────────────────────────────────────────────
function _renderDockAuthBtn(user) {
    let btn = document.getElementById('dock-auth-btn');
    const dock = document.getElementById('floating-right-dock');
    if (!dock) return;

    if (!btn) {
        btn = document.createElement('div');
        btn.id = 'dock-auth-btn';
        btn.style.position = 'relative';
        dock.insertBefore(btn, dock.firstChild);
    }

    if (user) {
        const name = user.displayName || user.email?.split('@')[0] || 'User';
        const initial = name.charAt(0).toUpperCase();
        const photoURL = user.photoURL;
        btn.innerHTML = `
            ${photoURL
                ? `<img class="auth-avatar" src="${photoURL}" alt="${initial}">`
                : `<div class="auth-avatar-letter">${initial}</div>`}
            <span>${name.split(' ')[0]}</span>
            <div class="auth-dropdown">
                <div style="padding:8px 12px 6px; font-size:11px; color:#475569; border-bottom:1px solid #1e3a5f; margin-bottom:4px;">
                    ${user.email || ''}
                </div>
                <button class="auth-dropdown-item danger" onclick="signOutUser(); document.getElementById('dock-auth-btn').classList.remove('show-dropdown');">🚪 Sign Out</button>
            </div>`;
        btn.onclick = (e) => {
            e.stopPropagation();
            btn.classList.toggle('show-dropdown');
        };
        document.addEventListener('click', () => btn.classList.remove('show-dropdown'), { once: true });
    } else {
        btn.innerHTML = `<span>🔑 Sign In</span>`;
        btn.onclick = () => { _ensureAuthModal(); document.getElementById('auth-overlay').classList.add('open'); };
    }
}

// ─── Presence update with real user info ──────────────────────────────────
function _updatePresenceWithUser(user) {
    if (!window._studioDB || !window._studioRef || !window._studioPresenceRef) return;
    try {
        const { set } = window._emailPassModule || {};
        if (!set) return;
        const pageName = document.title.includes('Video') ? 'Video Studio' : 'Image Studio';
        const presRef = window._studioPresenceRef;
        window._studioDB && window._studioRef && presRef && window._studioDB.app && (() => {
            // Use the global set from firebase
        })();
        // Use exposed set function
        if (window._studioSetPresence) {
            window._studioSetPresence({
                label: user.displayName || user.email?.split('@')[0] || 'User',
                email: user.email || '',
                photoURL: user.photoURL || '',
                uid: user.uid,
                page: pageName,
                lastSeen: Date.now(),
                authenticated: true
            });
        }
    } catch(e) {}
}

// ─── Save user to RTDB users node ────────────────────────────────────────
function _saveUserToRTDB(user) {
    function doSave() {
        try {
            const db  = window._studioDB;
            const ref = window._studioRef;
            if (!db || !ref) return;
            const userData = {
                displayName: user.displayName || user.email?.split('@')[0] || 'User',
                email: user.email || '',
                photoURL: user.photoURL || '',
                provider: user.providerData?.[0]?.providerId || 'password',
                uid: user.uid,
                lastLogin: Date.now(),
                createdAt: user.metadata?.creationTime ? new Date(user.metadata.creationTime).getTime() : Date.now()
            };
            if (window._studioSetUser) {
                window._studioSetUser(user.uid, userData);
            }
        } catch(e) {}
    }
    if (window._studioDB) { doSave(); }
    else { document.addEventListener('studioRtdbReady', doSave, { once: true }); }
}

// ─── Replay Queued Initialization (if called before script finished) ──────
if (typeof _preAuthInitQueue !== 'undefined' && _preAuthInitQueue) {
    window._studioAuthReady(..._preAuthInitQueue);
} else if (window._studioAuthReady && typeof window._studioAuthReady._getQueued === 'function') {
    const q = window._studioAuthReady._getQueued();
    if (q) window._studioAuthReady(...q);
}
