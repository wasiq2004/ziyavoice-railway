const { LLMService } = require("../llmService.js");
const nodeFetch = require("node-fetch");
const WalletService = require('./walletService.js');
const CostCalculator = require('./costCalculator.js');
const SarvamSttService = require('./sarvamSttService.js');

// Precompute mu-law to linear PCM table for fast VAD
const MU_LAW_TO_PCM = new Int16Array(256);
for (let i = 0; i < 256; i++) {
    let mu = ~i; // Invert bits
    let sign = (mu & 0x80);
    let exponent = (mu & 0x70) >> 4;
    let mantissa = (mu & 0x0F);
    let sample = (mantissa << (exponent + 3)) + 132;
    sample <<= (exponent);
    sample -= 132;
    MU_LAW_TO_PCM[i] = sign ? -sample : sample;
}

const sessions = new Map();

class MediaStreamHandler {
    constructor(geminiApiKey, openaiApiKey, campaignService, mysqlPool = null, sarvamApiKey = null) {
        if (!geminiApiKey) throw new Error("Missing Gemini API Key");
        if (!sarvamApiKey && !process.env.SARVAM_API_KEY) throw new Error("Missing Sarvam API Key for STT");

        this.llmService = new LLMService(geminiApiKey, openaiApiKey);
        this.campaignService = campaignService;
        this.mysqlPool = mysqlPool;
        this.sarvamApiKey = sarvamApiKey || process.env.SARVAM_API_KEY;
        this.sarvamSttService = new SarvamSttService(this.sarvamApiKey);

        if (mysqlPool) {
            this.walletService = new WalletService(mysqlPool);
            this.costCalculator = new CostCalculator(mysqlPool, this.walletService);
        }
        console.log('✅ MediaStreamHandler initialized (Sarvam STT)');
    }

    // ✅ FIX: Method to get fresh API key each time
    getElevenLabsApiKey() {
        return process.env.ELEVEN_LABS_API_KEY;
    }

    createSession(callId, agentPrompt, agentVoiceId, ws, userId = null, agentId = null, agentModel = null, agentSettings = null, contactId = null, campaignId = null) {
        const session = {
            callId,
            contactId,
            campaignId,
            context: [],
            agentPrompt,
            agentVoiceId: agentVoiceId || "21m00Tcm4TlvDq8ikWAM",
            agentModel: agentModel || "gemini-2.0-flash",
            agentSettings: agentSettings, 
            ws,
            streamSid: null,
            isReady: false,
            audioQueue: [],
            isSpeaking: false,
            isCancelled: false,   // Fix 1 & 3: tracks whether the current LLM turn was interrupted
            lastUserSpeechTime: null,
            isProcessing: false,
            userId: userId,
            agentId: agentId,
            startTime: new Date(),
            // Sarvam STT Buffering & VAD
            audioBuffer: [],
            speechDetectedInChunk: false,
            silenceTimer: null,
            lastSpeechTime: Date.now(),
            pendingMarkName: null,    // Fix 5: track the mark we're waiting for from Twilio
            usage: {
                twilio: 0,
                sarvam_stt: 0,
                gemini: 0,
                elevenlabs: 0,
                sarvam: 0
            }
        };
        sessions.set(callId, session);
        console.log(`✅ Created session for call ${callId} (Sarvam STT-ready)`);
        return session;
    }

