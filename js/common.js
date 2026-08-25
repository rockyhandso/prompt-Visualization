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
    { r: /\b(doctor doom|dr\.? doom|victor von doom)\b/gi, s: 'masked green-cloaked metal-faced monarch villain' },
    { r: /\b(avengers?|the avengers?)\b/gi,       s: 'legendary superhero alliance team' },
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
    // Indian Cricketers & Athletes (Public Figures often blocked by AI Safety)
    { r: /\b(virat kohli|virat|king kohli)\b/gi,         s: 'athletic bearded Indian master cricket batsman with intense focus in sports jersey' },
    { r: /\b(ms dhoni|m\.?s\.? dhoni|dhoni|mahi|thala)\b/gi, s: 'calm legendary Indian cricket captain wicketkeeper in number 7 jersey' },
    { r: /\b(rohit sharma|hitman)\b/gi,                  s: 'power-hitting Indian cricket captain batsman playing a pull shot' },
    { r: /\b(sachin tendulkar|sachin)\b/gi,              s: 'legendary master blaster Indian cricket batsman in white protective gear' },
    { r: /\b(cristiano ronaldo|ronaldo|cr7)\b/gi,        s: 'chiseled athletic Portuguese football champion in jersey' },
    { r: /\b(lionel messi|messi)\b/gi,                   s: 'agile bearded Argentine football maestro in number 10 jersey' },
    // Public Leaders & Visionaries
    { r: /\b(narendra modi|pm modi)\b/gi,                s: 'distinguished Indian statesman leader with silver beard in traditional kurta jacket' },
    { r: /\b(elon musk)\b/gi,                            s: 'tech billionaire aerospace visionary innovator' },
    // Bollywood / South
    { r: /\b(salman khan|bhaijaan)\b/gi,                 s: 'muscular Bollywood action hero with blue turquoise bracelet' },
    { r: /\b(shahrukh khan|shah rukh khan|srk)\b/gi,     s: 'charming charismatic Bollywood romantic hero with dimpled smile' },
    { r: /\b(amitabh bachchan|big b)\b/gi,               s: 'tall legendary Indian cinema veteran actor with silver French beard' },
    { r: /\b(rajinikanth|thalaiva)\b/gi,                 s: 'iconic South Indian action superstar with signature sunglasses' },
    { r: /\b(allu arjun|pushpa)\b/gi,                    s: 'stylish Telugu action hero with rugged intense look' },
    // Other
    { r: /\b(harry potter)\b/gi,                         s: 'young wizard with round glasses and lightning scar' },
    { r: /\b(gandalf)\b/gi,                              s: 'ancient long-bearded wizard in grey robes' },
    { r: /\b(darth vader)\b/gi,                          s: 'black-helmeted dark side commander villain' },
    { r: /\b(yoda)\b/gi,                                 s: 'small green ancient alien Jedi master' },
    { r: /\b(jack sparrow|captain jack)\b/gi,            s: 'eccentric dreadlocked pirate captain' },
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

