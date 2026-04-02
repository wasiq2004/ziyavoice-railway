import React, { useState } from 'react';

interface AddLeadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (lead: any) => void;
}

const AddLeadModal: React.FC<AddLeadModalProps> = ({ isOpen, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        notes: ''
    });

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
        onClose();
        setFormData({ name: '', phone: '', email: '', notes: '' }); // Reset
    };

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 p-8 rounded-[40px] w-full max-w-lg shadow-[0_20px_50px_rgba(0,0,0,0.3)] relative card-animate">
                <button
                    onClick={onClose}
                    className="absolute top-8 right-8 p-2 rounded-2xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-white transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-600"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M16 8L8 16M8 8l8 8" /></svg>
                </button>

                <div className="mb-8">
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white leading-tight">Add New Lead</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 font-bold uppercase tracking-widest opacity-60">Enter contact details below</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid grid-cols-1 gap-5">
                        <div className="group">
                            <label className="block text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2 px-1">
                                Full Name
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="John Doe"
                                className="w-full bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all font-bold"
                            />
                        </div>

                        <div className="group">
                            <label className="block text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2 px-1">
                                Phone Number
                            </label>
                            <input
                                type="tel"
                                required
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                placeholder="+1 (555) 000-0000"
                                className="w-full bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all font-bold"
                            />
                        </div>

                        <div className="group">
                            <label className="block text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2 px-1">
                                Email Address
                            </label>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                placeholder="john@example.com"
                                className="w-full bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all font-bold"
                            />
                        </div>

                        <div className="group">
                            <label className="block text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2 px-1">
                                Additional Notes
                            </label>
                            <textarea
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                rows={3}
                                placeholder="Follow up about product pricing..."
                                className="w-full bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all font-bold resize-none"
                            />
                        </div>
                    </div>

                    <div className="flex gap-4 pt-6">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-8 py-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-white rounded-2xl font-black transition-all transform active:scale-95 text-sm uppercase tracking-wider"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-8 py-4 bg-primary hover:bg-primary-dark text-white rounded-2xl font-black shadow-2xl shadow-primary/30 transition-all transform active:scale-95 hover:scale-[1.02] text-sm uppercase tracking-wider"
                        >
                            Save Lead
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddLeadModal;
