const nodeFetch = require("node-fetch");
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');


function getElevenLabsApiKey() {
    return process.env.ELEVEN_LABS_API_KEY;
}

function getSarvamApiKey() {
    return process.env.SARVAM_API_KEY;
}

async function generateTTS(text, options = {}) {
    // VERIFIED by Sarvam API: ONLY these 7 speakers exist for bulbul:v2
    const sarvamSpeakers = [
        'anushka', 'manisha', 'vidya', 'arya',   // female
        'abhilash', 'karun', 'hitesh'              // male
    ];

    // Auto-detect provider based on voice ID or speaker
    let provider = options.provider;

    // If no provider specified, try to detect from voice ID/speaker
    if (!provider) {
        const voiceId = (options.voiceId || options.speaker || '').toLowerCase();
        if (sarvamSpeakers.includes(voiceId)) {
            provider = 'sarvam';
            // Set speaker if not already set
            if (!options.speaker) {
                options.speaker = voiceId;
            }
        } else if (voiceId.length > 0) {
            // If we have a voice ID but it's not in the Sarvam list, assume ElevenLabs
            provider = 'elevenlabs';
        } else {
            // No voice ID provided, default to ElevenLabs
            provider = 'elevenlabs';
            console.warn('[TTS Controller] No voice ID or provider specified, defaulting to ElevenLabs');
        }
    }

    console.log(`[TTS Controller] Selected provider: ${provider}`);

    if (provider === 'sarvam') {
        return generateSarvamTTS(text, options);
    } else {
        return generateElevenLabsTTS(text, options);
    }
}


async function generateSarvamTTS(text, options) {
    console.log("[TTS Controller] Routing to Sarvam TTS");

    const apiKey = getSarvamApiKey();

    if (!apiKey) {
        throw new Error("Sarvam API key not configured");
    }

    const speaker = options.speaker || options.voiceId || "anushka";

    console.log(`[TTS] Using provider: Sarvam`);
    console.log(`   Speaker: ${speaker}`);

    try {
        const { generateSarvamTTS: sarvamService } = require("./tts_sarvam.js");
        const audioBuffer = await sarvamService(text, {
            speaker,
            target_language_code: options.language || "en-IN",
            model: "bulbul:v2",
            format: options.format || undefined,  // Pass format option (e.g., 'mp3' for preview)
            skipTwilioConversion: options.skipTwilioConversion || false  // Pass skip flag
        });

        console.log(`[TTS] Sarvam TTS completed: ${audioBuffer.length} bytes`);
        return audioBuffer;
    } catch (error) {
        console.error("[TTS] Error in Sarvam TTS:", error.message);
        throw error;
    }
}


function pcmToMuLaw(pcmBuffer) {
    const muLawBuffer = Buffer.alloc(pcmBuffer.length / 2);
    const split = [
        -32124, -31100, -30076, -29052, -28028, -27004, -25980, -24956,
        -23932, -22908, -21884, -20860, -19836, -18812, -17788, -16764,
        -15740, -14716, -13692, -12668, -11644, -10620, -9596, -8572,
        -7548, -6524, -5500, -4476, -3452, -2428, -1404, -380, 380,
        1404, 2428, 3452, 4476, 5500, 6524, 7548, 8572, 9596, 10620,
        11644, 12668, 13692, 14716, 15740, 16764, 17788, 18812, 19836,
        20860, 21884, 22908, 23932, 24956, 25980, 27004, 28028, 29052,
        30076, 31100, 32124
    ];

    for (let i = 0; i < pcmBuffer.length; i += 2) {
        let sample = pcmBuffer.readInt16LE(i);

        // Clamp sample
        if (sample > 32767) sample = 32767;
        if (sample < -32768) sample = -32768;

        // Encode to Mu-Law (simplified logic via lookup-ish approach or standard algorithm)
        // Standard G.711 algorithm:
        const sign = (sample < 0) ? 0x80 : 0;
        if (sample < 0) sample = -sample;
        sample = sample + 132;
        if (sample > 32767) sample = 32767;

        const exponent = [7, 6, 5, 4, 3, 2, 1, 0].find(e => sample >= (1 << (e + 5))) || 0;
        const mantissa = (sample >> (exponent + 1)) & 0x0F;
        const muLawByte = ~(sign | (exponent << 4) | mantissa);

        muLawBuffer[i / 2] = muLawByte;
    }
    return muLawBuffer;
}

/**
 * Convert MP3 buffer to µ-law using ffmpeg -> PCM -> MuLaw
 * @param {Buffer} mp3Buffer - MP3 audio buffer
 * @returns {Promise<Buffer>} - µ-law audio buffer
 */