// ── 4. SLIDE-OUT SIDE DRAWER (OFFCANVAS MENU) ──────────────────────────
function _createDrawerDOM() {
    if (location.pathname.includes('admin') || location.pathname.includes('users') || location.pathname.includes('insights')) return;
    if (document.getElementById('slide-drawer-panel')) return;
    if (!document.body) return;

    // Inject styles
    if (!document.getElementById('_drawer_styles')) {
        const s = document.createElement('style');
        s.id = '_drawer_styles';
        s.textContent = `
            #slide-drawer-backdrop {
                position: fixed; inset: 0; z-index: 9998;
                background: rgba(6, 11, 24, 0.65);
                backdrop-filter: blur(6px);
                opacity: 0; visibility: hidden;
                pointer-events: none;
                transition: opacity 0.3s ease, visibility 0.3s ease;
            }
            #slide-drawer-backdrop.open {
                opacity: 1; visibility: visible;
                pointer-events: auto;
            }
            #slide-drawer-panel {
                position: fixed; top: 0; right: 0; bottom: 0; width: 330px; max-width: 88vw;
                background: rgba(15, 25, 41, 0.98);
                backdrop-filter: blur(20px);
                border-left: 1px solid #1e3a5f;
                box-shadow: -15px 0 50px rgba(0,0,0,0.7);
                z-index: 9999;
                transform: translateX(100%);
                transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
                display: flex; flex-direction: column;
                padding: 22px; box-sizing: border-box; overflow-y: auto;
                font-family: 'Inter', system-ui, -apple-system, sans-serif;
            }
            #slide-drawer-panel.open {
                transform: translateX(0);
            }
            .drawer-section {
                margin-bottom: 18px;
                padding-bottom: 14px;
                border-bottom: 1px solid #1e3a5f;
            }
            .drawer-title {
                font-size: 11px; font-weight: 700; color: #818cf8;
                text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px;
            }
            .drawer-theme-btn {
                display: flex; align-items: center; justify-content: space-between;
                width: 100%; padding: 8px 12px; border-radius: 8px;
                background: #060b18; border: 1px solid #1e3a5f; color: #f8fafc;
                font-size: 12px; font-weight: 600; cursor: pointer; margin-bottom: 6px;
                transition: all 0.2s ease;
            }
            .drawer-theme-btn:hover {
                border-color: #6366f1; transform: translateX(3px); background: #111c30;
            }
        `;
        document.head.appendChild(s);
    }

    const backdrop = document.createElement('div');
    backdrop.id = 'slide-drawer-backdrop';
    backdrop.onclick = toggleSlideDrawer;
    document.body.appendChild(backdrop);

    const drawer = document.createElement('div');
    drawer.id = 'slide-drawer-panel';
    drawer.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; border-bottom:1px solid #1e3a5f; padding-bottom:12px;">
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:18px;">⚙️</span>
                <span style="font-weight:800; font-size:14px; color:#f8fafc; letter-spacing:0.5px;">Studio Quick Menu</span>
            </div>
            <button type="button" onclick="toggleSlideDrawer()" style="background:#111c30; border:1px solid #1e3a5f; color:#94a3b8; font-size:14px; font-weight:bold; cursor:pointer; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;">✕</button>
        </div>

        <!-- 1. ACCOUNT & SIGN IN -->
        <div class="drawer-section">
            <div class="drawer-title">👤 Account &amp; Access</div>
            <div id="drawer-auth-content"></div>
        </div>

        <!-- 2. THEME SELECTOR -->
        <div class="drawer-section">
            <div class="drawer-title">🎨 Visual Themes</div>
            <button type="button" class="drawer-theme-btn" onclick="changeAppTheme('default')"><span>🌌 Indigo Blue (Default)</span><span>🔵</span></button>
            <button type="button" class="drawer-theme-btn" onclick="changeAppTheme('cyberpunk')"><span>🔮 Cyberpunk Neon</span><span>🟣</span></button>
            <button type="button" class="drawer-theme-btn" onclick="changeAppTheme('emerald')"><span>🌲 Emerald Studio</span><span>🟢</span></button>
            <button type="button" class="drawer-theme-btn" onclick="changeAppTheme('oled')"><span>🖤 OLED Midnight Dark</span><span>⚫</span></button>
        </div>

        <!-- 3. PERSONAL API KEY -->
        <div class="drawer-section">
            <div class="drawer-title">🗝️ Custom Gemini API Key</div>
            <p style="font-size:11px; color:#94a3b8; line-height:1.4; margin-bottom:8px;">Agar shared limit full ho jaye toh apni free Gemini Key use karein.</p>
            <button type="button" class="btn" style="background:#111c30; border:1px solid #1e3a5f; color:#38bdf8; font-size:12px; padding:9px;" onclick="setUserCustomApiKey()">🗝️ Update Personal API Key</button>
        </div>

        <!-- 4. TOUR GUIDE -->
        <div class="drawer-section">
            <div class="drawer-title">🧭 App Walkthrough</div>
            <button type="button" class="btn" style="background:#111c30; border:1px solid #10b981; color:#34d399; font-size:12px; padding:9px;" onclick="toggleSlideDrawer(); if(typeof startTour==='function') startTour();">🧭 Start Interactive Tour</button>
        </div>

        <!-- 5. FEEDBACK -->
        <div>
            <a href="feedback.html" style="display:block; text-align:center; padding:10px; background:#060b18; border:1px solid #1e3a5f; border-radius:8px; color:#94a3b8; font-size:12px; text-decoration:none; font-weight:600;">
                💬 Send Feedback or Report Bug
            </a>
        </div>
    `;
    document.body.appendChild(drawer);
    _updateDrawerAuthInfo();
}

function toggleSlideDrawer() {
    let drawer = document.getElementById('slide-drawer-panel');
    let backdrop = document.getElementById('slide-drawer-backdrop');
    if (!drawer || !backdrop) {
        _createDrawerDOM();
        drawer = document.getElementById('slide-drawer-panel');
        backdrop = document.getElementById('slide-drawer-backdrop');
    }
    if (!drawer || !backdrop) return;

    const isOpen = drawer.classList.contains('open');
    if (isOpen) {
        drawer.classList.remove('open');
        backdrop.classList.remove('open');
    } else {
        drawer.classList.add('open');
        backdrop.classList.add('open');
        _updateDrawerAuthInfo();
    }
}
window.toggleSlideDrawer = toggleSlideDrawer;
window._createDrawerDOM = _createDrawerDOM;

function _updateDrawerAuthInfo() {
    const userContainer = document.getElementById('drawer-auth-content');
    if (!userContainer) return;
    const u = window._firebaseAuth ? window._firebaseAuth.currentUser : null;
    if (u) {
        const name = u.displayName || u.email?.split('@')[0] || 'User';
        const photo = u.photoURL;
        userContainer.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:10px; background:#060b18; border:1px solid #1e3a5f; border-radius:10px; margin-bottom:8px;">
                ${photo ? `<img src="${photo}" style="width:36px; height:36px; border-radius:50%; border:1px solid #6366f1;">` : `<div style="width:36px; height:36px; border-radius:50%; background:#6366f1; color:white; display:flex; align-items:center; justify-content:center; font-weight:bold;">${name.charAt(0).toUpperCase()}</div>`}
                <div style="overflow:hidden;">
                    <div style="font-weight:700; color:#f8fafc; font-size:13px;">${name}</div>
                    <div style="font-size:11px; color:#94a3b8; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${u.email || ''}</div>
                </div>
            </div>
            <a href="dashboard.html" style="display:block; text-align:center; padding:9px; background:linear-gradient(135deg,#0f2d4a,#1e1b4b); border:1px solid #6366f1; border-radius:8px; color:#818cf8; font-size:12px; font-weight:700; text-decoration:none; margin-bottom:6px;">📊 My Dashboard</a>
            <button type="button" class="btn" style="background:#ef4444; padding:8px; font-size:12px; border-radius:8px;" onclick="if(typeof signOutUser==='function') signOutUser(); _updateDrawerAuthInfo();">🚪 Sign Out</button>
        `;
    } else {
        userContainer.innerHTML = `
            <div style="font-size:12px; color:#94a3b8; margin-bottom:8px;">Sign in to save prompts &amp; access advanced AI director features.</div>
            <button type="button" class="btn" style="background:linear-gradient(135deg, #6366f1, #8b5cf6); padding:10px; font-size:12px; border-radius:8px;" onclick="toggleSlideDrawer(); if(typeof _ensureAuthModal==='function'){_ensureAuthModal(); document.getElementById('auth-overlay').classList.add('open');}">🔑 Sign In with Google / Email</button>
        `;
    }
}

// Auto-init on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _createDrawerDOM);
} else {
    _createDrawerDOM();
}


// ── 5. AI PROMPT AUDITOR & PLATFORM OPTIMIZER ENGINE ─────────────────
let _optimizerCurrentResult = null;

(function injectOptimizerStyles() {
    if (document.getElementById('_optimizer_styles')) return;
    const s = document.createElement('style');
    s.id = '_optimizer_styles';
    s.textContent = `
    #optimizer-modal-overlay {
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(6, 11, 24, 0.85); backdrop-filter: blur(12px);
        display: flex; align-items: center; justify-content: center;
        opacity: 0; visibility: hidden; pointer-events: none;
        transition: opacity 0.25s ease, visibility 0.25s ease;
    }
    #optimizer-modal-overlay.open { opacity: 1; visibility: visible; pointer-events: auto; }
    #optimizer-modal-box {
        background: #0f1929; border: 1px solid #1e3a5f; border-radius: 20px;
        padding: 28px; width: 100%; max-width: 620px; max-height: 90vh; overflow-y: auto;
        margin: 16px; box-shadow: 0 25px 60px rgba(0,0,0,0.6); font-family: 'Inter', sans-serif;
        color: #f1f5f9; position: relative; box-sizing: border-box;
    }
    .opt-title {
        font-size: 1.2rem; font-weight: 700;
        background: linear-gradient(135deg, #38bdf8, #8b5cf6);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        margin-bottom: 4px; display: flex; align-items: center; gap: 8px;
    }
    .opt-subtitle { font-size: 0.78rem; color: #64748b; margin-bottom: 18px; line-height: 1.4; }
    .opt-platform-selector { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
    .opt-plat-btn {
        background: #060b18; border: 1px solid #1e3a5f; color: #94a3b8;
        padding: 7px 12px; border-radius: 8px; font-size: 12px; font-weight: 600;
        cursor: pointer; transition: all 0.2s; font-family: inherit;
    }
    .opt-plat-btn:hover { border-color: #38bdf8; color: #f1f5f9; }
    .opt-plat-btn.active {
        background: linear-gradient(135deg, #0284c7, #6366f1);
        border-color: #38bdf8; color: #ffffff; box-shadow: 0 2px 10px rgba(2,132,199,0.4);
    }
    .opt-run-btn {
        width: 100%; padding: 12px;
        background: linear-gradient(135deg, #10b981, #059669);
        color: white; border: none; border-radius: 10px;
        font-size: 13px; font-weight: 700; font-family: inherit;
        cursor: pointer; transition: opacity 0.2s; margin-bottom: 18px;
        display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .opt-run-btn:hover { opacity: 0.9; }
    .opt-score-card {
        background: #060b18; border: 1px solid #1e3a5f; border-radius: 12px;
        padding: 14px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between;
    }
    .opt-score-num { font-size: 1.8rem; font-weight: 800; }
    .opt-score-num.high { color: #34d399; }
    .opt-score-num.medium { color: #fbbf24; }
    .opt-score-num.low { color: #f87171; }
    .opt-issue-card {
        background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25);
        border-radius: 10px; padding: 10px 14px; margin-bottom: 8px;
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
    }
    .opt-issue-card.quality {
        background: rgba(245,158,11,0.08); border-color: rgba(245,158,11,0.25);
    }
    .opt-replace-btn {
        background: #3b82f6; border: none; color: white;
        padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;
        cursor: pointer; transition: 0.15s; font-family: inherit; flex-shrink: 0;
    }
    .opt-replace-btn:hover { background: #2563eb; }
    .opt-result-box {
        background: #060b18; border: 1px solid #1e3a5f; border-radius: 10px;
        padding: 12px; font-family: monospace; font-size: 12px; color: #38bdf8;
        line-height: 1.5; margin-bottom: 14px; white-space: pre-wrap; word-break: break-word;
    }
    .opt-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .opt-action-btn {
        padding: 10px; border: none; border-radius: 8px; font-size: 12px; font-weight: 700;
        cursor: pointer; font-family: inherit; transition: opacity 0.2s; text-align: center;
    }
    .opt-action-btn.apply { background: linear-gradient(135deg, #10b981, #3b82f6); color: white; }
    .opt-action-btn.copy { background: #1e293b; color: #f1f5f9; border: 1px solid #334155; }
    .opt-action-btn:hover { opacity: 0.88; }
    `;
    document.head.appendChild(s);
})();

