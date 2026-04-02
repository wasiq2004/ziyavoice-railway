const nodeFetch = require("node-fetch");
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');


function pcmToMuLaw(pcmBuffer) {
    const muLawBuffer = Buffer.alloc(pcmBuffer.length / 2);

    for (let i = 0; i < pcmBuffer.length; i += 2) {
        let sample = pcmBuffer.readInt16LE(i);

        // Clamp sample
        if (sample > 32767) sample = 32767;
        if (sample < -32768) sample = -32768;

        // Encode to Mu-Law
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
 * Detect audio format by inspecting magic numbers (file signatures)
 * @param {Buffer} buffer - Audio buffer to inspect
 * @returns {string} - Detected format: 'mp3', 'wav', 's16le', or 'unknown'
 */
function detectAudioFormat(buffer) {
    if (buffer.length < 4) return 'unknown';

    // Check for MP3 (ID3 tag or MPEG frame sync)
    if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
        return 'mp3'; // ID3v2 tag
    }
    if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) {
        return 'mp3'; // MPEG frame sync
    }

    // Check for WAV (RIFF header)
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
        return 'wav'; // RIFF
    }

    // If no recognizable header, assume raw PCM (signed 16-bit little-endian)
    return 's16le';
}

/**
 * Convert audio buffer to PCM S16LE 8kHz using ffmpeg (File-based)
 * @param {Buffer} audioBuffer - Input audio buffer
 * @param {string} sourceFormat - Source audio format
 * @returns {Promise<Buffer>} - PCM 8kHz buffer
 */
async function convertToPcm8k(audioBuffer, sourceFormat) {
    return new Promise((resolve, reject) => {
        try {
            const inputExt = sourceFormat === 's16le' ? 'pcm' : sourceFormat;

            // Build ffmpeg args for memory-based processing
            const args = [
                '-y',
                '-i', 'pipe:0',      // Input from stdin
                '-f', 's16le',
                '-ar', '8000',
                '-ac', '1',
                '-acodec', 'pcm_s16le',
                'pipe:1'             // Output to stdout
            ];

            if (sourceFormat === 's16le') {
                args.splice(1, 0, '-f', 's16le', '-ar', '24000', '-ac', '1');
            }

            const ffmpeg = spawn('ffmpeg', args);
            let pcmData = Buffer.alloc(0);
            let ffmpegError = '';

            ffmpeg.stdout.on('data', (data) => {
                pcmData = Buffer.concat([pcmData, data]);
            });

            ffmpeg.stderr.on('data', (data) => {
                ffmpegError += data.toString();
            });

            ffmpeg.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`ffmpeg exited with code ${code}. Error: ${ffmpegError}`));
                    return;
                }
                resolve(pcmData);
            });

            ffmpeg.on('error', (err) => {
                reject(new Error(`FFmpeg error: ${err.message}`));
            });

            // Write input buffer to ffmpeg stdin
            ffmpeg.stdin.write(audioBuffer);
            ffmpeg.stdin.end();

        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Convert audio buffer to MP3 format using ffmpeg
 * @param {Buffer} audioBuffer - Source audio buffer
 * @param {string} sourceFormat - Source format (mp3, wav, s16le, etc.)
 * @returns {Promise<Buffer>} - MP3 audio buffer
 */
async function convertToMp3(audioBuffer, sourceFormat) {
    return new Promise((resolve, reject) => {
        try {
            const args = [
                '-y',
                '-i', 'pipe:0',
                '-codec:a', 'libmp3lame',
                '-b:a', '128k',
                '-ar', '44100',
                '-ac', '2',
                '-f', 'mp3',
                'pipe:1'
            ];

            if (sourceFormat === 's16le') {
                args.splice(1, 0, '-f', 's16le', '-ar', '24000', '-ac', '1');
            }

            const ffmpeg = spawn('ffmpeg', args);
            let mp3Data = Buffer.alloc(0);
            let ffmpegError = '';

            ffmpeg.stdout.on('data', (data) => {
                mp3Data = Buffer.concat([mp3Data, data]);
            });

            ffmpeg.stderr.on('data', (data) => {
                ffmpegError += data.toString();
            });

            ffmpeg.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`ffmpeg MP3 conversion failed with code ${code}. Error: ${ffmpegError}`));
                    return;
                }
                resolve(mp3Data);
            });

            ffmpeg.on('error', (err) => {
                reject(new Error(`FFmpeg MP3 conversion error: ${err.message}`));
            });

            ffmpeg.stdin.write(audioBuffer);
            ffmpeg.stdin.end();

        } catch (err) {
            reject(err);
        }
    });
}


/**
 * Generate speech audio using Sarvam TTS API
 * @param {string} text - The text to convert to speech
 * @param {Object} options - TTS options
 * @returns {Promise<Buffer>} - Audio buffer in ulaw_8000 format for Twilio
 */
