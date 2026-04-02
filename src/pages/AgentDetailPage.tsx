import React, { useState, useEffect, useCallback, useRef } from 'react';
import { VoiceAgent, ToolType, PreActionPhraseMode, Tool, VoiceAgentSettings, ToolHeader, ToolParameter } from '../types';
import {
    DocumentDuplicateIcon,
    EditIcon,
    ModelIcon,
    VoiceIcon,
    LanguageIcon,
    ToolsIcon,
    AVAILABLE_VOICE_PROVIDERS,
    AVAILABLE_VOICES,
    getVoiceNameById,
    AVAILABLE_MODELS,
    AVAILABLE_LANGUAGES,
    TrashIcon,
    EmbedIcon,
    CustomLlmIcon,
    SipPhoneIcon,
    KnowledgeIcon,
    WebhookIcon,
    PlayIcon,
    CheckIcon,
    MicrophoneIcon,
    getVoiceProviderById,
    AVAILABLE_LANGUAGES_BY_PROVIDER
} from '../constants';
import { PlusIcon, ArrowUpTrayIcon, DocumentTextIcon, XMarkIcon, StopIcon, PencilIcon } from '@heroicons/react/24/outline';
import Modal from '../components/Modal';
import { GoogleGenAI, Chat, Modality, LiveServerMessage, type Blob } from '@google/genai';
import { LLMService } from '../services/llmService';
import { getApiBaseUrl, getApiPath } from '../utils/api';
import { DocumentService } from '../services/documentService';
import { ToolExecutionService } from '../services/toolExecutionService';
import { useAuth } from '../contexts/AuthContext';
import { encode, decode } from './audioHelpers';

interface AgentDetailPageProps {
    agent: VoiceAgent;
    onBack: () => void;
    updateAgent: (updatedAgent: VoiceAgent) => void;
    onDuplicate: (agent: VoiceAgent) => void;
    onDelete: (agentId: string) => void;
    userId?: string;
}

const SettingsCard: React.FC<{ title: string; children: React.ReactNode; }> = ({ title, children }) => (
    <div className="bg-surface dark:bg-darkbg-light border border-slate-200 dark:border-darkbg-lighter rounded-3xl shadow-sm overflow-hidden card-animate group/card">
        <div className="p-8">
            <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 mb-8 uppercase tracking-[0.2em] flex items-center gap-2">
                <div className="w-1 h-4 bg-primary rounded-full" />
                {title}
            </h3>
            <div className="space-y-8">{children}</div>
        </div>
    </div>
);


interface SettingsToggleProps {
    label: string;
    description: string;
    checked: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    name: string;
    isBeta?: boolean;
    warning?: string;
}

const SettingsToggle: React.FC<SettingsToggleProps> = ({ label, description, checked, onChange, name, isBeta, warning }) => (
    <div className="flex items-start justify-between group/toggle p-5 -mx-5 rounded-2xl transition-colors hover:bg-lightbg dark:hover:bg-darkbg-lighter/50">
        <div className="flex-1 pr-8">
            <label htmlFor={name} className="flex items-center gap-2 cursor-pointer">
                <span className="text-sm font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">{label}</span>
                {isBeta && (
                    <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ring-1 ring-blue-200 dark:ring-blue-800">
                        Beta
                    </span>
                )}
            </label>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-1.5 leading-relaxed">{description}</p>
            {warning && (
                <div className="flex items-center gap-1.5 mt-2 text-amber-500">
                    <div className="w-1 h-1 rounded-full bg-current" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Warning: {warning}</p>
                </div>
            )}
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" id={name} name={name} className="sr-only peer" checked={checked} onChange={onChange} />
            <div className="w-12 h-7 bg-slate-200 dark:bg-darkbg-lighter peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
        </label>
    </div>
);