function _ensureOptimizerModalHTML() {
    if (document.getElementById('optimizer-modal-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'optimizer-modal-overlay';
    overlay.innerHTML = `
    <div id="optimizer-modal-box">
        <button onclick="closePromptOptimizerModal()" style="position:absolute;top:16px;right:18px;background:none;border:none;color:#64748b;font-size:20px;cursor:pointer;">✕</button>
        <div class="opt-title">🚀 AI Audit &amp; Platform Optimizer</div>
        <div class="opt-subtitle">
            Prompt ko copyright safety &amp; platform compliance ke liye analyze karein. Risky words identify honge aur target AI generator ke liye ideal format banega.
        </div>

        <div style="font-size:11px; font-weight:600; color:#94a3b8; text-transform:uppercase; margin-bottom:6px; letter-spacing:0.5px;">1. Target AI Platform Select Karein:</div>
        <div class="opt-platform-selector">
            <button class="opt-plat-btn active" data-plat="midjourney" onclick="_selectOptPlatform(this)">🎨 Midjourney (v6 / Niji)</button>
            <button class="opt-plat-btn" data-plat="imagen3" onclick="_selectOptPlatform(this)">🖼️ Imagen 3 / DALL-E 3</button>
            <button class="opt-plat-btn" data-plat="sora_veo" onclick="_selectOptPlatform(this)">🎬 Sora / Runway / Veo</button>
            <button class="opt-plat-btn" data-plat="flux_sd" onclick="_selectOptPlatform(this)">⚡ Flux / Stable Diffusion</button>
            <button class="opt-plat-btn" data-plat="generic" onclick="_selectOptPlatform(this)">🌐 Universal / All AI</button>
        </div>

        <div style="font-size:11px; font-weight:600; color:#94a3b8; text-transform:uppercase; margin-bottom:6px; letter-spacing:0.5px;">2. Prompt Text To Audit:</div>
        <textarea id="opt-input-text" class="input-box" rows="3" style="width:100%; font-family:inherit; font-size:12px; margin-bottom:14px; box-sizing:border-box;" placeholder="Audit karne ke liye prompt enter karein..."></textarea>

        <button class="opt-run-btn" id="opt-run-btn" onclick="runPromptOptimizer()">
            <span>🔍 Run AI Audit &amp; Optimize Prompt</span>
        </button>

        <div id="opt-results-container" style="display:none;"></div>
    </div>`;
    document.body.appendChild(overlay);
}

let _selectedOptPlatform = 'midjourney';
function _selectOptPlatform(btn) {
    document.querySelectorAll('.opt-plat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _selectedOptPlatform = btn.getAttribute('data-plat');
}

function openPromptOptimizerModal() {
    _ensureOptimizerModalHTML();
    const currentSubject = document.getElementById('subject-input')?.value.trim() || '';
    const textEl = document.getElementById('opt-input-text');
    if (textEl) textEl.value = currentSubject || 'a superhero fighting doctor doom in new york city';
    const overlay = document.getElementById('optimizer-modal-overlay');
    if (overlay) overlay.classList.add('open');
}

function closePromptOptimizerModal() {
    const overlay = document.getElementById('optimizer-modal-overlay');
    if (overlay) overlay.classList.remove('open');
}

async function runPromptOptimizer() {
    // ── Sign-In Gate Check ──
    if (typeof requireSignIn === 'function') {
        const user = window._firebaseAuth?.currentUser;
        if (!user) {
            requireSignIn(
                '🚀 AI Prompt Optimizer use karne ke liye please sign in karein.',
                () => runPromptOptimizer()
            );
            return;
        }
    }

    const textInput = document.getElementById('opt-input-text')?.value.trim();
    if (!textInput) {
        alert("Pehle check karne ke liye prompt text enter karein!");
        return;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
        alert("Gemini API Key nahi mili. Admin panel se set karein.");
        return;
    }

    const runBtn = document.getElementById('opt-run-btn');
    const container = document.getElementById('opt-results-container');
    if (runBtn) { runBtn.disabled = true; runBtn.innerHTML = `<span>⚡ Analyzing prompt compliance &amp; copyright risks...</span>`; }
    if (container) { container.style.display = 'none'; }

    try {
        const modelInfo = await fetchBestAvailableModel(apiKey);
        const apiUrl = `https://generativelanguage.googleapis.com/${modelInfo.apiVersion}/${modelInfo.modelPath}:generateContent?key=${apiKey}`;

        const platNames = {
            'midjourney': 'Midjourney (v6 / Niji 6)',
            'imagen3': 'Google Imagen 3 & DALL-E 3',
            'sora_veo': 'OpenAI Sora, Google Veo, and Runway Gen-3 Video Motion',
            'flux_sd': 'Flux.1 & Stable Diffusion XL',
            'generic': 'Universal AI Image & Video Generators'
        };

        const targetName = platNames[_selectedOptPlatform] || 'AI Image Generators';

        const systemPrompt = `You are a world-class AI Prompt Auditor, Copyright Safety & Public Figure Policy Specialist.
The user wants to audit and optimize a prompt for target generator: "${targetName}".
Prompt text: "${textInput}".

CRITICAL INSTRUCTIONS:
1. PUBLIC FIGURES, CELEBRITIES & LIVING PEOPLE (e.g. Virat Kohli, MS Dhoni, Rohit Sharma, Modi, actors, athletes, politicians):
   - AI image and video models (DALL-E 3, Midjourney, Imagen 3, Sora, Flux, Runway) strictly block or reject prompts containing names of real living public figures / celebrities to prevent deepfakes and policy violations.
   - You MUST detect any real celebrity/public figure name and replace it with an extremely vivid, detailed visual descriptive surrogate (e.g. for "Virat Kohli" -> "athletic bearded Indian master cricket batsman with intense focus in blue national team jersey raising his bat in victory").
2. COPYRIGHT & TRADEMARKS:
   - Replace any Marvel, DC, Disney, Anime, studio, brand, or trademarked characters with vivid descriptive equivalents.
3. PRESERVE DIALOGUES & SCRIPT BLOCKS:
   - If the original prompt contains spoken lines, quotes, or character script blocks (e.g. [Cinematic Character Script: ...], "character says ..."), YOU MUST KEEP THEM INTACT!
4. QUALITY & FORMAT:
   - Optimize visual description, composition, lighting, camera angles, and atmospheric cues tailored for ${targetName}.

Tasks:
1. Identify all copyrighted characters, studio names, trademarked logos, or public figures / celebrity names.
2. Scan for forbidden/weak buzzwords (e.g. "photorealistic", "4K", "8K" if discouraged on ${targetName}).
3. Re-write the prompt into a high-converting, 100% policy-compliant, copyright-safe, descriptive prompt tailored for ${targetName}.
4. Provide a quality & safety score out of 100.

Return ONLY a valid JSON object matching this exact schema:
{
  "score": 88,
  "copyrightIssues": [
    { "word": "Virat Kohli", "replacement": "athletic bearded Indian master cricket batsman in sports jersey", "reason": "Public figure name blocked by AI safety policy" }
  ],
  "qualitySuggestions": [
    { "original": "photorealistic", "replacement": "shot on 35mm camera, soft skin detail", "reason": "Midjourney v6 prefers camera parameters over generic quality buzzwords" }
  ],
  "platformAdvice": "Specific formatting advice for ${targetName}",
  "optimizedPrompt": "fully rewritten policy-compliant, copyright-safe descriptive prompt string WITH ALL DIALOGUES & SPOKEN LINES INTACT"
}`;

        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const data = await res.json();
        if (runBtn) { runBtn.disabled = false; runBtn.innerHTML = `<span>🔍 Run AI Audit &amp; Optimize Prompt</span>`; }

        if (data.error) {
            if (typeof checkAndHandleQuotaError === 'function' && checkAndHandleQuotaError(data.error)) return;
            alert("Gemini API Error: " + data.error.message);
            return;
        }

        const candidate = data.candidates?.[0];
        if (!candidate?.content?.parts?.[0]?.text) {
            alert("Gemini se response nahi mil paya. Please try again.");
            return;
        }

        let rawText = candidate.content.parts[0].text.trim();
        rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        const auditData = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
        _optimizerCurrentResult = auditData;

        _renderOptimizerResults(auditData);

    } catch (err) {
        if (runBtn) { runBtn.disabled = false; runBtn.innerHTML = `<span>🔍 Run AI Audit &amp; Optimize Prompt</span>`; }
        alert("Optimizer Error: " + err.message);
    }
}

function _renderOptimizerResults(data) {
    const container = document.getElementById('opt-results-container');
    if (!container) return;

    const score = data.score || 80;
    const scoreClass = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';
    const scoreBadge = score >= 80 ? '🟢 Excellent & Safe' : score >= 50 ? '🟡 Moderate Risk / Can Improve' : '🔴 High Risk / Action Needed';

    let issuesHtml = '';

    const copyrightIssues = data.copyrightIssues || [];
    const qualitySuggestions = data.qualitySuggestions || [];

    if (copyrightIssues.length === 0 && qualitySuggestions.length === 0) {
        issuesHtml = `<div style="padding:10px; background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.3); color:#4ade80; border-radius:8px; font-size:12px; margin-bottom:12px;">
            ✅ Koi major copyright risk ya forbidden word nahi mila! Prompt clean lag raha hai.
        </div>`;
    } else {
        copyrightIssues.forEach(iss => {
            issuesHtml += `
            <div class="opt-issue-card">
                <div>
                    <div style="font-size:12px; font-weight:700; color:#f87171;">🚫 ${escapeHTML(iss.word)} ➔ <span style="color:#4ade80;">${escapeHTML(iss.replacement)}</span></div>
                    <div style="font-size:11px; color:#94a3b8; margin-top:2px;">⚠️ ${escapeHTML(iss.reason)}</div>
                </div>
                <button class="opt-replace-btn" onclick="_replaceSingleWordInConcept('${escapeHTML(iss.word).replace(/'/g,"\\'")}', '${escapeHTML(iss.replacement).replace(/'/g,"\\'")}')">Replace</button>
            </div>`;
        });

        qualitySuggestions.forEach(q => {
            issuesHtml += `
            <div class="opt-issue-card quality">
                <div>
                    <div style="font-size:12px; font-weight:700; color:#fbbf24;">⚡ "${escapeHTML(q.original)}" ➔ <span style="color:#60a5fa;">"${escapeHTML(q.replacement)}"</span></div>
                    <div style="font-size:11px; color:#94a3b8; margin-top:2px;">💡 ${escapeHTML(q.reason)}</div>
                </div>
                <button class="opt-replace-btn" style="background:#8b5cf6;" onclick="_replaceSingleWordInConcept('${escapeHTML(q.original).replace(/'/g,"\\'")}', '${escapeHTML(q.replacement).replace(/'/g,"\\'")}')">Replace</button>
            </div>`;
        });
    }

    container.innerHTML = `
        <div class="opt-score-card">
            <div>
                <div style="font-size:11px; color:#94a3b8; font-weight:600; text-transform:uppercase;">Audit &amp; Compliance Score</div>
                <div style="font-size:12px; color:#cbd5e1; font-weight:500; margin-top:2px;">${scoreBadge}</div>
            </div>
            <div class="opt-score-num ${scoreClass}">${score}/100</div>
        </div>

        ${data.platformAdvice ? `
        <div style="background:#060b18; border:1px solid #1e3a5f; border-radius:10px; padding:10px 12px; margin-bottom:12px; font-size:12px; color:#cbd5e1; line-height:1.4;">
            <strong style="color:#38bdf8;">💡 Platform Recommendation:</strong> ${escapeHTML(data.platformAdvice)}
        </div>` : ''}

        <div style="font-size:11px; font-weight:600; color:#94a3b8; text-transform:uppercase; margin-bottom:6px; letter-spacing:0.5px;">Words to Optimize / Fix:</div>
        ${issuesHtml}

        <div style="font-size:11px; font-weight:600; color:#94a3b8; text-transform:uppercase; margin-top:14px; margin-bottom:6px; letter-spacing:0.5px;">Target Platform Optimized Prompt:</div>
        <div class="opt-result-box" id="opt-result-text">${escapeHTML(data.optimizedPrompt || '')}</div>

        <div class="opt-actions">
            <button class="opt-action-btn apply" onclick="applyOptimizedPrompt()">✨ Apply All Optimizations to Concept</button>
            <button class="opt-action-btn copy" onclick="copyOptimizedPromptText()">📋 Copy Prompt</button>
        </div>
    `;

    container.style.display = 'block';
}

function _replaceSingleWordInConcept(targetWord, replacementWord) {
    const inputEl = document.getElementById('subject-input');
    if (!inputEl) return;
    const regex = new RegExp('\\b' + targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
    if (regex.test(inputEl.value)) {
        inputEl.value = inputEl.value.replace(regex, replacementWord);
        if (typeof updatePrompt === 'function') updatePrompt();
        if (typeof triggerAutoSaveConcept === 'function') triggerAutoSaveConcept(300);
        alert(`✅ '${targetWord}' replaced with '${replacementWord}' in your Base Concept!`);
    } else {
        alert(`Word '${targetWord}' not found in current Base Concept text.`);
    }
}

function applyOptimizedPrompt() {
    if (!_optimizerCurrentResult || !_optimizerCurrentResult.optimizedPrompt) return;
    const inputEl = document.getElementById('subject-input');
    if (inputEl) {
        inputEl.value = _optimizerCurrentResult.optimizedPrompt;
        if (typeof updatePrompt === 'function') updatePrompt();
        if (typeof triggerAutoSaveConcept === 'function') triggerAutoSaveConcept(300);
        closePromptOptimizerModal();
        alert("✅ Optimized prompt Base Concept mein apply ho gaya!");
    }
}

function copyOptimizedPromptText() {
    const text = document.getElementById('opt-result-text')?.textContent;
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => alert("Optimized prompt copied!"));
    } else {
        alert("Optimized prompt text: " + text);
    }
}

// ── 6. INSTANT LIVE AI IMAGE PREVIEW ENGINE (GEMINI IMAGEN 3 + FLUX DUAL ENGINE) ──
let _currentLiveImgSeed = Math.floor(Math.random() * 1000000);

async function _getCleanEnglishVisualPrompt() {
    const isHinglishRegex = /[\u0900-\u097F]|\b(ki|ke|ka|ko|me|mein|par|pe|chal|raha|rahi|rahe|hai|hain|ek|aur|karo|badao|ladka|ladki|baarish|sadak|raja|pani|pahar|sher|ghoda|gaon|dost|gadi|purana|naya|chota|bada)\b/i;

    // 1. Try to get already generated English prompt (must NOT contain Hinglish or placeholders)
    const candidates = [
        document.getElementById('imagen-prompt-output')?.innerText,
        document.getElementById('flux-prompt-output')?.innerText,
        document.getElementById('prompt-output')?.innerText
    ];

    for (const cand of candidates) {
        if (cand && !cand.includes('Generating') && !cand.includes('generate ho raha') && !cand.includes('convert kar raha') && cand.length > 25) {
            if (!isHinglishRegex.test(cand)) {
                // It's a clean English prompt
                return cand.replace(/--ar\s+[0-9:]+/gi, '').replace(/--v\s+[0-9.]+/gi, '').replace(/--no\s+[^,]+/gi, '').replace(/[\n\r]+/g, ' ').trim();
            }
        }
    }

    // 2. If it's in Hinglish or raw concept, convert and expand with Gemini
    const rawConcept = document.getElementById('subject-input')?.value?.trim() || "Mumbai rain cyberpunk king";
    const apiKey = typeof getApiKey === 'function' ? getApiKey() : null;

    if (apiKey) {
        try {
            const modelInfo = await fetchBestAvailableModel(apiKey);
            if (modelInfo) {
                const apiUrl = `https://generativelanguage.googleapis.com/${modelInfo.apiVersion}/${modelInfo.modelPath}:generateContent?key=${apiKey}`;
                const promptReq = `You are a world-class prompt engineer for Google Imagen 3 and Midjourney.
Convert this raw user idea: "${rawConcept}" into a single, highly detailed, photorealistic 8k English image description.
Include detailed characters (e.g. Indian king in high-tech glowing cyberpunk armor and ornate neon crown), environment (wet Mumbai street in heavy monsoon rain), Devanagari Hindi neon signboards, auto-rickshaws, wet asphalt puddles reflecting neon lights, cinematic lighting, 8k resolution.
Return ONLY the final English description string, no quotes, no markdown.`;
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: promptReq }] }] })
                });
                const data = await res.json();
                const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text && text.trim().length > 15) {
                    const cleanText = text.trim().replace(/^["']|["']$/g, '');
                    // Sync with output boxes if empty
                    const outImg = document.getElementById('imagen-prompt-output');
                    if (outImg && (outImg.innerText.includes('Generating') || isHinglishRegex.test(outImg.innerText))) {
                        outImg.innerText = cleanText;
                    }
                    return cleanText;
                }
            }
        } catch (e) {
            console.warn("Visual prompt translation error:", e);
        }
    }

    // Fallback English expansion if API is offline
    if (isHinglishRegex.test(rawConcept)) {
        return "An Indian king in glowing futuristic cyberpunk armor and crown walking on a wet Mumbai street during heavy monsoon rain at night, neon Hindi signboards, auto-rickshaws, wet cobblestone reflections, cinematic lighting, 8k photorealistic";
    }

    return rawConcept;
}