    async endSession(callId) {
        const session = sessions.get(callId);
        if (session) {
            // Execute tools marked to run after call
            if (session.tools && session.tools.length > 0 && session.agentId) {
                const afterCallTools = session.tools.filter(tool => tool.runAfterCall);
                if (afterCallTools.length > 0) {
                    console.log(`🔧 Executing ${afterCallTools.length} after-call tools...`);

                    const ToolExecutionService = require('./toolExecutionService.js');
                    const toolExecutionService = new ToolExecutionService(this.llmService, this.mysqlPool);

                    // Execute after-call tools (don't await to avoid blocking)
                    toolExecutionService.processToolsAfterCall(session, afterCallTools)
                        .then(() => {
                            console.log('✅ After-call tools executed successfully');
                        })
                        .catch(err => {
                            console.error('❌ Error executing after-call tools:', err);
                        });
                }
            }

            let finalCost = 0;
            const durationSecondsForCost = session.startTime ? (new Date() - session.startTime) / 1000 : 0;

            // Calculate and charge for Twilio usage first so we have the cost
            if (session.startTime && session.userId && this.costCalculator) {
                try {
                    session.usage.twilio = durationSecondsForCost / 60;
                    const chargeResult = await this.costCalculator.recordAndCharge(
                        session.userId,
                        session.callId,
                        session.usage,
                        true, // isVoiceCall
                        durationSecondsForCost // durationSeconds
                    );
                    finalCost = chargeResult.totalCharged || 0;
                    console.log(`✅ Charged user ${session.userId}: $${finalCost.toFixed(4)}`);
                    console.log('   Breakdown:', chargeResult.breakdown);
                } catch (err) {
                    console.error('❌ Error charging user:', err.message);
                    if (err.message === 'Insufficient balance') {
                        console.warn(`⚠️ User ${session.userId} ended call with insufficient balance`);
                    }
                }
            }

            // Save Transcript and Classify Intent for Campaigns
            if (session.contactId && this.campaignService) {
                try {
                    const fullTranscript = session.context.map(msg => `${msg.role.toUpperCase()}: ${msg.parts[0].text}`).join('\n');
                    const durationSeconds = Math.round(durationSecondsForCost);
                    console.log(`📝 Saving transcript and classifying intent for contact ${session.contactId}...`);

                    await this.campaignService.updateContactAfterCall(
                        session.contactId,
                        durationSeconds,
                        finalCost, // Passing calculated cost here
                        'completed',
                        fullTranscript
                    );
                    console.log(`✅ Campaign contact ${session.contactId} updated with transcript and LLM classification`);
                } catch (campaignErr) {
                    console.error('❌ Error updating campaign contact after call:', campaignErr);
                }
            }

            if (session.silenceTimer) {
                clearTimeout(session.silenceTimer);
            }
            session.audioBuffer = [];
            sessions.delete(callId);
            console.log(`❌ Ended session for call ${callId}`);
        }
    }