async function convertMp3ToUlaw(mp3Buffer) {
    return new Promise((resolve, reject) => {
        try {
            // Convert to Raw PCM S16LE 8kHz using ffmpeg via pipe
            const ffmpeg = spawn('ffmpeg', [
                '-y',
                '-i', 'pipe:0',        // Input from stdin
                '-f', 's16le',
                '-ar', '8000',
                '-ac', '1',
                '-acodec', 'pcm_s16le',
                'pipe:1'               // Output to stdout
            ]);

            let pcmBuffer = Buffer.alloc(0);
            let errorOutput = '';

            ffmpeg.stdout.on('data', (data) => {
                pcmBuffer = Buffer.concat([pcmBuffer, data]);
            });

            ffmpeg.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            ffmpeg.on('close', (code) => {
                if (code !== 0) {
                    console.error(`[TTS] ffmpeg conversion failed with code ${code}`);
                    reject(new Error(`ffmpeg conversion failed: ${errorOutput}`));
                    return;
                }

                if (pcmBuffer.length === 0) {
                    reject(new Error('ffmpeg produced empty output'));
                    return;
                }

                // Convert PCM to Mu-Law in JS
                const ulawBuffer = pcmToMuLaw(pcmBuffer);
                resolve(ulawBuffer);
            });

            ffmpeg.on('error', (err) => {
                reject(err);
            });

            ffmpeg.stdin.write(mp3Buffer);
            ffmpeg.stdin.end();

        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Generate TTS using ElevenLabs
 * @param {string} text - Text to synthesize
 * @param {Object} options - TTS options
 * @param {string} options.voiceId - ElevenLabs voice ID
 * @returns {Promise<Buffer>} - Audio buffer
 */
async function generateElevenLabsTTS(text, options) {
    console.log("[TTS Controller] Routing to ElevenLabs TTS");

    const apiKey = getElevenLabsApiKey();

    if (!apiKey) {
        throw new Error("ElevenLabs API key not configured");
    }

    const voiceId = options.voiceId || "21m00Tcm4TlvDq8ikWAM"; // Default voice
    const outputFormat = options.output_format || options.format || "ulaw_8000";

    console.log(`[TTS] Using provider: ElevenLabs`);
    console.log(`[TTS] Sending request...`);
    console.log(`   Text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    console.log(`   Voice ID: ${voiceId}`);
    console.log(`   Output Format: ${outputFormat}`);
    console.log(`   Model: eleven_turbo_v2_5`);

    try {
        // Construct URL with query parameter for output_format
        const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`);
        url.searchParams.append('output_format', outputFormat);

        const response = await nodeFetch(url.toString(), {
            method: "POST",
            headers: {
                "Accept": "audio/basic", // Use audio/basic for ulaw compatibility
                "Content-Type": "application/json",
                "xi-api-key": apiKey,
            },
            body: JSON.stringify({
                text: text,
                model_id: "eleven_turbo_v2_5",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0.0,
                    use_speaker_boost: true,
                }
                // output_format is now in the URL query string
            }),
        });

        console.log(`[TTS] ElevenLabs API response status: ${response.status} ${response.statusText}`);
        console.log(`[TTS] Response headers:`, {
            'content-type': response.headers.get('content-type'),
            'content-length': response.headers.get('content-length'),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[TTS] ElevenLabs API error: ${response.status} - ${errorText}`);
            throw new Error(`ElevenLabs API error: ${response.status} - ${response.statusText}`);
        }

        const audioBuffer = await response.buffer();
        console.log(`[TTS] Audio received: ${audioBuffer.length} bytes`);
        console.log(`[TTS] First 20 bytes (hex): ${audioBuffer.slice(0, 20).toString('hex')}`);
        console.log(`[TTS] First 20 bytes (decimal): [${Array.from(audioBuffer.slice(0, 20)).join(', ')}]`);

        // Check if audio is valid
        const uniqueBytes = new Set(audioBuffer.slice(0, 100));
        console.log(`[TTS] Unique byte values in first 100 bytes: ${uniqueBytes.size}`);

        if (uniqueBytes.size === 1) {
            console.warn(`[TTS] ⚠️ WARNING: Audio appears to be silent/corrupt (all bytes are ${Array.from(uniqueBytes)[0]})`);
        }

        if (audioBuffer.length === 0) {
            console.error(`[TTS] ❌ ERROR: Audio buffer is empty!`);
            throw new Error('ElevenLabs returned empty audio buffer');
        }

        // Check if ElevenLabs returned MP3 instead of ulaw (some voices don't support ulaw)
        const contentType = response.headers.get('content-type');
        const isMp3 = contentType && contentType.includes('audio/mpeg');
        const hasId3Header = audioBuffer.slice(0, 3).toString() === 'ID3';

        // If skipTwilioConversion is true, return MP3 as-is (for preview)
        if (options.skipTwilioConversion) {
            console.log(`[TTS] skipTwilioConversion=true, returning audio as-is (${isMp3 || hasId3Header ? 'MP3' : 'raw'} format)`);
            return audioBuffer;
        }

        if (isMp3 || hasId3Header) {
            console.warn(`[TTS] ⚠️ ElevenLabs returned MP3 instead of ulaw. Converting to ulaw_8000 for Twilio...`);
            console.log(`[TTS] Content-Type: ${contentType}`);

            // Convert MP3 to ulaw using file-based ffmpeg (more reliable)
            return await convertMp3ToUlaw(audioBuffer);
        }

        console.log(`[TTS] Audio is already in ulaw format`);
        return audioBuffer;
    } catch (error) {
        console.error("[TTS] Error in ElevenLabs TTS:", error.message);
        console.error("[TTS] Error stack:", error.stack);
        throw error;
    }
}

/**
 * Get available voices from ElevenLabs
 * @returns {Promise<Array>} - List of available voices
 */
async function getAvailableVoices() {
    const apiKey = getElevenLabsApiKey();

    if (!apiKey) {
        throw new Error("ElevenLabs API key not configured");
    }

    try {
        const response = await nodeFetch("https://api.elevenlabs.io/v1/voices", {
            headers: {
                "xi-api-key": apiKey,
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch voices: ${response.statusText}`);
        }

        const data = await response.json();
        return data.voices;
    } catch (error) {
        console.error("Error fetching voices:", error.message);
        throw error;
    }
}

module.exports = {
    generateTTS,
    generateElevenLabsTTS,
    generateSarvamTTS,
    getAvailableVoices,
};