async function generateLiveImagePreview(forceRegen = false) {
    const box = document.getElementById('live-image-preview-box');
    const placeholder = document.getElementById('live-img-placeholder');
    const loading = document.getElementById('live-img-loading');
    const wrap = document.getElementById('live-img-wrap');
    const img = document.getElementById('live-ai-img-element');

    if (box) box.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
    if (loading) {
        loading.style.display = 'block';
        loading.innerHTML = `<div class="loading-spinner" style="display:inline-block; margin-right:8px;"></div>⚡ Gemini &amp; AI Image Engine se photo render ho rahi hai... (takes 2-4 seconds)`;
    }
    if (wrap) wrap.style.display = 'none';

    if (forceRegen) {
        _currentLiveImgSeed = Math.floor(Math.random() * 1000000);
    }

    // Get active aspect ratio
    const ratioTag = document.querySelector('#ratio-tags .tag.active');
    const ratio = ratioTag ? ratioTag.getAttribute('data-ratio') : '1:1';
    let width = 1024, height = 1024;
    let imagenRatio = "1:1";
    if (ratio === '16:9') { width = 1280; height = 720; imagenRatio = "16:9"; }
    else if (ratio === '9:16') { width = 720; height = 1280; imagenRatio = "9:16"; }
    else if (ratio === '4:5') { width = 800; height = 1000; imagenRatio = "3:4"; }

    const modelChoice = document.getElementById('live-img-model')?.value || 'flux';
    let cleanPrompt = await _getCleanEnglishVisualPrompt();

    // Enhance prompt based on selected model
    let finalPrompt = cleanPrompt;
    let modelParam = 'flux';

    if (modelChoice === 'flux-realism') {
        finalPrompt = `${cleanPrompt}, cinematic lighting, photorealistic 8k, ultra-detailed textures, masterpiece, depth of field`;
        modelParam = 'flux';
    } else if (modelChoice === 'turbo') {
        modelParam = 'turbo';
    } else {
        finalPrompt = `${cleanPrompt}, highly detailed, 8k resolution, photorealistic`;
        modelParam = 'flux';
    }

    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=${width}&height=${height}&seed=${_currentLiveImgSeed}&nologo=true&model=${modelParam}`;

    const captionEl = document.getElementById('live-img-caption');
    if (captionEl) {
        captionEl.innerHTML = `<strong style="color:#34d399;">Visual Prompt:</strong> ${finalPrompt}`;
    }

    if (img) img.src = imageUrl;
}

function _onLiveImgLoaded() {
    const loading     = document.getElementById('live-img-loading');
    const wrap        = document.getElementById('live-img-wrap');
    const regenBtn    = document.getElementById('live-regen-btn');
    const dlBtn       = document.getElementById('live-dl-btn');
    const contestBtn  = document.getElementById('live-contest-btn');

    if (loading)    loading.style.display    = 'none';
    if (wrap)       wrap.style.display       = 'block';
    if (regenBtn)   regenBtn.style.display   = 'inline-block';
    if (dlBtn)      dlBtn.style.display      = 'inline-block';
    if (contestBtn) contestBtn.style.display = 'inline-block';
}

function _onLiveImgError() {
    const loading = document.getElementById('live-img-loading');
    if (loading) loading.innerText = "❌ Image render timeout ho gaya. '🔄 Regenerate' button try karein.";
}

function downloadLiveImage() {
    const img = document.getElementById('live-ai-img-element');
    if (!img || !img.src) return;
    const a = document.createElement('a');
    a.href = img.src;
    a.download = `AI_Studio_Preview_${Date.now()}.jpg`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ═══════════════════════════════════════════════════════════════════════════
// ₹100 SUNDAY PROMPT CONTEST ENGINE
// ═══════════════════════════════════════════════════════════════════════════

// ── Sunday Countdown Timer ────────────────────────────────────────────────
function getNextSundayCountdown() {
    const now  = new Date();
    const day  = now.getDay(); // 0=Sun
    const daysLeft = day === 0 ? 7 : 7 - day;
    const nextSun = new Date(now);
    nextSun.setDate(now.getDate() + daysLeft);
    nextSun.setHours(20, 0, 0, 0);
    const diff = nextSun - now;
    if (diff <= 0) return { d:0, h:0, m:0, s:0 };
    const d = Math.floor(diff / 864e5);
    const h = Math.floor((diff % 864e5) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { d, h, m, s };
}

function startContestCountdown() {
    function tick() {
        const { d, h, m, s } = getNextSundayCountdown();
        const txt = `${d}d ${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
        document.querySelectorAll('.contest-countdown').forEach(el => el.textContent = txt);
    }
    tick();
    setInterval(tick, 1000);
}
window.startContestCountdown = startContestCountdown;

