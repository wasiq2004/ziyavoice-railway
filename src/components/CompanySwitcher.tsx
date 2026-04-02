import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getApiBaseUrl, getApiPath } from '../utils/api';
import { ChevronUpDownIcon, PlusIcon, BuildingOfficeIcon, CheckIcon } from '@heroicons/react/24/outline';

interface Company {
    id: string;
    name: string;
}

const CompanySwitcher: React.FC<{ isCollapsed: boolean }> = ({ isCollapsed }) => {
    const { user, updateUser } = useAuth();
    const [companies, setCompanies] = useState<Company[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [newCompanyName, setNewCompanyName] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (user?.id) {
            fetchCompanies();
        }
    }, [user?.id]);

    const fetchCompanies = async () => {
        try {
            const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/companies/${user?.id}`);
            if (!response.ok) return;
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) return;
            const data = await response.json();
            if (data.success) {
                setCompanies(data.companies);
            }
        } catch (error) {
            console.error('Error fetching companies:', error);
        }
    };

    const handleCreateCompany = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCompanyName.trim()) return;

        setIsLoading(true);
        try {
            const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/companies/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user?.id, name: newCompanyName.trim() }),
            });
            if (!response.ok) {
                const text = await response.text();
                console.error('Create company failed:', text);
                return;
            }
            const data = await response.json();
            if (data.success) {
                setCompanies([data.company, ...companies]);
                setNewCompanyName('');
                setIsCreating(false);
                if (companies.length === 0) {
                    await handleSwitchCompany(data.company.id);
                }
            }
        } catch (error) {
            console.error('Error creating company:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSwitchCompany = async (companyId: string) => {
        if (companyId === user?.current_company_id) {
            setIsOpen(false);
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/companies/switch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user?.id, companyId }),
            });
            if (!response.ok) {
                console.error('Switch company failed:', response.status);
                return;
            }
            const data = await response.json();
            if (data.success) {
                await updateUser({ current_company_id: companyId });
                setIsOpen(false);
                window.location.reload();
            }
        } catch (error) {
            console.error('Error switching company:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const currentCompany = companies.find(c => c.id === user?.current_company_id) || companies[0];

    if (isCollapsed) {
        return (
            <div className="flex items-center justify-center py-2 h-10 w-10 mx-auto bg-primary/10 rounded-lg text-primary">
                <BuildingOfficeIcon className="h-6 w-6" />
            </div>
        );
    }

    return (
        <div className="w-full px-[2px] mb-4">
            <div className="relative w-full">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-darkbg-light border border-slate-200 dark:border-slate-800 hover:border-primary/50 transition-all group shadow-sm"
                >
                    <div className="flex items-center space-x-3 overflow-hidden min-w-0 flex-1">
                        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            <BuildingOfficeIcon className="h-5 w-5" />
                        </div>
                        <div className="flex flex-col items-start overflow-hidden min-w-0 flex-1">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Company</span>
                            <span className="text-sm font-bold text-slate-800 dark:text-white truncate w-full text-left">
                                {currentCompany?.name || 'Select Company'}
                            </span>
                        </div>
                    </div>
                    <ChevronUpDownIcon className="h-5 w-5 flex-shrink-0 text-slate-400 group-hover:text-primary transition-colors ml-1" />
                </button>

                {isOpen && (
                    <div className="absolute left-0 right-0 w-full top-full mt-2 z-50 bg-white dark:bg-darkbg-surface border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="p-2 space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
                            {companies.map((company) => (
                                <button
                                    key={company.id}
                                    onClick={() => handleSwitchCompany(company.id)}
                                    className={`w-full flex items-center justify-between p-2.5 rounded-lg text-sm transition-colors ${company.id === user?.current_company_id
                                        ? 'bg-primary/10 text-primary font-bold'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-darkbg-light'
                                        }`}
                                >
                                    <span className="truncate">{company.name}</span>
                                    {company.id === user?.current_company_id && <CheckIcon className="flex-shrink-0 h-4 w-4" />}
                                </button>
                            ))}

                            {companies.length === 0 && !isCreating && (
                                <div className="px-3 py-4 text-center">
                                    <p className="text-xs text-slate-500">No companies found</p>
                                </div>
                            )}
                        </div>

                        <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-darkbg-light/30">
                            {isCreating ? (
                                <form onSubmit={handleCreateCompany} className="space-y-2">
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Company name..."
                                        value={newCompanyName}
                                        onChange={(e) => setNewCompanyName(e.target.value)}
                                        className="w-full px-3 py-2 text-sm bg-white dark:bg-darkbg-surface border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-primary outline-none text-slate-800 dark:text-white"
                                    />
                                    <div className="flex space-x-2">
                                        <button
                                            type="submit"
                                            disabled={isLoading || !newCompanyName.trim()}
                                            className="flex-1 py-1.5 text-xs font-bold bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50"
                                        >
                                            Create
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setIsCreating(false)}
                                            className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <button
                                    onClick={() => setIsCreating(true)}
                                    className="w-full flex items-center justify-center space-x-2 p-2 rounded-lg text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
                                >
                                    <PlusIcon className="h-4 w-4" />
                                    <span>Add New Company</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CompanySwitcher;