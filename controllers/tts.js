const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

const getTtsModels = async (req, res) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return res.json({ models: [], voices: [], error: 'OPENROUTER_API_KEY not set' });
    }

    try {
        const response = await fetch(`${OPENROUTER_BASE}/models?output_modalities=speech`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        const data = await response.json();
        const ttsModels = (data.data || []).map(m => ({
            id: m.id,
            name: m.name || m.id,
        }));
        const voices = ['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer'];
        return res.json({ models: ttsModels, voices });
    } catch (error) {
        console.error('OpenRouter models error:', error.message);
        return res.status(502).json({ models: [], voices: [], error: 'OpenRouter unavailable' });
    }
};

const textToSpeech = async (req, res) => {
    const { message, model, voice } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'message is required' });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'OPENROUTER_API_KEY not set' });
    }

    const trimmedMessage = message.trim().slice(0, 500);
    const selectedModel = model || 'openai/gpt-4o-mini-tts-2025-12-15';
    const selectedVoice = voice || 'nova';

    try {
        const response = await fetch(`${OPENROUTER_BASE}/audio/speech`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: selectedModel,
                voice: selectedVoice,
                input: trimmedMessage,
                response_format: 'mp3',
            }),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            console.error('OpenRouter TTS error:', response.status, errorText);
            return res.status(response.status).json({ error: 'TTS failed' });
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'no-cache');
        return res.send(buffer);
    } catch (error) {
        console.error('TTS proxy error:', error.message);
        return res.status(502).json({ error: 'TTS unavailable' });
    }
};

module.exports = { getTtsModels, textToSpeech };