// ── Promo Popup ──────────────────────────────────────────────────────────
function showContestPromoPopup() {
    // Only show on main studio page (index.html)
    if (!document.getElementById('subject-input') && !document.getElementById('contest-gallery-section')) return;
    const seen = localStorage.getItem('_contest_popup_date');
    if (seen === new Date().toDateString()) return;
    if (document.getElementById('contest-promo-popup')) return;

    const popup = document.createElement('div');
    popup.id = 'contest-promo-popup';
    popup.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(6,11,24,0.88);backdrop-filter:blur(10px);padding:16px;';
    popup.innerHTML = `
        <div style="background:linear-gradient(135deg,#0f1929,#1e1b4b);border:1px solid #6366f1;border-radius:20px;padding:32px 26px;max-width:430px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(99,102,241,0.45);position:relative;">
            <div style="font-size:52px;margin-bottom:10px;">🏆</div>
            <div style="font-size:11px;font-weight:800;color:#818cf8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;">Weekly Sunday Reward</div>
            <div style="font-size:22px;font-weight:900;color:#f1f5f9;margin-bottom:10px;line-height:1.3;">Har Sunday <span style="color:#fbbf24;">1 Lucky Winner</span> ko ₹100! 🎉</div>
            <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#fca5a5;font-weight:700;">
                ⚠️ Sirf 1 winner ko milega ₹100 — sabse zyada likes wale ko!
            </div>
            <div style="font-size:13px;color:#94a3b8;line-height:1.7;margin-bottom:18px;">
                🎨 AI prompt se best image generate karo<br>
                📸 Social media par share karo + <b style="color:#f1f5f9;">#AIPromptStudio</b><br>
                ❤️ Maximum likes laao → <strong style="color:#fbbf24;">₹100 Cash</strong> jeeto!<br>
                <span style="font-size:11px;color:#818cf8;font-weight:700;">👑 Har Sunday evening — Sirf 1 Winner Announce Hoga</span>
            </div>
            <div style="background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.3);border-radius:10px;padding:10px;margin-bottom:18px;font-size:12px;color:#c7d2fe;">
                ⏱️ Next Sunday Draw In: <strong class="contest-countdown" style="color:#fbbf24;font-size:13px;">Loading...</strong>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
                <button onclick="closeContestPopup();window.scrollTo({top:document.getElementById('contest-gallery-section')?.offsetTop||0,behavior:'smooth'});"
                    style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border:none;padding:13px;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 4px 18px rgba(99,102,241,0.45);">
                    ⚡ Abhi Participate Karein!
                </button>
                <button onclick="closeContestPopup()"
                    style="background:transparent;color:#64748b;border:1px solid #1e3a5f;padding:9px;border-radius:10px;font-size:12px;cursor:pointer;">
                    Baad mein dekhenge ✕
                </button>
            </div>
        </div>`;
    document.body.appendChild(popup);
    startContestCountdown();
}

