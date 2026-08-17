/**
 * Jolly Nobel AI Studio — Shared Enterprise Module (js/common.js)
 * Shared Utilities, Caching, Security Encryption, Copyright Shield, and Language Engines.
 */

// ── 1. SECURITY & ENCRYPTION CONSTANTS ────────────────────────────────
const SECURITY_SALT = "JollyNobelSecuritySalt2026";
const DEFAULT_ENCRYPTED_KEY = "CyYWDSo3LT0jBAE0V0FFEBomERg8H3RzZ1AsCRlVQSorLCYvYw0i";
const DEFAULT_ADMIN_PIN = "1234";

function decryptKey(encBase64) {
    try {
        const binary = atob(encBase64);
        let dec = '';
        for (let i = 0; i < binary.length; i++) {
            dec += String.fromCharCode(binary.charCodeAt(i) ^ SECURITY_SALT.charCodeAt(i % SECURITY_SALT.length));
        }
        return dec;
    } catch (e) { return null; }
}

function encryptKey(plainStr) {
    let enc = '';
    for (let i = 0; i < plainStr.length; i++) {
        enc += String.fromCharCode(plainStr.charCodeAt(i) ^ SECURITY_SALT.charCodeAt(i % SECURITY_SALT.length));
    }
    return btoa(enc);
}

function getApiKey() {
    // 1. User's personal key (if entered due to quota limit or voluntarily)
    const userOwnEnc = localStorage.getItem('GEMINI_USER_CUSTOM_KEY');
    if (userOwnEnc) {
        const dec = decryptKey(userOwnEnc);
        if (dec) return dec;
    }

    // 2. Admin key set in admin panel
    const savedEnc = localStorage.getItem('GEMINI_SECURE_KEY');
    if (savedEnc) {
        const dec = decryptKey(savedEnc);
        if (dec) return dec;
    }

    // 3. Default embedded shared key
    return decryptKey(DEFAULT_ENCRYPTED_KEY);
}

function setUserCustomApiKey() {
    const userOwnEnc = localStorage.getItem('GEMINI_USER_CUSTOM_KEY');
    let currentStatus = "Currently using: Default Shared API Key";
    if (userOwnEnc) {
        const dec = decryptKey(userOwnEnc);
        const masked = dec && dec.length > 8 ? dec.substring(0, 4) + '...' + dec.substring(dec.length - 4) : '****';
        currentStatus = `Currently using: YOUR Personal Key [${masked}]`;
    }

    const newKey = prompt(
        `🔑 Personal Gemini API Key Settings\n${currentStatus}\n\n` +
        `If the shared API limit is full, you can use your own FREE Gemini API Key:\n` +
        `1. Get a free key at: https://aistudio.google.com/app/apikey\n` +
        `2. Paste your API Key below (or leave empty to reset to Default Shared Key):`
    );

    if (newKey !== null) {
        const trimmed = newKey.trim();
        if (trimmed === "") {
            localStorage.removeItem('GEMINI_USER_CUSTOM_KEY');
            alert("✅ Reset to Default Shared API Key!");
        } else if (trimmed.startsWith("AIza")) {
            const enc = encryptKey(trimmed);
            localStorage.setItem('GEMINI_USER_CUSTOM_KEY', enc);
            alert("✅ Personal Gemini API Key saved! Tool will now use your key.");
        } else {
            alert("⚠️ Key format galat hai. Valid Gemini API key 'AIza...' se shuru hoti hai.");
        }
    }
}

function checkAndHandleQuotaError(errDataOrMsg) {
    const errStr = typeof errDataOrMsg === 'object' ? JSON.stringify(errDataOrMsg) : String(errDataOrMsg);
    const isQuota = /quota|429|RESOURCE_EXHAUSTED|limit|exceeded|RATE_LIMIT/i.test(errStr);

    if (isQuota) {
        if (confirm("⚠️ Shared API Key Limit Reached!\n\nDefault API Key ki daily quota limit full ho gayi hai.\n\nKya aap apni FREE Gemini API Key enter karna chahte hain taaki tool chalta rahe?\n(Free Key yahan se lein: https://aistudio.google.com/app/apikey)")) {
            setUserCustomApiKey();
        }
        return true;
    }
    return false;
}

