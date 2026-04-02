const nodeFetch = require("node-fetch");
const { v4: uuidv4 } = require("uuid");

class VoiceSyncService {
    constructor(pool) {
        this.pool = pool;
        this.cache = {
            data: null,
            timestamp: null,
            ttl: 30 * 60 * 1000 // 30 minutes
        };
    }

    async syncAllProviders() {
        console.log('[VoiceSync] Starting sync for all providers...');

        const results = {
            success: true,
            synced: 0,
            errors: []
        };

        try {
            // Sync ElevenLabs voices
            const elevenLabsResult = await this.syncElevenLabsVoices();
            results.synced += elevenLabsResult.count;
            if (!elevenLabsResult.success) {
                results.errors.push(`ElevenLabs: ${elevenLabsResult.error}`);
            }
        } catch (error) {
            console.error('[VoiceSync] ElevenLabs sync failed:', error);
            results.errors.push(`ElevenLabs: ${error.message}`);
        }

        try {
            // Sync Sarvam voices
            const sarvamResult = await this.syncSarvamVoices();
            results.synced += sarvamResult.count;
            if (!sarvamResult.success) {
                results.errors.push(`Sarvam: ${sarvamResult.error}`);
            }
        } catch (error) {
            console.error('[VoiceSync] Sarvam sync failed:', error);
            results.errors.push(`Sarvam: ${error.message}`);
        }

        // Clear cache after sync
        this.cache.data = null;
        this.cache.timestamp = null;

        console.log(`[VoiceSync] Sync complete. Total synced: ${results.synced}, Errors: ${results.errors.length}`);

        return results;
    }

