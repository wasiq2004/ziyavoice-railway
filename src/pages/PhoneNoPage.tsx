import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import AppLayout from '../components/AppLayout';
import Modal from '../components/Modal';
import CallInitiator from '../components/CallInitiator';
import { PhoneNumber, VoiceAgent } from '../types';
import { phoneNumberService } from '../services/phoneNumberService';
import { agentService } from '../services/agentService';
import { twilioNumberService } from '../services/twilioNumberService';
import { twilioBasicService } from '../services/twilioBasicService';
import { useAuth } from '../contexts/AuthContext';
import { usePlanAccess } from '../utils/usePlanAccess';
import { getApiBaseUrl, getApiPath } from '../utils/api';
import UpgradePlanModal from '../components/UpgradePlanModal';
import {
    PlusIcon,
    PhoneIcon,
    ChevronDownIcon,
    ArrowUpRightIcon,
    EllipsisVerticalIcon,
    TrashIcon,
    PencilIcon,
    ArrowPathIcon,
    PhoneArrowUpRightIcon,
    UserIcon,
    ClockIcon,
    CalendarIcon,
    DevicePhoneMobileIcon,
    CheckCircleIcon,
    SignalIcon
} from '@heroicons/react/24/outline';
import Skeleton from '../components/Skeleton';

const ImportPhoneNumberModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    user: any;
    onPhoneNumberImported: (phoneNumber: PhoneNumber) => void;
}> = ({ isOpen, onClose, user, onPhoneNumberImported }) => {
    const PROVIDERS = ['TWILIO']; // Only Twilio provider
    const [activeProvider, setActiveProvider] = useState('TWILIO');
    const [formData, setFormData] = useState({
        region: 'us-west',
        country: 'us',
        phoneNumber: '',
        twilioSid: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setError(''); // Clear error when user types
    };

    const handleImport = async () => {
        try {
            setLoading(true);
            setError('');

            if (!user) {
                throw new Error('User not authenticated');
            }

            // Validate phone number format
            if (!formData.phoneNumber || formData.phoneNumber.trim().length === 0) {
                throw new Error('Phone number is required');
            }

            // Basic format validation - should contain at least numbers
            if (!/[\d\+\-\(\)\s]{7,}/.test(formData.phoneNumber)) {
                throw new Error('Invalid phone number format');
            }

            // Call the phone number service to import the phone number
            // The backend will validate with Twilio if credentials are available
            const newPhoneNumber = await phoneNumberService.importPhoneNumber(user.id, formData);

            // Notify the parent component about the new phone number
            onPhoneNumberImported(newPhoneNumber);

            // Reset form and close modal
            setFormData({
                region: 'us-west',
                country: 'us',
                phoneNumber: '',
                twilioSid: '',
            });
            onClose();

            alert('Phone number imported successfully!');
        } catch (error) {
            console.error('Error importing phone number:', error);
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div
                className="bg-white dark:bg-darkbg text-slate-800 dark:text-slate-200 rounded-lg shadow-xl w-full max-w-2xl transform transition-all"
                onClick={e => e.stopPropagation()}
            >
                {/* Tabs - Only Twilio */}
                <div className="border-b border-slate-200 dark:border-slate-700">
                    <nav className="-mb-px flex space-x-8 px-6">
                        <button
                            onClick={() => setActiveProvider('TWILIO')}
                            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeProvider === 'TWILIO'
                                ? 'border-primary text-slate-900 dark:text-white'
                                : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-500'
                                }`}
                        >
                            TWILIO
                        </button>
                    </nav>
                </div>

                {/* Form */}
                <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
                    <div>
                        <label htmlFor="region" className="block text-sm font-medium mb-1">Region</label>
                        <select
                            id="region"
                            name="region"
                            value={formData.region}
                            onChange={handleInputChange}
                            className="w-full bg-white dark:bg-darkbg-light border border-slate-300 dark:border-slate-600 rounded-md px-3 py-2 text-slate-900 dark:text-white focus:ring-primary focus:border-primary"
                        >
                            <option value="us-west">us-west</option>
                            <option value="us-east">us-east</option>
                            <option value="eu-central-1">eu-central-1</option>
                        </select>
                        <p className="text-xs text-slate-400 mt-1">Select the region matching your Twilio account region. If unsure, choose based on call destination.</p>
                    </div>

                    <div>
                        <label htmlFor="country" className="block text-sm font-medium mb-1">Country</label>
                        <select
                            id="country"
                            name="country"
                            value={formData.country}
                            onChange={handleInputChange}
                            className="w-full bg-white dark:bg-darkbg-light border border-slate-300 dark:border-slate-600 rounded-md px-3 py-2 text-slate-900 dark:text-white focus:ring-primary focus:border-primary"
                        >
                            <option value="us">United States (+1)</option>
                            <option value="gb">United Kingdom (+44)</option>
                            <option value="ca">Canada (+1)</option>
                        </select>
                    </div>

                    <div>
                        <label htmlFor="phoneNumber" className="block text-sm font-medium mb-1">Phone Number</label>
                        <input
                            type="text"
                            id="phoneNumber"
                            name="phoneNumber"
                            value={formData.phoneNumber}
                            onChange={handleInputChange}
                            placeholder="+1234567890"
                            className="w-full bg-white dark:bg-darkbg-light border border-slate-300 dark:border-slate-600 rounded-md px-3 py-2 text-slate-900 dark:text-white focus:ring-primary focus:border-primary"
                        />
                    </div>

                    <div>
                        <label htmlFor="twilioSid" className="block text-sm font-medium mb-1">Twilio SID (Optional)</label>
                        <input
                            type="text"
                            id="twilioSid"
                            name="twilioSid"
                            value={formData.twilioSid}
                            onChange={handleInputChange}
                            placeholder="PNXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                            className="w-full bg-white dark:bg-darkbg-light border border-slate-300 dark:border-slate-600 rounded-md px-3 py-2 text-slate-900 dark:text-white focus:ring-primary focus:border-primary"
                        />
                        <p className="text-xs text-slate-400 mt-1">Enter the Twilio SID for this phone number (starts with PN).</p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="p-3 bg-red-900/30 border border-red-500 rounded text-red-200 text-sm">
                            ❌ {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 dark:bg-darkbg-light flex justify-between items-center rounded-b-lg">
                    <a href="#" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary hover:underline flex items-center">
                        Tutorials
                        <ArrowUpRightIcon className="h-4 w-4 ml-1" />
                    </a>
                    <div className="flex space-x-3">
                        <button
                            onClick={onClose}
                            disabled={loading}
                            className="text-white font-semibold py-2 px-4 rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Close
                        </button>
                        <button
                            onClick={handleImport}
                            disabled={loading}
                            className="bg-primary hover:bg-primary-dark text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                            {loading ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Importing...
                                </>
                            ) : (
                                'Import'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Connect Twilio Number Modal - Integrated Setup
const ConnectTwilioNumberModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    user: any;
    onNumberAdded: () => void;
}> = ({ isOpen, onClose, user, onNumberAdded }) => {
    const [formData, setFormData] = useState({
        twilioAccountSid: '',
        twilioAuthToken: '',
        phoneNumber: '',
        region: 'us-west'
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [step, setStep] = useState(1); // Step 1: Credentials, Step 2: Phone Number
    const [availableNumbers, setAvailableNumbers] = useState<Array<{ phoneNumber: string; friendlyName: string; capabilities: any; sid: string }>>([]);
    const [fetchingNumbers, setFetchingNumbers] = useState(false);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setError('');
    };

    const validateCredentials = async () => {
        try {
            setLoading(true);
            setError('');
            setSuccess('');

            if (!formData.twilioAccountSid || !formData.twilioAuthToken) {
                throw new Error('Both Account SID and Auth Token are required');
            }

            if (!formData.twilioAccountSid.startsWith('AC')) {
                throw new Error('Account SID should start with "AC"');
            }

            if (formData.twilioAuthToken.length < 32) {
                throw new Error('Auth Token appears to be invalid (too short)');
            }

            // Validate credentials by making an API call to the backend
            const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/validate-twilio-credentials`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    accountSid: formData.twilioAccountSid,
                    authToken: formData.twilioAuthToken,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to validate Twilio credentials');
            }

            setSuccess('✅ Credentials validated successfully! Fetching your phone numbers...');

            // Fetch available phone numbers from Twilio
            setFetchingNumbers(true);
            try {
                const numbers = await twilioNumberService.fetchAvailableNumbers(
                    formData.twilioAccountSid,
                    formData.twilioAuthToken
                );
                setAvailableNumbers(numbers);

                if (numbers.length === 0) {
                    setError('No phone numbers found in your Twilio account. Please purchase a number first.');
                    setSuccess('');
                } else {
                    setTimeout(() => {
                        setSuccess('');
                        setStep(2);
                    }, 1000);
                }
            } catch (fetchError: any) {
                console.error('Error fetching numbers:', fetchError);
                setError('Failed to fetch phone numbers. Please try again.');
                setSuccess('');
            } finally {
                setFetchingNumbers(false);
            }
        } catch (error: any) {
            console.error('Error validating credentials:', error);
            setError('Failed to validate credentials. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleConnectNumber = async () => {
        try {
            setLoading(true);
            setError('');
            setSuccess('');

            if (!user) {
                throw new Error('User not authenticated');
            }

            if (!formData.phoneNumber) {
                throw new Error('Phone number is required');
            }

            if (!formData.phoneNumber.startsWith('+')) {
                throw new Error('Phone number must start with + (E.164 format)');
            }

            // Add the Twilio number with credentials (no verification needed)
            const result = await twilioNumberService.addTwilioNumber(
                user.id,
                formData.phoneNumber,
                formData.region,
                formData.twilioAccountSid,
                formData.twilioAuthToken
            );

            setSuccess('✅ Twilio number connected and verified successfully!');

            setTimeout(() => {
                onNumberAdded();
                handleClose();
            }, 1500);
        } catch (error: any) {
            console.error('Error connecting Twilio number:', error);
            setError('Failed to connect Twilio number. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setFormData({
            twilioAccountSid: '',
            twilioAuthToken: '',
            phoneNumber: '',
            region: 'us-west'
        });
        setError('');
        setSuccess('');
        setStep(1);
        setAvailableNumbers([]);
        setFetchingNumbers(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center p-4" onClick={handleClose}>
            <div
                className="bg-white dark:bg-darkbg text-slate-800 dark:text-slate-200 rounded-lg shadow-xl w-full max-w-2xl transform transition-all"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold">Connect Twilio Number</h2>
                        <span className="text-sm text-slate-400">Step {step} of 2</span>
                    </div>

                    <p className="text-sm text-slate-400 mb-4">
                        {step === 1
                            ? 'Enter your Twilio Account SID and Auth Token to authenticate. You can find these in your Twilio Console.'
                            : `Select a phone number from your Twilio account (${availableNumbers.length} number${availableNumbers.length !== 1 ? 's' : ''} available).`}
                    </p>

                    {error && (
                        <div className="mb-4 p-3 bg-red-900/30 border border-red-500 rounded text-red-200">
                            ❌ {error}
                        </div>
                    )}

                    {success && (
                        <div className="mb-4 p-3 bg-green-900/30 border border-green-500 rounded text-green-200">
                            {success}
                        </div>
                    )}

                    <div className="space-y-4">
                        {step === 1 ? (
                            <>
                                <div>
                                    <label htmlFor="twilioAccountSid" className="block text-sm font-medium mb-1">
                                        Twilio Account SID <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        id="twilioAccountSid"
                                        name="twilioAccountSid"
                                        value={formData.twilioAccountSid}
                                        onChange={handleInputChange}
                                        placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                        className="w-full bg-white dark:bg-darkbg-light border border-slate-300 dark:border-slate-600 rounded-md px-3 py-2 text-slate-900 dark:text-white focus:ring-primary focus:border-primary"
                                    />
                                    <p className="mt-1 text-xs text-slate-400">
                                        Find this in your Twilio Console under Account Info (starts with AC)
                                    </p>
                                </div>

                                <div>
                                    <label htmlFor="twilioAuthToken" className="block text-sm font-medium mb-1">
                                        Twilio Auth Token <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="password"
                                        id="twilioAuthToken"
                                        name="twilioAuthToken"
                                        value={formData.twilioAuthToken}
                                        onChange={handleInputChange}
                                        placeholder="Your Auth Token"
                                        className="w-full bg-white dark:bg-darkbg-light border border-slate-300 dark:border-slate-600 rounded-md px-3 py-2 text-slate-900 dark:text-white focus:ring-primary focus:border-primary"
                                    />
                                    <p className="mt-1 text-xs text-slate-400">
                                        Your Auth Token is displayed in your Twilio Console. Keep this secure!
                                    </p>
                                </div>
                            </>
                        ) : (
                            <>
                                {fetchingNumbers ? (
                                    <div className="flex flex-col items-center justify-center py-8">
                                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mb-4"></div>
                                        <p className="text-slate-400">Fetching your Twilio phone numbers...</p>
                                    </div>
                                ) : (
                                    <>
                                        <div>
                                            <label htmlFor="region" className="block text-sm font-medium mb-1">
                                                Region <span className="text-red-500">*</span>
                                            </label>
                                            <select
                                                id="region"
                                                name="region"
                                                value={formData.region}
                                                onChange={handleInputChange}
                                                className="w-full bg-white dark:bg-darkbg-light border border-slate-300 dark:border-slate-600 rounded-md px-3 py-2 text-slate-900 dark:text-white focus:ring-primary focus:border-primary"
                                            >
                                                <option value="us-west">US West</option>
                                                <option value="us-east">US East</option>
                                                <option value="eu-central-1">EU Central</option>
                                                <option value="ie">Ireland</option>
                                                <option value="sg">Singapore</option>
                                                <option value="au">Australia</option>
                                            </select>
                                            <p className="mt-1 text-xs text-slate-400">
                                                Select the region closest to your call destinations
                                            </p>
                                        </div>

                                        <div>
                                            <label htmlFor="phoneNumber" className="block text-sm font-medium mb-1">
                                                Phone Number <span className="text-red-500">*</span>
                                            </label>
                                            <select
                                                id="phoneNumber"
                                                name="phoneNumber"
                                                value={formData.phoneNumber}
                                                onChange={handleInputChange}
                                                className="w-full bg-white dark:bg-darkbg-light border border-slate-300 dark:border-slate-600 rounded-md px-3 py-2 text-slate-900 dark:text-white focus:ring-primary focus:border-primary"
                                            >
                                                <option value="">-- Select a phone number --</option>
                                                {availableNumbers.map((num) => (
                                                    <option key={num.sid} value={num.phoneNumber}>
                                                        {num.phoneNumber} {num.friendlyName ? `(${num.friendlyName})` : ''}
                                                        {num.capabilities?.voice ? ' • Voice' : ''}
                                                        {num.capabilities?.sms ? ' • SMS' : ''}
                                                        {num.capabilities?.mms ? ' • MMS' : ''}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="mt-1 text-xs text-slate-400">
                                                Select a phone number from your Twilio account to connect.
                                            </p>
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <div className="px-6 py-4 bg-slate-50 dark:bg-darkbg-light flex justify-between items-center rounded-b-lg">
                    <button
                        onClick={step === 1 ? handleClose : () => setStep(1)}
                        className="text-white font-semibold py-2 px-4 rounded-lg hover:bg-slate-700"
                    >
                        {step === 1 ? 'Cancel' : 'Back'}
                    </button>
                    <button
                        onClick={step === 1 ? validateCredentials : handleConnectNumber}
                        disabled={loading || (step === 1 && (!formData.twilioAccountSid || !formData.twilioAuthToken)) || (step === 2 && !formData.phoneNumber)}
                        className="bg-primary hover:bg-primary-dark text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                        {loading ? (step === 1 ? 'Validating...' : 'Connecting...') : (step === 1 ? 'Validate Credentials' : 'Connect Number')}
                    </button>
                </div>
            </div>
        </div>
    );
};

const PhoneNoPage: React.FC = () => {
    const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
    const [agents, setAgents] = useState<VoiceAgent[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
    const [isEditModalOpen, setEditModalOpen] = useState(false);
    const [editingPhoneNumber, setEditingPhoneNumber] = useState<PhoneNumber | null>(null);
    const [selectedAgentId, setSelectedAgentId] = useState('');
    const [isPurchaseModalOpen, setPurchaseModalOpen] = useState(false);
    const [isImportModalOpen, setImportModalOpen] = useState(false);
    const [isAddTwilioModalOpen, setAddTwilioModalOpen] = useState(false);
    const [isCallModalOpen, setCallModalOpen] = useState(false);
    const [isMakeCallModalOpen, setMakeCallModalOpen] = useState(false);
    const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<PhoneNumber | null>(null);
    const [twilioPhoneNumbers, setTwilioPhoneNumbers] = useState<any[]>([]);
    const [callHistory, setCallHistory] = useState<any[]>([]);
    const [userTwilioAccounts, setUserTwilioAccounts] = useState<any[]>([]); // Store user's Twilio accounts
    const { user } = useAuth();
    const { checkAccess, blockingReason, clearBlock } = usePlanAccess();

    useEffect(() => {
        if (user) {
            loadPhoneNumbers();
            loadAgents();
            loadTwilioPhoneNumbers();
            loadCallHistory();
            loadUserTwilioAccounts(); // Load user's Twilio accounts
        }
    }, [user]);

    const loadUserTwilioAccounts = async () => {
        if (!user) return;
        try {
            const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/twilio/accounts?userId=${user.id}`);
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    setUserTwilioAccounts(data.data || []);
                }
            }
        } catch (error) {
            console.error('Error loading user Twilio accounts:', error);
        }
    };

    const loadTwilioPhoneNumbers = async () => {
        if (!user) return;
        try {
            const numbers = await twilioBasicService.getPhoneNumbers(user.id);
            setTwilioPhoneNumbers(numbers);
        } catch (error) {
            console.error('Error loading Twilio phone numbers:', error);
        }
    };

    const loadCallHistory = async () => {
        if (!user) return;
        try {
            const calls = await twilioBasicService.getCalls(user.id, 20);
            setCallHistory(calls);
        } catch (error) {
            console.error('Error loading call history:', error);
            // Don't show alert to user as it might be confusing
            // Call history section will simply not be displayed if there's an error
        }
    };

    const loadPhoneNumbers = async () => {
        try {
            setLoading(true);
            if (!user) {
                throw new Error('User not authenticated');
            }
            const data = await phoneNumberService.getPhoneNumbers(user.id);
            console.log('Raw phone numbers from API:', data);

            // Map database column names to frontend property names
            const mappedData = data.map((phone: any) => {
                const mapped = {
                    ...phone,
                    createdDate: phone.created_at || phone.createdDate || phone.purchased_at,
                    agentId: phone.agent_id || phone.agentId,
                    agentName: phone.agent_name || phone.agentName,
                    countryCode: phone.country_code || phone.countryCode,
                    nextCycle: phone.next_cycle || phone.nextCycle,
                    twilioSid: phone.twilio_sid || phone.twilioSid
                };
                console.log('Mapped phone number:', mapped);
                return mapped;
            });
            setPhoneNumbers(mappedData);
        } catch (error) {
            console.error('Error loading phone numbers:', error);
            alert('Failed to load phone numbers');
        } finally {
            setLoading(false);
        }
    };

    const loadAgents = async () => {
        try {
            if (!user) {
                throw new Error('User not authenticated');
            }
            const agentData = await agentService.getAgents(user.id);
            setAgents(agentData);
        } catch (error) {
            console.error('Error loading agents:', error);
            // Don't show alert here as it might be confusing to show two alerts
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (activeDropdown && !(event.target as Element).closest('.dropdown-menu') && !(event.target as Element).closest('.dropdown-trigger')) {
                setActiveDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [activeDropdown]);

    const formatDateTime = (isoString: string) => {
        if (!isoString) {
            return { date: 'N/A', time: 'N/A' };
        }
        try {
            const date = new Date(isoString);
            if (isNaN(date.getTime())) {
                return { date: 'Invalid Date', time: '' };
            }
            const datePart = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const timePart = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
            return { date: datePart, time: timePart };
        } catch (error) {
            console.error('Error formatting date:', error, isoString);
            return { date: 'Invalid Date', time: '' };
        }
    };

    const handleToggleDropdown = (e: React.MouseEvent, numberId: string) => {
        e.stopPropagation();
        if (activeDropdown === numberId) {
            setActiveDropdown(null);
        } else {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setDropdownPos({
                top: rect.bottom + window.scrollY,
                left: rect.right + window.scrollX - 224 // w-56 is 224px
            });
            setActiveDropdown(numberId);
        }
    };

    const openEditModal = (phoneNumber: PhoneNumber) => {
        setEditingPhoneNumber(phoneNumber);
        setSelectedAgentId(phoneNumber.agentId || '');
        setEditModalOpen(true);
        setActiveDropdown(null);
    };

    const openCallModal = (phoneNumber: PhoneNumber) => {
        setSelectedPhoneNumber(phoneNumber);
        setCallModalOpen(true);
        setActiveDropdown(null);
    };

    const openMakeCallModal = (phoneNumber: any) => {
        setSelectedPhoneNumber({
            ...phoneNumber,
            phoneNumber: phoneNumber.phoneNumber || phoneNumber.number || phoneNumber.phone_number,
            agentId: phoneNumber.agentId || phoneNumber.agent_id,
            agentName: phoneNumber.agentName || phoneNumber.agent_name
        } as PhoneNumber);

        setMakeCallModalOpen(true);
        setActiveDropdown(null);
    };

    const handleMakeCall = async (from: string, to: string, agentId: string) => {
        if (!user) {
            alert('User not authenticated');
            return;
        }

        const allowed = await checkAccess(user.id);
        if (!allowed) return;

        // Validate user ID format (UUID)
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)) {
            alert('Invalid user ID. Please log in again.');
            return;
        }

        // Validate phone number formats
        if (!/^\+?[1-9]\d{1,14}$/.test(from)) {
            alert('The "from" number must be a valid Twilio number in E.164 format (e.g., +1234567890)');
            return;
        }

        if (!/^\+?[1-9]\d{1,14}$/.test(to)) {
            alert('Please enter a valid phone number in E.164 format (e.g., +1234567890)');
            return;
        }

        // Validate agent ID format
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentId)) {
            alert('Please select a valid agent');
            return;
        }

        try {
            const call = await twilioBasicService.makeCall(user.id, from, to, agentId);
            alert(`Call initiated with agent! Call SID: ${call.callSid}`);
            setMakeCallModalOpen(false);
            setCallModalOpen(false); // Close both modals
            loadCallHistory();
        } catch (error: any) {
            console.error('Error making call:', error);
            alert(`Failed to make call. Something went wrong.

Please check that:
1. The 'from' number is a verified Twilio number in your account
2. The 'to' number is in the correct format (e.g., +1234567890)
3. You have selected an agent
4. Your Twilio credentials are valid`);
        }
    };

    const handleSaveAgentAssignment = async () => {
        if (!editingPhoneNumber) return;

        try {
            console.log('Saving agent assignment:', {
                userId: user!.id,
                phoneNumberId: editingPhoneNumber.id,
                selectedAgentId: selectedAgentId
            });

            let updateData: Partial<any> = {};

            if (!selectedAgentId) {
                // Unassigning agent
                updateData = {
                    agentId: null,
                    agentName: ''
                };
            } else {
                // Assigning agent
                const selectedAgent = agents.find(a => a.id === selectedAgentId);
                if (!selectedAgent) {
                    throw new Error('Selected agent not found');
                }
                updateData = {
                    agentId: selectedAgentId,
                    agentName: selectedAgent.name
                };
            }

            const updatedPhoneNumber = await phoneNumberService.updatePhoneNumber(user!.id, editingPhoneNumber.id, updateData);

            // Map the returned data to match frontend field names
            const mappedPhoneNumber = {
                ...updatedPhoneNumber,
                createdDate: updatedPhoneNumber.created_at || updatedPhoneNumber.createdDate,
                agentId: updatedPhoneNumber.agent_id || updatedPhoneNumber.agentId,
                agentName: updatedPhoneNumber.agent_name || updatedPhoneNumber.agentName,
                countryCode: updatedPhoneNumber.country_code || updatedPhoneNumber.countryCode,
                nextCycle: updatedPhoneNumber.next_cycle || updatedPhoneNumber.nextCycle,
                twilioSid: updatedPhoneNumber.twilio_sid || updatedPhoneNumber.twilioSid
            };

            setPhoneNumbers(phoneNumbers.map(pn =>
                pn.id === editingPhoneNumber.id ? mappedPhoneNumber : pn
            ));

            setEditModalOpen(false);
            setEditingPhoneNumber(null);
        } catch (error) {
            console.error('Error updating phone number:', error);
            alert('Failed to update phone number. Please try again.');
        }
    };

    const handleDeleteNumber = async (numberId: string) => {
        if (window.confirm("Are you sure you want to delete this phone number?")) {
            try {
                await phoneNumberService.deletePhoneNumber(user!.id, numberId);
                setPhoneNumbers(phoneNumbers.filter(pn => pn.id !== numberId));
            } catch (error) {
                console.error('Error deleting phone number:', error);
                alert('Failed to delete phone number');
            }
        }
        setActiveDropdown(null);
    };

    // Handle redirect to Twilio for purchasing numbers
    const handleBuyNumber = () => {
        // Redirect to Twilio's phone number purchasing page
        window.open('https://www.twilio.com/console/phone-numbers/search', '_blank');
        setPurchaseModalOpen(false);
    };

    const handleCallStarted = (callId: string) => {
        console.log('Call started with ID:', callId);
        // In a real implementation, you might want to track the call or update UI
    };

    if (loading) {
        return (
            <AppLayout
                breadcrumbs={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Phone Numbers' }]}
                pageTitle="Phone Numbers"
            >
                <div className="space-y-8">
                    {/* Metrics Skeleton */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 p-5 rounded-3xl shadow-sm">
                                <div className="flex items-center justify-between mb-4">
                                    <Skeleton width={44} height={44} variant="rounded" />
                                    <Skeleton width={80} height={10} variant="text" />
                                </div>
                                <Skeleton width={60} height={28} variant="text" className="mb-2" />
                                <Skeleton width={100} height={12} variant="text" />
                            </div>
                        ))}
                    </div>

                    {/* Table Skeleton */}
                    <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                            <div className="space-y-2">
                                <Skeleton width={150} height={20} variant="text" />
                                <Skeleton width={250} height={14} variant="text" />
                            </div>
                            <Skeleton width={32} height={32} variant="rounded" />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                        <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Connection</th>
                                        <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Integrated Agent</th>
                                        <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Region & Type</th>
                                        <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Added On</th>
                                        <th className="px-8 py-5"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {[...Array(5)].map((_, i) => (
                                        <tr key={i}>
                                            <td className="px-8 py-6">
                                                <div className="flex items-center">
                                                    <Skeleton width={48} height={48} variant="rounded" />
                                                    <div className="ml-4 space-y-2">
                                                        <Skeleton width={120} height={16} variant="text" />
                                                        <Skeleton width={80} height={10} variant="text" />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6">
                                                <div className="flex items-center">
                                                    <Skeleton width={32} height={32} variant="rounded" className="mr-3" />
                                                    <Skeleton width={100} height={14} variant="text" />
                                                </div>
                                            </td>
                                            <td className="px-8 py-6">
                                                <div className="space-y-2">
                                                    <Skeleton width={80} height={14} variant="text" />
                                                    <Skeleton width={60} height={10} variant="text" />
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 text-right">
                                                <div className="flex flex-col items-end space-y-2">
                                                    <Skeleton width={80} height={14} variant="text" />
                                                    <Skeleton width={60} height={10} variant="text" />
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 text-right">
                                                <Skeleton width={32} height={32} variant="rounded" className="ml-auto" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Dashboard', path: '/dashboard' },
                { label: 'Phone Numbers' }
            ]}
            pageTitle="Phone Numbers"
            pageDescription="Manage your virtual phone numbers and assign voice agents."
            primaryAction={
                <div className="flex items-center space-x-3">

                    <button
                        onClick={async () => {
                            if (!user) return;
                            const allowed = await checkAccess(user.id);
                            if (!allowed) return;
                            setAddTwilioModalOpen(true);
                        }}
                        className="flex items-center px-5 py-2.5 rounded-xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all group"
                    >
                        <PlusIcon className="h-4 w-4 mr-2 group-hover:rotate-90 transition-transform duration-200" />
                        Connect Twilio
                    </button>
                </div>
            }
        >
            <div className="space-y-8 animate-in fade-in duration-500">

                {/* Metrics Section */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                        {
                            label: 'Total Numbers',
                            value: phoneNumbers.length,
                            icon: DevicePhoneMobileIcon,
                            color: 'blue',
                            trend: 'Active Connections'
                        },
                        {
                            label: 'Active Agents',
                            value: agents.filter(a => a.status === 'Active').length,
                            icon: UserIcon,
                            color: 'green',
                            trend: `${agents.length} Total Agents`
                        },
                        {
                            label: 'Recent Calls',
                            value: callHistory.length,
                            icon: PhoneArrowUpRightIcon,
                            color: 'purple',
                            trend: 'Last 30 Days'
                        }
                    ].map((stat, i) => (
                        <div key={i} className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all group">
                            <div className="flex items-center justify-between mb-4">
                                <div className={`p-3 rounded-xl bg-${stat.color}-50 dark:bg-${stat.color}-900/20 text-${stat.color}-500 group-hover:scale-110 transition-transform duration-300`}>
                                    <stat.icon className="h-5 w-5" />
                                </div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{stat.trend}</span>
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-1">{stat.value}</h3>
                            <p className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">{stat.label}</p>
                        </div>
                    ))}
                </div>

                {/* Main Table Content */}
                <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
                    <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Your Phone Numbers</h2>
                            <p className="text-sm text-slate-500 font-medium">Connect numbers to agents for automated voice responses.</p>
                        </div>
                        <div className="flex items-center space-x-2">
                            <button className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                <ArrowPathIcon className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    {phoneNumbers.length === 0 ? (
                        <div className="p-20 text-center">
                            <div className="w-20 h-20 bg-slate-50 dark:bg-slate-900 rounded-3xl flex items-center justify-center mx-auto mb-6">
                                <PhoneIcon className="h-10 w-10 text-slate-300" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">No phone numbers yet</h3>
                            <p className="text-slate-500 max-w-sm mx-auto mb-8 font-medium italic">
                                Ready to take your calls to the next level? Connect your first Twilio number to get started.
                            </p>
                            <button
                                onClick={async () => {
                                    if (!user) return;
                                    const allowed = await checkAccess(user.id);
                                    if (!allowed) return;
                                    setAddTwilioModalOpen(true);
                                }}
                                className="inline-flex items-center px-6 py-3 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all"
                            >
                                <PlusIcon className="h-5 w-5 mr-2" />
                                Connect Your First Number
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                        <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Connection</th>
                                        <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Integrated Agent</th>
                                        <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Region & Type</th>
                                        <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Added On</th>
                                        <th className="px-8 py-5"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {phoneNumbers.map((phoneNumber) => {
                                        const { date, time } = formatDateTime(phoneNumber.createdDate);
                                        return (
                                            <tr key={phoneNumber.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center">
                                                        <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 transition-transform group-hover:scale-110">
                                                            <PhoneIcon className="h-6 w-6" />
                                                        </div>
                                                        <div className="ml-4">
                                                            <div className="text-base font-bold text-slate-900 dark:text-white mb-0.5">
                                                                {phoneNumber.phoneNumber || phoneNumber.number || phoneNumber.phone_number}
                                                            </div>
                                                            <div className="flex items-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                                                <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></span>
                                                                {phoneNumber.provider} Connection
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    {phoneNumber.agentId ? (
                                                        <div className="flex items-center">
                                                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary mr-3">
                                                                <UserIcon className="h-4 w-4" />
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-bold text-slate-900 dark:text-white leading-none mb-1">{phoneNumber.agentName}</div>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); openEditModal(phoneNumber); }}
                                                                    className="text-[10px] font-black uppercase text-primary hover:underline tracking-widest"
                                                                >
                                                                    Change Agent
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); openEditModal(phoneNumber); }}
                                                            className="flex items-center px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold text-[10px] uppercase tracking-widest hover:bg-primary hover:text-white transition-all border border-slate-100 dark:border-slate-800"
                                                        >
                                                            <PlusIcon className="h-3.5 w-3.5 mr-2" />
                                                            Assign Agent
                                                        </button>
                                                    )}
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="text-sm font-bold text-slate-900 dark:text-white mb-1 uppercase tracking-wider">{phoneNumber.region || 'Global'}</div>
                                                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{phoneNumber.twilioSid?.substring(0, 10) || 'Verified Extension'}</div>
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    <div className="text-sm font-bold text-slate-900 dark:text-white mb-1">{date}</div>
                                                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{time}</div>
                                                </td>
                                                <td className="px-8 py-6 text-right relative">
                                                    <button
                                                        onClick={(e) => handleToggleDropdown(e, phoneNumber.id)}
                                                        className="dropdown-trigger p-2 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                                                    >
                                                        <EllipsisVerticalIcon className="h-6 w-6" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Secondary Sections Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-10">
                    {/* Call History Card */}
                    {callHistory.length > 0 && (
                        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden flex flex-col h-full">
                            <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <ClockIcon className="h-5 w-5 text-purple-500" />
                                    Recent Activity
                                </h2>
                                <button className="text-xs font-bold text-primary uppercase tracking-widest hover:underline">View History</button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-slate-50/30 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-800">
                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Routing</th>
                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                                            <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Time</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                                        {callHistory.slice(0, 4).map((call) => {
                                            const { date, time } = formatDateTime(call.timestamp);
                                            return (
                                                <tr key={call.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                                    <td className="px-6 py-5">
                                                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-0.5">{call.toNumber}</div>
                                                        <div className="text-[10px] text-slate-500 font-medium italic">from {call.fromNumber}</div>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${call.status === 'completed' ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-900/50' :
                                                            'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                                                            }`}>
                                                            {call.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-5 text-right font-bold text-[10px] text-slate-400">
                                                        {time}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Twilio Accounts Card */}
                    {userTwilioAccounts.length > 0 && (
                        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden h-full">
                            <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <SignalIcon className="h-5 w-5 text-blue-500" />
                                    Twilio Infrastructure
                                </h2>
                                <button onClick={() => window.location.href = '/twilio-settings'} className="text-xs font-bold text-primary uppercase tracking-widest hover:underline">Manage Accounts</button>
                            </div>
                            <div className="p-8 space-y-4">
                                {userTwilioAccounts.map((account) => (
                                    <div key={account.id} className="group p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:border-primary/30 transition-all flex items-center justify-between">
                                        <div className="flex items-center">
                                            <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center text-red-500 mr-4 shadow-sm">
                                                <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" /></svg>
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-slate-900 dark:text-white leading-none mb-1.5">{account.name}</div>
                                                <div className="text-[10px] font-mono text-slate-500 font-bold tracking-tighter">
                                                    SID: {account.accountSid.substring(0, 10)}...{account.accountSid.substring(account.accountSid.length - 4)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="px-3 py-1 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-[10px] font-black uppercase rounded-lg border border-green-100 dark:border-green-900/30">Verified</div>
                                    </div>
                                ))}
                                <button
                                    onClick={() => window.location.href = '/twilio-settings'}
                                    className="w-full py-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 font-bold text-xs hover:border-primary/50 hover:text-primary transition-all flex items-center justify-center gap-2"
                                >
                                    <PlusIcon className="h-4 w-4" />
                                    Configure More Accounts
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Sub-components / Modals Portaled */}
            {activeDropdown && (() => {
                const phoneNumber = phoneNumbers.find(p => p.id === activeDropdown);
                if (!phoneNumber) return null;
                return createPortal(
                    <div
                        className="dropdown-menu fixed w-64 rounded-2xl shadow-2xl bg-white dark:bg-slate-800/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 z-[9999] py-2 animate-in fade-in slide-in-from-top-2 duration-200"
                        style={{ top: `${dropdownPos.top}px`, left: `${dropdownPos.left}px` }}
                    >
                        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 mb-1">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Quick Actions</p>
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{phoneNumber.phoneNumber || phoneNumber.number}</p>
                        </div>
                        <button
                            onClick={async () => {
                                if (!user) return;
                                const allowed = await checkAccess(user.id);
                                if (!allowed) return;
                                openMakeCallModal(phoneNumber);
                            }}
                            className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        >
                            <PhoneIcon className="h-4 w-4 text-slate-400" />
                            <span className="font-semibold">Initiate Test Call</span>
                        </button>
                        <button onClick={() => openEditModal(phoneNumber)} className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                            <PencilIcon className="h-4 w-4 text-slate-400" />
                            <span className="font-semibold">Change Assignment</span>
                        </button>
                        <div className="h-px bg-slate-100 dark:bg-slate-700 my-1 mx-2"></div>
                        <button onClick={() => handleDeleteNumber(phoneNumber.id)} className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                            <TrashIcon className="h-4 w-4" />
                            <span className="font-semibold">Delete Connection</span>
                        </button>
                    </div>,
                    document.body
                );
            })()}

            {/* Modals */}
            <ImportPhoneNumberModal
                isOpen={isImportModalOpen}
                onClose={() => setImportModalOpen(false)}
                user={user}
                onPhoneNumberImported={(newPhoneNumber) => {
                    setPhoneNumbers(prev => [...prev, newPhoneNumber]);
                }}
            />

            <ConnectTwilioNumberModal
                isOpen={isAddTwilioModalOpen}
                onClose={() => setAddTwilioModalOpen(false)}
                user={user}
                onNumberAdded={() => {
                    loadPhoneNumbers();
                    loadTwilioPhoneNumbers();
                }}
            />

            {editingPhoneNumber && (
                <Modal
                    isOpen={isEditModalOpen}
                    onClose={() => {
                        setEditModalOpen(false);
                        setEditingPhoneNumber(null);
                    }}
                    title="Assign Voice Agent"
                >
                    <div className="space-y-6">
                        <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                                Phone Number
                            </label>
                            <div className="text-lg font-black text-slate-900 dark:text-white">
                                {editingPhoneNumber.phoneNumber || editingPhoneNumber.number || editingPhoneNumber.phone_number}
                            </div>
                        </div>

                        <div>
                            <label htmlFor="agentSelect" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">
                                Select Voice Agent
                            </label>
                            <div className="relative group">
                                <select
                                    id="agentSelect"
                                    value={selectedAgentId}
                                    onChange={(e) => setSelectedAgentId(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none font-bold"
                                >
                                    <option value="">No Agent Assigned</option>
                                    {agents.map((agent) => (
                                        <option key={agent.id} value={agent.id}>
                                            {agent.name} ({agent.status})
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                    <ChevronDownIcon className="h-5 w-5" />
                                </div>
                            </div>
                            <p className="mt-2 text-[10px] text-slate-500 font-medium leading-relaxed italic">
                                Heads up: Calls to this number will be handled by the selected agent immediately.
                            </p>
                        </div>

                        <div className="flex justify-end space-x-3 pt-6 border-t border-slate-100 dark:border-slate-800">
                            <button
                                onClick={() => {
                                    setEditModalOpen(false);
                                    setEditingPhoneNumber(null);
                                }}
                                className="px-6 py-2.5 rounded-xl text-slate-500 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveAgentAssignment}
                                className="px-8 py-2.5 bg-primary rounded-xl text-white font-black shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all text-sm"
                            >
                                Save Assignment
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {selectedPhoneNumber && isCallModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-300" onClick={() => setCallModalOpen(false)}>
                    <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl max-w-md w-full mx-4 overflow-hidden border border-slate-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>
                        <div className="h-1.5 bg-primary w-full"></div>
                        <div className="p-8">
                            <CallInitiator
                                phoneNumber={selectedPhoneNumber}
                                agents={agents}
                                onCallStarted={handleCallStarted}
                                onMakeCall={handleMakeCall}
                                isInModal={true}
                                onClose={() => {
                                    setCallModalOpen(false);
                                    setSelectedPhoneNumber(null);
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {selectedPhoneNumber && isMakeCallModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-300" onClick={() => setMakeCallModalOpen(false)}>
                    <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl max-w-md w-full mx-4 overflow-hidden border border-slate-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>
                        <div className="h-1.5 bg-primary w-full"></div>
                        <div className="p-8">
                            <CallInitiator
                                phoneNumber={selectedPhoneNumber}
                                agents={agents}
                                onCallStarted={handleCallStarted}
                                onMakeCall={handleMakeCall}
                                isInModal={true}
                                onClose={() => {
                                    setMakeCallModalOpen(false);
                                    setSelectedPhoneNumber(null);
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}
            {/* Upgrade Plan Modal */}
            <UpgradePlanModal reason={blockingReason} onClose={clearBlock} />
        </AppLayout>
    );
};

export default PhoneNoPage;