// ── 2. DYNAMIC MODEL DISCOVERY WITH CACHING (SESSIONSTORAGE TTL) ───────
async function fetchBestAvailableModel(apiKey) {
    // Check sessionStorage cache (TTL: 1 Hour)
    const cached = sessionStorage.getItem('GEMINI_MODEL_CACHE');
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.timestamp < 3600000 && parsed.modelInfo) {
                return parsed.modelInfo;
            }
        } catch (e) { console.warn("Cache parse error", e); }
    }

    const versions = ['v1beta', 'v1'];
    const preferredModels = [
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3.7-flash",
        "gemini-3.1-flash-lite",
        "gemini-3-flash-preview",
        "gemini-2.0-flash",
        "gemini-pro-latest"
    ];

    for (const ver of versions) {
        try {
            const listUrl = `https://generativelanguage.googleapis.com/${ver}/models?key=${apiKey}`;
            const response = await fetch(listUrl);
            const resJson = await response.json();

            if (resJson.error) {
                console.warn(`ListModels error on ${ver}:`, resJson.error);
                continue;
            }

            if (resJson.models && Array.isArray(resJson.models)) {
                const textModels = resJson.models.filter(m =>
                    m.supportedGenerationMethods &&
                    m.supportedGenerationMethods.includes("generateContent") &&
                    !m.name.includes("embedding") &&
                    !m.name.includes("imagen") &&
                    !m.name.includes("aqa") &&
                    !m.name.includes("2.5-flash") &&
                    !m.name.includes("1.5-flash") &&
                    !m.name.includes("1.5-pro")
                );

                if (textModels.length > 0) {
                    let selectedInfo = null;
                    for (const pref of preferredModels) {
                        const found = textModels.find(m => m.name.includes(pref));
                        if (found) {
                            selectedInfo = { modelPath: found.name, apiVersion: ver };
                            break;
                        }
                    }
                    if (!selectedInfo) {
                        selectedInfo = { modelPath: textModels[0].name, apiVersion: ver };
                    }

                    // Save to sessionStorage cache
                    sessionStorage.setItem('GEMINI_MODEL_CACHE', JSON.stringify({
                        timestamp: Date.now(),
                        modelInfo: selectedInfo
                    }));

                    return selectedInfo;
                }
            }
        } catch (err) {
            console.warn(`Failed to list models on ${ver}:`, err);
        }
    }

    const defaultFallback = { modelPath: 'models/gemini-3.6-flash', apiVersion: 'v1beta' };
    sessionStorage.setItem('GEMINI_MODEL_CACHE', JSON.stringify({
        timestamp: Date.now(),
        modelInfo: defaultFallback
    }));
    return defaultFallback;
}