function closeContestPopup() {
    const p = document.getElementById('contest-promo-popup');
    if (p) p.style.display = 'none';
    localStorage.setItem('_contest_popup_date', new Date().toDateString());
}
window.closeContestPopup = closeContestPopup;
window.showContestPromoPopup = showContestPromoPopup;

// ── Contest Submission Modal ─────────────────────────────────────────────
function openContestSubmitModal() {
    const u = window._firebaseAuth?.currentUser || window._currentUser;
    if (!u) { alert('🔐 Contest me participate karne ke liye pehle Sign In karein!\n(Quick Menu ⚙️ > Sign In)'); return; }

    if (!document.getElementById('contest-submit-modal')) _injectContestModal();
    const concept    = document.getElementById('subject-input')?.value?.trim() || '';
    const midjourney = document.getElementById('prompt-output')?.innerText?.trim() || '';
    const imgEl      = document.getElementById('live-ai-img-element');
    const imgSrc     = imgEl?.src && imgEl.src.startsWith('http') ? imgEl.src : '';

    const pf = document.getElementById('cm-prefill-prompt');
    if (pf) pf.textContent = midjourney || concept || '(Pehle prompt generate karein)';
    const ip = document.getElementById('cm-img-preview');
    if (ip) { ip.src = imgSrc; ip.style.display = imgSrc ? 'block' : 'none'; }
    document.getElementById('contest-submit-modal').style.display = 'flex';
}
window.openContestSubmitModal = openContestSubmitModal;

