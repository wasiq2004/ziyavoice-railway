import React from 'react';
// FIX: Add missing icon imports
import {
    ChartBarIcon,
    UserGroupIcon,
    PhoneIcon as OutlinePhoneIcon,
    CogIcon,
    CodeBracketIcon,
    CircleStackIcon,
    CreditCardIcon,
    ClipboardIcon,
    PlayIcon as SolidPlayIcon,
    ArrowUpOnSquareIcon,
    BookOpenIcon,
    GlobeAltIcon,
    WrenchScrewdriverIcon,
    AdjustmentsHorizontalIcon,
    DocumentDuplicateIcon as HeroDocumentDuplicateIcon,
    ArrowDownTrayIcon,
    TrashIcon as OutlineTrashIcon,
    CpuChipIcon,
    SpeakerWaveIcon,
    ArrowUpRightIcon,
    CheckIcon,
    PencilIcon,
    ClipboardDocumentListIcon,
    CalendarIcon,
    BuildingOfficeIcon,
    UsersIcon,
    PresentationChartBarIcon,
    LifebuoyIcon,
    ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';
// FIX: Add missing icon import
import { PhoneIcon as SolidPhoneIcon, MicrophoneIcon } from '@heroicons/react/24/solid';
import { Page, Campaign, CampaignStatus, VoiceAgent, VoiceAgentStatus, PhoneNumber, PhoneProvider, PreActionPhraseMode, ToolType } from './types';

// FIX: Add missing icon exports required by other pages
// Icon re-exports for consistent usage
export const EditIcon = PencilIcon;
export const PhoneIcon = OutlinePhoneIcon;
export const ImportIcon = ArrowDownTrayIcon;
export const DocumentDuplicateIcon = HeroDocumentDuplicateIcon;
export const ModelIcon = CpuChipIcon;
export const VoiceIcon = SpeakerWaveIcon;
export const LanguageIcon = GlobeAltIcon;
export const ToolsIcon = WrenchScrewdriverIcon;
export const TrashIcon = OutlineTrashIcon;
export const EmbedIcon = CodeBracketIcon; // Using CodeBracket for Embed
export const CustomLlmIcon = AdjustmentsHorizontalIcon; // Using Adjustments for Custom LLM
export const SipPhoneIcon = SolidPhoneIcon; // Using SolidPhone for SIP
export const KnowledgeIcon = BookOpenIcon;
export const WebhookIcon = ArrowUpRightIcon;
export const PlayIcon = SolidPlayIcon;
export { CheckIcon, MicrophoneIcon, ArrowUpRightIcon }; // Exporting directly

export const APP_VERSION = '1.2';


interface SidebarItem {
    id: Page;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

export const SIDEBAR_ITEMS: SidebarItem[] = [
    { id: Page.Dashboard, icon: ChartBarIcon },
    { id: Page.Agent, icon: UserGroupIcon },
    { id: Page.PhoneNo, icon: OutlinePhoneIcon },
    { id: Page.Campaigns, icon: ChartBarIcon },
    { id: Page.Schedule, icon: CalendarIcon },
    { id: Page.Reports, icon: ClipboardDocumentListIcon },
    { id: Page.Settings, icon: CogIcon },
    // { id: Page.API, icon: CodeBracketIcon },
    { id: Page.Credits, icon: CircleStackIcon },
    { id: Page.Support, icon: LifebuoyIcon },
];

export const ADMIN_SIDEBAR_ITEMS: SidebarItem[] = [
    { id: Page.AdminDashboard, icon: ChartBarIcon },
    { id: Page.AdminUsers, icon: UserGroupIcon },
    { id: Page.AdminReports, icon: ClipboardDocumentListIcon },
    { id: Page.AdminCredits, icon: CreditCardIcon },
    { id: Page.AdminSettings, icon: CogIcon },
    { id: Page.AdminSupport, icon: LifebuoyIcon },
];

export const SUPER_ADMIN_SIDEBAR_ITEMS: SidebarItem[] = [
    { id: Page.SuperAdminDashboard, icon: ChartBarIcon },
    { id: Page.SuperAdminOrganizations, icon: BuildingOfficeIcon },
    { id: Page.SuperAdminPricing, icon: CreditCardIcon },
    { id: Page.SuperAdminCredits, icon: CircleStackIcon },
    { id: Page.SuperAdminSupport, icon: LifebuoyIcon },
    { id: Page.SuperAdminSettings, icon: CogIcon },
];






export const AVAILABLE_VOICE_PROVIDERS = [
    { id: 'eleven-labs', name: 'ElevenLabs' },
    { id: 'sarvam', name: 'Sarvam AI' },
];

// Updated to use dynamic voices
export const AVAILABLE_VOICES: { [key: string]: { id: string, name: string }[] } = {
    'eleven-labs': [
        { id: 'eleven-rachel', name: 'Rachel' },
        { id: 'eleven-drew', name: 'Drew' },
        { id: 'eleven-clyde', name: 'Clyde' },
        { id: 'eleven-zara', name: 'Zara' },
        { id: 'eleven-indian-monika', name: 'Monika (Hindi)' },
        { id: 'eleven-indian-sagar', name: 'Sagar (Indian English)' },
    ],
};

import { getApiBaseUrl, getApiPath } from './utils/api';

// Function to fetch voices dynamically
export const fetchAvailableVoices = async (): Promise<{ [key: string]: { id: string, name: string }[] }> => {
    try {
        const apiBaseUrl = `${getApiBaseUrl()}${getApiPath()}`;
        const response = await fetch(`${apiBaseUrl}/voices/elevenlabs`);
        const result = await response.json();

        if (result.success) {
            // Transform the fetched voices to match our format
            const voices = result.voices.map((voice: any) => ({
                id: voice.id,
                name: voice.name
            }));

            return {
                'eleven-labs': voices
            };
        } else {
            // Fallback to hardcoded voices if API call fails
            return AVAILABLE_VOICES;
        }
    } catch (error) {
        console.error('Error fetching voices:', error);
        // Fallback to hardcoded voices if API call fails
        return AVAILABLE_VOICES;
    }
};

export const getVoiceNameById = (voiceId: string): string => {
    for (const provider in AVAILABLE_VOICES) {
        const voices = AVAILABLE_VOICES[provider];
        const voice = voices.find(v => v.id === voiceId);
        if (voice) return voice.name;
    }
    return voiceId; // fallback
};

export const getVoiceProviderById = (voiceId: string): string => {
    for (const providerId in AVAILABLE_VOICES) {
        if (AVAILABLE_VOICES[providerId].some(v => v.id === voiceId)) {
            return providerId;
        }
    }
    return AVAILABLE_VOICE_PROVIDERS[0].id; // fallback
};

export const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" {...props}><path fill="#4285f4" d="M386 208v-32h-48v32h-32v48h32v32h48v-32h32v-48h-32z" /><path fill="#34a853" d="M424 344v-32h-32v32h-32v48h32v32h48v-32h32v-48h-32z" /><path fill="#fbbc05" d="M130 160v-48h-48v48h-48v48h48v48h48v-48h48v-48h-48z" /><path fill="#ea4335" d="M130 304v-48h-48v48h-48v48h48v48h48v-48h48v-48h-48z" /><path fill="#4285f4" d="M256 64a192 192 0 1 0 0 384a192 192 0 0 0 0-384zm0 336a144 144 0 1 1 0-288a144 144 0 0 1 0 288z" /><path fill="currentColor" d="M256 128a128 128 0 1 0 0 256a128 128 0 0 0 0-256zm0 208a80 80 0 1 1 0-160a80 80 0 0 1 0 160z" /></svg>
);
// FIX: Fix truncated SVG path for OpenAI icon
export const OpenAIIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
        <path d="M20.677 7.622c.28.54.42.96.42 1.26 0 .24-.06.54-.18.9l-1.02 2.88-2.1-3.6c.36-.66.84-1.2 1.44-1.62.6-.42 1.14-.63 1.62-.63.24 0 .48.09.6.27a.9.9 0 01.24.66zm-2.94 4.86c.3.54.45 1.02.45 1.44s-.09.84-.27 1.26l-2.1-3.6 1.92 1.2zm-4.32-8.22c.6 0 1.14.21 1.62.63.48.42.84.96 1.08 1.62.24.66.36 1.41.36 2.25s-.06 1.59-.18 2.25l-2.88 7.32c-.3.72-.69 1.32-1.17 1.8-.48.48-1.05.72-1.71.72-.66 0-1.26-.24-1.8-.72-.54-.48-.96-1.08-1.26-1.8L3.323 9.422c-.12-.66-.18-1.38-.18-2.16 0-.84.12-1.59.36-2.25.24-.66.6-1.2 1.08-1.62.48-.42 1.02-.63 1.62-.63s1.08.21 1.56.63l2.28 1.86 2.28-1.86c.48-.42 1.02-.63 1.56-.63zm-5.46 7.68l-1.02 2.88-2.1-3.6c.36-.66.84-1.2 1.44-1.62.6-.42 1.14-.63 1.62-.63.24 0 .48.09.6.27.12.18.18.42.18.72 0 .3-.12.72-.36 1.26z" />
    </svg>
);

