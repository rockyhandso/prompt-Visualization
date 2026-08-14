/**
 * Jolly Nobel AI Studio — Robust Interactive Hinglish Tour Engine (js/tour.js)
 */

(function () {
    // 1. INJECT STYLES
    const style = document.createElement('style');
    style.textContent = `
        #tour-overlay {
            position: fixed;
            inset: 0;
            z-index: 999998;
            background: rgba(0, 0, 0, 0.75);
            display: none;
            cursor: pointer;
        }

        #tour-spotlight {
            position: fixed;
            z-index: 999999;
            border-radius: 8px;
            box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.75);
            pointer-events: none;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border: 3px solid #38bdf8;
            display: none;
        }

        #tour-tooltip {
            position: fixed;
            z-index: 1000000;
            background: #0f172a;
            border: 2px solid #38bdf8;
            border-radius: 12px;
            padding: 16px 20px;
            width: min(340px, 90vw);
            box-shadow: 0 10px 35px rgba(0,0,0,0.8), 0 0 15px rgba(56, 189, 248, 0.3);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #f8fafc;
            display: none;
            box-sizing: border-box;
        }

        .tour-step-label {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 1px;
            text-transform: uppercase;
            color: #38bdf8;
            margin-bottom: 4px;
        }
        .tour-emoji { font-size: 24px; margin-bottom: 6px; display: block; }
        .tour-title { font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: 6px; }
        .tour-desc { font-size: 13px; color: #cbd5e1; line-height: 1.5; margin-bottom: 14px; }
        .tour-desc strong { color: #93c5fd; }
        .tour-desc em { color: #86efac; font-style: normal; }

        .tour-nav { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .tour-dots { display: flex; gap: 5px; align-items: center; flex: 1; }
        .tour-dot {
            width: 7px; height: 7px; border-radius: 50%;
            background: #334155; transition: 0.2s; cursor: pointer;
        }
        .tour-dot.active { background: #38bdf8; width: 18px; border-radius: 4px; }
        
        .tour-btn {
            border: none; border-radius: 6px; padding: 6px 12px;
            font-size: 12px; font-weight: 700; cursor: pointer; transition: 0.2s;
        }
        .tour-btn-skip { background: transparent; color: #94a3b8; }
        .tour-btn-skip:hover { color: #ef4444; }
        .tour-btn-next { background: #0284c7; color: white; }
        .tour-btn-next:hover { background: #0369a1; }
        .tour-btn-finish { background: #10b981; color: white; }
        .tour-btn-finish:hover { background: #059669; }
    `;
    document.head.appendChild(style);

    // 2. DEFINE STEPS FOR BOTH PAGES
    const isVideo = location.pathname.toLowerCase().includes('video');

    const IMAGE_STEPS = [
        { selector: '#engine-select',   emoji: '🎯', title: 'Step 1: AI Engine Chunein',       desc: '<strong>Pehle engine select karein</strong> — Midjourney, DALL·E 3, Gemini, Flux, ya Leonardo. Har engine ke according perfect prompt structure generate hota hai!' },
        { selector: '#ratio-tags',      emoji: '📐', title: 'Step 2: Aspect Ratio',            desc: '<strong>Image ka size choose karein</strong> — Square (1:1), Cinematic (16:9), Portrait (4:5), ya Reel (9:16).' },
        { selector: '#subject-input',   emoji: '✍️', title: 'Step 3: Apna Idea Likhein',       desc: '<strong>Yahan apna prompt idea type karein</strong> — Hinglish, Hindi ya English mein (e.g. <em>"mumbai ki sadak par ek sports car"</em>). Upar <strong>🇮🇳 Hinglish</strong> button se rich English prompt me convert kar sakte hain!' },
        { selector: '.gemini-box',      emoji: '🤖', title: 'Step 4: Gemini Brainstorm',       desc: '<strong>🧠 Brainstorm</strong> dabayein — Gemini AI aapke idea ko 3 detailed creative visual scenarios mein expand karega. Option par click karke turant select karein!' },
        { selector: '.output-card',     emoji: '📋', title: 'Step 5: Final Prompt & Copy',     desc: 'Yahan aapka <strong>final positive & negative prompt</strong> ready milega. <strong>📋 Copy</strong> button dabakar Midjourney ya DALL·E mein use karein!' },
        { selector: null,               emoji: '🎉', title: 'Tour Complete!',                  desc: 'Ab aap <strong>AI Image Prompt Studio</strong> use karne ke liye bilkul ready hain! 🚀<br><br>Agar shared API key limit full ho jaye to <strong>🔑 My API Key</strong> se apni free key jod sakte hain.' }
    ];

    const VIDEO_STEPS = [
        { selector: '#engine-select',            emoji: '🎯', title: 'Step 1: Video Engine Chunein',     desc: '<strong>Target AI Video engine chunein</strong> — Runway Gen-3, OpenAI Sora, Luma Dream Machine, Kling, Hailuo, ya Google Veo.' },
        { selector: '#ratio-tags',               emoji: '📐', title: 'Step 2: Video Ratio',             desc: '<strong>Orientation select karein</strong> — 16:9 (Landscape / YouTube) ya 9:16 (Vertical Reel / Short).' },
        { selector: '#subject-input',            emoji: '✍️', title: 'Step 3: Base Concept Likhein',    desc: '<strong>Apna video scene idea yahan type karein</strong> — Hinglish ya English mein (e.g. <em>"a sports car drifting on wet street in neon rain"</em>).' },
        { selector: '#camera-motion-tags',       emoji: '🎥', title: 'Step 4: Camera & Speed Tags',     desc: 'Yahan se <strong>Camera Movement</strong> (Drone, Push In, Orbit) aur <strong>Speed</strong> (120fps Slow-mo) select karein.' },
        { selector: '#character-dialogue-list',  emoji: '🗣️', title: 'Step 5: Multi-Character Script',  desc: '<strong>Har character ka naam aur dialogue add karein</strong> — jaise "Ramesh" + dialogue. <strong>➕ Add Character</strong> se multiple characters add kar sakte hain!' },
        { selector: '.gemini-box',               emoji: '🤖', title: 'Step 6: Gemini Video Director',   desc: '<strong>🧠 Brainstorm</strong> button se Gemini 3 detailed cinematic motion scenarios generate karega.' },
        { selector: '.output-card',              emoji: '📋', title: 'Step 7: Final Video Prompt',      desc: 'Aapka <strong>Cinematic Video Prompt Package</strong> ready hai! Copy karein aur Sora / Runway mein paste karein.' },
        { selector: null,                        emoji: '🎬', title: 'Tour Complete! Ready to Direct!',  desc: 'Ab aap <strong>AI Video Motion Studio</strong> use karne ke liye ready hain! 🚀<br><br>Upar <strong>"Video Clip Analyzer"</strong> se aap 15-30 sec ka clip upload karke uska prompt bhi extract kar sakte hain!' }
    ];

    // 3. DOM SETUP
    let overlay, spotlight, tooltip;

    function ensureDOMElements() {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'tour-overlay';
            overlay.onclick = endTour;
            document.body.appendChild(overlay);
        }
        if (!spotlight) {
            spotlight = document.createElement('div');
            spotlight.id = 'tour-spotlight';
            document.body.appendChild(spotlight);
        }
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'tour-tooltip';
            document.body.appendChild(tooltip);
        }
    }

    let currentStep = 0;
    let tourActive = false;

    function getSteps() {
        const isVid = location.pathname.toLowerCase().includes('video');
        return isVid ? VIDEO_STEPS : IMAGE_STEPS;
    }

    function positionElements(el) {
        ensureDOMElements();
        if (!el) {
            spotlight.style.display = 'none';
            overlay.style.display = 'block';
            tooltip.style.display = 'block';
            tooltip.style.top = '50%';
            tooltip.style.left = '50%';
            tooltip.style.transform = 'translate(-50%, -50%)';
            return;
        }

        const rect = el.getBoundingClientRect();
        const pad = 6;

        spotlight.style.display = 'block';
        spotlight.style.top = Math.max(0, rect.top - pad) + 'px';
        spotlight.style.left = Math.max(0, rect.left - pad) + 'px';
        spotlight.style.width = (rect.width + pad * 2) + 'px';
        spotlight.style.height = (rect.height + pad * 2) + 'px';

        overlay.style.display = 'none'; // spotlight handles the dark overlay via massive box-shadow

        tooltip.style.display = 'block';
        tooltip.style.transform = 'none';

        const ttW = 340;
        const ttH = 220;

        // Position tooltip below element if space permits, else above
        let top = rect.bottom + 12;
        let left = Math.max(10, Math.min(rect.left, window.innerWidth - ttW - 10));

        if (top + ttH > window.innerHeight) {
            top = Math.max(10, rect.top - ttH - 12);
        }

        tooltip.style.top = top + 'px';
        tooltip.style.left = left + 'px';
    }

    function renderStep(idx) {
        ensureDOMElements();
        const steps = getSteps();
        const step = steps[idx];
        const el = step.selector ? document.querySelector(step.selector) : null;

        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => { positionElements(el); }, 250);
        } else {
            positionElements(null);
        }

        const isLast = idx === steps.length - 1;
        const dots = steps.map((_, i) => `<span class="tour-dot ${i === idx ? 'active' : ''}" onclick="tourGoTo(${i})"></span>`).join('');

        tooltip.innerHTML = `
            <div class="tour-step-label">Tour &bull; ${idx + 1} / ${steps.length}</div>
            <span class="tour-emoji">${step.emoji}</span>
            <div class="tour-title">${step.title}</div>
            <div class="tour-desc">${step.desc}</div>
            <div class="tour-nav">
                <div class="tour-dots">${dots}</div>
                <button class="tour-btn tour-btn-skip" onclick="tourSkip()">✕ Skip</button>
                ${isLast
                    ? `<button class="tour-btn tour-btn-finish" onclick="tourEnd()">✅ Done!</button>`
                    : `<button class="tour-btn tour-btn-next" onclick="tourNext()">Aage &rarr;</button>`}
            </div>
        `;
    }

    function startTour() {
        ensureDOMElements();
        tourActive = true;
        currentStep = 0;
        renderStep(0);
    }

    function endTour() {
        tourActive = false;
        if (overlay) overlay.style.display = 'none';
        if (tooltip) tooltip.style.display = 'none';
        if (spotlight) spotlight.style.display = 'none';
    }

    // Expose Global Window Functions
    window.startTour = startTour;
    window.tourNext  = () => { const steps = getSteps(); if (currentStep < steps.length - 1) { currentStep++; renderStep(currentStep); } else { endTour(); } };
    window.tourSkip  = endTour;
    window.tourEnd   = endTour;
    window.tourGoTo  = (idx) => { currentStep = idx; renderStep(idx); };

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (!tourActive) return;
        if (e.key === 'ArrowRight' || e.key === 'Enter') window.tourNext();
        if (e.key === 'Escape') endTour();
    });

    // Auto-setup when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureDOMElements);
    } else {
        ensureDOMElements();
    }
})();
