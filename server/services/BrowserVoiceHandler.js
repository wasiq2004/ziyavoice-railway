// Sarvam STT is the sole STT provider
const { LLMService } = require("../llmService.js");
const SarvamSttService = require('./sarvamSttService.js');
const WalletService = require('./walletService.js');
const CostCalculator = require('./costCalculator.js');
const AgentService = require('./agentService.js');
const ToolExecutionService = require('./toolExecutionService.js');
const fetch = require('node-fetch');

// Session management
const sessions = new Map();

class BrowserVoiceHandler {
    constructor(geminiApiKey, openaiApiKey, elevenLabsApiKey, sarvamApiKey, mysqlPool = null) {
        if (!sarvamApiKey) throw new Error("Missing SARVAM_API_KEY for STT");

        this.geminiApiKey = geminiApiKey;
        this.openaiApiKey = openaiApiKey;
        this.elevenLabsApiKey = elevenLabsApiKey;
        this.sarvamApiKey = sarvamApiKey;
        this.mysqlPool = mysqlPool;
        this.llmService = new LLMService(geminiApiKey, openaiApiKey);
        this.sarvamSttService = new SarvamSttService(sarvamApiKey);

        // Initialize wallet and cost tracking services
        if (mysqlPool) {
            this.walletService = new WalletService(mysqlPool);
            this.costCalculator = new CostCalculator(mysqlPool, this.walletService);
        }

        console.log('✅ BrowserVoiceHandler initialized (Sarvam STT)');
    }

    /**
     * Create a new voice session for a browser client
     */
    createSession(connectionId, agentPrompt, agentVoiceId, ws, userId = null, agentId = null, agentModel = null, agentSettings = null, tools = []) {
        const session = {
            connectionId,
            agentPrompt,
            agentVoiceId,
            agentModel: agentModel || "gemini-2.0-flash",
            agentSettings,
            tools,
            ws,
            userId,
            agentId,
            conversationHistory: [],
            elevenLabsConnection: null,
            isProcessing: false,
            audioQueue: [], // Unused, keeping for compatibility if needed
            inputQueue: [], // Queue for user inputs to prevent dropping
            audioBuffer: [], // Accumulate audio chunks here
            speechDetectedInChunk: false, // Flag to track if speech was detected in current buffer
            silenceTimer: null,
            startTime: Date.now(),
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalAudioDuration: 0, // In seconds for legacy
            totalSTTSeconds: 0,    // New accurate tracking
            totalTTSCharacters: 0, // New accurate tracking
            callLogId: null,
            userSpeechBuffer: '',
            lastSpeechTime: Date.now(),
            isInterrupted: false,
        };

        sessions.set(connectionId, session);
        console.log(`📞 Created browser voice session: ${connectionId}`);

        return session;
    }

    /**
     * End a voice session and cleanup resources
     */
    async endSession(connectionId) {
        const session = sessions.get(connectionId);
        if (!session) return;

        console.log(`📴 Ending browser voice session: ${connectionId}`);

        // Deepgram cleanup removed


        // Close ElevenLabs connection
        if (session.elevenLabsConnection) {
            try {
                session.elevenLabsConnection.close();
            } catch (error) {
                console.error('Error closing ElevenLabs connection:', error);
            }
        }

        // Clear silence timer
        if (session.silenceTimer) {
            clearTimeout(session.silenceTimer);
        }

        // Log call end
        await this.logCallEnd(session);

        sessions.delete(connectionId);
    }

