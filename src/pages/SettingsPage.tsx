import React, { useState, useEffect } from 'react';
import AppLayout from '../components/AppLayout';
import {
    UserIcon,
    CalendarIcon,
    EnvelopeIcon,
    PhotoIcon,
    CheckIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';

interface SettingsPageProps { }

const SettingsPage: React.FC<SettingsPageProps> = () => {
    const { user, updateUser } = useAuth();

    const [profile, setProfile] = useState({
        full_name: '',
        email: '',
        dob: '',
        gender: '',
        profile_image: ''
    });

    useEffect(() => {
        if (user) {
            setProfile({
                full_name: user.full_name || user.username || '',
                email: user.email || '',
                dob: user.dob || '',
                gender: user.gender || '',
                profile_image: user.profile_image || ''
            });
        }
    }, [user]);

    const [saveStatus, setSaveStatus] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setProfile(prev => ({ ...prev, [name]: value }));
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setProfile(prev => ({ ...prev, profile_image: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSaveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const result = await updateUser(profile);
            if (result.error) throw new Error(result.error.message);

            setSaveStatus('✅ Profile saved successfully!');
            setTimeout(() => setSaveStatus(''), 3000);
        } catch (error) {
            console.error("Failed to save profile", error);
            setSaveStatus('❌ Failed to save profile.');
            setTimeout(() => setSaveStatus(''), 3000);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Dashboard', path: '/dashboard' },
                { label: 'User Profile' }
            ]}
            pageTitle="User Profile"
            pageDescription="Manage your personal details and account information."
            primaryAction={
                <button
                    form="profile-form"
                    type="submit"
                    disabled={isSaving}
                    className="flex items-center px-6 py-2.5 rounded-xl bg-primary text-white font-black text-sm shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all group disabled:opacity-50"
                >
                    <CheckIcon className="h-4 w-4 mr-2" />
                    {isSaving ? 'Saving...' : 'Save Profile'}
                </button>
            }
        >
            <div className="max-w-4xl space-y-8 animate-in fade-in duration-500">
                {saveStatus && (
                    <div className={`p-4 rounded-2xl flex items-center justify-between shadow-sm border animate-in slide-in-from-top-2 ${saveStatus.includes('✅')
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/30 text-red-700 dark:text-red-400'
                        }`}>
                        <div className="flex items-center">
                            <span className="mr-3 font-bold">{saveStatus.split(' ')[0]}</span>
                            <span className="text-sm font-bold">{saveStatus.split(' ').slice(1).join(' ')}</span>
                        </div>
                        <button onClick={() => setSaveStatus('')} className="p-1 hover:bg-black/5 rounded-lg transition-colors">
                            <CheckIcon className="h-4 w-4" />
                        </button>
                    </div>
                )}

                <form id="profile-form" onSubmit={handleSaveProfile} className="space-y-6">
                    {/* Profile Section */}
                    <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden transition-all hover:shadow-md">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Personal Details</h3>
                            <UserIcon className="h-5 w-5 text-slate-300" />
                        </div>
                        <div className="p-8 space-y-6">

                            {/* Profile Image URL */}
                            <div>
                                <label htmlFor="profile_image" className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Profile Image</label>
                                <div className="relative group flex items-center gap-4">
                                    <div className="flex-1 relative">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                                            <PhotoIcon className="h-5 w-5" />
                                        </div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            name="profile_image"
                                            id="profile_image"
                                            onChange={handleImageUpload}
                                            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all font-bold text-slate-900 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                                        />
                                    </div>
                                    {profile.profile_image && (
                                        <div className="shrink-0 relative">
                                            <img src={profile.profile_image} alt="Profile Preview" className="h-16 w-16 rounded-2xl object-cover shadow-md border border-slate-200 dark:border-slate-700" />
                                            <button
                                                type="button"
                                                onClick={() => setProfile(prev => ({ ...prev, profile_image: '' }))}
                                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-sm hover:bg-red-600 transition-colors"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Full Name */}
                                <div>
                                    <label htmlFor="full_name" className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Full Name</label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                                            <UserIcon className="h-5 w-5" />
                                        </div>
                                        <input
                                            type="text"
                                            name="full_name"
                                            id="full_name"
                                            value={profile.full_name}
                                            onChange={handleInputChange}
                                            className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all font-bold text-slate-900 dark:text-white"
                                            placeholder="Jane Doe"
                                        />
                                    </div>
                                </div>

                                {/* Email Address */}
                                <div>
                                    <label htmlFor="email" className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Email Address</label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                                            <EnvelopeIcon className="h-5 w-5" />
                                        </div>
                                        <input
                                            type="email"
                                            name="email"
                                            id="email"
                                            value={profile.email}
                                            onChange={handleInputChange}
                                            className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all font-bold text-slate-900 dark:text-white opacity-75"
                                            placeholder="jane@example.com"
                                            readOnly
                                        />
                                    </div>
                                    <p className="mt-2 text-[10px] text-slate-500 italic">Email address cannot be changed directly.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Date of Birth */}
                                <div>
                                    <label htmlFor="dob" className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Date of Birth</label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                                            <CalendarIcon className="h-5 w-5" />
                                        </div>
                                        <input
                                            type="date"
                                            name="dob"
                                            id="dob"
                                            value={profile.dob}
                                            onChange={handleInputChange}
                                            className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all font-bold text-slate-900 dark:text-white"
                                        />
                                    </div>
                                </div>

                                {/* Gender */}
                                <div>
                                    <label htmlFor="gender" className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Gender</label>
                                    <div className="relative">
                                        <select
                                            id="gender"
                                            name="gender"
                                            value={profile.gender}
                                            onChange={handleInputChange}
                                            className="w-full py-4 px-5 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-2xl font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all text-slate-900 dark:text-white"
                                        >
                                            <option value="">Select Gender</option>
                                            <option value="Male">Male</option>
                                            <option value="Female">Female</option>
                                            <option value="Non-Binary">Non-Binary</option>
                                            <option value="Prefer not to say">Prefer not to say</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
};

export default SettingsPage;