// ── 3. COPYRIGHT SAFE REWRITE DICTIONARY & ENGINE ──────────────────────
const COPYRIGHT_MAP = [
    // Marvel
    { r: /\b(hulk|bruce banner)\b/gi,            s: 'emerald-skinned giant warrior' },
    { r: /\b(iron man|tony stark)\b/gi,           s: 'armored tech billionaire hero' },
    { r: /\b(spider[- ]?man|peter parker)\b/gi,  s: 'agile wall-crawling masked hero' },
    { r: /\b(thor)\b/gi,                          s: 'ancient lightning god warrior' },
    { r: /\b(captain america|steve rogers)\b/gi, s: 'patriotic super soldier warrior' },
    { r: /\b(black widow|natasha)\b/gi,           s: 'elite female spy fighter' },
    { r: /\b(wolverine|logan)\b/gi,               s: 'feral claw-wielding mutant warrior' },
    { r: /\b(deadpool|wade wilson)\b/gi,          s: 'masked mercenary anti-hero' },
    { r: /\b(thanos)\b/gi,                        s: 'colossal purple-skinned cosmic warlord' },
    { r: /\b(venom)\b/gi,                         s: 'black symbiote alien warrior' },
    { r: /\b(black panther|t.?challa)\b/gi,      s: 'vibranium-suited African king warrior' },
    { r: /\b(doctor strange|stephen strange)\b/gi,s: 'mystical sorcerer supreme warrior' },
    { r: /\b(loki)\b/gi,                          s: 'trickster god of mischief' },
    { r: /\b(groot)\b/gi,                         s: 'giant sentient tree creature' },
    { r: /\b(rocket raccoon)\b/gi,                s: 'genetically modified raccoon warrior' },
    // DC
    { r: /\b(superman|clark kent|kal.?el)\b/gi,  s: 'caped solar-powered alien hero' },
    { r: /\b(batman|bruce wayne)\b/gi,            s: 'dark caped vigilante hero' },
    { r: /\b(wonder woman|diana prince)\b/gi,    s: 'warrior princess with golden lasso' },
    { r: /\b(the flash|barry allen)\b/gi,         s: 'scarlet-suited speedster hero' },
    { r: /\b(aquaman|arthur curry)\b/gi,          s: 'trident-wielding ocean king warrior' },
    { r: /\b(joker)\b/gi,                         s: 'chaotic clown-faced anarchist villain' },
    { r: /\b(lex luthor)\b/gi,                    s: 'bald genius billionaire villain' },
    { r: /\b(cyborg|victor stone)\b/gi,           s: 'half-human cybernetic hero' },
    // Disney / Pixar
    { r: /\b(mickey mouse)\b/gi,                  s: 'cheerful round-eared cartoon mouse' },
    { r: /\b(elsa)\b/gi,                          s: 'ice-powered blonde queen' },
    { r: /\b(moana)\b/gi,                         s: 'Polynesian ocean voyager princess' },
    // Game Characters
    { r: /\b(mario|super mario)\b/gi,             s: 'mustachioed plumber hero in red cap' },
    { r: /\b(sonic the hedgehog|sonic)\b/gi,      s: 'blue supersonic hedgehog hero' },
    { r: /\b(master chief)\b/gi,                  s: 'armored space marine soldier' },
    { r: /\b(kratos)\b/gi,                        s: 'ash-covered god-slaying Spartan warrior' },
    { r: /\b(link)\b/gi,                          s: 'green-tunic elven sword hero' },
    { r: /\b(geralt|witcher)\b/gi,                s: 'white-haired monster hunter warrior' },
    // Anime
    { r: /\b(goku|son goku)\b/gi,                 s: 'spiky-haired martial arts warrior with golden aura' },
    { r: /\b(naruto uzumaki|naruto)\b/gi,         s: 'orange-suited ninja with whisker marks' },
    { r: /\b(luffy|monkey d\.? luffy)\b/gi,       s: 'straw-hat wearing rubber-bodied pirate captain' },
    { r: /\b(saitama|one punch man)\b/gi,         s: 'bald caped overpowered hero' },
    { r: /\b(zoro|roronoa zoro)\b/gi,             s: 'three-sword-wielding green-haired swordsman' },
    // Bollywood / South
    { r: /\b(salman khan)\b/gi,                   s: 'muscular Bollywood action hero' },
    { r: /\b(shahrukh khan|srk)\b/gi,             s: 'charming Bollywood romantic hero' },
    { r: /\b(rajinikanth|thalaiva)\b/gi,          s: 'iconic South Indian action superstar' },
    { r: /\b(allu arjun)\b/gi,                    s: 'stylish Telugu action hero with signature moves' },
    // Other
    { r: /\b(harry potter)\b/gi,                  s: 'young wizard with round glasses and lightning scar' },
    { r: /\b(gandalf)\b/gi,                       s: 'ancient long-bearded wizard in grey robes' },
    { r: /\b(darth vader)\b/gi,                   s: 'black-helmeted dark side commander villain' },
    { r: /\b(yoda)\b/gi,                          s: 'small green ancient alien Jedi master' },
    { r: /\b(jack sparrow|captain jack)\b/gi,     s: 'eccentric dreadlocked pirate captain' },
];