    /**
     * Handle incoming WebSocket connection from browser
     */
    handleConnection(ws, req) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const voiceId = url.searchParams.get('voiceId') || 'default';
        const agentId = url.searchParams.get('agentId');
        const userId = url.searchParams.get('userId');
        const identity = decodeURIComponent(url.searchParams.get('identity') || '');
        const connectionId = `browser-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        console.log(`🌐 New browser voice connection: ${connectionId}`);
        console.log(`   Voice ID: ${voiceId}, Agent ID: ${agentId}, User ID: ${userId}`);

        (async () => {
            let agentPrompt = identity;
            let agentVoiceId = voiceId && voiceId !== 'default' ? voiceId : "21m00Tcm4TlvDq8ikWAM"; // default
            let agentModel = "gemini-2.0-flash"; // default model
            let greetingMessage = "Hello! How can I help you today?";
            let tools = [];
            let agent = null;
            let settings = null;

            if (agentId && userId && this.mysqlPool) {
                try {
                    const agentService = new AgentService(this.mysqlPool);
                    agent = await agentService.getAgentById(userId, agentId);
                    if (agent) {
                        agentPrompt = agent.identity || agentPrompt;
                        settings = agent.settings;

                        // Process Tools
                        if (agent.settings && agent.settings.tools && agent.settings.tools.length > 0) {
                            tools = agent.settings.tools;
                            const toolDescriptions = tools.map(tool =>
                                `- ${tool.name}: ${tool.description} (Parameters: ${tool.parameters?.map(p => `${p.name} (${p.type})${p.required ? ' [required]' : ''}`).join(', ') || 'None'})`
                            ).join('\n');

                            agentPrompt += `\n\nAvailable Tools:\n${toolDescriptions}\n\nWhen you need to collect information from the user, ask for the required parameters. When all required information is collected, respond with a JSON object in the format: {"tool": "tool_name", "data": {"param1": "value1", "param2": "value2"}}. Do NOT add any other text before or after the JSON.`;
                        }

                        // Only overwrite voice if it wasn't explicitly provided in query params
                        if ((!voiceId || voiceId === 'default') && agent.voiceId) {
                            agentVoiceId = agent.voiceId;
                        }

                        if (agent.model) {
                            agentModel = agent.model;
                            console.log(`🤖 Using agent model: ${agentModel}`);
                        }
                        if (agent.settings?.greetingLine) greetingMessage = agent.settings.greetingLine;
                        console.log(`✅ Loaded agent details for ${agent.name} with ${tools.length} tools`);
                    }
                } catch (err) {
                    console.error("⚠️ Error loading agent details:", err);
                }
            }

            // Check user balance before starting call
            if (userId && this.walletService) {
                try {
                    const balanceCheck = await this.walletService.checkBalanceForCall(userId, 0.10);
                    if (!balanceCheck.allowed) {
                        console.error(`❌ Insufficient balance for user ${userId}: ${balanceCheck.message}`);
                        ws.send(JSON.stringify({
                            event: 'error',
                            message: balanceCheck.message,
                            balance: balanceCheck.balance
                        }));
                        ws.close();
                        return;
                    }
                    console.log(`✅ Balance check passed: $${balanceCheck.balance.toFixed(4)}`);
                } catch (err) {
                    console.error("⚠️ Error checking balance:", err);
                }
            }

            // Create session
            const session = this.createSession(connectionId, agentPrompt, agentVoiceId, ws, userId, agentId, agentModel, settings, tools);

            // Add multilingual instruction to system prompt
            session.agentPrompt += `\n\nIMPORTANT: You must respond in the same language as the user's input. Do not translate unless explicitly requested. If the user speaks Hindi, reply in Hindi. If English, reply in English.`;

            // Send initial greeting if configured
            // Use the greeting from agent settings if available
            this.sendInitialGreeting(session, greetingMessage);