    /**
     * Sync voices from ElevenLabs
     * @returns {Promise<{success: boolean, count: number, error?: string}>}
     */
    async syncElevenLabsVoices() {
        console.log('[VoiceSync] Fetching ElevenLabs voices...');

        try {
            const apiKey = process.env.ELEVEN_LABS_API_KEY || process.env.ELEVEN_LABS_API_KEY;

            if (!apiKey) {
                return {
                    success: false,
                    count: 0,
                    error: 'ElevenLabs API key not configured'
                };
            }

            const response = await nodeFetch('https://api.elevenlabs.io/v1/voices', {
                method: 'GET',
                headers: {
                    'xi-api-key': apiKey,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`ElevenLabs API error: ${response.status} - ${response.statusText}`);
            }

            const data = await response.json();
            const voices = data.voices || [];

            console.log(`[VoiceSync] Received ${voices.length} voices from ElevenLabs`);

            let syncedCount = 0;
            for (const rawVoice of voices) {
                try {
                    const voiceDTO = this.normalizeElevenLabsVoice(rawVoice);
                    await this.upsertVoice(voiceDTO);
                    syncedCount++;
                } catch (error) {
                    console.error(`[VoiceSync] Error upserting ElevenLabs voice ${rawVoice.voice_id}:`, error.message);
                }
            }

            return {
                success: true,
                count: syncedCount
            };

        } catch (error) {
            console.error('[VoiceSync] ElevenLabs sync error:', error);
            return {
                success: false,
                count: 0,
                error: error.message
            };
        }
    }

    /**
     * Sync voices from Sarvam
     * @returns {Promise<{success: boolean, count: number, error?: string}>}
     */
    async syncSarvamVoices() {
        console.log('[VoiceSync] Fetching Sarvam voices...');

        try {
            // VERIFIED: These are the ONLY 7 speakers supported by Sarvam bulbul:v2.
            // Confirmed from the API: "Available speakers for bulbul:v2 are: anushka, abhilash, manisha, vidya, arya, karun, hitesh"
            const validSpeakers = ['anushka', 'manisha', 'vidya', 'arya', 'abhilash', 'karun', 'hitesh'];

            // Purge any old/invalid Sarvam voices that are no longer supported
            await this.pool.execute(
                `DELETE FROM voices WHERE provider = 'sarvam' AND provider_voice_id NOT IN (${validSpeakers.map(() => '?').join(',')})`,
                validSpeakers
            );
            console.log('[VoiceSync] Purged invalid Sarvam voices from DB');

            const sarvamVoices = [
                { speaker: 'anushka', language: 'en-IN', gender: 'female' },
                { speaker: 'manisha', language: 'en-IN', gender: 'female' },
                { speaker: 'vidya', language: 'en-IN', gender: 'female' },
                { speaker: 'arya', language: 'en-IN', gender: 'female' },
                { speaker: 'abhilash', language: 'en-IN', gender: 'male' },
                { speaker: 'karun', language: 'en-IN', gender: 'male' },
                { speaker: 'hitesh', language: 'en-IN', gender: 'male' },
            ];

            console.log(`[VoiceSync] Upserting ${sarvamVoices.length} Sarvam voices`);

            let syncedCount = 0;
            for (const rawVoice of sarvamVoices) {
                try {
                    const voiceDTO = this.normalizeSarvamVoice(rawVoice);
                    await this.upsertVoice(voiceDTO);
                    syncedCount++;
                } catch (error) {
                    console.error(`[VoiceSync] Error upserting Sarvam voice ${rawVoice.speaker}:`, error.message);
                }
            }

            return {
                success: true,
                count: syncedCount
            };

        } catch (error) {
            console.error('[VoiceSync] Sarvam sync error:', error);
            return {
                success: false,
                count: 0,
                error: error.message
            };
        }
    }

    /**
     * Normalize ElevenLabs voice to common DTO format
     * @param {any} rawVoice - Raw voice data from ElevenLabs API
     * @returns {VoiceDTO}
     */
    normalizeElevenLabsVoice(rawVoice) {
        return {
            provider: 'elevenlabs',
            providerVoiceId: rawVoice.voice_id,
            displayName: rawVoice.name,
            languageCode: rawVoice.labels?.language || 'en-US',
            gender: rawVoice.labels?.gender || null,
            sampleRate: null,
            locale: rawVoice.labels?.accent || null,
            isPreviewAvailable: !!rawVoice.preview_url,
            meta: {
                category: rawVoice.category,
                description: rawVoice.description,
                previewUrl: rawVoice.preview_url,
                labels: rawVoice.labels,
                settings: rawVoice.settings
            }
        };
    }

    /**
     * Normalize Sarvam voice to common DTO format
     * @param {any} rawVoice - Raw voice data from Sarvam
     * @returns {VoiceDTO}
     */
    normalizeSarvamVoice(rawVoice) {
        const firstName = rawVoice.speaker.charAt(0).toUpperCase() + rawVoice.speaker.slice(1);
        const genderLabel = rawVoice.gender
            ? ` (${rawVoice.gender.charAt(0).toUpperCase() + rawVoice.gender.slice(1)})`
            : '';
        return {
            provider: 'sarvam',
            providerVoiceId: rawVoice.speaker,
            displayName: `${firstName}${genderLabel}`,
            // bulbul:v2 always uses en-IN as the API target_language_code.
            // The gender/accent origin is informational only.
            languageCode: 'en-IN',
            gender: rawVoice.gender || null,
            sampleRate: null,
            locale: 'en-IN',
            isPreviewAvailable: true,
            meta: {
                speaker: rawVoice.speaker,
                accentOrigin: rawVoice.language,
                supportedLanguages: ['en-IN']
            }
        };
    }

    /**
     * Upsert voice into database
     * @param {VoiceDTO} voiceDTO - Normalized voice data
     * @returns {Promise<void>}
     */
    async upsertVoice(voiceDTO) {
        try {
            const id = uuidv4();
            const metaJson = JSON.stringify(voiceDTO.meta || {});

            // Try to insert, on duplicate key update
            await this.pool.execute(
                `INSERT INTO voices 
                (id, provider, provider_voice_id, display_name, language_code, gender, sample_rate, locale, is_preview_available, meta)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                display_name = VALUES(display_name),
                language_code = VALUES(language_code),
                gender = VALUES(gender),
                sample_rate = VALUES(sample_rate),
                locale = VALUES(locale),
                is_preview_available = VALUES(is_preview_available),
                meta = VALUES(meta),
                updated_at = CURRENT_TIMESTAMP`,
                [
                    id,
                    voiceDTO.provider,
                    voiceDTO.providerVoiceId,
                    voiceDTO.displayName,
                    voiceDTO.languageCode,
                    voiceDTO.gender,
                    voiceDTO.sampleRate,
                    voiceDTO.locale,
                    voiceDTO.isPreviewAvailable,
                    metaJson
                ]
            );

            console.log(`[VoiceSync] Upserted voice: ${voiceDTO.provider}/${voiceDTO.providerVoiceId} - ${voiceDTO.displayName}`);

        } catch (error) {
            console.error('[VoiceSync] Error upserting voice:', error);
            throw error;
        }
    }

    /**
     * Get all voices from database
     * @param {string} provider - Filter by provider (all, elevenlabs, sarvam)
     * @returns {Promise<any[]>}
     */
    async getVoices(provider = 'all') {
        try {
            // Check cache first
            if (this.cache.data && Date.now() - this.cache.timestamp < this.cache.ttl) {
                console.log('[VoiceSync] Returning cached voices');
                return this.filterVoicesByProvider(this.cache.data, provider);
            }

            // Fetch from database
            let [rows] = await this.pool.execute(
                'SELECT * FROM voices ORDER BY provider, display_name'
            );

            // Auto-seed Sarvam voices if DB has none
            // This ensures the first page load always shows voices without needing a manual /sync call.
            const hasSarvam = rows.some(r => r.provider === 'sarvam');
            if (!hasSarvam) {
                console.log('[VoiceSync] No Sarvam voices found in DB — auto-seeding...');
                await this.syncSarvamVoices();
                // Re-fetch after seeding
                [rows] = await this.pool.execute(
                    'SELECT * FROM voices ORDER BY provider, display_name'
                );
            }

            // Parse meta JSON (MySQL might return it as object or string depending on driver)
            const voices = rows.map(row => ({
                ...row,
                meta: typeof row.meta === 'string' ? JSON.parse(row.meta) : (row.meta || {})
            }));

            // Update cache
            this.cache.data = voices;
            this.cache.timestamp = Date.now();

            console.log(`[VoiceSync] Fetched ${voices.length} voices from database`);

            return this.filterVoicesByProvider(voices, provider);

        } catch (error) {
            console.error('[VoiceSync] Error fetching voices:', error);
            throw error;
        }
    }

    /**
     * Filter voices by provider
     * @param {any[]} voices - All voices
     * @param {string} provider - Provider filter
     * @returns {any[]}
     */
    filterVoicesByProvider(voices, provider) {
        if (provider === 'all') {
            return voices;
        }
        return voices.filter(v => v.provider === provider);
    }

    /**
     * Get voice by ID
     * @param {string} id - Voice ID
     * @returns {Promise<any|null>}
     */
    async getVoiceById(id) {
        try {
            // First try to find by UUID (id field)
            let [rows] = await this.pool.execute(
                'SELECT * FROM voices WHERE id = ?',
                [id]
            );

            // If not found, try to find by provider_voice_id (for backward compatibility)
            if (rows.length === 0) {
                [rows] = await this.pool.execute(
                    'SELECT * FROM voices WHERE provider_voice_id = ?',
                    [id]
                );
            }

            if (rows.length === 0) {
                return null;
            }

            const voice = rows[0];
            return {
                ...voice,
                meta: typeof voice.meta === 'string' ? JSON.parse(voice.meta) : (voice.meta || {})
            };

        } catch (error) {
            console.error('[VoiceSync] Error fetching voice by ID:', error);
            throw error;
        }
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.data = null;
        this.cache.timestamp = null;
        console.log('[VoiceSync] Cache cleared');
    }
}

module.exports = VoiceSyncService;