function copyrightSafeRewrite() {
    const el = document.getElementById('subject-input');
    if (!el) return;
    let text = el.value;
    let changed = false;
    COPYRIGHT_MAP.forEach(({ r, s }) => {
        if (r.test(text)) {
            text = text.replace(r, s);
            changed = true;
        }
    });
    if (changed) {
        el.value = text;
        if (typeof updatePrompt === 'function') updatePrompt();
        if (typeof triggerAutoSaveConcept === 'function') triggerAutoSaveConcept(300);
        alert('✅ Copyright names replaced with safe alternatives!\nPlease review and edit as needed.');
    } else {
        alert('✅ No copyrighted character names detected in your prompt!');
    }
}

// ── 4. LANGUAGE ENGINES (HINGLISH & HINDI TRANSLATOR) ───────────────────
async function convertHinglishToEnglishPrompt() {
    const inputEl = document.getElementById('subject-input');
    if (!inputEl) return;
    const currentText = inputEl.value.trim();
    if (!currentText) {
        alert("Pehle Hinglish ya Hindi me idea enter karein! (e.g. 'ek kala ghoda baarish me daud raha hai')");
        return;
    }

    const apiKey = getApiKey();
    if (!apiKey) { alert("Pehle Admin Panel se API Key configure karein!"); return; }

    const loading = document.getElementById('loading');
    if (loading) {
        loading.innerText = '🇮🇳 Hinglish / Hindi ko English AI Prompt me convert kiya ja raha hai...';
        loading.style.display = 'block';
    }

    try {
        const modelInfo = await fetchBestAvailableModel(apiKey);
        const apiUrl = `https://generativelanguage.googleapis.com/${modelInfo.apiVersion}/${modelInfo.modelPath}:generateContent?key=${apiKey}`;

        const systemPrompt = `You are an expert AI Prompt Engineer and Hinglish/Hindi to English translator.
The user entered an idea in Hinglish or Hindi: "${currentText}".
Convert and expand this into a highly descriptive, cinematic, professional English AI Prompt suitable for Midjourney, Imagen 3, Sora, and Runway. Remove any copyrighted character names.
Return ONLY the final English prompt string, no markdown, no quotes, no intro or extra conversational text.`;

        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt }] }]
            })
        });

        const data = await res.json();
        if (loading) loading.style.display = 'none';

        if (data.error) {
            if (checkAndHandleQuotaError(data.error)) return;
            alert("Gemini API Error: " + data.error.message);
            return;
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
            inputEl.value = text.trim().replace(/^["']|["']$/g, '');
            if (typeof updatePrompt === 'function') updatePrompt();
            if (typeof autoDetectCharactersFromConcept === 'function') autoDetectCharactersFromConcept();
            if (typeof triggerAutoSaveConcept === 'function') triggerAutoSaveConcept(300);
            alert("✅ Hinglish/Hindi idea English AI Prompt me convert ho gaya!");
        } else {
            alert("Translation fail ho gaya. Kripya dobara try karein.");
        }
    } catch (err) {
        if (loading) loading.style.display = 'none';
        alert("Translation Error: " + err.message);
    }
}

async function translatePromptToHindi() {
    const promptOutput = document.getElementById('prompt-output')?.textContent;
    if (!promptOutput || promptOutput === 'Generating...') {
        alert("Pehle ek prompt generate hone dein!");
        return;
    }

    const apiKey = getApiKey();
    if (!apiKey) { alert("Pehle Admin Panel se API Key configure karein!"); return; }

    const box = document.getElementById('hindi-translation-box');
    const textEl = document.getElementById('hindi-translation-text');
    if (box) box.style.display = 'block';
    if (textEl) textEl.textContent = '⚡ Gemini Hindi me anuvaad kar raha hai...';

    try {
        const modelInfo = await fetchBestAvailableModel(apiKey);
        const apiUrl = `https://generativelanguage.googleapis.com/${modelInfo.apiVersion}/${modelInfo.modelPath}:generateContent?key=${apiKey}`;

        const systemPrompt = `Translate the following AI Image/Video Prompt into clear Devanagari Hindi and simple Hinglish so a Hindi user understands every detail clearly:
"${promptOutput}"

Format your response nicely as:
🇮🇳 **हिंदी अनुवाद (Hindi):**
[Hindi translation here]

🗣️ **Hinglish samjhein:**
[Simple Hinglish explanation here]`;

        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt }] }]
            })
        });

        const data = await res.json();
        if (data.error) {
            if (checkAndHandleQuotaError(data.error)) return;
            if (textEl) textEl.textContent = '❌ Error: ' + data.error.message;
            return;
        }
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text && textEl) {
            textEl.textContent = text.trim();
        } else if (textEl) {
            textEl.textContent = '❌ Anuvaad nahi ho saka.';
        }
    } catch (err) {
        if (textEl) textEl.textContent = '❌ Error: ' + err.message;
    }
}

