const express = require('express');
const router = express.Router();
const VoiceSyncService = require('../services/voiceSyncService');
const { generateTTS } = require('../services/tts_controller');

// Initialize voice sync service
let voiceSyncService;

function initVoiceSync(pool) {
    voiceSyncService = new VoiceSyncService(pool);
    return router;
}

router.get('/', async (req, res) => {
    try {
        const provider = req.query.provider || 'all';

        if (!['all', 'elevenlabs', 'sarvam'].includes(provider)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid provider. Must be: all, elevenlabs, or sarvam'
            });
        }

        const voices = await voiceSyncService.getVoices(provider);

        res.json({
            success: true,
            voices: voices,
            count: voices.length,
            provider: provider,
            cached: true
        });

    } catch (error) {
        console.error('[VoiceAPI] Error fetching voices:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch voices',
            error: error.message
        });
    }
});

router.post('/sync', async (req, res) => {
    try {
        console.log('[VoiceAPI] Starting voice sync...');
        const result = await voiceSyncService.syncAllProviders();

        res.json({
            success: result.errors.length === 0,
            synced: result.synced,
            errors: result.errors,
            message: `Synced ${result.synced} voices${result.errors.length > 0 ? ` with ${result.errors.length} errors` : ''}`
        });

    } catch (error) {
        console.error('[VoiceAPI] Error syncing voices:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to sync voices',
            error: error.message
        });
    }
});


router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const voice = await voiceSyncService.getVoiceById(id);

        if (!voice) {
            return res.status(404).json({
                success: false,
                message: 'Voice not found'
            });
        }

        res.json({
            success: true,
            voice: voice
        });

    } catch (error) {
        console.error('[VoiceAPI] Error fetching voice:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch voice',
            error: error.message
        });
    }
});

router.post('/:id/preview', async (req, res) => {
    try {
        const { id } = req.params;
        const { text } = req.body;

        const voice = await voiceSyncService.getVoiceById(id);

        if (!voice) {
            return res.status(404).json({
                success: false,
                message: 'Voice not found'
            });
        }

        const previewText = text || "Hello, this is a preview of the selected voice.";

        let ttsOptions = {
            voiceId: voice.provider_voice_id,
            provider: voice.provider,
            language: voice.language_code,
            speaker: voice.provider_voice_id,
            skipTwilioConversion: true  
        };

        if (voice.provider === 'sarvam') {
            ttsOptions.format = 'mp3';
            ttsOptions.speaker = voice.provider_voice_id;
            ttsOptions.target_language_code = 'en-IN';  
        } else {
            ttsOptions.output_format = 'mp3_44100_128'; 
        }

        const audioBuffer = await generateTTS(previewText, ttsOptions);
        const base64Audio = audioBuffer.toString('base64');

        const mimeType = 'audio/mpeg';
        const dataUri = `data:${mimeType};base64,${base64Audio}`;

        res.json({
            success: true,
            audioData: dataUri,
            voice: {
                id: voice.id,
                name: voice.display_name,
                provider: voice.provider
            }
        });

    } catch (error) {
        console.error('[VoiceAPI] Error generating preview:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate voice preview',
            error: error.message
        });
    }
});

module.exports = { router, initVoiceSync };