    appendToContext(session, text, role) {
        session.context.push({ role, parts: [{ text }] });
        console.log(`💬 ${role.toUpperCase()}: ${text}`);
    }
    // REPLACE the handleConnection method in mediaStreamHandler.js:
    async handleConnection(ws, req) {
        let callId = null;
        let agentId = null;
        let userId = null;
        let session = null;

        try {
            console.log(`📞 [NEW] WebSocket connection from Twilio (awaiting start event)`);

            // ✅ DO NOT CLOSE THE CONNECTION - wait for start event from Twilio
            let eventReceived = false;

            // ✅ Set up error handler FIRST
            ws.on("error", (error) => {
                if (error.code === 'WS_ERR_INVALID_UTF8' || error.message?.includes('invalid UTF-8') || error.message?.includes('Invalid WebSocket frame')) {
                    // Normal - binary audio, ignore
                    return;
                }
                console.error(`❌ [${callId || 'CONN'}] WebSocket error:`, error.message);
            });

            // ✅ Main message handler
            ws.on("message", async (message) => {
                try {
                    let data;

                    // Try to parse as JSON (Twilio events)
                    if (Buffer.isBuffer(message)) {
                        try {
                            data = JSON.parse(message.toString('utf8'));
                        } catch (e) {
                            // Binary data - handle as audio IF session exists
                            if (session?.isReady) {
                                this.handleIncomingAudio(session, message);
                            }
                            return;
                        }
                    } else if (typeof message === 'string') {
                        try {
                            data = JSON.parse(message);
                        } catch (e) {
                            return;
                        }
                    }

                    if (!data || !data.event) {
                        return;
                    }

                    // ✅ CRITICAL: Handle "start" event - this is where Twilio sends parameters!
                    if (data.event === "start") {
                        if (eventReceived) return; // Ignore duplicate start events
                        eventReceived = true;

                        console.log(`🚀 [*] TWILIO START EVENT received`);

                        // ✅ Extract parameters from Twilio's customParameters
                        const customParams = data.start?.customParameters || {};
                        callId = customParams.callId;
                        agentId = customParams.agentId;
                        userId = customParams.userId;
                        const contactId = customParams.contactId;
                        const campaignId = customParams.campaignId;

                        console.log(`📋 [${callId}] Received parameters:`, {
                            callId, agentId, userId, contactId, campaignId
                        });

                        // ✅ Validate we have minimum required parameters
                        if (!callId || !agentId || !userId) {
                            console.error(`❌ [${callId}] Missing required parameters from Twilio start event`);
                            ws.close(1008, 'Missing required parameters');
                            return;
                        }

                        // ✅ Load agent configuration
                        let agentPrompt = "You are a helpful AI voice assistant. Keep responses concise and natural for phone conversations.";
                        let agentVoiceId = "21m00Tcm4TlvDq8ikWAM"; // Default ElevenLabs voice
                        let agentModel = "gemini-2.0-flash"; // Default Gemini model
                        let greetingMessage = "Hello! How can I help you today?";
                        let tools = [];

                        try {
                            const AgentService = require('./agentService.js');
                            const agentService = new AgentService(require('../config/database.js').default);

                            console.log(`🔍 [${callId}] Loading agent ${agentId} for user ${userId}`);
                            const agent = await agentService.getAgentById(userId, agentId);

                            if (agent) {
                                console.log(`✅ [${callId}] Agent loaded: "${agent.name}"`);
                                agentPrompt = agent.identity || agentPrompt;
                                agentVoiceId = agent.voiceId || agentVoiceId;
                                agentModel = agent.model || agentModel;
                                greetingMessage = agent.settings?.greetingLine || greetingMessage;

                                if (agent.settings?.tools && agent.settings.tools.length > 0) {
                                    tools = agent.settings.tools;
                                    console.log(`🔧 [${callId}] ${tools.length} tools available`);
                                }
                            } else {
                                console.warn(`⚠️  [${callId}] Agent not found, using defaults`);
                            }
                        } catch (err) {
                            console.error(`⚠️  [${callId}] Error loading agent:`, err.message);
                        }

                        // ✅ Check wallet balance
                        if (this.walletService) {
                            try {
                                const balanceCheck = await this.walletService.checkBalanceForCall(userId, 0.10);
                                if (!balanceCheck.allowed) {
                                    console.error(`❌ [${callId}] Insufficient balance`);
                                    ws.close(1008, 'Insufficient balance');
                                    return;
                                }
                                console.log(`✅ [${callId}] Balance OK: $${balanceCheck.balance.toFixed(2)}`);
                            } catch (err) {
                                console.error(`❌ [${callId}] Balance check error:`, err.message);
                            }
                        }

                        // ✅ CREATE SESSION - session is NOW ready!
                        session = this.createSession(
                            callId, agentPrompt, agentVoiceId, ws, userId, agentId, agentModel,
                            { tools }, contactId, campaignId
                        );
                        session.streamSid = data.start.streamSid;
                        session.isReady = true;
                        session.tools = tools;
                        session.greetingMessage = greetingMessage;

                        console.log(`🎉 [${callId}] SESSION INITIALIZED - Ready for real-time voice!`);

                        // ✅ Send initial greeting
                        setTimeout(async () => {
                            try {
                                console.log(`🎤 [${callId}] Synthesizing greeting: "${greetingMessage}"`);
                                const greetingAudio = await this.synthesizeTTS(greetingMessage, agentVoiceId, session);
                                if (greetingAudio && greetingAudio.length > 0) {
                                    console.log(`📤 [${callId}] Sending greeting (${greetingAudio.length} bytes) to user`);
                                    this.sendAudioToTwilio(session, greetingAudio);
                                }
                            } catch (err) {
                                console.error(`❌ [${callId}] Greeting error:`, err.message);
                            }
                        }, 300);

                    } else if (data.event === "media" && session?.isReady) {
                        // ✅ Real-time audio from user - process immediately (no buffering)
                        if (data.media?.payload) {
                            const audioBuffer = Buffer.from(data.media.payload, "base64");
                            this.handleIncomingAudio(session, audioBuffer);
                        }

                    } else if (data.event === "connected") {
                        console.log(`✅ [${callId}] Twilio stream connected`);

                    } else if (data.event === "stop") {
                        console.log(`⏹️  [${callId}] Twilio stopped stream`);
                        if (callId) this.endSession(callId);

                    } else if (data.event === "mark") {
                        if (data.mark?.name === session?.pendingMarkName) {
                            session.isSpeaking = false;
                            session.pendingMarkName = null;
                        }
                    }

                } catch (err) {
                    console.error(`❌ [${callId}] Message handler error:`, err.message);
                }
            });

            // ✅ Close handler
            ws.on("close", () => {
                console.log(`🔌 [${callId}] WebSocket closed`);
                if (callId) this.endSession(callId);
            });

            console.log(`✅ WebSocket ready - waiting for Twilio "start" event...`);

        } catch (err) {
            console.error(`❌ handleConnection error:`, err.message);
            ws.close(1011, 'Internal server error');
        }
    }