// ── 5. PROOFREADING ENGINE ─────────────────────────────────────────────
async function proofreadText(rawPromptText) {
    const apiKey = getApiKey();
    if (!apiKey) {
        alert("Pehle Admin Panel se API Key configure karein!");
        return null;
    }

    const activeModelInfo = await fetchBestAvailableModel(apiKey);
    if (!activeModelInfo) return null;

    const systemPrompt = `You are an expert AI Prompt Proofreader and Grammar Specialist.
Check and correct any grammatical errors, spelling mistakes, awkward phrasing, or typos in this prompt: "${rawPromptText}".
Return ONLY the corrected, polished prompt phrase in clean English. Do not include introductory text or quotes.`;

    const apiUrl = `https://generativelanguage.googleapis.com/${activeModelInfo.apiVersion}/${activeModelInfo.modelPath}:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt }] }]
            })
        });

        const data = await response.json();
        if (data.error) {
            checkAndHandleQuotaError(data.error);
            return null;
        }
        const candidate = data.candidates?.[0];
        if (candidate && candidate.content?.parts?.[0]?.text) {
            return candidate.content.parts[0].text.trim().replace(/^["']|["']$/g, '');
        }
    } catch (err) {
        console.error("Proofread Error:", err);
    }
    return null;
}

// ── 6. UTILITIES: DEBOUNCE & DOM SECURITY SANITIZATION ──────────────────
function debounce(func, wait = 150) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
const escapeHtml = escapeHTML;

function safeSetText(elementId, text) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = text;
}

// ── 7. APP UI THEME SWITCHER ───────────────────────────────────────────
function changeAppTheme(themeName) {
    if (themeName === 'default') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', themeName);
    }
    localStorage.setItem('APP_THEME', themeName);
}

(function initSavedTheme() {
    const savedTheme = localStorage.getItem('APP_THEME');
    if (savedTheme) changeAppTheme(savedTheme);
})();

// ── 7.5 API ERROR FEEDBACK BANNER ──────────────────────────────────────
(function injectErrorBannerCSS() {
    const css = document.createElement('style');
    css.textContent = `
        .api-error-banner {
            background: linear-gradient(135deg, #1e0000, #2d1215);
            border: 1px solid #7f1d1d;
            border-radius: 12px;
            padding: 16px 20px;
            margin: 12px 0;
            animation: errorSlideIn 0.35s ease;
        }
        @keyframes errorSlideIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .api-error-banner .aeb-header {
            display: flex; align-items: center; gap: 8px;
            font-size: 14px; font-weight: 700; color: #fca5a5;
            margin-bottom: 8px;
        }
        .api-error-banner .aeb-header .aeb-pulse {
            width: 8px; height: 8px; border-radius: 50%;
            background: #ef4444; display: inline-block;
            animation: aebPulse 1.2s ease infinite;
        }
        @keyframes aebPulse {
            0%,100% { opacity:1; transform:scale(1); }
            50% { opacity:0.4; transform:scale(0.7); }
        }
        .api-error-banner .aeb-msg {
            font-size: 12px; color: #d4d4d8; line-height: 1.6;
            margin-bottom: 12px; word-break: break-word;
        }
        .api-error-banner .aeb-actions {
            display: flex; gap: 8px; flex-wrap: wrap;
        }
        .api-error-banner .aeb-btn {
            padding: 8px 16px; border-radius: 8px; font-size: 12px;
            font-weight: 700; cursor: pointer; border: none;
            transition: 0.2s; text-decoration: none; display: inline-flex;
            align-items: center; gap: 5px;
        }
        .aeb-btn-feedback {
            background: #f59e0b; color: #0f172a;
            animation: aebGlow 1.5s ease infinite alternate;
        }
        @keyframes aebGlow {
            from { box-shadow: 0 0 4px rgba(245,158,11,0.3); }
            to   { box-shadow: 0 0 16px rgba(245,158,11,0.6); }
        }
        .aeb-btn-feedback:hover {
            background: #fbbf24; transform: translateY(-1px);
        }
        .aeb-btn-retry {
            background: #334155; color: #e2e8f0;
        }
        .aeb-btn-retry:hover { background: #475569; }
        .aeb-btn-dismiss {
            background: transparent; color: #64748b; font-weight: 500;
        }
        .aeb-btn-dismiss:hover { color: #94a3b8; }
    `;
    document.head.appendChild(css);
})();

/**
 * showApiErrorBanner - Shows an inline error + highlighted feedback button
 * @param {string} errorMsg - The API error message
 * @param {HTMLElement|string} containerOrId - Container element or its ID to insert banner into
 * @param {Function} [retryFn] - Optional retry function to call on "Try Again"
 */
function showApiErrorBanner(errorMsg, containerOrId, retryFn) {
    try {
        const container = typeof containerOrId === 'string'
            ? document.getElementById(containerOrId)
            : containerOrId;
        if (!container) { alert(errorMsg); return; }

        // Remove any existing banner in this container
        const old = container.querySelectorAll('.api-error-banner');
        old.forEach(el => el.remove());

        const currentPage = location.pathname.split('/').pop() || 'index.html';

        // Pre-fill feedback data in sessionStorage for the feedback page
        const feedbackCtx = {
            autoCategory: 'bug',
            autoPage: currentPage.includes('video') ? 'Video Studio (video.html)' : 'Image Studio (index.html)',
            autoMessage: `API Error: ${errorMsg}\n\nPage: ${currentPage}\nTime: ${new Date().toLocaleString('en-IN')}\nBrowser: ${navigator.userAgent.substring(0, 80)}`
        };
        try { sessionStorage.setItem('FEEDBACK_PREFILL', JSON.stringify(feedbackCtx)); } catch(e){}

        const banner = document.createElement('div');
        banner.className = 'api-error-banner';
        banner.innerHTML = `
            <div class="aeb-header">
                <span class="aeb-pulse"></span>
                ⚠️ API Error / High Demand Detected
            </div>
            <div class="aeb-msg">
                ${escapeHTML(String(errorMsg))}
            </div>
            <div class="aeb-actions">
                <a href="feedback.html" class="aeb-btn aeb-btn-feedback">
                    💬 Report This Issue
                </a>
                <button class="aeb-btn" style="background:#059669; color:white;" onclick="setUserCustomApiKey()">
                    🔑 Use My Own Key
                </button>
                ${retryFn ? '<button class="aeb-btn aeb-btn-retry" id="aeb-retry-btn">🔄 Try Again</button>' : ''}
                <button class="aeb-btn aeb-btn-dismiss" onclick="this.closest('.api-error-banner').remove()">✕ Dismiss</button>
            </div>
        `;
        container.prepend(banner);

        // Attach retry handler (clears model cache to force fresh discovery)
        if (retryFn) {
            const retryBtn = banner.querySelector('#aeb-retry-btn');
            if (retryBtn) retryBtn.onclick = function() {
                try { sessionStorage.removeItem('GEMINI_MODEL_CACHE'); } catch(e){}
                banner.remove();
                retryFn();
            };
        }

        banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch(err) {
        console.error("Error displaying banner:", err);
        alert(errorMsg);
    }
}

// ── 8. FLOATING RIGHT-SIDE ACTION DOCK (Always Visible) ─────────────────
(function initRightDock() {
    const dockCSS = document.createElement('style');
    dockCSS.textContent = `
        .floating-right-dock {
            position: fixed;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            gap: 8px;
            pointer-events: auto;
        }

        .dock-item {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            text-decoration: none;
            background: #1e293b;
            border: 1px solid #334155;
            color: #f8fafc;
            border-radius: 30px;
            padding: 6px 12px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 14px rgba(0,0,0,0.35);
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            backdrop-filter: blur(8px);
            white-space: nowrap;
        }

        .dock-item .dock-icon {
            font-size: 16px;
            margin-left: 6px;
        }

        .dock-item .dock-text {
            font-size: 12px;
            line-height: 1;
        }

        .dock-item:hover {
            transform: translateX(-4px) scale(1.04);
            box-shadow: 0 6px 20px rgba(0,0,0,0.5);
        }

        .dock-feedback {
            background: linear-gradient(135deg, #f59e0b, #d97706);
            border-color: #fbbf24;
            color: #0f172a !important;
            font-weight: 700;
            animation: dockPulse 2s infinite alternate;
        }
        @keyframes dockPulse {
            from { box-shadow: 0 0 4px rgba(245, 158, 11, 0.4); }
            to   { box-shadow: 0 0 16px rgba(245, 158, 11, 0.8); }
        }

        .dock-tour {
            background: linear-gradient(135deg, #3b82f6, #6366f1);
            border-color: #60a5fa;
            color: #ffffff !important;
        }

        .dock-key {
            background: #065f46;
            border-color: #059669;
            color: #a7f3d0 !important;
        }

        .dock-admin {
            background: #1e1e2e;
            border-color: #4b5563;
            color: #cbd5e1 !important;
        }

        .dock-themes {
            display: flex;
            gap: 4px;
            background: #0f172a;
            border: 1px solid #334155;
            padding: 4px 8px;
            border-radius: 20px;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .dock-theme-btn {
            background: #1e293b;
            border: none;
            border-radius: 50%;
            width: 22px;
            height: 22px;
            font-size: 11px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: 0.2s;
            padding: 0;
        }
        .dock-theme-btn:hover { transform: scale(1.2); }

        @media (max-width: 600px) {
            .floating-right-dock {
                right: 6px;
                top: auto;
                bottom: 16px;
                transform: none;
                flex-direction: row;
                gap: 6px;
                background: rgba(15, 23, 42, 0.85);
                padding: 6px;
                border-radius: 40px;
                border: 1px solid #334155;
            }
            .dock-item .dock-text { display: none; }
            .dock-item { padding: 8px; border-radius: 50%; }
            .dock-item .dock-icon { margin-left: 0; }
            .dock-themes { display: none; }
        }
    `;
    document.head.appendChild(dockCSS);

    function createDock() {
        if (document.getElementById('floating-right-dock')) return;

        const dock = document.createElement('div');
        dock.id = 'floating-right-dock';
        dock.className = 'floating-right-dock';

        dock.innerHTML = `
            <a href="feedback.html" class="dock-item dock-feedback" title="Apna Feedback ya Bug Report dein">
                <span class="dock-text">💬 Feedback</span>
                <span class="dock-icon">💬</span>
            </a>
            <button type="button" class="dock-item dock-tour" onclick="if(typeof startTour==='function'){startTour();}" title="Interactive Hinglish Tour Guide">
                <span class="dock-text">🧭 Tour Guide</span>
                <span class="dock-icon">🧭</span>
            </button>
            <button type="button" class="dock-item dock-key" onclick="setUserCustomApiKey()" title="Enter your personal Gemini API Key">
                <span class="dock-text">🔑 My API Key</span>
                <span class="dock-icon">🔑</span>
            </button>
            <div class="dock-themes" title="Theme badlein">
                <button type="button" class="dock-theme-btn" onclick="changeAppTheme('default')" title="Default Dark">🌙</button>
                <button type="button" class="dock-theme-btn" onclick="changeAppTheme('cyberpunk')" style="background:#a855f7;" title="Cyberpunk">🟣</button>
                <button type="button" class="dock-theme-btn" onclick="changeAppTheme('emerald')" style="background:#10b981;" title="Emerald">🟢</button>
                <button type="button" class="dock-theme-btn" onclick="changeAppTheme('oled')" style="background:#334155;" title="OLED">🖤</button>
            </div>
        `;

        document.body.appendChild(dock);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createDock);
    } else {
        createDock();
    }
})();