const VoiceSelectionModal: React.FC<{
    onClose: () => void;
    onSave: (voiceId: string) => void;
    currentVoiceId: string;
    availableVoices: { [key: string]: { id: string, name: string }[] };
    loadingVoices: boolean;
    playingVoiceId: string | null;
    onPlayPreview: (voiceId: string) => void;
    onStopPreview: () => void;
}> = ({ onClose, onSave, currentVoiceId, availableVoices, loadingVoices, playingVoiceId, onPlayPreview, onStopPreview }) => {
    const [selectedProvider, setSelectedProvider] = useState(() => getVoiceProviderById(currentVoiceId));
    const [selectedVoice, setSelectedVoice] = useState(currentVoiceId);

    // Use API-fetched voices or fallback to hardcoded ones
    const voicesToDisplay = Object.keys(availableVoices).length > 0 ? availableVoices : AVAILABLE_VOICES;

    useEffect(() => {
        const voicesForProvider = voicesToDisplay[selectedProvider] || [];
        if (!voicesForProvider.some(v => v.id === selectedVoice)) {
            setSelectedVoice(voicesForProvider[0]?.id || '');
        }
    }, [selectedProvider, selectedVoice, voicesToDisplay]);

    return (
        <Modal isOpen={true} onClose={onClose} title="Select Voice" maxWidth="max-w-2xl">
            <div className="space-y-6">
                {/* Provider Tabs */}
                <div className="flex bg-lightbg dark:bg-darkbg p-1 rounded-2xl">
                    {AVAILABLE_VOICE_PROVIDERS.map(provider => (
                        <button
                            key={provider.id}
                            onClick={() => setSelectedProvider(provider.id)}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${selectedProvider === provider.id
                                ? 'bg-surface dark:bg-darkbg-light text-primary shadow-lg shadow-primary/5'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                        >
                            {provider.name}
                        </button>
                    ))}
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                            Available Voices
                        </h4>
                        {loadingVoices && (
                            <div className="flex items-center gap-2">
                                <div className="animate-spin rounded-full h-3 w-3 border-2 border-primary border-b-transparent" />
                                <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Syncing...</span>
                            </div>
                        )}
                    </div>

                    <div className="max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {loadingVoices ? (
                            <div className="py-20 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/30 rounded-3xl border border-slate-100 dark:border-slate-800">
                                <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-b-transparent mb-4" />
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading Voice Library</p>
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {(voicesToDisplay[selectedProvider] || []).length === 0 ? (
                                    <div className="py-16 text-center bg-lightbg dark:bg-darkbg-light/50 rounded-3xl border border-slate-100 dark:border-darkbg-lighter">
                                        <VoiceIcon className="h-12 w-12 text-slate-200 dark:text-darkbg-lighter mx-auto mb-3" />
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No voices found</p>
                                        <p className="text-[9px] font-bold text-slate-300 dark:text-slate-600 uppercase tracking-wider mt-1">Check your API configuration</p>
                                    </div>
                                ) : (
                                    (voicesToDisplay[selectedProvider] || []).map(voice => (
                                        <div
                                            key={voice.id}
                                            onClick={() => setSelectedVoice(voice.id)}
                                            className={`group relative p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 ${selectedVoice === voice.id
                                                ? 'bg-primary/5 border-primary/30 shadow-sm'
                                                : 'bg-surface dark:bg-darkbg-light/50 border-slate-100 dark:border-darkbg-lighter hover:border-slate-200 dark:hover:border-slate-700'
                                                }`}
                                        >
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm transition-colors ${selectedVoice === voice.id
                                                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                                : 'bg-lightbg dark:bg-darkbg text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-darkbg-lighter'
                                                }`}>
                                                {voice.name.charAt(0)}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <h5 className={`text-sm font-black truncate transition-colors ${selectedVoice === voice.id ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>
                                                    {voice.name}
                                                </h5>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                                                    {selectedProvider === 'eleven-labs' ? 'High Fidelity' : 'Standard'}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        if (playingVoiceId === voice.id) {
                                                            onStopPreview();
                                                        } else {
                                                            onPlayPreview(voice.id);
                                                        }
                                                    }}
                                                    className={`p-2.5 rounded-xl transition-all ${playingVoiceId === voice.id
                                                        ? 'bg-primary text-white scale-110 shadow-lg shadow-primary/25'
                                                        : 'bg-lightbg dark:bg-darkbg text-slate-400 hover:text-primary hover:bg-primary/10'
                                                        }`}
                                                >
                                                    {playingVoiceId === voice.id ? (
                                                        <StopIcon className="w-4 h-4" />
                                                    ) : (
                                                        <PlayIcon className="w-4 h-4" />
                                                    )}
                                                </button>

                                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedVoice === voice.id
                                                    ? 'bg-primary border-primary scale-110'
                                                    : 'border-slate-200 dark:border-darkbg-lighter opacity-0 group-hover:opacity-100'
                                                    }`}>
                                                    {selectedVoice === voice.id && <CheckIcon className="h-4 w-4 text-white" />}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={() => onSave(selectedVoice)}
                    disabled={!selectedVoice}
                    className="bg-primary text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/25 hover:bg-primary-dark transition-all disabled:opacity-50"
                >
                    Save Voice
                </button>
            </div>
        </Modal>
    );
};



const AgentDetailPage: React.FC<AgentDetailPageProps> = ({ agent: initialAgent, onBack, updateAgent, onDuplicate, onDelete, userId }) => {
    const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
    const [agent, setAgent] = useState<VoiceAgent>(initialAgent);
    const [editedAgent, setEditedAgent] = useState<VoiceAgent>(initialAgent);
    const [isEditingPrompt, setIsEditingPrompt] = useState(false);
    const [isActionsDropdownOpen, setActionsDropdownOpen] = useState(false);

    const [isModelModalOpen, setModelModalOpen] = useState(false);
    const [isVoiceModalOpen, setVoiceModalOpen] = useState(false);
    const [isLanguageModalOpen, setLanguageModalOpen] = useState(false);

    const [isToolsModalOpen, setToolsModalOpen] = useState(false);
    const [editingTool, setEditingTool] = useState<Tool | null>(null);
    const [isGoogleSheetsSharingModalOpen, setGoogleSheetsSharingModalOpen] = useState(false);

    const [isKnowledgeModalOpen, setKnowledgeModalOpen] = useState(false);

    // Voice preview state
    // State for API-fetched voices
    const [availableVoices, setAvailableVoices] = useState<{ [key: string]: { id: string, name: string }[] }>({});
    const [loadingVoices, setLoadingVoices] = useState(false);
    const playingVoiceRef = useRef<string | null>(null); // Track which voice is playing without causing re-renders
    const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);

    // Call Agent State
    const [callAgentTab, setCallAgentTab] = useState<'web' | 'chat'>('web');
    const [isCallActive, setIsCallActive] = useState(false);

    // Add a useEffect to log when isCallActive changes
    useEffect(() => {
        console.log('isCallActive changed to:', isCallActive);
        // Update the debug ref to track the actual call state
        callActiveDebugRef.current = isCallActive;

        // When a call ends, trigger a credit balance refresh in the sidebar
        if (!isCallActive) {
            window.dispatchEvent(new Event('wallet_updated'));
        }
    }, [isCallActive]);
    const [chatMessages, setChatMessages] = useState<{ sender: 'user' | 'agent', text: string }[]>([]);
    const [currentMessage, setCurrentMessage] = useState('');
    const [isAgentReplying, setIsAgentReplying] = useState(false);
    const [geminiChatSession, setGeminiChatSession] = useState<Chat | null>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // Conversation history for voice calls
    const conversationHistoryRef = useRef<{ role: string; text: string }[]>([]);
    const greetingSentRef = useRef<boolean>(false);
    const sessionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const callActiveDebugRef = useRef<boolean>(false);
    const webSocketRef = useRef<WebSocket | null>(null);  // Add this line for WebSocket connection

    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const microphoneStreamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
    const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const nextStartTimeRef = useRef<number>(0);
    const knowledgeCacheRef = useRef<Map<string, string>>(new Map());
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);

    // Prefetch knowledge base documents
    useEffect(() => {
        const prefetchKnowledge = async () => {
            if (editedAgent.settings.knowledgeDocIds && editedAgent.settings.knowledgeDocIds.length > 0 && userId) {
                const documentService = new DocumentService();
                for (const docId of editedAgent.settings.knowledgeDocIds) {
                    if (!knowledgeCacheRef.current.has(docId)) {
                        try {
                            const content = await documentService.getDocumentContent(docId);
                            knowledgeCacheRef.current.set(docId, content);
                            console.log(`Prefetched document: ${docId}`);
                        } catch (error) {
                            console.error(`Error prefetching doc ${docId}:`, error);
                        }
                    }
                }
            }
        };
        prefetchKnowledge();
    }, [editedAgent.settings.knowledgeDocIds, userId]);

    const initialNewToolState: Omit<Tool, 'id' | 'preActionPhrases'> & { preActionPhrases: string } = {
        name: '', description: '', type: ToolType.Webhook, webhookUrl: '', method: 'POST',
        runAfterCall: false, preActionPhrasesMode: PreActionPhraseMode.Flexible, preActionPhrases: '',
        parameters: [],
        headers: [],
    };
    const [newTool, setNewTool] = useState(initialNewToolState);
    const [newToolFunctionType, setNewToolFunctionType] = useState<'Webhook' | 'WebForm' | 'GoogleSheets'>('GoogleSheets');

    const actionsDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatMessages, isAgentReplying]);
    useEffect(() => {
        // For Gemini models, we don't need a persistent chat session since it's stateless
        const isGeminiModel = editedAgent.model.startsWith('gemini');

        // Only initialize a real chat session for compatible Gemini models
        if (editedAgent && editedAgent.identity && isGeminiModel) {
            if (!API_KEY) {
                setChatMessages([{ sender: 'agent' as const, text: 'The API_KEY is not configured. Chat and voice features are disabled.' }]);
                setGeminiChatSession(null);
                return;
            }

            try {
                const ai = new GoogleGenAI({ apiKey: API_KEY });
                const chat = ai.chats.create({
                    model: editedAgent.model,
                    config: { systemInstruction: editedAgent.identity },
                    history: [],
                });
                setGeminiChatSession(chat);
                setChatMessages([]); // Reset chat on agent/model change
            } catch (error) {
                console.error("Failed to initialize Gemini chat session:", error);
                setChatMessages([{ sender: 'agent' as const, text: 'Error: Could not connect to the AI model.' }]);
                setGeminiChatSession(null);
            }
        } else {
            // For other models or when identity is missing
            setGeminiChatSession(null);
            setChatMessages([]);
            // Clear conversation history
            conversationHistoryRef.current = [];
        }
    }, [editedAgent.id, editedAgent.identity, editedAgent.model, API_KEY]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (actionsDropdownRef.current && !actionsDropdownRef.current.contains(event.target as Node)) {
                setActionsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch available voices from API
    useEffect(() => {
        const fetchVoices = async () => {
            try {
                setLoadingVoices(true);

                // Use the correct API base URL
                const apiBaseUrl = getApiBaseUrl();
                // Fetch all voices from all providers
                const url = `${apiBaseUrl}${getApiPath()}/voices?provider=all`;

                console.log('🔍 Fetching voices from:', url);

                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('❌ Voice fetch error:', response.status, errorText);
                    throw new Error(`Failed to fetch voices: ${response.status}`);
                }

                // Check if response is JSON
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    const textResponse = await response.text();
                    console.error('❌ Non-JSON response:', textResponse.substring(0, 200));
                    throw new Error('Server returned non-JSON response');
                }

                const data = await response.json();
                console.log('✅ Voices data received:', data);

                if (data.success && data.voices) {
                    // Transform API response to match the expected format
                    const voicesByProvider: { [key: string]: { id: string, name: string }[] } = {
                        'eleven-labs': [],
                        'sarvam': []
                    };

                    data.voices.forEach((voice: any) => {
                        // Map backend provider names to frontend IDs
                        if (voice.provider === 'elevenlabs') {
                            voicesByProvider['eleven-labs'].push({
                                id: voice.provider_voice_id,
                                name: voice.display_name
                            });
                        } else if (voice.provider === 'sarvam') {
                            voicesByProvider['sarvam'].push({
                                // Sarvam voices might need a prefix or handled as is. 
                                // Using provider_voice_id directly as that's what we likely store.
                                id: voice.provider_voice_id,
                                name: voice.display_name
                            });
                        }
                    });

                    console.log('✅ Transformed voices:', voicesByProvider);
                    setAvailableVoices(voicesByProvider);
                } else {
                    throw new Error('Invalid response format from API');
                }
            } catch (error) {
                console.error('❌ Error fetching voices:', error);
                // Don't alert on error to avoid annoying the user if backend is down, just log it
                // alert(`Failed to load voices: ${error.message}. Using default voices.`);
                // Fallback to hardcoded voices if API fails
                setAvailableVoices(AVAILABLE_VOICES);
            } finally {
                setLoadingVoices(false);
            }
        };

        fetchVoices();
    }, []);
    // Audio helper functions

    const decodeAudioData = async (
        data: Uint8Array,
        ctx: AudioContext,
        sampleRate: number,
        numChannels: number,
    ): Promise<AudioBuffer> => {
        const dataInt16 = new Int16Array(data.buffer);
        const frameCount = dataInt16.length / numChannels;
        const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

        for (let channel = 0; channel < numChannels; channel++) {
            const channelData = buffer.getChannelData(channel);
            for (let i = 0; i < frameCount; i++) {
                channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
            }
        }
        return buffer;
    };

    const createBlob = (data: Float32Array): Blob => {
        const l = data.length;
        const int16 = new Int16Array(l);
        for (let i = 0; i < l; i++) {
            int16[i] = data[i] * 32768;
        }
        return {
            data: encode(new Uint8Array(int16.buffer)),
            mimeType: 'audio/pcm;rate=16000',
        };
    };

    // Helper functions to pause and resume speech recognition
    const pauseRecognition = () => {
        try { speechRecognitionRef.current?.stop(); } catch { }
    };

    const resumeRecognition = () => {
        // Add a small delay before resuming to ensure TTS has fully ended
        setTimeout(() => {
            const isCallActuallyActive = isCallActive || callActiveDebugRef.current;
            if (isCallActuallyActive) {
                try {
                    if (speechRecognitionRef.current) {
                        speechRecognitionRef.current.start();
                        console.log('Speech recognition resumed successfully');
                    }
                } catch (error) {
                    console.error('Error resuming speech recognition:', error);
                    // If we can't resume due to invalid state, try to reinitialize
                    if (error instanceof Error && error.name === 'InvalidStateError') {
                        try {
                            if (speechRecognitionRef.current) {
                                try {
                                    speechRecognitionRef.current.stop();
                                } catch (stopError) {
                                    // Ignore stop errors
                                }
                            }
                            speechRecognitionRef.current = initializeSpeechRecognition();
                            if (speechRecognitionRef.current) {
                                speechRecognitionRef.current.start();
                                console.log('Speech recognition reinitialized and started after resume error');
                            }
                        } catch (reinitError) {
                            console.error('Failed to reinitialize speech recognition after resume error:', reinitError);
                        }
                    }
                }
            } else {
                console.log('Skipping speech recognition resume - call is no longer active');
            }
        }, 150); // Small delay to ensure TTS has fully ended
    };

    // Function to convert text to speech using Eleven Labs
    const convertTextToSpeech = async (text: string) => {
        try {
            // Get Eleven Labs API key from environment variables
            const elevenLabsApiKey = import.meta.env.VITE_ELEVEN_LABS_API_KEY;
            if (!elevenLabsApiKey) {
                throw new Error('Eleven Labs API key is not configured');
            }

            // Create Eleven Labs client
            // @ts-ignore
            const elevenLabsClient = new ElevenLabsClient({
                apiKey: elevenLabsApiKey
            });

            // Map voice IDs to Eleven Labs voice IDs
            const elevenLabsVoiceMap: { [key: string]: string } = {
                'eleven-rachel': '21m00Tcm4TlvDq8ikWAM',
                'eleven-drew': '29vD33N1CtxCmqQRPOHJ',
                'eleven-clyde': '2EiwWnXFnvU5JabPnv8n',
                'eleven-zara': 'D38z5RcWu1voky8WS1ja',
                'eleven-indian-monika': '1qEiC6qsybMkmnNdVMbK',
                'eleven-indian-sagar': 'Qc0h5B5Mqs8oaH4sFZ9X'
            };

            const elevenLabsVoiceId = elevenLabsVoiceMap[editedAgent.voiceId] || editedAgent.voiceId;

            // Convert text to speech using Eleven Labs
            // @ts-ignore
            const audioStream = await elevenLabsClient.textToSpeech.convert(
                elevenLabsVoiceId,
                {
                    text: text,
                    modelId: 'eleven_multilingual_v2',
                    voiceSettings: {
                        stability: 0.5,
                        similarityBoost: 0.5
                    }
                }
            );

            // Play the audio
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const arrayBuffer = await new Response(audioStream).arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);

            // Ensure playback happens only once by using a flag
            let playbackStarted = false;
            return new Promise<void>((resolve) => {
                source.onended = () => {
                    if (!playbackStarted) {
                        playbackStarted = true;
                        resolve();
                    }
                };
                // Additional safety to prevent multiple starts
                if (!playbackStarted) {
                    playbackStarted = true;
                    source.start();
                }
            });
        } catch (error) {
            console.error('Error converting text to speech:', error);
            throw error;
        }
    };

    // Helper function to convert Float32Array to WAV format
    const convertFloat32ToWav = async (float32Array: Float32Array, sampleRate: number): Promise<ArrayBuffer> => {
        const buffer = new ArrayBuffer(44 + float32Array.length * 2);
        const view = new DataView(buffer);

        // WAV header
        const writeString = (offset: number, string: string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + float32Array.length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, float32Array.length * 2, true);

        // Convert float32 to int16
        let offset = 44;
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            offset += 2;
        }

        return buffer;
    };

    // Voice preview functions
    const playVoicePreview = async (voiceId: string, text?: string) => {
        try {
            playingVoiceRef.current = voiceId;

            // Stop any currently playing preview
            if (previewAudioRef.current) {
                previewAudioRef.current.pause();
                previewAudioRef.current = null;
                setPreviewAudio(null);
            }

            // Generate preview audio
            const apiBaseUrl = getApiBaseUrl();
            const response = await fetch(`${apiBaseUrl}${getApiPath()}/voices/${voiceId}/preview`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: text || "Hello, this is a preview of the selected voice."
                })
            });

            const result = await response.json();

            if (result.success) {
                // Create audio from base64 data
                const audioSrc = result.audioData.startsWith('data:')
                    ? result.audioData
                    : `data:audio/mpeg;base64,${result.audioData}`;
                const audio = new Audio(audioSrc);
                previewAudioRef.current = audio;
                setPreviewAudio(audio);
                audio.play();

                // Set up event listeners
                audio.onended = () => {
                    playingVoiceRef.current = null;
                    previewAudioRef.current = null;
                    setPreviewAudio(null);
                };

                audio.onerror = () => {
                    playingVoiceRef.current = null;
                    previewAudioRef.current = null;
                    setPreviewAudio(null);
                };
            } else {
                throw new Error(result.message || 'Failed to generate voice preview');
            }
        } catch (error) {
            console.error('Error playing voice preview:', error);
            alert('Failed to play voice preview. Please try again.');
            playingVoiceRef.current = null;
        }
    };

    const stopVoicePreview = () => {
        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current = null;
            setPreviewAudio(null);
        }
        playingVoiceRef.current = null;
    };

    // Speech recognition reference
    const speechRecognitionRef = useRef<any>(null);
    // Speech recognition retry count for exponential backoff
    const speechRecognitionRetryCountRef = useRef<number>(0);
    const speechRecognitionMaxRetries = 5;

    // Function to initialize speech recognition
    // NOTE: We're removing browser-based speech recognition and will use ElevenLabs STT through backend
    const initializeSpeechRecognition = useCallback(() => {
        // For ElevenLabs STT, we don't initialize browser speech recognition
        // Instead, we'll handle audio streaming through WebSocket to backend
        console.log('Using ElevenLabs STT through backend WebSocket connection');
        return null;
    }, [editedAgent]);

    // Enhanced startCall function with BrowserVoiceHandler (all API keys handled on backend)
    const startCall = async () => {
        console.log('🎙️ Starting browser voice call...');

        console.log('Setting isCallActive to true');
        console.log('Call stack for setting isCallActive to true:', new Error().stack);
        // Set a flag to prevent immediate false setting
        callActiveDebugRef.current = true;
        setIsCallActive(true);

        // Clear any existing timeouts
        if (sessionTimeoutRef.current) {
            clearTimeout(sessionTimeoutRef.current);
            sessionTimeoutRef.current = null;
        }

        // Set up session timeout if enabled
        console.log('Setting up session timeout. Duration:', editedAgent.settings.sessionTimeoutFixedDuration);
        if (editedAgent.settings.sessionTimeoutFixedDuration > 0) {
            const timeoutMs = editedAgent.settings.sessionTimeoutFixedDuration * 1000;
            console.log('Session timeout will trigger in', editedAgent.settings.sessionTimeoutFixedDuration, 'seconds (', timeoutMs, 'ms)');
            // Make sure the timeout is reasonable (at least 1 second)
            if (timeoutMs >= 1000) {
                sessionTimeoutRef.current = setTimeout(() => {
                    console.log('Session timeout triggered');
                    const isCallActuallyActive = isCallActive || callActiveDebugRef.current;
                    if (isCallActuallyActive) {
                        alert(editedAgent.settings.sessionTimeoutEndMessage || "Your session has ended.");
                        // Don't automatically stop the call
                        // The user should explicitly click the stop button
                        // stopCall();
                    }
                }, timeoutMs);
            } else {
                console.log('Skipping session timeout setup because duration is too short:', timeoutMs, 'ms');
            }
        } else {
            console.log('No session timeout set or duration is 0');
        }

        try {
            // Set up audio processing for the live session
            console.log('Setting up audio processing for live session');

            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                microphoneStreamRef.current = stream;
            } catch (error) {
                console.error('Failed to get microphone access:', error);
                alert('Microphone access is required for voice calls. Please enable microphone permissions and try again.');
                // Set isCallActive to false since we couldn't get microphone access
                setIsCallActive(false);
                return;
            }

            try {
                inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                const source = inputAudioContextRef.current.createMediaStreamSource(stream);
                // TODO: Replace ScriptProcessorNode with AudioWorkletNode for better performance
                // ScriptProcessorNode is deprecated but still widely supported
                // AudioWorkletNode would provide better performance and is the recommended approach
                scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
                source.connect(scriptProcessorRef.current);
                scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);

                // DO NOT set up audio processing yet - wait for WebSocket connection
                // It will be set up after WebSocket connects
            } catch (error) {
                console.error('Failed to create audio context:', error);
                alert('Failed to initialize audio processing. Please try again.');
                // Set isCallActive to false since we couldn't initialize audio processing
                setIsCallActive(false);
                return;
            }

            // Initialize WebSocket connection to backend for Google Voice Stream processing (STT + Gemini + TTS)
            try {
                const isCallActuallyActive = isCallActive || callActiveDebugRef.current;
                console.log('Initializing WebSocket connection for Google Voice Stream processing. isCallActuallyActive:', isCallActuallyActive);

                if (isCallActuallyActive) {
                    // Ensure we have microphone access before starting
                    console.log('Starting WebSocket connection. Microphone stream available:', !!microphoneStreamRef.current);
                    if (microphoneStreamRef.current) {
                        // Add a small delay to ensure everything is ready
                        setTimeout(() => {
                            try {
                                // Check if the call is still active before starting
                                const isCallStillActive = isCallActive || callActiveDebugRef.current;
                                if (isCallStillActive) {
                                    // Establish WebSocket connection to backend using the new BrowserVoiceHandler
                                    const apiBaseUrl = getApiBaseUrl();
                                    const wsProtocol = apiBaseUrl.startsWith('https') ? 'wss:' : 'ws:';
                                    const wsHost = new URL(apiBaseUrl).host;
                                    // Pass the agent's voice ID and identity as query parameters
                                    const voiceId = editedAgent.voiceId || 'default';
                                    const agentId = editedAgent.id;
                                    const agentIdentity = encodeURIComponent(editedAgent.identity || '');
                                    const wsUrl = `${wsProtocol}//${wsHost}/browser-voice-stream?voiceId=${encodeURIComponent(voiceId)}&agentId=${agentId}&identity=${agentIdentity}&userId=${userId || ''}`;
                                    console.log('🌐 Connecting to Browser Voice Stream with voiceId:', voiceId, 'agentId:', agentId);
                                    webSocketRef.current = new WebSocket(wsUrl);

                                    webSocketRef.current.onopen = () => {
                                        console.log('WebSocket connection established successfully for voice stream');
                                        console.log('WebSocket readyState:', webSocketRef.current?.readyState);
                                        // Reset retry count on successful start
                                        speechRecognitionRetryCountRef.current = 0;

                                        // NOW set up audio processing after WebSocket is connected
                                        if (scriptProcessorRef.current) {
                                            scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                                                // Send audio data to backend via WebSocket for voice stream processing
                                                if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
                                                    const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);

                                                    // Check if there's actual audio data
                                                    let hasAudio = false;
                                                    for (let i = 0; i < inputData.length; i++) {
                                                        if (Math.abs(inputData[i]) > 0.01) {
                                                            hasAudio = true;
                                                            break;
                                                        }
                                                    }

                                                    if (hasAudio) {
                                                        // console.log('Audio detected, sending to server');
                                                    }

                                                    // Convert float32 to int16
                                                    const int16Data = new Int16Array(inputData.length);
                                                    for (let i = 0; i < inputData.length; i++) {
                                                        int16Data[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
                                                    }

                                                    // Send audio data as base64 (binary-safe encoding)
                                                    const uint8Array = new Uint8Array(int16Data.buffer);
                                                    let binary = '';
                                                    const chunkSize = 0x8000; // Process in chunks to avoid call stack size exceeded
                                                    for (let i = 0; i < uint8Array.length; i += chunkSize) {
                                                        const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
                                                        binary += String.fromCharCode.apply(null, Array.from(chunk));
                                                    }
                                                    const base64Data = btoa(binary);
                                                    webSocketRef.current.send(JSON.stringify({
                                                        event: 'audio',
                                                        data: base64Data
                                                    }));
                                                } else {
                                                    console.log('WebSocket not ready for audio. State:', webSocketRef.current?.readyState);
                                                }
                                            };
                                            console.log('Audio processing enabled after WebSocket connected');
                                        }

                                        // Set up heartbeat to keep connection alive
                                        const heartbeatInterval = setInterval(() => {
                                            if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
                                                webSocketRef.current.send(JSON.stringify({ event: 'ping' }));
                                            }
                                        }, 10000); // Send ping every 10 seconds

                                        // Store interval ID so we can clear it later
                                        (webSocketRef.current as any).heartbeatInterval = heartbeatInterval;
                                    };

                                    webSocketRef.current.onmessage = async (event) => {
                                        const data = JSON.parse(event.data);
                                        console.log('Received message from server:', data.event); // Log event only to reduce noise

                                        // Handle error messages
                                        if (data.event === 'error') {
                                            console.error('Server error:', data.message);
                                            return;
                                        }

                                        // Handle ping/pong messages
                                        if (data.event === 'ping') {
                                            if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
                                                webSocketRef.current.send(JSON.stringify({ event: 'pong' }));
                                            }
                                            return;
                                        }

                                        if (data.event === 'pong') {
                                            return;
                                        }

                                        if (data.event === 'transcript' && data.text) {
                                            // Update UI with user speech
                                            console.log('User detected:', data.text);
                                            setChatMessages(prev => [...prev, { sender: 'user', text: data.text }]);
                                            conversationHistoryRef.current.push({ role: 'user', text: data.text });
                                        }

                                        else if (data.event === 'agent-response' && data.text) {
                                            // Update UI with agent response
                                            console.log('Agent response:', data.text);
                                            setChatMessages(prev => [...prev, { sender: 'agent', text: data.text }]);
                                            conversationHistoryRef.current.push({ role: 'model', text: data.text });
                                        }

                                        else if (data.event === 'stop-audio') {
                                            // Interruption handling - stop current playback
                                            if (audioSourcesRef.current) {
                                                audioSourcesRef.current.forEach(source => {
                                                    try { source.stop(); } catch (e) { }
                                                });
                                                audioSourcesRef.current.clear();
                                            }
                                        }

                                        else if (data.event === 'audio' && data.audio) {
                                            // Play audio response from backend
                                            try {
                                                console.log('Playing agent response audio');

                                                // Use the output audio context we already have
                                                if (!outputAudioContextRef.current) {
                                                    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                                                }

                                                const audioContext = outputAudioContextRef.current;
                                                const binary = atob(data.audio);
                                                const array = new Uint8Array(binary.length);
                                                for (let i = 0; i < binary.length; i++) {
                                                    array[i] = binary.charCodeAt(i);
                                                }

                                                const audioBuffer = await audioContext.decodeAudioData(array.buffer);
                                                const source = audioContext.createBufferSource();
                                                source.buffer = audioBuffer;
                                                source.connect(audioContext.destination);

                                                // Store reference to stop previous audio if needed
                                                audioSourcesRef.current.forEach(prevSource => {
                                                    try {
                                                        prevSource.stop();
                                                    } catch (error) {
                                                        console.error('Error stopping previous audio:', error);
                                                    }
                                                });
                                                audioSourcesRef.current.clear();

                                                // Store this source and play it
                                                audioSourcesRef.current.add(source);
                                                source.start();
                                                console.log('Agent audio started playing');
                                            } catch (error) {
                                                console.error('Error playing audio response:', error);
                                            }
                                        }
                                    };

                                    webSocketRef.current.onerror = (error) => {
                                        console.error('WebSocket error:', error);
                                        // Try to reconnect on error
                                        setTimeout(() => {
                                            const isCallStillActive = isCallActive || callActiveDebugRef.current;
                                            if (isCallStillActive && !webSocketRef.current) {
                                                console.log('Attempting to reconnect WebSocket...');
                                                // Re-establish WebSocket connection
                                                const apiBaseUrl = getApiBaseUrl();
                                                const wsProtocol = apiBaseUrl.startsWith('https') ? 'wss:' : 'ws:';
                                                const wsHost = new URL(apiBaseUrl).host;
                                                const voiceId = editedAgent.voiceId || 'default';
                                                const agentId = editedAgent.id;
                                                const agentIdentity = encodeURIComponent(editedAgent.identity || '');
                                                const wsUrl = `${wsProtocol}//${wsHost}/browser-voice-stream?voiceId=${encodeURIComponent(voiceId)}&agentId=${agentId}&identity=${agentIdentity}&userId=${userId || ''}`;
                                                webSocketRef.current = new WebSocket(wsUrl);
                                            }
                                        }, 1000);
                                    };

                                    webSocketRef.current.onclose = (event) => {
                                        console.log('WebSocket connection closed', event);
                                        console.log('Close code:', event.code);
                                        console.log('Close reason:', event.reason);
                                        console.log('Was clean:', event.wasClean);
                                        // Clear heartbeat interval
                                        if (webSocketRef.current && (webSocketRef.current as any).heartbeatInterval) {
                                            clearInterval((webSocketRef.current as any).heartbeatInterval);
                                        }
                                        // Clear reference on close
                                        webSocketRef.current = null;
                                    };
                                } else {
                                    console.log('Skipping WebSocket connection - call no longer active');
                                }
                            } catch (startError) {
                                console.error('Error establishing WebSocket connection:', startError);
                            }
                        }, 750); // Increased delay to 750ms to ensure everything is ready
                    } else {
                        console.error('Cannot start WebSocket connection: No microphone stream available');
                    }
                } else {
                    console.log('WebSocket connection not started. Call active:', isCallActuallyActive);
                }
            } catch (error) {
                console.error('Error initializing WebSocket connection:', error);
                // Don't let connection errors kill the entire call
                console.log('WebSocket connection failed to initialize, but continuing call');
            };

            console.log('Audio processing started successfully');
        } catch (error) {
            console.error('Failed to start call:', error);
            alert('Could not start the call. Please ensure you have given microphone permissions.');
            // Only set isCallActive to false if it was true, to avoid timing issues
            const isCallActuallyActive = isCallActive || callActiveDebugRef.current;
            if (isCallActuallyActive) {
                console.log('Setting isCallActive to false in error handler');
                console.log('Call stack for setting isCallActive to false in error handler:', new Error().stack);
                setIsCallActive(false);
            }
        }
    };

    // The Web Speech API is used for real-time speech recognition instead of ElevenLabs STT
    // ElevenLabs STT is designed for file transcription, not real-time streaming

    const stopCall = useCallback(() => {
        console.log('Stopping call...');
        console.log('Setting isCallActive to false');
        console.log('Call stack for setting isCallActive to false:', new Error().stack);
        setIsCallActive(false);
        // Reset the greeting sent flag when stopping the call
        greetingSentRef.current = false;

        // Stop audio processing
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.onaudioprocess = null;
        }

        // Close WebSocket connection if active
        if (webSocketRef.current) {
            webSocketRef.current.close();
            webSocketRef.current = null;
            console.log('Closed WebSocket connection for Google Voice Stream processing');
        }

        // Reset speech recognition retry count
        speechRecognitionRetryCountRef.current = 0;

        // Clear any existing timeouts
        if (sessionTimeoutRef.current) {
            clearTimeout(sessionTimeoutRef.current);
            sessionTimeoutRef.current = null;
        }

        // Reset audio sources
        audioSourcesRef.current.clear();
        nextStartTimeRef.current = 0;

        if (outputAudioContextRef.current) {
            try {
                outputAudioContextRef.current.close();
            } catch (error) {
                console.error('Error closing output audio context:', error);
                // Continue cleanup even if there's an error
            }
        }
        outputAudioContextRef.current = null;

        // Clear conversation history when call ends
        conversationHistoryRef.current = [];
    }, []);

    // Cleanup effect for voice call resources
    useEffect(() => {
        return () => {
            // Cleanup when component unmounts
            console.log('Cleaning up voice call resources');

            // Clear any existing timeouts
            if (sessionTimeoutRef.current) {
                clearTimeout(sessionTimeoutRef.current);
                sessionTimeoutRef.current = null;
            }

            try {
                microphoneStreamRef.current?.getTracks().forEach(track => track.stop());
            } catch (error) {
                console.error('Error stopping microphone tracks:', error);
                // Continue cleanup even if there's an error
            }
            microphoneStreamRef.current = null;

            try {
                scriptProcessorRef.current?.disconnect();
            } catch (error) {
                console.error('Error disconnecting script processor:', error);
                // Continue cleanup even if there's an error
            }
            scriptProcessorRef.current = null;

            if (inputAudioContextRef.current) {
                try {
                    inputAudioContextRef.current.close();
                } catch (error) {
                    console.error('Error closing input audio context:', error);
                    // Continue cleanup even if there's an error
                }
            }
            inputAudioContextRef.current = null;

            audioSourcesRef.current.forEach(source => {
                try {
                    source.stop();
                } catch (error) {
                    console.error('Error stopping audio source:', error);
                    // Continue cleanup even if there's an error
                }
            });

            // Reset the greeting sent flag
            greetingSentRef.current = false;

            // Reset speech recognition retry count
            speechRecognitionRetryCountRef.current = 0;
        }
    }, []);

    // Initialize the call with AI greeting if userStartsFirst is false
    useEffect(() => {
        // Client-side greeting logic disabled - now handled by server-side DeepgramBrowserHandler
        console.log("Client-side greeting disabled. Server will handle greeting.");
    }, [isCallActive]);

    // Enhanced conversation processing with knowledge base integration
    const processConversationTurn = async (userInput: string) => {
        try {
            // Add user input to conversation history
            conversationHistoryRef.current.push({ role: 'user', text: userInput });

            // Check for knowledge base documents
            let knowledgeBaseContent = '';
            const hasKnowledge = editedAgent.settings.knowledgeDocIds && editedAgent.settings.knowledgeDocIds.length > 0 && userId;

            if (hasKnowledge) {
                // Play pre-action phrase immediately
                const defaultPhrases = ["Please wait, let me check the database for more details.", "Let me check my records.", "One moment, let me look that up."];
                // Use user-defined phrases if available, otherwise use defaults
                // The user specifically requested "please wait let me check the database for more details"
                let phrases = editedAgent.settings.preActionPhrases;
                if (!phrases || phrases.length === 0) {
                    phrases = defaultPhrases;
                }
                const phrase = phrases[Math.floor(Math.random() * phrases.length)];

                // Play phrase without awaiting to allow parallel processing
                // This gives immediate feedback while the LLM processes
                playVoicePreview(editedAgent.voiceId, phrase).catch(err => console.error("Error playing pre-action phrase:", err));

                try {
                    const documentService = new DocumentService();
                    let docContents: string[] = [];
                    if (editedAgent.settings.knowledgeDocIds && editedAgent.settings.knowledgeDocIds.length > 0) {
                        docContents = await Promise.all(
                            editedAgent.settings.knowledgeDocIds.map(async (docId) => {
                                if (knowledgeCacheRef.current.has(docId)) {
                                    return knowledgeCacheRef.current.get(docId)!;
                                }
                                const content = await documentService.getDocumentContent(docId);
                                knowledgeCacheRef.current.set(docId, content);
                                return content;
                            })
                        );
                    }
                    knowledgeBaseContent = docContents.filter(content => content).join('\n\n');
                } catch (error) {
                    console.error('Error fetching knowledge base documents:', error);
                }
            }

            // Send text to LLM for response with full conversation history
            const llmService = new LLMService(import.meta.env.VITE_GEMINI_API_KEY);

            // Prepare contents for API with complete conversation history
            const contentsForApi = conversationHistoryRef.current.map(msg => ({
                role: msg.role === 'agent' ? 'model' : 'user',
                parts: [{ text: msg.text }]
            }));

            // Enhance system instruction with knowledge base content if available
            let systemInstruction = editedAgent.identity;
            if (knowledgeBaseContent) {
                systemInstruction += `\n\nKnowledge Base:\n${knowledgeBaseContent}`;
            }

            // Add tool information to system instruction if tools are configured
            if (editedAgent.settings.tools && editedAgent.settings.tools.length > 0) {
                const toolDescriptions = editedAgent.settings.tools.map(tool =>
                    `- ${tool.name}: ${tool.description} (Parameters: ${tool.parameters?.map(p => `${p.name} (${p.type})${p.required ? ' [required]' : ''}`).join(', ') || 'None'})`
                ).join('\n');

                systemInstruction += `

Available Tools:
${toolDescriptions}

When you need to collect information from the user, ask for the required parameters. When all required information is collected, respond with a JSON object in the format: {"tool": "tool_name", "data": {"param1": "value1", "param2": "value2"}}`;
            }

            // Generate response using LLM with conversation context
            const result = await llmService.generateContent({
                model: editedAgent.model,
                contents: contentsForApi,
                config: { systemInstruction }
            });

            let agentResponse = result.text;

            // Check if the response contains tool execution instructions
            try {
                const jsonResponse = JSON.parse(agentResponse);
                if (jsonResponse.tool && jsonResponse.data) {
                    // Execute the tool
                    const toolExecutionService = new ToolExecutionService();
                    const tool = editedAgent.settings.tools.find(t => t.name === jsonResponse.tool);

                    if (tool) {
                        const success = await toolExecutionService.executeTool(tool, jsonResponse.data);

                        if (success) {
                            agentResponse = `I've successfully collected that information and saved it to ${tool.name}.`;
                        } else {
                            agentResponse = `I encountered an issue while saving your information to ${tool.name}. Let's try again.`;
                        }
                    } else {
                        agentResponse = `I couldn't find the tool "${jsonResponse.tool}". Let's continue our conversation.`;
                    }
                }
            } catch (e) {
                // Not a JSON response, continue with normal response
            }

            // Add agent response to conversation history
            conversationHistoryRef.current.push({ role: 'agent', text: agentResponse });

            // Stop any pre-action phrase playing before starting response audio
            stopVoicePreview();

            // Get Eleven Labs API key from environment variables
            const elevenLabsApiKey = import.meta.env.VITE_ELEVEN_LABS_API_KEY;
            if (!elevenLabsApiKey) {
                throw new Error('Eleven Labs API key is not configured');
            }

            // Create Eleven Labs client
            // @ts-ignore
            const elevenLabsClient = new ElevenLabsClient({
                apiKey: elevenLabsApiKey
            });

            // Map voice IDs to Eleven Labs voice IDs
            const elevenLabsVoiceMap: { [key: string]: string } = {
                'eleven-rachel': '21m00Tcm4TlvDq8ikWAM',
                'eleven-drew': '29vD33N1CtxCmqQRPOHJ',
                'eleven-clyde': '2EiwWnXFnvU5JabPnv8n',
                'eleven-zara': 'D38z5RcWu1voky8WS1ja',
                'eleven-indian-monika': '1qEiC6qsybMkmnNdVMbK',
                'eleven-indian-sagar': 'Qc0h5B5Mqs8oaH4sFZ9X'
            };

            const elevenLabsVoiceId = elevenLabsVoiceMap[editedAgent.voiceId] || editedAgent.voiceId;

            // Convert response to speech using Eleven Labs
            // @ts-ignore
            const audioStream = await elevenLabsClient.textToSpeech.convert(
                elevenLabsVoiceId,
                {
                    text: agentResponse,
                    modelId: 'eleven_multilingual_v2',
                    voiceSettings: {
                        stability: 0.5,
                        similarityBoost: 0.5
                    }
                }
            );

            // Play the response with race condition protection
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const arrayBuffer = await new Response(audioStream).arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);

            // Prevent race conditions by ensuring playback happens only once
            let playbackStarted = false;
            const startPlayback = () => {
                if (!playbackStarted) {
                    playbackStarted = true;
                    pauseRecognition();
                    source.start();
                }
            };

            // Set up completion handler
            source.onended = () => {
                if (playbackStarted) {
                    resumeRecognition();
                }
            };

            // Start playback
            startPlayback();

            console.log('Conversation turn processed:', { userInput, agentResponse });
            return agentResponse;
        } catch (error) {
            console.error('Error processing conversation turn:', error);
            // Still resume recognition even if there's an error
            resumeRecognition();
            throw error;
        }
    };

    const handleSettingsChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;

        const nameParts = name.split('.');
        setEditedAgent(prev => {
            // Create a safe copy of the agent object
            const newAgent = { ...prev };

            // Ensure settings object exists
            if (!newAgent.settings) {
                newAgent.settings = { ...prev.settings };
            }

            let currentLevel: any = newAgent;

            for (let i = 0; i < nameParts.length - 1; i++) {
                if (!currentLevel[nameParts[i]]) {
                    currentLevel[nameParts[i]] = {};
                }
                currentLevel = currentLevel[nameParts[i]];
            }

            const finalKey = nameParts[nameParts.length - 1];

            if (type === 'checkbox') {
                currentLevel[finalKey] = (e.target as HTMLInputElement).checked;
            } else if (type === 'number' || e.target.dataset.type === 'number') {
                currentLevel[finalKey] = parseFloat(value) || 0;
            } else {
                currentLevel[finalKey] = value;
            }

            // Update the agent with error handling
            try {
                updateAgent(newAgent);
            } catch (error) {
                console.error('Error updating agent settings:', error);
                // Don't prevent the UI from updating even if the backend fails
            }

            return newAgent;
        });
    }, [updateAgent]);



    const copyToClipboard = (text: string, type: string) => navigator.clipboard.writeText(text).then(() => alert(`${type} copied to clipboard!`));

    const handleSavePrompt = () => {
        setIsEditingPrompt(false);
        updateAgent(editedAgent);
    };
    const handleCancelPrompt = () => { setEditedAgent(p => ({ ...p, identity: agent.identity })); setIsEditingPrompt(false); };

    const handleSaveModel = (newModelId: string) => {
        const updatedAgent = { ...editedAgent, model: newModelId };
        setEditedAgent(updatedAgent);
        updateAgent(updatedAgent);
        setModelModalOpen(false);
    };

    const handleSaveVoice = (newVoiceId: string) => {
        console.log('=== SAVING VOICE ===');
        console.log('New Voice ID:', newVoiceId);
        console.log('Current Agent Voice ID:', editedAgent.voiceId);

        let updatedAgent = { ...editedAgent, voiceId: newVoiceId };

        // Auto-update language if the current one is not supported by the new voice provider
        const newProviderId = getVoiceProviderById(newVoiceId);
        const supportedLanguages = AVAILABLE_LANGUAGES_BY_PROVIDER[newProviderId] || AVAILABLE_LANGUAGES;
        const isCurrentLanguageSupported = supportedLanguages.some(lang => lang.id === updatedAgent.language);

        if (!isCurrentLanguageSupported) {
            updatedAgent.language = supportedLanguages[0].id;
        }

        console.log('Updated Agent Voice ID:', updatedAgent.voiceId);
        console.log('===================');

        setEditedAgent(updatedAgent);
        updateAgent(updatedAgent);
        setVoiceModalOpen(false);
    };

    const handleSaveLanguage = (newLanguageId: string) => {
        const updatedAgent = { ...editedAgent, language: newLanguageId };
        setEditedAgent(updatedAgent);
        updateAgent(updatedAgent);
        setLanguageModalOpen(false);
    };

    const handleSubmitTool = () => {
        let finalTool: Tool;

        if (newToolFunctionType === 'GoogleSheets') {
            // For Google Sheets, we create a special tool
            finalTool = {
                ...newTool,
                id: editingTool ? editingTool.id : `tool-${Date.now()}`,
                type: ToolType.GoogleSheets, // Use proper Google Sheets type
                method: 'POST', // Not used for Google Sheets
                headers: [], // Not used for Google Sheets
                preActionPhrases: newTool.preActionPhrases.split(',').map(p => p.trim()).filter(p => p)
            };
        } else {
            // For regular Webhook and WebForm
            finalTool = {
                ...newTool,
                id: editingTool ? editingTool.id : `tool-${Date.now()}`,
                type: newToolFunctionType === 'Webhook' ? ToolType.Webhook : ToolType.WebForm,
                preActionPhrases: newTool.preActionPhrases.split(',').map(p => p.trim()).filter(p => p)
            };
        }

        const updatedAgent = editingTool
            ? { ...editedAgent, settings: { ...editedAgent.settings, tools: editedAgent.settings.tools.map(t => t.id === editingTool.id ? finalTool : t) } }
            : { ...editedAgent, settings: { ...editedAgent.settings, tools: [...editedAgent.settings.tools, finalTool] } };

        setEditedAgent(updatedAgent);
        updateAgent(updatedAgent);
        setToolsModalOpen(false);
        setNewTool(initialNewToolState);
        setEditingTool(null);

        // Show Google Sheets sharing instructions if this is a Google Sheets tool
        if (newToolFunctionType === 'GoogleSheets' && finalTool.webhookUrl) {
            setGoogleSheetsSharingModalOpen(true);
        }
    };

    const handleNewToolChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setNewTool(p => ({ ...p, [e.target.name]: e.target.value }));
    const handleEditTool = (tool: Tool) => {
        setEditingTool(tool);
        setNewTool({
            ...tool,
            preActionPhrases: tool.preActionPhrases.join(', '),
            headers: tool.headers || [],
            parameters: tool.parameters || [],
        });
        setNewToolFunctionType(
            tool.type === ToolType.WebForm ? 'WebForm' :
                tool.type === ToolType.GoogleSheets ? 'GoogleSheets' : 'Webhook'
        );
        setToolsModalOpen(true);
    };
    const handleDeleteTool = (toolId: string) => {
        if (window.confirm("Are you sure you want to delete this tool?")) {
            const updatedAgent = { ...editedAgent, settings: { ...editedAgent.settings, tools: editedAgent.settings.tools.filter(t => t.id !== toolId) } };
            setEditedAgent(updatedAgent);
            updateAgent(updatedAgent);
        }
    };

    // Tool Headers and Parameters handlers
    const handleAddHeader = () => setNewTool(prev => ({ ...prev, headers: [...(prev.headers || []), { key: '', value: '' }] }));
    const handleDeleteHeader = (index: number) => setNewTool(prev => ({ ...prev, headers: (prev.headers || []).filter((_, i) => i !== index) }));
    const handleHeaderChange = (index: number, field: keyof ToolHeader, value: string) => {
        setNewTool(prev => {
            const newHeaders = JSON.parse(JSON.stringify(prev.headers || []));
            newHeaders[index][field] = value;
            return { ...prev, headers: newHeaders };
        });
    };

    const handleAddParameter = () => setNewTool(prev => ({ ...prev, parameters: [...(prev.parameters || []), { name: '', type: 'string', required: false }] }));
    const handleDeleteParameter = (index: number) => setNewTool(prev => ({ ...prev, parameters: (prev.parameters || []).filter((_, i) => i !== index) }));
    const handleParameterChange = (index: number, field: keyof ToolParameter, value: string | boolean) => {
        setNewTool(prev => {
            const newParams = JSON.parse(JSON.stringify(prev.parameters || []));
            newParams[index][field] = value;
            return { ...prev, parameters: newParams };
        });
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        const message = currentMessage.trim();
        if (!message || isAgentReplying) return;

        const newMessages = [...chatMessages, { sender: 'user' as const, text: message }];
        setChatMessages(newMessages);
        setCurrentMessage('');
        setIsAgentReplying(true);

        if (geminiChatSession) {
            // Handle real Gemini chat session
            try {
                const stream = await geminiChatSession.sendMessageStream({ message });
                let agentResponseText = '';
                setChatMessages(prev => [...prev, { sender: 'agent' as const, text: '' }]);

                for await (const chunk of stream) {
                    agentResponseText += chunk.text;
                    setChatMessages(prev => {
                        const updatedMessages = [...prev];
                        updatedMessages[updatedMessages.length - 1].text = agentResponseText;
                        return updatedMessages;
                    });
                }

                // Check if the response contains tool execution instructions
                try {
                    const jsonResponse = JSON.parse(agentResponseText);
                    if (jsonResponse.tool && jsonResponse.data) {
                        // Execute the tool
                        const toolExecutionService = new ToolExecutionService();
                        const tool = editedAgent.settings.tools.find(t => t.name === jsonResponse.tool);

                        if (tool) {
                            const success = await toolExecutionService.executeTool(tool, jsonResponse.data);

                            const toolResponse = success
                                ? `I've successfully collected that information and saved it to ${tool.name}.`
                                : `I encountered an issue while saving your information to ${tool.name}. Let's try again.`;

                            setChatMessages(prev => {
                                const updatedMessages = [...prev];
                                updatedMessages[updatedMessages.length - 1].text = toolResponse;
                                return updatedMessages;
                            });
                        }
                    }
                } catch (e) {
                    // Not a JSON response, continue with normal response
                }
            } catch (error) {
                console.error("Gemini API call failed:", error);
                const errorMsg = 'Sorry, an error occurred while trying to respond.';
                setChatMessages(prev => {
                    const updatedMessages = [...prev];
                    if (updatedMessages[updatedMessages.length - 1]?.sender === 'agent') {
                        updatedMessages[updatedMessages.length - 1].text = errorMsg;
                    } else {
                        updatedMessages.push({ sender: 'agent' as const, text: errorMsg });
                    }
                    return updatedMessages;
                });
            } finally {
                setIsAgentReplying(false);
            }
        } else {
            // Handle simulated chat for non-Gemini models using a one-off Gemini call
            if (!API_KEY) {
                setChatMessages(prev => [...prev, { sender: 'agent' as const, text: 'Cannot simulate response. API_KEY is not configured.' }]);
                setIsAgentReplying(false);
                return;
            }
            try {
                // Prepare system instruction with tool information if tools are configured
                let systemInstruction = `You are simulating an AI agent. The user has selected the model named '${editedAgent.model}'. Your instructions are defined by the following identity:\n\n${editedAgent.identity}`;

                // Add tool information to system instruction if tools are configured
                if (editedAgent.settings.tools && editedAgent.settings.tools.length > 0) {
                    const toolDescriptions = editedAgent.settings.tools.map(tool =>
                        `- ${tool.name}: ${tool.description} (Parameters: ${tool.parameters?.map(p => `${p.name} (${p.type})${p.required ? ' [required]' : ''}`).join(', ') || 'None'})`
                    ).join('\n');

                    systemInstruction += `

Available Tools:
${toolDescriptions}

When you need to collect information from the user, ask for the required parameters. When all required information is collected, respond with a JSON object in the format: {"tool": "tool_name", "data": {"param1": "value1", "param2": "value2"}}`;
                }

                const ai = new GoogleGenAI({ apiKey: API_KEY });
                const contentsForApi = newMessages.map(msg => ({
                    role: msg.sender === 'agent' ? 'model' : 'user',
                    parts: [{ text: msg.text }]
                }));

                const stream = await ai.models.generateContentStream({
                    model: 'gemini-2.0-flash',
                    contents: contentsForApi,
                    config: {
                        systemInstruction
                    }
                });

                let agentResponseText = '';
                setChatMessages(prev => [...prev, { sender: 'agent' as const, text: '' }]);

                for await (const chunk of stream) {
                    agentResponseText += chunk.text;
                    setChatMessages(prev => {
                        const updatedMessages = [...prev];
                        updatedMessages[updatedMessages.length - 1].text = agentResponseText;
                        return updatedMessages;
                    });
                }

                // Check if the response contains tool execution instructions
                try {
                    const jsonResponse = JSON.parse(agentResponseText);
                    if (jsonResponse.tool && jsonResponse.data) {
                        // Execute the tool
                        const toolExecutionService = new ToolExecutionService();
                        const tool = editedAgent.settings.tools.find(t => t.name === jsonResponse.tool);

                        if (tool) {
                            const success = await toolExecutionService.executeTool(tool, jsonResponse.data);

                            const toolResponse = success
                                ? `I've successfully collected that information and saved it to ${tool.name}.`
                                : `I encountered an issue while saving your information to ${tool.name}. Let's try again.`;

                            setChatMessages(prev => {
                                const updatedMessages = [...prev];
                                updatedMessages[updatedMessages.length - 1].text = toolResponse;
                                return updatedMessages;
                            });
                        }
                    }
                } catch (e) {
                    // Not a JSON response, continue with normal response
                }
            } catch (error) {
                console.error("Simulated API call failed:", error);
                setChatMessages(prev => [...prev, { sender: 'agent' as const, text: 'Sorry, an error occurred during the simulation.' }]);
            } finally {
                setIsAgentReplying(false);
            }
        }
    };

    const preActionPhraseOptions = [
        { id: PreActionPhraseMode.Disable, label: 'disable', description: 'The agent will execute the action silently without saying anything.' },
        { id: PreActionPhraseMode.Flexible, label: 'flexible', description: 'The agent will generate a phrase based on the examples provided, adjusting for context and language.' },
        { id: PreActionPhraseMode.Strict, label: 'strict', description: 'The agent will say exactly one of the phrases provided, regardless of language.' }
    ];

    const ModelSelectionModal: React.FC<{
        onClose: () => void;
        onSave: (modelId: string) => void;
        currentModelId: string;
    }> = ({ onClose, onSave, currentModelId }) => {
        const [selectedModel, setSelectedModel] = useState(currentModelId);

        return (
            <Modal isOpen={true} onClose={onClose} title="Select Intelligence">
                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                    <div className="grid gap-3">
                        {AVAILABLE_MODELS.map(model => (
                            <div
                                key={model.id}
                                onClick={() => setSelectedModel(model.id)}
                                className={`group p-5 rounded-3xl border transition-all cursor-pointer flex items-center gap-5 ${selectedModel === model.id
                                    ? 'bg-primary/5 border-primary/30 shadow-sm'
                                    : 'bg-white dark:bg-darkbg-surface border-slate-100 dark:border-darkbg-lighter hover:border-slate-200 dark:hover:border-darkbg-light'
                                    }`}
                            >
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${selectedModel === model.id
                                    ? 'bg-primary text-white shadow-xl shadow-primary/20'
                                    : 'bg-slate-50 dark:bg-slate-800 text-slate-400 group-hover:bg-slate-100 dark:group-hover:bg-slate-700'
                                    }`}>
                                    <model.icon className="h-7 w-7" />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h4 className={`text-base font-black transition-colors ${selectedModel === model.id ? 'text-primary' : 'text-slate-800 dark:text-white'}`}>
                                        {model.name}
                                    </h4>
                                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                                        {model.description}
                                    </p>
                                </div>

                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedModel === model.id
                                    ? 'bg-primary border-primary scale-110'
                                    : 'border-slate-200 dark:border-slate-700 opacity-30 group-hover:opacity-100'
                                    }`}>
                                    {selectedModel === model.id && <CheckIcon className="h-4 w-4 text-white" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSave(selectedModel)}
                        className="bg-primary text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/25 hover:bg-primary-dark transition-all"
                    >
                        Set Intelligence
                    </button>
                </div>
            </Modal>
        );
    };



    const LanguageSelectionModal: React.FC<{
        onClose: () => void;
        onSave: (languageId: string) => void;
        currentLanguageId: string;
        voiceProviderId: string;
    }> = ({ onClose, onSave, currentLanguageId, voiceProviderId }) => {
        const [selectedLanguage, setSelectedLanguage] = useState(currentLanguageId);
        const languagesToShow = AVAILABLE_LANGUAGES_BY_PROVIDER[voiceProviderId] || AVAILABLE_LANGUAGES;

        useEffect(() => {
            // If the currently selected language is not supported by the provider, default to the first available one.
            if (!languagesToShow.some(lang => lang.id === selectedLanguage)) {
                setSelectedLanguage(languagesToShow[0]?.id || AVAILABLE_LANGUAGES[0].id);
            }
        }, [voiceProviderId, languagesToShow, selectedLanguage]);

        return (
            <Modal isOpen={true} onClose={onClose} title="Select Language">
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {languagesToShow.map(lang => (
                            <div
                                key={lang.id}
                                onClick={() => setSelectedLanguage(lang.id)}
                                className={`group p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${selectedLanguage === lang.id
                                    ? 'bg-primary/5 border-primary/30'
                                    : 'bg-white dark:bg-darkbg-surface border-slate-100 dark:border-darkbg-lighter hover:border-slate-200 dark:hover:border-darkbg-light'
                                    }`}
                            >
                                <span className={`text-sm font-black transition-colors ${selectedLanguage === lang.id ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>
                                    {lang.name}
                                </span>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedLanguage === lang.id
                                    ? 'bg-primary border-primary scale-110'
                                    : 'border-slate-200 dark:border-slate-700 opacity-0 group-hover:opacity-100'
                                    }`}>
                                    {selectedLanguage === lang.id && <CheckIcon className="h-3 w-3 text-white" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSave(selectedLanguage)}
                        className="bg-primary text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/25 hover:bg-primary-dark transition-all"
                    >
                        Save Language
                    </button>
                </div>
            </Modal>
        )
    };

    const KnowledgeModal: React.FC<{
        isOpen: boolean;
        onClose: () => void;
        agent: VoiceAgent;
        onSave: (updatedSettings: VoiceAgentSettings) => void;
        userId: string;
    }> = ({ isOpen, onClose, agent, onSave, userId }) => {
        const [localSettings, setLocalSettings] = useState<VoiceAgentSettings>(agent.settings);
        const [availableDocs, setAvailableDocs] = useState<{ id: string; name: string; size: string; uploadedDate: string }[]>([]);
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState<string | null>(null);
        const fileInputRef = useRef<HTMLInputElement>(null);

        const documentService = new DocumentService();

        useEffect(() => {
            if (isOpen && userId) {
                setLocalSettings(JSON.parse(JSON.stringify(agent.settings)));
                loadDocuments();
            }
        }, [agent, isOpen, userId]);

        const loadDocuments = async () => {
            try {
                setLoading(true);
                setError(null);
                const docs = await documentService.getDocuments(userId, agent.id);
                setAvailableDocs(docs.map(doc => ({
                    id: doc.id,
                    name: doc.name,
                    size: 'Unknown',
                    uploadedDate: new Date(doc.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                })));
            } catch (err) {
                console.error('Error loading documents:', err);
                setError('Failed to load documents');
            } finally {
                setLoading(false);
            }
        };

        const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
            if (event.target.files && userId) {
                try {
                    setLoading(true);
                    setError(null);
                    const files = Array.from(event.target.files) as File[];
                    const uploadPromises = files.map(file => documentService.uploadDocument(userId, file, agent.id));
                    const uploadedDocs = await Promise.all(uploadPromises);
                    const newDocs = uploadedDocs.map(doc => ({
                        id: doc.id,
                        name: doc.name,
                        size: 'Unknown',
                        uploadedDate: new Date(doc.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    }));
                    setAvailableDocs(prev => [...prev, ...newDocs]);
                    const newDocIds = newDocs.map(d => d.id);
                    setLocalSettings(prev => ({ ...prev, knowledgeDocIds: [...(prev.knowledgeDocIds || []), ...newDocIds] }));
                    event.target.value = '';
                } catch (err) {
                    setError('Failed to upload files');
                } finally {
                    setLoading(false);
                }
            }
        };

        const toggleDocSelection = (docId: string) => {
            setLocalSettings(prev => {
                const currentIds = prev.knowledgeDocIds || [];
                return {
                    ...prev,
                    knowledgeDocIds: currentIds.includes(docId) ? currentIds.filter(id => id !== docId) : [...currentIds, docId]
                };
            });
        };

        return (
            <Modal isOpen={isOpen} onClose={onClose} title="Knowledge Base">
                <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                    {/* Upload Section */}
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="group relative border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all card-animate"
                    >
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple accept=".pdf,.doc,.docx,.txt,.md,.csv" />
                        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                            {loading ? <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-b-transparent" /> : <ArrowUpTrayIcon className="h-8 w-8 text-slate-400 group-hover:text-primary transition-colors" />}
                        </div>
                        <h4 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white mb-2">Upload Documents</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PDF, DOCX, TXT, MD, CSV (Max 10MB)</p>
                    </div>

                    {error && <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/50 p-4 rounded-2xl text-xs font-bold text-red-500 uppercase tracking-wider">{error}</div>}

                    {/* Document List */}
                    <div className="space-y-3">
                        <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">Selected Documents</h4>
                        {availableDocs.length === 0 && !loading ? (
                            <div className="py-12 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border border-slate-100 dark:border-slate-800 text-center">
                                <DocumentTextIcon className="h-12 w-12 text-slate-200 dark:text-slate-800 mx-auto mb-3" />
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No documents found</p>
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {availableDocs.map(doc => {
                                    const isSelected = (localSettings.knowledgeDocIds || []).includes(doc.id);
                                    return (
                                        <div
                                            key={doc.id}
                                            onClick={() => toggleDocSelection(doc.id)}
                                            className={`group p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 ${isSelected ? 'bg-primary/5 border-primary/30 shadow-sm shadow-primary/5' : 'bg-white dark:bg-darkbg-surface border-slate-100 dark:border-darkbg-lighter hover:border-slate-300 dark:hover:border-darkbg-light'}`}
                                        >
                                            <div className={`p-3 rounded-xl transition-colors ${isSelected ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 group-hover:bg-slate-100 dark:group-hover:bg-slate-700'}`}>
                                                <DocumentTextIcon className="h-5 w-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h5 className={`text-sm font-black truncate ${isSelected ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>{doc.name}</h5>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{doc.uploadedDate}</p>
                                            </div>
                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-primary border-primary scale-110' : 'border-slate-200 dark:border-slate-700 group-hover:border-primary/50'}`}>
                                                {isSelected && <CheckIcon className="h-4 w-4 text-white" />}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Pre-action phrase */}
                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-3xl p-6 border border-slate-100 dark:border-slate-800">
                        <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Searching Behavior</h4>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Search Phrase</label>
                                <input
                                    type="text"
                                    value={(localSettings.preActionPhrases || [])[0] || ''}
                                    onChange={e => setLocalSettings(p => ({ ...p, preActionPhrases: e.target.value ? [e.target.value] : [] }))}
                                    placeholder="e.g. Let me check my records..."
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-medium placeholder:text-slate-300 dark:placeholder:text-slate-600"
                                />
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-3 leading-relaxed">The agent will say this while retrieving information from the documents.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                    <button onClick={onClose} className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">Cancel</button>
                    <button onClick={() => { onSave(localSettings); onClose(); }} className="bg-primary text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/25 hover:bg-primary-dark transition-all">Save Changes</button>
                </div>
            </Modal>
        );
    };

    const renderToolsModal = () => (
        <Modal
            isOpen={isToolsModalOpen}
            onClose={() => { setToolsModalOpen(false); setNewTool(initialNewToolState); setEditingTool(null); }}
            title={editingTool ? 'Edit Automation Tool' : 'New Automation Tool'}
        >
            <div className="space-y-8 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                {/* Basic Info */}
                <div className="grid gap-6">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Tool Name</label>
                        <input
                            type="text"
                            name="name"
                            value={newTool.name}
                            onChange={handleNewToolChange}
                            placeholder="e.g. Order Tracking"
                            className="w-full bg-slate-50/50 dark:bg-darkbg-surface border border-slate-200 dark:border-darkbg-lighter rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all font-bold text-slate-800 dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Description</label>
                        <textarea
                            name="description"
                            value={newTool.description}
                            onChange={(e) => setNewTool(p => ({ ...p, description: e.target.value }))}
                            placeholder="Tell the agent when and how to use this tool..."
                            rows={3}
                            className="w-full bg-slate-50/50 dark:bg-darkbg-surface border border-slate-200 dark:border-darkbg-lighter rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all font-medium text-slate-700 dark:text-slate-200 min-h-[100px]"
                        />
                    </div>
                </div>

                {/* Google Sheets Integration Card */}
                <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-3xl p-6 border border-emerald-100 dark:border-emerald-900/30">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 rounded-xl">
                            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M14.5 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V7.5L14.5 2zM14 8V3.5L18.5 8H14zM11 11h2v2h-2v-2zm-3 0h2v2H8v-2zm9 6H7v-1h10v1zm0-2H7v-1h10v1zm0-2H13v-1h4v1z" />
                            </svg>
                        </div>
                        <div>
                            <h4 className="text-sm font-black text-emerald-900 dark:text-emerald-300 uppercase tracking-widest">Google Sheets</h4>
                            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-500/80 uppercase tracking-wider">Direct Data Sync</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-[10px] font-bold text-emerald-800/60 dark:text-emerald-400/60 uppercase tracking-widest mb-2 ml-1">Spreadsheet URL</label>
                            <input
                                type="text"
                                name="webhookUrl"
                                value={newTool.webhookUrl}
                                onChange={handleNewToolChange}
                                placeholder="https://docs.google.com/spreadsheets/d/..."
                                className="w-full bg-white dark:bg-darkbg-surface border border-emerald-100/50 dark:border-emerald-900/30 rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all font-medium text-slate-800 dark:text-white"
                            />
                        </div>

                        <div className="pt-2">
                            <div className="flex justify-between items-center mb-4 px-1">
                                <h5 className="text-[10px] font-black text-emerald-800/60 dark:text-emerald-400/60 uppercase tracking-widest">Sheet Columns</h5>
                                <button type="button" onClick={handleAddParameter} className="text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:text-emerald-700 transition-colors flex items-center gap-1.5">
                                    <PlusIcon className="h-3.5 w-3.5 border-2 border-emerald-600 rounded-md" /> Add Column
                                </button>
                            </div>

                            <div className="space-y-3">
                                {(newTool.parameters || []).map((param, index) => (
                                    <div key={index} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center bg-white/60 dark:bg-darkbg-light/30 p-2.5 rounded-2xl border border-emerald-100/50 dark:border-emerald-900/20 group animate-slide-in">
                                        <input
                                            type="text"
                                            value={param.name}
                                            onChange={e => handleParameterChange(index, 'name', e.target.value)}
                                            placeholder="Column Name"
                                            className="bg-transparent border-none text-sm font-bold text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-700 focus:ring-0 px-2"
                                        />
                                        <select
                                            value={param.type}
                                            onChange={e => handleParameterChange(index, 'type', e.target.value)}
                                            className="bg-emerald-50 dark:bg-slate-800 border-none rounded-xl text-[10px] font-black uppercase tracking-widest py-1.5 pl-3 pr-8 focus:ring-0 text-emerald-700 dark:text-emerald-400"
                                        >
                                            <option value="string">Text</option>
                                            <option value="number">Num</option>
                                            <option value="boolean">Yes/No</option>
                                        </select>
                                        <div className="flex flex-col items-center gap-1 px-1">
                                            <label className="text-[8px] font-black text-slate-400 uppercase">Req</label>
                                            <input
                                                type="checkbox"
                                                checked={param.required}
                                                onChange={e => handleParameterChange(index, 'required', e.target.checked)}
                                                className="h-4 w-4 rounded-md border-emerald-200 dark:border-emerald-800 text-emerald-500 focus:ring-emerald-500/20 bg-white dark:bg-darkbg-surface"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteParameter(index)}
                                            className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                {(!newTool.parameters || newTool.parameters.length === 0) && (
                                    <div className="text-center py-6 bg-white/40 dark:bg-darkbg-light/10 rounded-2xl border-2 border-dashed border-emerald-100 dark:border-emerald-900/30">
                                        <p className="text-[10px] font-black text-emerald-800/40 dark:text-emerald-400/40 uppercase tracking-widest">No columns defined yet</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Behavioral settings */}
                <div className="bg-slate-50 dark:bg-darkbg-light/30 rounded-3xl p-6 border border-slate-100 dark:border-darkbg-lighter space-y-8">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">Execution Mode</h4>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Run this tool after call ends</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer group">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={newTool.runAfterCall}
                                onChange={(e) => setNewTool(p => ({ ...p, runAfterCall: e.target.checked }))}
                            />
                            <div className="w-12 h-7 bg-slate-200 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                    </div>

                    <div className="space-y-4">
                        <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Agent Announcement</label>
                        <div className="grid gap-3">
                            {preActionPhraseOptions.map(opt => (
                                <div
                                    key={opt.id}
                                    onClick={() => setNewTool(p => ({ ...p, preActionPhrasesMode: opt.id }))}
                                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${newTool.preActionPhrasesMode === opt.id ? 'bg-primary/5 border-primary/30' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${newTool.preActionPhrasesMode === opt.id ? 'bg-primary border-primary' : 'border-slate-200 dark:border-slate-700'}`}>
                                            {newTool.preActionPhrasesMode === opt.id && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                        </div>
                                        <span className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">{opt.label}</span>
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-2 ml-7 leading-relaxed">{opt.description}</p>
                                </div>
                            ))}
                        </div>

                        {(newTool.preActionPhrasesMode === 'flexible' || newTool.preActionPhrasesMode === 'strict') && (
                            <div className="mt-4 animate-slide-in">
                                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Example Phrases</label>
                                <input
                                    type="text"
                                    name="preActionPhrases"
                                    value={newTool.preActionPhrases}
                                    onChange={handleNewToolChange}
                                    placeholder="e.g. Saving that now, Just a second..."
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-medium"
                                />
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-2 px-1">Separate multiple phrases with commas.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                <button
                    onClick={() => { setToolsModalOpen(false); setNewTool(initialNewToolState); setEditingTool(null); }}
                    className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSubmitTool}
                    className="bg-primary text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/25 hover:bg-primary-dark transition-all"
                >
                    {editingTool ? 'Update Tool' : 'Create Tool'}
                </button>
            </div>
        </Modal>
    );


    // Fetch user documents for display
    const [userDocuments, setUserDocuments] = useState<{ id: string; name: string }[]>([]);

    useEffect(() => {
        const fetchDocuments = async () => {
            if (userId) {
                try {
                    const documentService = new DocumentService();
                    // @ts-ignore - Assuming getDocuments exists and returns the expected format
                    const docs = await documentService.getDocuments(userId);
                    setUserDocuments(docs);
                } catch (error) {
                    console.error('Error fetching documents:', error);
                }
            }
        };
        fetchDocuments();
    }, [userId, isKnowledgeModalOpen]); // Re-fetch when modal closes in case of new uploads

    return (
        <div className="min-h-full">
            {isModelModalOpen && (
                <ModelSelectionModal
                    onClose={() => setModelModalOpen(false)}
                    onSave={handleSaveModel}
                    currentModelId={editedAgent.model}
                />
            )}
            {isVoiceModalOpen && (
                <VoiceSelectionModal
                    onClose={() => setVoiceModalOpen(false)}
                    onSave={handleSaveVoice}
                    currentVoiceId={editedAgent.voiceId}
                    availableVoices={availableVoices}
                    loadingVoices={loadingVoices}
                    playingVoiceId={playingVoiceRef.current}
                    onPlayPreview={playVoicePreview}
                    onStopPreview={stopVoicePreview}
                />
            )}
            {isLanguageModalOpen && (
                <LanguageSelectionModal
                    onClose={() => setLanguageModalOpen(false)}
                    onSave={handleSaveLanguage}
                    currentLanguageId={editedAgent.language}
                    voiceProviderId={getVoiceProviderById(editedAgent.voiceId)}
                />
            )}
            {isGoogleSheetsSharingModalOpen && (
                <Modal isOpen={true} onClose={() => setGoogleSheetsSharingModalOpen(false)} title="Google Sheets Setup">
                    <div className="space-y-8 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                        <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-3xl p-6">
                            <div className="flex items-center gap-4 mb-3">
                                <div className="p-3 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 rounded-2xl">
                                    <CheckIcon className="h-6 w-6" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-emerald-900 dark:text-emerald-300 uppercase tracking-widest">Share Permission</h4>
                                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-500/70 uppercase tracking-wider">Required for Sync</p>
                                </div>
                            </div>
                            <p className="text-xs font-medium text-emerald-800/80 dark:text-emerald-400/80 leading-relaxed">
                                To allow your agent to save data, you must share your spreadsheet with our service account email as an <span className="font-black underline">Editor</span>.
                            </p>
                        </div>

                        <div className="space-y-6">
                            <h5 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">Implementation Steps</h5>

                            <div className="grid gap-4">
                                {[
                                    { step: 1, text: "Open your Google Sheet" },
                                    { step: 2, text: 'Click the "Share" button at the top right' },
                                    { step: 3, isEmail: true },
                                    { step: 4, text: 'Set permission to "Editor"' },
                                    { step: 5, text: 'Click "Send" or "Done"' },
                                ].map((item, i) => (
                                    <div key={i} className="flex gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                                        <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center flex-shrink-0 text-xs font-black text-primary">
                                            {item.step}
                                        </div>
                                        <div className="flex-1">
                                            {item.isEmail ? (
                                                <div className="space-y-3">
                                                    <p className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wide">Add this service email</p>
                                                    <div className="group relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex items-center justify-between hover:border-primary/50 transition-all">
                                                        <code className="text-[10px] font-bold text-primary break-all pr-2">
                                                            ziyavoice@stoked-brand-423611-i3.iam.gserviceaccount.com
                                                        </code>
                                                        <button
                                                            onClick={() => {
                                                                navigator.clipboard.writeText('ziyavoice@stoked-brand-423611-i3.iam.gserviceaccount.com');
                                                            }}
                                                            className="p-2 bg-primary/5 text-primary rounded-lg hover:bg-primary transition-colors hover:text-white"
                                                        >
                                                            <DocumentDuplicateIcon className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-sm font-bold text-slate-600 dark:text-slate-300 pt-1.5">{item.text}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="p-5 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-3xl">
                            <p className="text-[10px] font-bold text-amber-700/80 dark:text-amber-500/80 uppercase tracking-widest leading-relaxed">
                                Note: This is an automated service account. It only accesses sheets you explicitly share with it.
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-end mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={() => setGoogleSheetsSharingModalOpen(false)}
                            className="bg-primary text-white px-10 py-3 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/25 hover:bg-primary-dark transition-all"
                        >
                            Got it!
                        </button>
                    </div>
                </Modal>
            )}
            {userId && (
                <KnowledgeModal
                    isOpen={isKnowledgeModalOpen}
                    onClose={() => setKnowledgeModalOpen(false)}
                    agent={editedAgent}
                    userId={userId}
                    onSave={async (newSettings) => {
                        try {
                            const updatedAgent = { ...editedAgent, settings: newSettings };
                            setEditedAgent(updatedAgent);
                            await updateAgent(updatedAgent);
                            setKnowledgeModalOpen(false);
                            // Refresh docs
                            const documentService = new DocumentService();
                            const docs = await documentService.getDocuments(userId);
                            setUserDocuments(docs);
                        } catch (error) {
                            console.error('Error saving knowledge settings:', error);
                        }
                    }}
                />
            )}
            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 p-4 sm:p-6 lg:p-8">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            { title: 'Model', value: AVAILABLE_MODELS.find(m => m.id === editedAgent.model)?.name || editedAgent.model, icon: ModelIcon, action: () => setModelModalOpen(true), color: 'blue' },
                            {
                                title: 'Voice',
                                value: (() => {
                                    const allVoices = Object.values(availableVoices).flat() as { id: string, name: string }[];
                                    const apiVoice = allVoices.find(v => v.id === editedAgent.voiceId);
                                    if (apiVoice) return apiVoice.name;
                                    const hardcodedName = getVoiceNameById(editedAgent.voiceId);
                                    return hardcodedName || editedAgent.voiceId;
                                })(),
                                icon: VoiceIcon,
                                action: () => setVoiceModalOpen(true),
                                color: 'purple'
                            },
                            { title: 'Language', value: AVAILABLE_LANGUAGES.find(l => l.id === editedAgent.language)?.name || editedAgent.language, icon: LanguageIcon, action: () => setLanguageModalOpen(true), color: 'emerald' },
                        ].map(item => (
                            <button
                                onClick={item.action}
                                key={item.title}
                                className="relative overflow-hidden group p-6 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all text-left"
                            >
                                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <item.icon className="h-16 w-16" />
                                </div>
                                <div className="relative z-10">
                                    <div className={`w-10 h-10 rounded-xl mb-4 flex items-center justify-center ${item.color === 'blue' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-500' :
                                        item.color === 'purple' ? 'bg-purple-50 dark:bg-purple-900/40 text-purple-400' :
                                            'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-400'
                                        }`}>
                                        <item.icon className="h-5 w-5" />
                                    </div>
                                    <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{item.title}</h4>
                                    <p className="font-bold text-slate-800 dark:text-white truncate">{item.value}</p>
                                </div>
                                <div className="absolute bottom-0 left-0 h-1 bg-primary w-0 group-hover:w-full transition-all duration-300"></div>
                            </button>
                        ))}
                    </div>

                    <div className="bg-white dark:bg-darkbg-surface border border-slate-200 dark:border-darkbg-lighter rounded-3xl shadow-sm overflow-hidden card-animate">
                        <div className="p-8 border-b border-slate-100 dark:border-darkbg-lighter flex justify-between items-center bg-slate-50/30 dark:bg-darkbg-light/50">
                            <div>
                                <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <EditIcon className="h-4 w-4" /> Agent Prompt
                                </h3>
                                <p className="text-[10px] text-slate-400 font-bold mt-1 tracking-wider">Define personality, goals, and constraints</p>
                            </div>
                            {!isEditingPrompt ? (
                                <button onClick={() => setIsEditingPrompt(true)} className="flex items-center text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary-dark transition-colors px-4 py-2 bg-primary/5 rounded-xl border border-primary/10">Edit Agent Prompt</button>
                            ) : (
                                <div className="flex gap-2">
                                    <button onClick={handleCancelPrompt} className="text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500">Cancel</button>
                                    <button onClick={handleSavePrompt} className="text-[10px] font-black uppercase tracking-widest text-white bg-primary px-4 py-2 rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all">Save Changes</button>
                                </div>
                            )}
                        </div>
                        <div className="p-8">
                            {isEditingPrompt ? (
                                <textarea
                                    name="identity"
                                    value={editedAgent.identity}
                                    onChange={handleSettingsChange}
                                    className="w-full h-96 p-6 font-mono text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl focus:ring-4 focus:ring-primary/10 focus:border-primary focus:outline-none transition-all resize-none shadow-inner"
                                    placeholder="You are a helpful customer support agent..."
                                />
                            ) : (
                                <div className="space-y-4">
                                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300 font-medium selection:bg-primary/20">
                                        {editedAgent.identity}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    <SettingsCard title="Conversation Configuration">
                        <SettingsToggle label="User starts first" description="Agent will wait for user to start first." name="settings.userStartsFirst" checked={editedAgent.settings.userStartsFirst} onChange={handleSettingsChange} />

                        <div className="p-5 -mx-5 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20 border border-slate-100 dark:border-slate-800">
                            <label htmlFor="greetingLine" className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 ml-1">Greeting Line</label>
                            <input
                                type="text"
                                id="greetingLine"
                                name="settings.greetingLine"
                                value={editedAgent.settings.greetingLine}
                                onChange={handleSettingsChange}
                                placeholder="e.g. Hello! How can I help you today?"
                                className="w-full bg-slate-50/50 dark:bg-darkbg-surface border border-slate-200 dark:border-darkbg-lighter rounded-xl px-5 py-3.5 text-sm focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all font-bold text-slate-800 dark:text-white"
                            />
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-3 ml-1">The first message the agent says. Leave blank to disable.</p>
                        </div>

                        <div className="pt-4 mt-2">
                            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-6 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                Session Timeout
                                <span className="text-[8px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-full font-black">Advanced</span>
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div>
                                    <label htmlFor="sessionTimeoutFixedDuration" className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Fixed Duration (Seconds)</label>
                                    <input
                                        type="number"
                                        id="sessionTimeoutFixedDuration"
                                        name="settings.sessionTimeoutFixedDuration"
                                        value={editedAgent.settings.sessionTimeoutFixedDuration}
                                        onChange={handleSettingsChange}
                                        min="0" max="86400"
                                        className="w-full bg-slate-50/50 dark:bg-darkbg-surface border border-slate-200 dark:border-darkbg-lighter rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all font-bold text-slate-800 dark:text-white"
                                        placeholder="e.g. 300"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="sessionTimeoutEndMessage" className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">End-of-Session Message</label>
                                    <input
                                        type="text"
                                        id="sessionTimeoutEndMessage"
                                        name="settings.sessionTimeoutEndMessage"
                                        value={editedAgent.settings.sessionTimeoutEndMessage}
                                        onChange={handleSettingsChange}
                                        className="w-full bg-slate-50/50 dark:bg-darkbg-surface border border-slate-200 dark:border-darkbg-lighter rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all font-bold text-slate-800 dark:text-white text-ellipsis"
                                        placeholder="e.g. Goodbye!"
                                    />
                                </div>
                            </div>
                        </div>
                    </SettingsCard>

                    <SettingsCard title="Webhook Integration">
                        <SettingsToggle
                            label="Enable Webhook Delivery"
                            description="Send extracted structured data to your endpoint after each call."
                            name="settings.webhookEnabled"
                            checked={editedAgent.settings.webhookEnabled || false}
                            onChange={handleSettingsChange}
                        />

                        {editedAgent.settings.webhookEnabled && (
                            <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                                <div>
                                    <label htmlFor="webhookUrl" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Webhook URL</label>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">HTTPS endpoint to receive POST requests.</p>
                                    <input
                                        type="text"
                                        id="webhookUrl"
                                        name="settings.webhookUrl"
                                        value={editedAgent.settings.webhookUrl || ''}
                                        onChange={handleSettingsChange}
                                        placeholder="https://api.yourdomain.com/webhook"
                                        className="mt-2 w-full px-4 py-3 bg-slate-50/50 dark:bg-darkbg-surface border border-slate-200 dark:border-darkbg-lighter rounded-xl focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all font-bold text-slate-800 dark:text-white"
                                    />
                                </div>
                            </div>
                        )}
                    </SettingsCard>

                </div>
                {/* Right Column */}
                <div className="lg:col-span-1">
                    <div className="sticky top-28 space-y-6">
                        <div className="bg-white dark:bg-darkbg-surface border border-slate-200 dark:border-darkbg-lighter rounded-3xl shadow-sm overflow-hidden card-animate">
                            <div className="p-6 border-b border-slate-100 dark:border-slate-800/50 flex justify-between items-center">
                                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <SipPhoneIcon className="h-4 w-4" /> Simulator
                                </h3>
                                <div className="flex bg-slate-100 dark:bg-darkbg-light p-1 rounded-xl">
                                    <button onClick={() => setCallAgentTab('web')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${callAgentTab === 'web' ? 'bg-white dark:bg-darkbg-surface text-primary shadow-sm' : 'text-slate-500 hover:text-primary'}`}>Web</button>
                                    <button onClick={() => setCallAgentTab('chat')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${callAgentTab === 'chat' ? 'bg-white dark:bg-darkbg-surface text-primary shadow-sm' : 'text-slate-500 hover:text-primary'}`}>Chat</button>
                                </div>
                            </div>
                            <div className="p-6">
                                {callAgentTab === 'web' ? (
                                    <div className="text-center py-8">
                                        <div className="relative inline-block">
                                            {isCallActive && (
                                                <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping"></div>
                                            )}
                                            <button
                                                onClick={isCallActive ? stopCall : startCall}
                                                className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl ${isCallActive
                                                    ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30'
                                                    : 'bg-primary hover:bg-primary-dark shadow-primary/30'
                                                    }`}
                                            >
                                                {isCallActive ? (
                                                    <StopIcon className="h-10 w-10 text-white" />
                                                ) : (
                                                    <MicrophoneIcon className="h-10 w-10 text-white" />
                                                )}
                                            </button>
                                        </div>
                                        <div className="mt-6">
                                            <p className="font-black text-slate-800 dark:text-white uppercase tracking-wider">{isCallActive ? 'Call in Progress' : 'Ready to Test'}</p>
                                            <p className="text-xs text-slate-500 mt-1">{isCallActive ? 'Agent is listening...' : 'Click to start a voice conversation'}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col h-[450px]">
                                        <div ref={chatContainerRef} className="flex-1 space-y-4 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
                                            {chatMessages.length === 0 && (
                                                <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                                                    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-4">
                                                        <EmbedIcon className="h-8 w-8 text-slate-400" />
                                                    </div>
                                                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">No Messages Yet</p>
                                                </div>
                                            )}
                                            {chatMessages.map((msg, index) => (
                                                <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${msg.sender === 'user'
                                                        ? 'bg-primary text-white shadow-lg shadow-primary/20 rounded-tr-none'
                                                        : 'bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-tl-none border border-slate-200 dark:border-slate-800'
                                                        }`}>
                                                        {msg.text}
                                                    </div>
                                                </div>
                                            ))}
                                            {isAgentReplying && (
                                                <div className="flex justify-start">
                                                    <div className="px-5 py-3 rounded-2xl bg-slate-100 dark:bg-slate-900 rounded-tl-none border border-slate-200 dark:border-slate-800">
                                                        <div className="flex items-center space-x-1.5">
                                                            <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                                            <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                                            <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce"></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <form onSubmit={handleSendMessage} className="mt-4 flex gap-2">
                                            <input
                                                type="text"
                                                value={currentMessage}
                                                onChange={(e) => setCurrentMessage(e.target.value)}
                                                placeholder="Ask something..."
                                                className="flex-1 bg-slate-50 dark:bg-darkbg-light border border-slate-200 dark:border-darkbg-lighter rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-medium"
                                            />
                                            <button
                                                type="submit"
                                                className="p-3 bg-primary text-white rounded-xl hover:bg-primary-dark shadow-lg shadow-primary/20 disabled:opacity-50 transition-all"
                                                disabled={isAgentReplying || !API_KEY}
                                            >
                                                <svg className="w-5 h-5 -rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
                                                </svg>
                                            </button>
                                        </form>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-white dark:bg-darkbg-surface border border-slate-200 dark:border-darkbg-lighter rounded-3xl shadow-sm p-8 space-y-6 card-animate">
                            <div className="flex justify-between items-center">
                                <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <KnowledgeIcon className="h-4 w-4" /> Knowledge
                                </h3>
                                <button onClick={() => setKnowledgeModalOpen(true)} className="text-[10px] font-black uppercase tracking-wider text-primary hover:text-primary-dark transition-colors">Manage</button>
                            </div>

                            <div className="bg-slate-50 dark:bg-darkbg-light/50 rounded-2xl p-4 border border-slate-100 dark:border-darkbg-lighter">
                                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                                    Agent has access to <span className="text-primary font-bold">{editedAgent.settings.knowledgeDocIds?.length || 0}</span> documents for context.
                                </p>
                            </div>

                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                {editedAgent.settings.knowledgeDocIds && editedAgent.settings.knowledgeDocIds.length > 0 && userDocuments.length > 0 ? (
                                    userDocuments
                                        .filter(doc => (editedAgent.settings.knowledgeDocIds || []).includes(doc.id))
                                        .map(doc => (
                                            <div key={doc.id} className="group flex items-center p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50 rounded-xl hover:border-primary/30 transition-all">
                                                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-400 group-hover:text-primary transition-colors mr-3">
                                                    <DocumentTextIcon className="h-4 w-4" />
                                                </div>
                                                <span className="truncate flex-1 text-xs font-bold text-slate-700 dark:text-slate-200" title={doc.name}>{doc.name}</span>
                                            </div>
                                        ))
                                ) : (
                                    <button onClick={() => setKnowledgeModalOpen(true)} className="w-full py-8 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl text-slate-400 hover:text-primary hover:border-primary/50 transition-all flex flex-col items-center gap-2">
                                        <PlusIcon className="h-6 w-6" />
                                        <span className="text-xs font-black uppercase tracking-wider">Add Knowledge</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="bg-white dark:bg-darkbg-surface border border-slate-200 dark:border-darkbg-lighter rounded-3xl shadow-sm p-8 space-y-6 card-animate">
                            <div className="flex justify-between items-center">
                                <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <ToolsIcon className="h-4 w-4" /> Automation Tools
                                </h3>
                                <button
                                    onClick={() => { setEditingTool(null); setNewTool(initialNewToolState); setNewToolFunctionType('GoogleSheets'); setToolsModalOpen(true); }}
                                    className="text-[10px] font-black uppercase tracking-wider text-primary hover:text-primary-dark transition-colors"
                                >
                                    New Tool
                                </button>
                            </div>

                            <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl p-4 border border-emerald-100 dark:border-emerald-900/50">
                                <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed font-medium">
                                    <span className="font-bold">{editedAgent.settings.tools.length}</span> tools enabled for autonomous data collection.
                                </p>
                            </div>

                            <div className="space-y-3">
                                {editedAgent.settings.tools.length > 0 ? (
                                    editedAgent.settings.tools.map(tool => (
                                        <div key={tool.id} className="group p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-800 hover:border-primary/30 transition-all">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-xs font-black text-slate-800 dark:text-white group-hover:text-primary transition-colors">{tool.name}</span>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleEditTool(tool)} className="p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-400 hover:text-primary transition-all">
                                                        <PencilIcon className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button onClick={() => handleDeleteTool(tool.id)} className="p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-400 hover:text-red-500 transition-all">
                                                        <TrashIcon className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-900 text-[9px] font-black uppercase tracking-widest text-slate-500">Google Sheets</span>
                                                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                                                <span className="text-[10px] text-slate-400 font-bold">{tool.parameters?.length || 0} Params</span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <button
                                        onClick={() => { setEditingTool(null); setNewTool(initialNewToolState); setNewToolFunctionType('GoogleSheets'); setToolsModalOpen(true); }}
                                        className="w-full py-8 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl text-slate-400 hover:text-primary hover:border-primary/50 transition-all flex flex-col items-center gap-2"
                                    >
                                        <PlusIcon className="h-6 w-6" />
                                        <span className="text-xs font-black uppercase tracking-wider">Add Tool</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {renderToolsModal()}
        </div>
    );
};

export default AgentDetailPage;