            // Handle incoming messages from browser
            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);

                    switch (data.event) {
                        case 'audio':
                            // Buffer audio and perform VAD
                            await this.handleIncomingAudio(session, data.data);
                            break;

                        case 'ping':
                            ws.send(JSON.stringify({ event: 'pong' }));
                            break;

                        case 'stop-speaking':
                            // Handle user interruption
                            this.handleInterruption(session);
                            break;

                        default:
                            console.log(`Unknown event: ${data.event}`);
                    }
                } catch (error) {
                    console.error('Error processing browser message:', error);
                    ws.send(JSON.stringify({
                        event: 'error',
                        message: 'Failed to process message'
                    }));
                }
            });

            // Handle WebSocket close
            ws.on('close', async () => {
                console.log(`🔌 Browser disconnected: ${connectionId}`);
                await this.endSession(connectionId);
            });

            // Handle WebSocket errors
            ws.on('error', (error) => {
                console.error(`❌ Browser WebSocket error (${connectionId}):`, error);
            });

            // Log call start
            this.logCallStart(session);

        })();
    }

    /**
     * Initialize Deepgram streaming connection - Removed
     */
    initializeDeepgramStreaming(session) {
        // Deprecated/Removed
        console.log('Deepgram streaming disabled in favor of Sarvam STT');
    }

    /**
     * Handle incoming audio from browser
     * Buffers audio and uses simple VAD to detect silence/utterance end
     */
    async handleIncomingAudio(session, base64Audio) {
        try {
            // Decode base64 audio to buffer (Int16 PCM)
            const audioChunk = Buffer.from(base64Audio, 'base64');
            session.audioBuffer.push(audioChunk);

            // Simple energy-based VAD (Voice Activity Detection)
            // Calculate RMS (Root Mean Square) amplitude
            let sumSquares = 0;
            // Iterate by 2 bytes (16-bit samples)
            for (let i = 0; i < audioChunk.length; i += 2) {
                const sample = audioChunk.readInt16LE(i);
                sumSquares += sample * sample;
            }
            const numSamples = audioChunk.length / 2;
            const rms = Math.sqrt(sumSquares / numSamples);

            // Threshold for silence (adjustable)
            // 0x7FFF is max (32767). Low values like 500-1000 indicate silence.
            // Frontend might already filter very quiet noise, but let's be safe.
            const SILENCE_THRESHOLD = 3000;

            if (rms > SILENCE_THRESHOLD) {
                // Speech detected
                session.speechDetectedInChunk = true; // Mark that we found speech
                session.lastSpeechTime = Date.now();
                if (session.silenceTimer) {
                    clearTimeout(session.silenceTimer);
                    session.silenceTimer = null;
                }
            } else {
                // Silence detected
                if (!session.silenceTimer && session.audioBuffer.length > 0) {
                    // 700ms: long enough to avoid cutting mid-sentence, short enough to feel real-time.
                    session.silenceTimer = setTimeout(() => {
                        this.processBufferedAudio(session);
                    }, 700);
                }
            }
        } catch (error) {
            console.error('Error handling incoming audio:', error);
        }
    }

    /**
     * Process buffered audio: Transcribe with Sarvam -> LLM
     */
    async processBufferedAudio(session) {
        if (session.audioBuffer.length === 0) return;

        // Reset timer
        session.silenceTimer = null;

        // Check if we legitimate speech was detected in this chunk
        if (!session.speechDetectedInChunk) {
            console.log(`🔇 Dropping buffer of pure silence (${session.audioBuffer.length} chunks)`);
            session.audioBuffer = [];
            return;
        }

        // Concatenate buffer
        const completeBuffer = Buffer.concat(session.audioBuffer);
        // Clear buffer and reset speech flag
        session.audioBuffer = [];
        session.speechDetectedInChunk = false;

        // Skip if buffer is too short (likely just noise / click).
        // With VAD at 700ms, the silence tail is much shorter.
        // 16000 bytes (16kHz 16-bit mono) = ~0.5s — filters clicks/pops but keeps short words like "yes".
        if (completeBuffer.length < 16000) {
            console.log(`⚠️ Dropping short audio buffer: ${completeBuffer.length} bytes (likely noise)`);
            return;
        }

        try {
            console.log(`🎤 Sending ${completeBuffer.length} bytes to Sarvam STT...`);

            // Convert raw PCM to WAV container for Sarvam
            const wavBuffer = this.createWavHeader(completeBuffer);

            // Call Sarvam STT
            const result = await this.sarvamSttService.transcribe(wavBuffer);
            const transcript = result.transcript;
            const detectedLanguage = result.language_code;

            // Track STT duration (16kHz PCM = 32000 bytes/sec)
            const durationSeconds = completeBuffer.length / 32000;
            session.totalSTTSeconds += durationSeconds;
            session.totalAudioDuration += durationSeconds; // Compatibility

            if (transcript && transcript.trim()) {
                const cleanTranscript = transcript.trim();
                console.log(`📝 Sarvam Transcript: "${cleanTranscript}" (Language: ${detectedLanguage})`);

                // Store detected language for TTS later
                if (detectedLanguage) {
                    session.detectedLanguage = detectedLanguage;
                }

                // Filter out common STT hallucinations on silence.
                // With VAD at 700ms: speech + 700ms tail.
                // A real 'Yes' at 300ms + 700ms tail = ~32,000 bytes.
                // Buffer < 20,000 bytes = sub-0.6s total = likely hallucination.
                const hallucinations = ['Okay.', 'Yes.', 'No.', 'Okay', 'Yes', 'No'];
                if (hallucinations.includes(cleanTranscript) && completeBuffer.length < 20000) {
                    console.log(`⚠️ Ignoring likely hallucination: "${cleanTranscript}" (buffer: ${completeBuffer.length})`);
                    return;
                }

                // Send user transcript to browser
                session.ws.send(JSON.stringify({
                    event: 'transcript',
                    text: cleanTranscript,
                    isFinal: true
                }));

                // Add to conversation history
                this.appendToContext(session, cleanTranscript, 'user');

                // Process with LLM
                await this.processUserInput(session, cleanTranscript);
            } else {
                console.log('📝 Empty transcript from Sarvam');
            }

        } catch (error) {
            console.error('❌ Sarvam STT processing error:', error);
            session.ws.send(JSON.stringify({
                event: 'error',
                message: 'Speech recognition failed'
            }));
        }
    }

    /**
     * Create WAV header for PCM data
     */
    createWavHeader(pcmData) {
        const numChannels = 1;
        const sampleRate = 16000;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
        const blockAlign = numChannels * (bitsPerSample / 8);
        const dataSize = pcmData.length;
        const buffer = Buffer.alloc(44 + dataSize);

        // RIFF chunk
        buffer.write('RIFF', 0);
        buffer.writeUInt32LE(36 + dataSize, 4);
        buffer.write('WAVE', 8);

        // fmt sub-chunk
        buffer.write('fmt ', 12);
        buffer.writeUInt32LE(16, 16); // Subchunk1Size
        buffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
        buffer.writeUInt16LE(numChannels, 22);
        buffer.writeUInt32LE(sampleRate, 24);
        buffer.writeUInt32LE(byteRate, 28);
        buffer.writeUInt16LE(blockAlign, 32);
        buffer.writeUInt16LE(bitsPerSample, 34);

        // data sub-chunk
        buffer.write('data', 36);
        buffer.writeUInt32LE(dataSize, 40);

        // Write PCM data
        pcmData.copy(buffer, 44);

        return buffer;
    }

    /**
     * Process user input with LLM
     */
    async processUserInput(session, userInput) {
        // Add to queue
        session.inputQueue.push(userInput);

        if (session.isProcessing) {
            console.log(`🔄 Already processing, queued input: "${userInput}"`);
            return;
        }

        session.isProcessing = true;

        // Process queue
        while (session.inputQueue.length > 0) {
            const currentInput = session.inputQueue.shift();

            try {
                console.log(`🤖 Processing user input (streaming): "${currentInput}"`);

                // Stream LLM response — fires TTS on each complete sentence
                const fullResponse = await this.callLLMStream(session, currentInput);

                if (fullResponse) {
                    // Conversation history already updated inside callLLMStream
                    // Send complete text to browser for transcript display
                    session.ws.send(JSON.stringify({
                        event: 'agent-response',
                        text: fullResponse
                    }));
                }

            } catch (error) {
                console.error('Error processing user input:', error);
                session.ws.send(JSON.stringify({
                    event: 'error',
                    message: 'Failed to process your message'
                }));
            }
        }

        session.isProcessing = false;
    }

    /**
     * STREAMING LLM call — fires TTS per sentence for minimum latency.
     * Replaces the old blocking callLLM().
     */
    async callLLMStream(session, userInput) {
        try {
            console.log(`🧠 [Stream] Calling LLM for session: ${session.connectionId}`);
            const modelToUse = session.agentModel || 'gemini-2.0-flash';
            const isGemini = modelToUse.includes('gemini');

            // Build conversation history in Gemini parts format
            const contents = session.conversationHistory.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            }));

            // Get the async stream from LLM service
            const stream = await this.llmService.generateContentStream({
                model: modelToUse,
                contents,
                config: { systemInstruction: session.agentPrompt }
            });

            let fullText = '';
            let currentSentence = '';
            // Sentence boundaries: period/exclamation/question followed by whitespace or end of string
            const SENTENCE_BOUNDARY = /[.!?]+(\s|$)/;

            for await (const chunk of stream) {
                // Extract text from chunk based on provider format
                let content = '';
                try {
                    content = isGemini ? chunk.text() : (chunk.choices?.[0]?.delta?.content || '');
                } catch (e) {
                    continue; // skip malformed chunks
                }
                if (!content) continue;

                fullText += content;
                currentSentence += content;

                // Fire TTS as soon as a complete sentence is ready
                if (SENTENCE_BOUNDARY.test(currentSentence)) {
                    const match = currentSentence.match(SENTENCE_BOUNDARY);
                    const splitIndex = match.index + match[0].length;
                    const completeSentence = currentSentence.slice(0, splitIndex).trim();
                    currentSentence = currentSentence.slice(splitIndex);

                    // Skip pure JSON tool-call responses — don't speak those
                    if (completeSentence && !completeSentence.startsWith('{')) {
                        console.log(`📡 [Stream] Sentence ready → TTS: "${completeSentence}"`);
                        // Fire-and-forget so next sentence can start streaming while TTS is generating
                        this.synthesizeAndStreamTTS(session, completeSentence).catch(err =>
                            console.error('❌ Sentence TTS error:', err)
                        );
                    }
                }
            }

            // Flush any remaining text that didn't end with punctuation
            if (currentSentence.trim() && !currentSentence.trim().startsWith('{')) {
                console.log(`📡 [Stream] Final sentence → TTS: "${currentSentence.trim()}"`);
                this.synthesizeAndStreamTTS(session, currentSentence.trim()).catch(err =>
                    console.error('❌ Final sentence TTS error:', err)
                );
            }

            console.log(`✅ [Stream] Full LLM response: "${fullText.substring(0, 100)}..."`);

            // Check for tool call in the full response
            try {
                const cleanText = fullText.replace(/```json/g, '').replace(/```/g, '').trim();
                if (cleanText.startsWith('{') && cleanText.endsWith('}')) {
                    const parsed = JSON.parse(cleanText);
                    if (parsed.tool && parsed.data && this.mysqlPool) {
                        console.log(`🛠️ Tool usage detected: ${parsed.tool}`);
                        const tool = session.tools?.find(t => t.name === parsed.tool);
                        if (tool) {
                            const toolService = new ToolExecutionService(this.llmService, this.mysqlPool);
                            await toolService.executeTool(tool, parsed.data, session, session.agentSettings);
                            this.appendToContext(session, JSON.stringify({ tool: parsed.tool, status: 'success', message: 'Data processing initiated' }), 'user');
                            // Recurse to get the verbal confirmation response
                            return await this.callLLMStream(session, 'Tool executed successfully. Please continue.');
                        } else {
                            console.warn(`Tool ${parsed.tool} not found in configuration`);
                        }
                    }
                }
            } catch (jsonError) {
                // Not a JSON tool call — normal text response
            }

            // Update conversation history with full assistant response
            if (fullText) {
                this.appendToContext(session, fullText, 'assistant');
            }

            return fullText;

        } catch (error) {
            console.error('❌ [Stream] LLM call failed:', error);
            const fallback = "I'm sorry, I'm having trouble responding right now.";
            this.synthesizeAndStreamTTS(session, fallback).catch(() => { });
            return fallback;
        }
    }

    /**
     * Synthesize TTS and stream to browser
     */
    async synthesizeAndStreamTTS(session, text) {
        try {
            console.log(`🔊 Synthesizing TTS: "${text.substring(0, 50)}..."`);

            const voiceProvider = this.getVoiceProvider(session.agentVoiceId);

            if (voiceProvider === 'elevenlabs') {
                await this.synthesizeElevenLabsTTS(session, text);
            } else if (voiceProvider === 'sarvam') {
                await this.synthesizeSarvamTTS(session, text);
            } else {
                console.error('Unknown voice provider:', voiceProvider);
            }

            // Track TTS characters
            session.totalTTSCharacters += text.length;

        } catch (error) {
            console.error('Error synthesizing TTS:', error);
            session.ws.send(JSON.stringify({
                event: 'error',
                message: 'Failed to generate speech'
            }));
        }
    }

    /**
     * Synthesize with ElevenLabs TTS — turbo model for minimum latency.
     * Uses eleven_turbo_v2_5 (real-time model, 2-3x faster) and mp3_22050_32
     * (75% smaller than default → faster generation AND faster download).
     * Sends a single complete 'audio' event so the browser's decodeAudioData()
     * always receives a valid, complete MP3 file.
     */
    async synthesizeElevenLabsTTS(session, text) {
        try {
            if (!this.elevenLabsApiKey) {
                throw new Error('ElevenLabs API key not configured');
            }

            const voiceId = session.agentVoiceId;
            const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`;

            console.log(`🔊 [EL] Requesting TTS (turbo) for: "${text.substring(0, 60)}"`);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': this.elevenLabsApiKey
                },
                body: JSON.stringify({
                    text,
                    // eleven_turbo_v2_5: ElevenLabs' real-time optimised model — 2-3x faster
                    model_id: 'eleven_turbo_v2_5',
                    // mp3_22050_32: ~75% smaller than default 128kbps → faster API + faster transfer
                    output_format: 'mp3_22050_32',
                    voice_settings: {
                        stability: 0.4,
                        similarity_boost: 0.7
                        // style & use_speaker_boost intentionally omitted — add latency on EL side
                    }
                })
            });

            if (!response.ok) {
                const errText = await response.text().catch(() => response.statusText);
                throw new Error(`ElevenLabs API error: ${response.status} - ${errText}`);
            }

            // Collect the streaming response into a complete buffer.
            // NOTE: We MUST send a complete MP3 to the browser because the frontend
            // uses AudioContext.decodeAudioData() which requires a valid, full audio file.
            // Partial chunks would cause decoding failures.
            const chunks = [];
            for await (const chunk of response.body) {
                chunks.push(chunk);
            }
            const audioBuffer = Buffer.concat(chunks);

            session.ws.send(JSON.stringify({
                event: 'audio',
                audio: audioBuffer.toString('base64'),
                format: 'mp3'
            }));

            console.log(`✅ [EL] Sent ${audioBuffer.length} bytes for: "${text.substring(0, 40)}"`);

        } catch (error) {
            console.error('❌ ElevenLabs TTS error:', error);
            throw error;
        }
    }
    /**
     * Synthesize with Sarvam TTS
     */
    async synthesizeSarvamTTS(session, text) {
        try {
            if (!this.sarvamApiKey) {
                throw new Error('Sarvam API key not configured');
            }

            const url = 'https://api.sarvam.ai/text-to-speech';

            console.log(`🔊 Calling Sarvam TTS API...`);
            console.log(`   Text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
            // Clean speaker ID (remove 'sarvam:' or 'sarvam/' prefix if present)
            const cleanSpeakerId = session.agentVoiceId.replace(/^sarvam[:/]/i, '');
            console.log(`   Speaker (clean): ${cleanSpeakerId}`);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-subscription-key': this.sarvamApiKey  // Lowercase header name
                },
                body: JSON.stringify({
                    inputs: [text],
                    target_language_code: session.detectedLanguage || 'en-IN',  // use detected language
                    speaker: cleanSpeakerId,
                    pitch: 0.2,
                    pace: 0.95,
                    loudness: 1.5,
                    speech_sample_rate: 22050,
                    enable_preprocessing: true,
                    model: 'bulbul:v2'
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ Sarvam API error: ${response.status} - ${response.statusText}`);
                console.error(`   Error details: ${errorText}`);
                throw new Error(`Sarvam API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log(`✅ Sarvam API response received`);

            if (data.audios && data.audios.length > 0) {
                const base64Audio = data.audios[0];

                session.ws.send(JSON.stringify({
                    event: 'audio',
                    audio: base64Audio,
                    format: 'wav' // Sarvam returns WAV by default (base64 encoded)
                }));

                console.log('✅ Sarvam TTS audio sent to browser');
            } else {
                throw new Error('No audio data in Sarvam response');
            }

        } catch (error) {
            console.error('❌ Sarvam TTS error:', error);
            throw error;
        }
    }

    /**
     * Get voice provider from voice ID
     */
    getVoiceProvider(voiceId) {
        // Sarvam voice IDs - comprehensive list
        const sarvamVoices = [
            // Female voices
            'ananya', 'aditi', 'vidya', 'manisha', 'anushka', 'amartya',
            // Male voices
            'arvind', 'abhilash', 'aarav', 'karun', 'dhruv', 'rohan',
            // Additional Sarvam voices
            'arya', 'hitesh', 'chitra'
        ];

        // Check if voice ID contains 'sarvam' or matches known Sarvam voices
        if (voiceId.includes('sarvam') || sarvamVoices.includes(voiceId.toLowerCase())) {
            return 'sarvam';
        }

        // Default to ElevenLabs for all other voices
        return 'elevenlabs';
    }

    /**
     * Handle user interruption (stop current audio playback)
     */
    handleInterruption(session) {
        console.log(`⏸️ User interrupted session: ${session.connectionId}`);

        session.isInterrupted = true;

        // Send stop signal to browser
        session.ws.send(JSON.stringify({
            event: 'stop-audio'
        }));

        // Reset processing state
        session.isProcessing = false;
    }

    /**
     * Send initial greeting to user
     */
    async sendInitialGreeting(session, customGreeting = null) {
        try {
            // Check if agent prompt includes a greeting instruction
            const greetingText = customGreeting || "Hello! How can I help you today?";

            // Small delay to ensure connection is stable
            setTimeout(async () => {
                session.ws.send(JSON.stringify({
                    event: 'agent-response',
                    text: greetingText
                }));

                this.appendToContext(session, greetingText, 'assistant');
                await this.synthesizeAndStreamTTS(session, greetingText);
            }, 500);

        } catch (error) {
            console.error('Error sending initial greeting:', error);
        }
    }

    /**
     * Append message to conversation context
     */
    appendToContext(session, content, role) {
        session.conversationHistory.push({
            role: role,
            content: content,
            timestamp: Date.now()
        });

        // Keep conversation history manageable (last 20 messages)
        if (session.conversationHistory.length > 20) {
            session.conversationHistory = session.conversationHistory.slice(-20);
        }
    }

    /**
     * Log call start to database
     */
    async logCallStart(session) {
        if (!this.mysqlPool || !session.userId) {
            console.log('⚠️ Skipping call logging (no database pool or user ID)');
            return;
        }

        try {
            const { v4: uuidv4 } = require('uuid');
            const callId = uuidv4();

            await this.mysqlPool.execute(
                `INSERT INTO calls (id, user_id, agent_id, call_sid, from_number, to_number, direction, status, call_type, started_at, timestamp)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [
                    callId,
                    session.userId,
                    session.agentId || null,
                    session.connectionId, // Use connection ID as call_sid for browser calls
                    'browser-client', // from_number
                    'voice-agent', // to_number
                    'inbound', // direction
                    'in-progress', // status
                    'web_call', // call_type - changed from 'browser' to match database ENUM
                    new Date(session.startTime)
                ]
            );

            session.callLogId = callId;
            console.log(`✅ Call logged to database: ${callId}`);

        } catch (error) {
            console.error('❌ Error logging call start:', error);
        }
    }

    /**
     * Log call end to database
     */
    async logCallEnd(session) {
        if (!this.mysqlPool || !session.callLogId) {
            console.log('⚠️ Skipping call end logging (no database pool or call ID)');
            return;
        }

        try {
            const endTime = new Date();
            const duration = Math.floor((endTime - session.startTime) / 1000); // Duration in seconds

            await this.mysqlPool.execute(
                `UPDATE calls 
                SET status = 'completed', 
                    ended_at = ?, 
                    duration = ? 
                WHERE id = ?`,
                [endTime, duration, session.callLogId]
            );

            console.log(`✅ Call ended and logged: ${session.callLogId}, duration: ${duration}s`);

            // Charge user for usage using CostCalculator
            if (session.userId && this.mysqlPool) {
                try {
                    console.log('\n💰 --- Detailed Cost Summary ---');
                    console.log(`📡 Connection ID: ${session.connectionId}`);
                    console.log(`👤 User ID: ${session.userId}`);
                    console.log(`⏱️ Duration: ${duration}s`);

                    const voiceProvider = this.getVoiceProvider(session.agentVoiceId);
                    const usage = {
                        gemini: session.totalInputTokens + session.totalOutputTokens,
                        deepgram: session.totalSTTSeconds,  // Using deepgram pricing for STT
                    };

                    // Attribute TTS usage to the correct provider
                    if (voiceProvider === 'elevenlabs') {
                        usage.elevenlabs = session.totalTTSCharacters;
                    } else {
                        usage.sarvam = session.totalTTSCharacters;
                    }

                    const costCalculator = new CostCalculator(this.mysqlPool, new WalletService(this.mysqlPool));
                    const result = await costCalculator.recordAndCharge(
                        session.userId,
                        session.callLogId,
                        usage,
                        true, // isVoiceCall
                        duration // durationSeconds
                    );

                    console.log('\n📊 Service Breakdown:');
                    console.log(`   - LLM (Gemini): ${usage.gemini} tokens`);
                    console.log(`   - STT (Sarvam): ${session.totalSTTSeconds.toFixed(2)}s`);
                    if (voiceProvider === 'elevenlabs') {
                        console.log(`   - TTS (ElevenLabs): ${session.totalTTSCharacters} chars`);
                    } else {
                        console.log(`   - TTS (Sarvam): ${session.totalTTSCharacters} chars`);
                    }

                    console.log('\n💵 Final Charge:');
                    console.log(`   Total Charged: $${result.totalCharged.toFixed(4)}`);
                    console.log('--------------------------------\n');
                } catch (chargeError) {
                    console.error('❌ Error charging user:', chargeError.message);
                    // Don't fail the call end if charging fails
                    if (chargeError.message === 'Insufficient balance') {
                        console.warn(`⚠️ User ${session.userId} ended call with insufficient balance`);
                    }
                }
            }

        } catch (error) {
            console.error('❌ Error logging call end:', error);
        }
    }
}

module.exports = { BrowserVoiceHandler };