async function generateSarvamTTS(text, options = {}) {
    try {
        const apiKey = process.env.SARVAM_API_KEY;

        if (!apiKey) {
            throw new Error("SARVAM_API_KEY not configured in environment variables");
        }

        const language = options.target_language_code || options.language || 'en-IN';
        const speaker = options.speaker;

        console.log(`[TTS] Using provider: Sarvam`);
        console.log(`   Text: "${text.substring(0, 50)}..."`);
        console.log(`   Speaker: ${speaker}`);

        // Determine output codec and sample rate based on use case
        let outputCodec = 'mulaw';  // Default: µ-law for Twilio
        let sampleRate = 8000;      // Default: 8kHz for Twilio

        if (options.skipTwilioConversion) {
            // For preview: use requested format (default to mp3) and higher sample rate
            outputCodec = options.format || 'mp3';
            sampleRate = 24000; // Better quality for preview
            console.log(`[TTS] Preview mode: requesting ${outputCodec} at ${sampleRate}Hz`);
        } else {
            console.log(`[TTS] Twilio mode: requesting mulaw directly (NO CONVERSION NEEDED!)`);
        }
        if (!options.skipTwilioConversion) {
            outputCodec = 'wav';
            sampleRate = 22050;
            console.log(`[TTS] Override: requesting WAV and normalizing to µ-law 8kHz locally`);
        }

        // Request audio from Sarvam with optimal format
        const requestBody = {
            inputs: [text],
            target_language_code: language,
            speaker: speaker,
            model: "bulbul:v2",
            enable_preprocessing: true,
            speech_sample_rate: sampleRate,
            output_audio_codec: outputCodec  // ✨ NEW: Request specific codec!
        };

        console.log(`[TTS] Sarvam request:`, {
            speaker,
            language,
            sample_rate: sampleRate,
            codec: outputCodec
        });

        const response = await nodeFetch(
            "https://api.sarvam.ai/text-to-speech",
            {
                method: "POST",
                headers: {
                    "api-subscription-key": apiKey,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            }
        );

        if (!response.ok) {
            let errorMessage = `Sarvam API error: ${response.status}`;
            try {
                const errorData = await response.json();
                // Properly serialize the error object
                errorMessage += ` - ${typeof errorData === 'string' ? errorData : JSON.stringify(errorData)}`;
            } catch (e) {
                try {
                    const errorText = await response.text();
                    errorMessage += ` - ${errorText}`;
                } catch (e2) {
                    errorMessage += ' - (could not read error body)';
                }
            }
            console.error('[TTS] Sarvam error details:', errorMessage);
            throw new Error(errorMessage);
        }

        const jsonResponse = await response.json();
        const base64Audio = jsonResponse.audios && jsonResponse.audios[0];

        if (!base64Audio) {
            throw new Error('No audio data in Sarvam response');
        }

        const audioBuffer = Buffer.from(base64Audio, 'base64');
        console.log(`[TTS] Sarvam raw audio size: ${audioBuffer.length} bytes`);

        // Check format
        const actualFormat = detectAudioFormat(audioBuffer);
        console.log(`[TTS] Detected Sarvam format: ${actualFormat}`);

        // If skipTwilioConversion is true, return MP3 for browser preview
        if (options.skipTwilioConversion) {
            console.log(`[TTS] skipTwilioConversion=true, converting to MP3 for browser preview`);

            // If already MP3, return as-is
            if (actualFormat === 'mp3') {
                console.log(`[TTS] Audio is already MP3, returning as-is`);
                return audioBuffer;
            }

            // Convert to MP3 using FFmpeg
            const mp3Buffer = await convertToMp3(audioBuffer, actualFormat);
            console.log(`[TTS] Converted to MP3: ${mp3Buffer.length} bytes`);
            return mp3Buffer;
        }

        // For Twilio calls: Check if we already have µ-law
        console.log(`[TTS] Processing audio for Twilio...`);

        // If we requested mulaw and got it, return directly!
        if (outputCodec === 'mulaw') {
            console.log(`[TTS] ✨ Sarvam returned µ-law directly - NO CONVERSION NEEDED!`);
            console.log(`[TTS] Audio size: ${audioBuffer.length} bytes`);
            // Sarvam returns raw µ-law data when requested
            return audioBuffer;
        }

        // Otherwise, we have PCM/WAV/MP3 and need to convert
        console.log(`[TTS] Converting ${actualFormat} to µ-law for Twilio...`);

        // Step 1: Convert to PCM 8k (using FFmpeg)
        const pcmBuffer = await convertToPcm8k(audioBuffer, actualFormat);
        console.log(`[TTS] Converted to PCM 8k: ${pcmBuffer.length} bytes`);

        // Step 2: Encode to MuLaw (using JS)
        const ulawBuffer = pcmToMuLaw(pcmBuffer);
        console.log(`[TTS] Encoded to MuLaw: ${ulawBuffer.length} bytes`);

        return ulawBuffer;

    } catch (error) {
        console.error("[TTS] Error in Sarvam TTS:", error.message);
        throw error;
    }
}

module.exports = {
    generateSarvamTTS, // Export MUST match what tts_controller requires
};