function closeContestModal() {
    const m = document.getElementById('contest-submit-modal');
    if (m) m.style.display = 'none';
}
window.closeContestModal = closeContestModal;

function _injectContestModal() {
    const modal = document.createElement('div');
    modal.id = 'contest-submit-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;background:rgba(6,11,24,0.92);backdrop-filter:blur(10px);padding:16px;';
    modal.innerHTML = `
        <div style="background:#0f1929;border:1px solid #6366f1;border-radius:18px;padding:24px;max-width:500px;width:100%;max-height:90vh;overflow-y:auto;position:relative;">
            <button onclick="closeContestModal()" style="position:absolute;top:12px;right:12px;background:none;border:1px solid #1e3a5f;color:#94a3b8;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;">✕</button>
            <div style="text-align:center;margin-bottom:16px;">
                <div style="font-size:28px;">🏆</div>
                <div style="font-size:16px;font-weight:800;color:#f1f5f9;margin-top:4px;">₹100 Sunday Contest Entry</div>
                <div style="font-size:11px;color:#64748b;margin-top:2px;">Har Sunday — <b style="color:#fca5a5;">Sirf 1 Winner</b> ko ₹100 milega!</div>
            </div>
            <div style="font-size:11px;color:#818cf8;font-weight:700;margin-bottom:4px;">📝 Your Prompt:</div>
            <div id="cm-prefill-prompt" style="background:#060b18;border:1px solid #1e3a5f;border-radius:8px;padding:10px;font-size:11px;color:#94a3b8;margin-bottom:12px;max-height:60px;overflow:auto;line-height:1.5;"></div>
            <img id="cm-img-preview" style="display:none;width:100%;border-radius:10px;margin-bottom:12px;max-height:150px;object-fit:cover;border:1px solid #1e3a5f;" alt="Entry">
            <div style="font-size:11px;color:#818cf8;font-weight:700;margin-bottom:4px;">📱 Platform:</div>
            <select id="cm-platform" style="width:100%;background:#060b18;border:1px solid #1e3a5f;border-radius:8px;padding:9px;color:#f8fafc;font-size:12px;margin-bottom:12px;font-family:inherit;">
                <option value="">-- Select Platform --</option>
                <option value="Instagram">📸 Instagram (Post / Reel)</option>
                <option value="Twitter">🐦 Twitter / X</option>
                <option value="YouTube">▶️ YouTube Shorts</option>
                <option value="LinkedIn">💼 LinkedIn</option>
                <option value="Facebook">📘 Facebook</option>
            </select>
            <div style="font-size:11px;color:#818cf8;font-weight:700;margin-bottom:4px;">🔗 Social Post URL:</div>
            <input id="cm-post-url" type="url" placeholder="https://instagram.com/p/your-post" style="width:100%;background:#060b18;border:1px solid #1e3a5f;border-radius:8px;padding:9px;color:#f8fafc;font-size:12px;margin-bottom:12px;font-family:inherit;">
            <div style="font-size:11px;color:#818cf8;font-weight:700;margin-bottom:4px;">💳 UPI ID / PhonePe / GPay Number:</div>
            <input id="cm-upi" type="text" placeholder="yourname@upi  ya  9876543210" style="width:100%;background:#060b18;border:1px solid #1e3a5f;border-radius:8px;padding:9px;color:#f8fafc;font-size:12px;margin-bottom:14px;font-family:inherit;">
            <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:10px;font-size:11px;color:#fde68a;line-height:1.5;margin-bottom:14px;">
                ⚠️ <b>Rules:</b> Post me site link ya <b>#AIPromptStudio</b> compulsory. Fake likes disqualify. 1 entry/week per user. <b style="color:#fca5a5;">Sirf 1 winner ko ₹100 milega</b> — sabse zyada valid likes wale ko.
            </div>
            <button onclick="submitContestEntry()" style="width:100%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border:none;padding:13px;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 4px 16px rgba(99,102,241,0.4);">
                🚀 Submit Entry for Sunday Draw!
            </button>
            <div id="cm-status" style="margin-top:10px;text-align:center;font-size:12px;min-height:16px;color:#34d399;"></div>
        </div>`;
    document.body.appendChild(modal);
}

// ── Submit Entry to Firebase ─────────────────────────────────────────────
async function submitContestEntry() {
    const statusEl = document.getElementById('cm-status');
    const u = window._firebaseAuth?.currentUser || window._currentUser;
    if (!u) { if (statusEl) statusEl.textContent = '❌ Sign in required.'; return; }

    const platform = document.getElementById('cm-platform')?.value?.trim();
    const postUrl  = document.getElementById('cm-post-url')?.value?.trim();
    const upiId    = document.getElementById('cm-upi')?.value?.trim();
    const prompt   = document.getElementById('cm-prefill-prompt')?.textContent?.trim();
    const imgSrc   = document.getElementById('cm-img-preview')?.src || '';

    if (!platform)  { if (statusEl) statusEl.textContent = '❌ Platform select karein.'; return; }
    if (!postUrl || !postUrl.startsWith('http')) { if (statusEl) statusEl.textContent = '❌ Valid post URL daalen.'; return; }
    if (!upiId)     { if (statusEl) statusEl.textContent = '❌ UPI ID daalen.'; return; }

    if (statusEl) statusEl.textContent = '⏳ Submitting...';

    try {
        const entry = {
            uid: u.uid,
            userName: u.displayName || u.email?.split('@')[0] || 'User',
            userEmail: u.email || '',
            userPhoto: u.photoURL || '',
            prompt: prompt || '',
            imageUrl: imgSrc,
            platform, postUrl, upiId,
            likeCount: 0,
            likesMap: {},
            status: 'pending',
            createdAt: Date.now()
        };
        if (window._studioPush && window._studioRef && window._studioDB) {
            await window._studioPush(window._studioRef(window._studioDB, 'contests/entries'), entry);
        }
        if (statusEl) statusEl.textContent = '✅ Entry submitted! Sunday ko winner announce hoga. Best of luck! 🏆';
        setTimeout(() => { closeContestModal(); loadContestGallery(); }, 2000);
    } catch (e) {
        if (statusEl) statusEl.textContent = '❌ Error: ' + e.message;
    }
}
window.submitContestEntry = submitContestEntry;