// FIX: Add missing data exports required by AgentDetailPage
export const AVAILABLE_MODELS = [
    // Gemini Models
    { id: 'gemini-2.0-flash', name: 'Ziya-2.0-flash', description: 'Latest Gemini model, fast and efficient', icon: GoogleIcon, provider: 'gemini' },
    { id: 'gemini-1.5-flash', name: 'Ziya-LLM', description: 'Previous generation, reliable and cost-effective', icon: GoogleIcon, provider: 'gemini' },
    { id: 'gemini-1.5-pro', name: 'Salman-LLM(Highly Efficient)', description: 'More capable, better for complex tasks', icon: GoogleIcon, provider: 'gemini' },

    //     // OpenAI Models
    //     { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable OpenAI model, best quality', icon: OpenAIIcon, provider: 'openai' },
    //     { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and affordable, great for most tasks', icon: OpenAIIcon, provider: 'openai' },
    //     { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Previous generation flagship model', icon: OpenAIIcon, provider: 'openai' },
    //     { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Most cost-effective OpenAI model', icon: OpenAIIcon, provider: 'openai' },
];

export const AVAILABLE_LANGUAGES = [
    { id: 'ENGLISH', name: 'English' },
    { id: 'SPANISH', name: 'Spanish' },
    { id: 'FRENCH', name: 'French' },
    { id: 'GERMAN', name: 'German' },
    { id: 'ITALIAN', name: 'Italian' },
    { id: 'PORTUGUESE', name: 'Portuguese' },
];

export const AVAILABLE_LANGUAGES_BY_PROVIDER: { [key: string]: { id: string, name: string }[] } = {
    'millis-pro': [
        { id: 'ENGLISH', name: 'English' },
        { id: 'SPANISH', name: 'Spanish' },
    ],
    'eleven-labs': AVAILABLE_LANGUAGES,
    'google': [
        { id: 'ENGLISH', name: 'English' },
        { id: 'SPANISH', name: 'Spanish' },
        { id: 'FRENCH', name: 'French' },
    ],
};