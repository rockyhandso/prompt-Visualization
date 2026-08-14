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
        "gemini-flash-latest",
        "gemini-3.5-flash",
        "gemini-3.6-flash",
        "gemini-2.0-flash",
        "gemini-pro-latest",
        "gemini-3-flash-preview"
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

    const defaultFallback = { modelPath: 'models/gemini-flash-latest', apiVersion: 'v1beta' };
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