    async callLLM(session) {
        // Fix 6: LLM_TIMEOUT_MS — if Gemini does not complete within this window,
        // we abort and return a graceful fallback. Prevents indefinite silence on API hangs.
        const LLM_TIMEOUT_MS = 20000; // 20 seconds

        try {
            const modelToUse = session.agentModel || "gemini-2.0-flash";
            const isGemini = modelToUse.includes('gemini');
            const provider = isGemini ? 'Gemini' : 'OpenAI';

            console.log(`🧠 Calling ${provider} LLM Stream with model: ${modelToUse}`);

            // Fix 6: Wrap stream acquisition in a timeout promise
            const streamPromise = this.llmService.generateContentStream({
                model: modelToUse,
                contents: session.context,
                config: { systemInstruction: session.agentPrompt },
            });

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`LLM_TIMEOUT: ${provider} did not respond within ${LLM_TIMEOUT_MS / 1000}s`)), LLM_TIMEOUT_MS)
            );

            const stream = await Promise.race([streamPromise, timeoutPromise]);

            let fullText = "";
            let currentSentence = "";
            const sentenceBoundaries = /[.!?]+(\s|$)/;

            for await (const chunk of stream) {
                // Fix 1 (also checked here): If the user interrupted mid-stream, stop iterating
                if (session.isCancelled) {
                    console.log(`🚫 LLM stream iteration aborted — turn was cancelled`);
                    break;
                }

                let content = "";
                if (isGemini) {
                    content = chunk.text();
                } else {
                    content = chunk.choices[0]?.delta?.content || "";
                }

                if (!content) continue;

                fullText += content;
                currentSentence += content;

                if (sentenceBoundaries.test(currentSentence)) {
                    const match = currentSentence.match(sentenceBoundaries);
                    const splitIndex = match.index + match[0].length;
                    const completeSentence = currentSentence.slice(0, splitIndex).trim();

                    if (completeSentence && !completeSentence.startsWith('{')) {
                        console.log(`📡 Sentence ready for TTS: "${completeSentence}"`);
                        this.processSentenceTTS(completeSentence, session);
                    }

                    currentSentence = currentSentence.slice(splitIndex);
                }
            }

            if (currentSentence.trim() && !currentSentence.trim().startsWith('{')) {
                console.log(`📡 Final sentence ready for TTS: "${currentSentence.trim()}"`);
                this.processSentenceTTS(currentSentence.trim(), session);
            }

            console.log(`💬 ${provider} full response received:`, fullText.substring(0, 100) + '...');

            try {
                const cleanText = fullText.replace(/```json/g, '').replace(/```/g, '').trim();
                if (cleanText.startsWith('{') && cleanText.endsWith('}')) {
                    const parsed = JSON.parse(cleanText);

                    if (parsed.tool && parsed.data) {
                        console.log(`🛠️ Tool usage detected: ${parsed.tool}`);
                        const tool = session.tools?.find(t => t.name === parsed.tool);
                        if (tool) {
                            const filteredData = {};
                            const allowedParams = tool.parameters || [];
                            allowedParams.forEach(param => {
                                if (parsed.data[param.name] !== undefined) {
                                    filteredData[param.name] = parsed.data[param.name];
                                }
                            });

                            const blackList = ['transcript', 'context', 'raw_text', 'conversation', 'history'];
                            blackList.forEach(key => delete filteredData[key]);

                            if (!session.dataSaved && Object.keys(filteredData).length > 0) {
                                try {
                                    const ToolExecutionService = require('./toolExecutionService.js');
                                    const toolService = new ToolExecutionService(this.llmService, this.mysqlPool);
                                    await toolService.executeTool(tool, filteredData, session, session.agentSettings);
                                    session.dataSaved = true;
                                    console.log(`✅ Structured data processed via WebhookService`);
                                } catch (toolErr) {
                                    console.error('❌ Failed to execute tool service:', toolErr);
                                }
                            }
                        }

                        // Fix 4: Append the model's own tool-call JSON to context BEFORE recursing,
                        // so Gemini has a proper memory of what it requested in the next turn.
                        this.appendToContext(session, cleanText, "model");

                        this.appendToContext(session, JSON.stringify({
                            tool: parsed.tool,
                            status: "success",
                            message: "Execution completed"
                        }), "user");

                        return await this.callLLM(session);
                    }
                }
            } catch (jsonError) {
                // Not a valid JSON tool call
            }

            return fullText;
        } catch (err) {
            // Fix 6: Handle timeout gracefully with a spoken fallback
            if (err.message && err.message.startsWith('LLM_TIMEOUT')) {
                console.error(`⏱️ ${err.message}`);
                const fallback = "I'm sorry, I'm taking a bit longer to respond. Could you please repeat that?";
                this.processSentenceTTS(fallback, session);
                return fallback;
            }
            console.error("❌ LLM stream error:", err);
            return "I apologize, I'm having trouble processing that right now.";
        }
    }

    async processSentenceTTS(text, session) {
        // Fix 1: If the user interrupted this LLM turn, discard this sentence entirely
        if (session.isCancelled) {
            console.log(`🚫 Discarding stale TTS sentence (turn was cancelled): "${text.substring(0, 40)}..."`);
            return;
        }
        try {
            const ttsAudio = await this.synthesizeTTS(text, session.agentVoiceId, session);
            // Re-check after the async TTS call (user may have interrupted while TTS was generating)
            if (ttsAudio && !session.isCancelled) {
                this.sendAudioToTwilio(session, ttsAudio);
            } else if (session.isCancelled) {
                console.log(`🚫 Discarding stale TTS audio (turn was cancelled during synthesis): "${text.substring(0, 40)}..."`);
            }
        } catch (err) {
            console.error("❌ Error processing sentence TTS:", err);
        }
    }

    async synthesizeTTS(text, voiceId, session = null) {
        try {
            const { generateTTS } = require('./tts_controller.js');
            const audioBuffer = await generateTTS(text, { voiceId });

            if (session && session.usage) {
                const characterCount = text.length;
                const sarvamVoices = [
                    'anushka', 'abhilash', 'manisha', 'vidya', 'arya', 'karun',
                    'hitesh', 'aditya', 'isha', 'ritu', 'chirag', 'harsh',
                    'sakshi', 'priya', 'neha', 'rahul', 'pooja', 'rohan',
                    'simran', 'kavya', 'anjali', 'sneha', 'kiran', 'vikram',
                    'rajesh', 'sunita', 'tara', 'anirudh', 'kriti', 'ishaan',
                    'ratan', 'varun', 'manan', 'sumit', 'roopa', 'kabir',
                    'aayan', 'shubh', 'arvind'
                ];

                const isSarvam = voiceId && (
                    voiceId.includes('sarvam') ||
                    sarvamVoices.includes(voiceId.toLowerCase())
                );

                if (isSarvam) {
                    session.usage.sarvam += characterCount;
                } else {
                    session.usage.elevenlabs += characterCount;
                }
            }
            return audioBuffer;
        } catch (err) {
            console.error("❌ TTS error:", err);
            return null;
        }
    }

    sendAudioToTwilio(session, audioBuffer) {
        try {
            if (!session.isReady || !session.streamSid) {
                session.audioQueue.push(audioBuffer);
                return;
            }

            session.isSpeaking = true;
            const chunkSize = 160;
            let offset = 0;

            const sendNextChunk = () => {
                // Stop sending if the turn was cancelled (user interrupted)
                if (!session.isSpeaking || session.isCancelled) return;

                if (offset >= audioBuffer.length) {
                    // Fix 5: Send a uniquely named mark so we can listen for Twilio's echo back
                    // to know when audio has ACTUALLY finished playing in the user's ear
                    const markName = `audio_end_${Date.now()}`;
                    session.pendingMarkName = markName;
                    session.ws.send(JSON.stringify({
                        event: "mark",
                        streamSid: session.streamSid,
                        mark: { name: markName },
                    }));
                    // isSpeaking is now set to false ONLY when Twilio echoes the mark back
                    // (see the mark event handler in handleConnection)
                    return;
                }

                const chunkBuffer = audioBuffer.slice(offset, offset + chunkSize);
                session.ws.send(JSON.stringify({
                    event: "media",
                    streamSid: session.streamSid,
                    media: { payload: chunkBuffer.toString('base64') },
                }));
                offset += chunkSize;
                setTimeout(sendNextChunk, 18);
            };
            sendNextChunk();
        } catch (err) {
            console.error("❌ Error sending audio to Twilio:", err);
            session.isSpeaking = false;
        }
    }

    /**
     * Handle incoming audio from Twilio (mulaw)
     */
    async handleIncomingAudio(session, audioChunk) {
        try {
            session.audioBuffer.push(audioChunk);

            // VAD Logic for mulaw
            let sumSquares = 0;
            for (let i = 0; i < audioChunk.length; i++) {
                const sample = MU_LAW_TO_PCM[audioChunk[i]];
                sumSquares += sample * sample;
            }
            const rms = Math.sqrt(sumSquares / audioChunk.length);

            // Adjusted threshold for phone line noise
            const SILENCE_THRESHOLD = 1500;

            if (rms > SILENCE_THRESHOLD) {
                session.speechDetectedInChunk = true;
                session.lastSpeechTime = Date.now();
                if (session.silenceTimer) {
                    clearTimeout(session.silenceTimer);
                    session.silenceTimer = null;
                }

                // Fix 1 & 3: User spoke while agent was talking — cancel the current LLM turn
                if (session.isSpeaking || session.isProcessing) {
                    console.log(`⚠️ User interruption detected — cancelling current LLM turn`);
                    session.isCancelled = true;   // signals callLLM & processSentenceTTS to stop
                    session.isSpeaking = false;
                    session.pendingMarkName = null;  // clear pending mark
                    if (session.ws && session.streamSid) {
                        session.ws.send(JSON.stringify({
                            event: "clear",
                            streamSid: session.streamSid
                        }));
                    }
                }
            } else {
                if (!session.silenceTimer && session.audioBuffer.length > 0) {
                    // 600ms: phone lines have less ambient noise so shorter wait is safe.
                    session.silenceTimer = setTimeout(() => {
                        this.processBufferedAudio(session);
                    }, 600);
                }
            }
        } catch (error) {
            console.error('Error handling incoming audio:', error);
        }
    }

    /**
     * Process buffered audio: mulaw -> WAV -> Sarvam STT -> LLM
     */
    async processBufferedAudio(session) {
        if (session.audioBuffer.length === 0) return;
        session.silenceTimer = null;

        // Fix 2: Guard against parallel execution — if already processing, discard this audio chunk
        if (session.isProcessing) {
            console.log(`⚠️ Already processing audio — discarding new chunk to prevent race condition`);
            session.audioBuffer = [];
            session.speechDetectedInChunk = false;
            return;
        }

        if (!session.speechDetectedInChunk) {
            session.audioBuffer = [];
            return;
        }

        const completeBuffer = Buffer.concat(session.audioBuffer);
        session.audioBuffer = [];
        session.speechDetectedInChunk = false;

        // Skip extremely short buffers (noise)
        if (completeBuffer.length < 4000) return; // < 0.5s

        try {
            console.log(`🎤 Transcribing ${completeBuffer.length} bytes with Sarvam STT...`);

            // Pure-JS mulaw (8kHz) → WAV (16kHz PCM) — no FFmpeg spawn needed
            const wavBuffer = this.convertMulawToWavJS(completeBuffer);

            const result = await this.sarvamSttService.transcribe(wavBuffer);
            const transcript = result.transcript;

            // Track usage (8kHz mulaw = 8000 bytes/sec)
            const durationSeconds = completeBuffer.length / 8000;
            session.usage.sarvam_stt += durationSeconds;

            if (transcript && transcript.trim()) {
                console.log(`📝 Sarvam Transcript: "${transcript}"`);
                this.appendToContext(session, transcript, "user");

                // Fix 1 & 3: Reset cancellation flag at start of a new fresh LLM turn
                session.isCancelled = false;
                session.isProcessing = true;
                const llmResponse = await this.callLLM(session);

                // Fix 3: Only commit the response to context if the turn was NOT cancelled
                // (i.e., user did not interrupt). Prevents the AI from "remembering" things
                // it said but the user never heard.
                if (!session.isCancelled && llmResponse) {
                    this.appendToContext(session, llmResponse, "model");
                } else if (session.isCancelled) {
                    console.log(`🚫 LLM response discarded from context (turn was cancelled by user interruption)`);
                }

                session.isProcessing = false;
            }
        } catch (error) {
            console.error('❌ Sarvam STT processing error:', error);
            session.isProcessing = false;
        }
    }

    /**
     * Pure-JS mulaw→8kHz PCM→16kHz PCM→WAV conversion.
     * Replaces the FFmpeg child-process spawn — eliminates 150–300ms cold-start per utterance.
     *
     * Steps:
     *   1. Mulaw bytes → 16-bit signed PCM at 8kHz  (MU_LAW_TO_PCM lookup table already in memory)
     *   2. 8kHz → 16kHz upsample via linear interpolation (2×)
     *   3. Wrap in a standard 44-byte WAV header
     *
     * @param {Buffer} mulawBuffer - Raw µ-law 8kHz mono audio from Twilio
     * @returns {Buffer} WAV file buffer at 16kHz PCM, ready for Sarvam STT
     */
    convertMulawToWavJS(mulawBuffer) {
        const len = mulawBuffer.length;

        // Step 1: mulaw → 16-bit PCM at 8kHz using the in-memory lookup table
        const pcm8k = new Int16Array(len);
        for (let i = 0; i < len; i++) {
            pcm8k[i] = MU_LAW_TO_PCM[mulawBuffer[i]];
        }

        // Step 2: Upsample 8kHz → 16kHz by 2× linear interpolation
        // Each input sample becomes 2 output samples:
        //   out[2i]   = in[i]
        //   out[2i+1] = average of in[i] and in[i+1]  (linear interpolation)
        const upLen = len * 2;
        const pcm16k = new Int16Array(upLen);
        for (let i = 0; i < len - 1; i++) {
            pcm16k[2 * i] = pcm8k[i];
            pcm16k[2 * i + 1] = Math.round((pcm8k[i] + pcm8k[i + 1]) / 2);
        }
        // Handle the last sample (no next sample to interpolate with)
        pcm16k[2 * (len - 1)] = pcm8k[len - 1];
        pcm16k[2 * (len - 1) + 1] = pcm8k[len - 1];

        // Step 3: Build a standard 44-byte WAV/RIFF header + PCM data
        const pcmBuffer = Buffer.from(pcm16k.buffer);
        const dataSize = pcmBuffer.length;
        const sampleRate = 16000;
        const channels = 1;
        const bitDepth = 16;
        const byteRate = sampleRate * channels * (bitDepth / 8);
        const blockAlign = channels * (bitDepth / 8);

        const header = Buffer.alloc(44);
        header.write('RIFF', 0);
        header.writeUInt32LE(36 + dataSize, 4);
        header.write('WAVE', 8);
        header.write('fmt ', 12);
        header.writeUInt32LE(16, 16);           // PCM sub-chunk size
        header.writeUInt16LE(1, 20);            // PCM format (linear)
        header.writeUInt16LE(channels, 22);
        header.writeUInt32LE(sampleRate, 24);
        header.writeUInt32LE(byteRate, 28);
        header.writeUInt16LE(blockAlign, 32);
        header.writeUInt16LE(bitDepth, 34);
        header.write('data', 36);
        header.writeUInt32LE(dataSize, 40);

        return Buffer.concat([header, pcmBuffer]);
    }
}

module.exports = { MediaStreamHandler };
