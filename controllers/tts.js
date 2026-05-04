const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const DEFAULT_TTS_MODEL = 'openai/gpt-4o-mini-tts-2025-12-15';

const TTS_MODELS = [
    {
        id: DEFAULT_TTS_MODEL,
        name: 'OpenAI: GPT-4o Mini TTS',
        voices: [
            'alloy',
            'ash',
            'ballad',
            'coral',
            'echo',
            'fable',
            'nova',
            'onyx',
            'sage',
            'shimmer',
            'verse',
            'marin',
            'cedar',
        ],
    },
];

const TTS_MODEL_IDS = new Set(TTS_MODELS.map(model => model.id));
const TTS_VOICES_BY_MODEL = Object.fromEntries(TTS_MODELS.map(model => [model.id, model.voices]));

function getDefaultVoice(modelId = DEFAULT_TTS_MODEL) {
    return modelId === DEFAULT_TTS_MODEL ? 'nova' : TTS_VOICES_BY_MODEL[modelId]?.[0] || 'nova';
}

const getTtsModels = async (req, res) => {
    return res.json({
        models: TTS_MODELS.map(({ id, name }) => ({ id, name })),
        voices: TTS_VOICES_BY_MODEL[DEFAULT_TTS_MODEL],
        voicesByModel: TTS_VOICES_BY_MODEL,
        defaultModel: DEFAULT_TTS_MODEL,
        defaultVoice: getDefaultVoice(DEFAULT_TTS_MODEL),
    });
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
    const selectedModel = model || DEFAULT_TTS_MODEL;
    if (!TTS_MODEL_IDS.has(selectedModel)) {
        return res.status(400).json({ error: 'unsupported TTS model' });
    }

    const modelVoices = TTS_VOICES_BY_MODEL[selectedModel];
    const selectedVoice = voice || getDefaultVoice(selectedModel);
    if (!modelVoices.includes(selectedVoice)) {
        return res.status(400).json({ error: 'unsupported TTS voice' });
    }

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

module.exports = {
    DEFAULT_TTS_MODEL,
    TTS_MODELS,
    getTtsModels,
    textToSpeech,
};
