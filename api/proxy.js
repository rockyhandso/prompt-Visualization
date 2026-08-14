/**
 * Jolly Nobel AI Studio — Serverless Proxy Endpoint (api/proxy.js)
 * Vercel / Netlify / Express Compatible Serverless Proxy.
 * Shields API Key completely from frontend browser network inspection.
 */

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({
            error: { message: "Server Error: GEMINI_API_KEY Environment Variable is missing on backend." }
        });
    }

    try {
        const { endpoint, payload, action } = req.body || {};

        if (action === 'listModels') {
            const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const response = await fetch(listUrl);
            const data = await response.json();
            return res.status(response.status).json(data);
        }

        if (action === 'generateContent') {
            const { apiVersion = 'v1beta', modelPath = 'models/gemini-flash-latest' } = req.body;
            const apiUrl = `https://generativelanguage.googleapis.com/${apiVersion}/${modelPath}:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            return res.status(response.status).json(data);
        }

        return res.status(400).json({ error: { message: "Invalid action. Supported: listModels, generateContent" } });

    } catch (err) {
        return res.status(500).json({ error: { message: "Proxy Server Error: " + err.message } });
    }
}