// ── Like Entry ───────────────────────────────────────────────────────────
async function likeContestEntry(entryKey) {
    const u = window._firebaseAuth?.currentUser || window._currentUser;
    if (!u) { alert('❤️ Like karne ke liye pehle Sign In karein!'); return; }
    const btn = document.getElementById('like-btn-' + entryKey);
    const countEl = document.getElementById('like-count-' + entryKey);
    const already = btn?.dataset.liked === '1';

    try {
        const fbMod = await import('https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js');
        const likeRef = fbMod.ref(window._studioDB, `contests/entries/${entryKey}/likesMap/${u.uid}`);
        if (already) {
            await fbMod.remove(likeRef);
            if (countEl) countEl.textContent = Math.max(0, parseInt(countEl.textContent||'0') - 1);
            if (btn) { btn.dataset.liked = '0'; btn.style.color = '#94a3b8'; btn.style.background = '#111c30'; btn.style.borderColor = '#1e3a5f'; }
        } else {
            await fbMod.set(likeRef, true);
            if (countEl) countEl.textContent = parseInt(countEl.textContent||'0') + 1;
            if (btn) { btn.dataset.liked = '1'; btn.style.color = '#ef4444'; btn.style.background = 'rgba(239,68,68,0.12)'; btn.style.borderColor = 'rgba(239,68,68,0.35)'; }
        }
    } catch(e) { console.warn('Like error:', e); }
}
window.likeContestEntry = likeContestEntry;

// ── Load Contest Gallery ─────────────────────────────────────────────────
function loadContestGallery() {
    const container = document.getElementById('contest-gallery-grid');
    if (!container || !window._studioDB || !window._studioRef) return;

    container.innerHTML = '<div style="text-align:center;color:#38bdf8;padding:32px;grid-column:1/-1;">⏳ Gallery load ho rahi hai...</div>';

    import('https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js').then(fbMod => {
        const entriesRef = fbMod.ref(window._studioDB, 'contests/entries');
        fbMod.onValue(entriesRef, (snap) => {
            const data = snap.val();
            container.innerHTML = '';
            const u = window._firebaseAuth?.currentUser || window._currentUser;
            const myUid = u?.uid || '';

            if (!data) {
                container.innerHTML = '<div style="text-align:center;color:#475569;padding:40px;grid-column:1/-1;"><div style="font-size:36px;margin-bottom:12px;">🎨</div><div style="font-size:14px;">Koi entry nahi hai abhi. <b style=\'color:#818cf8;\'>Pehle wale bano!</b></div></div>';
                return;
            }

            const entries = Object.entries(data)
                .map(([k,v]) => {
                    const count = v.likesMap ? Object.keys(v.likesMap).length : (v.likeCount || 0);
                    return { key: k, ...v, likeCount: count };
                })
                .filter(e => e.status !== 'disqualified')
                .sort((a,b) => (b.likeCount||0) - (a.likeCount||0))
                .slice(0, 12);

            entries.forEach((entry, idx) => {
                const isLiked  = myUid && entry.likesMap?.[myUid];
                const isWinner = entry.status === 'winner';
                const card = document.createElement('div');
                card.style.cssText = `background:#0f1929;border:1px solid ${isWinner?'#fbbf24':'#1e3a5f'};border-radius:14px;overflow:hidden;transition:transform 0.2s,box-shadow 0.2s;`;
                card.onmouseenter = () => { card.style.transform = 'translateY(-4px)'; card.style.boxShadow = '0 12px 32px rgba(99,102,241,0.2)'; };
                card.onmouseleave = () => { card.style.transform = ''; card.style.boxShadow = ''; };
                const medal = idx===0?'🥇 #1':idx===1?'🥈 #2':idx===2?'🥉 #3':'';
                card.innerHTML = `
                    ${isWinner?'<div style="background:linear-gradient(135deg,#92400e,#78350f);color:#fbbf24;text-align:center;font-size:11px;font-weight:800;padding:6px;letter-spacing:0.5px;">👑 SUNDAY WINNER — ₹100 WON!</div>':''}
                    ${medal&&!isWinner?`<div style="background:rgba(99,102,241,0.15);color:#a5b4fc;text-align:center;font-size:10px;font-weight:800;padding:4px;">${medal} TOP ENTRY</div>`:''}
                    ${entry.imageUrl?`<img src="${_cEsc(entry.imageUrl)}" style="width:100%;height:155px;object-fit:cover;display:block;" onerror="this.style.display='none'" alt="Entry">`:'<div style="height:90px;background:#060b18;display:flex;align-items:center;justify-content:center;font-size:36px;">🎨</div>'}
                    <div style="padding:12px;">
                        <div style="display:flex;align-items:center;gap:7px;margin-bottom:7px;">
                            ${entry.userPhoto?`<img src="${_cEsc(entry.userPhoto)}" style="width:22px;height:22px;border-radius:50%;border:1px solid #6366f1;" onerror="this.style.display='none">`:'<div style="width:22px;height:22px;border-radius:50%;background:#6366f1;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:white;flex-shrink:0;">' + _cEsc((entry.userName||'U').charAt(0).toUpperCase()) + '</div>'}
                            <div style="font-size:12px;font-weight:700;color:#f1f5f9;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_cEsc(entry.userName||'Anonymous')}</div>
                            <div style="font-size:9px;color:#6366f1;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.25);border-radius:5px;padding:2px 6px;flex-shrink:0;">${_cEsc(entry.platform||'')}</div>
                        </div>
                        <div style="font-size:11px;color:#64748b;margin-bottom:9px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${_cEsc((entry.prompt||'').substring(0,100))}${(entry.prompt||'').length>100?'...':''}</div>
                        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                            <button id="like-btn-${entry.key}" data-liked="${isLiked?'1':'0'}"
                                onclick="likeContestEntry('${entry.key}')"
                                style="display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:8px;border:1px solid ${isLiked?'rgba(239,68,68,0.35)':'#1e3a5f'};background:${isLiked?'rgba(239,68,68,0.12)':'#111c30'};color:${isLiked?'#ef4444':'#94a3b8'};font-size:12px;font-weight:700;cursor:pointer;transition:all 0.2s;">
                                ❤️ <span id="like-count-${entry.key}">${entry.likeCount||0}</span>
                            </button>
                            ${entry.postUrl?`<a href="${_cEsc(entry.postUrl)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#818cf8;font-weight:700;text-decoration:none;border:1px solid #1e3a5f;border-radius:8px;padding:5px 9px;background:#060b18;">🔗 View Post</a>`:''}
                        </div>
                    </div>`;
                container.appendChild(card);
            });
        }, { onlyOnce: false });
    }).catch(e => console.warn('Gallery load error:', e));
}
window.loadContestGallery = loadContestGallery;

function _cEsc(str) {
    return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Auto-init on page load
document.addEventListener('DOMContentLoaded', () => {
    startContestCountdown();
    setTimeout(showContestPromoPopup, 2800);
    setTimeout(loadContestGallery, 1200);
});
