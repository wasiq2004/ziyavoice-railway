import React, { useState, useRef } from 'react';
import {
    XMarkIcon,
    ArrowUpTrayIcon,
    DocumentIcon,
    CheckCircleIcon,
    ExclamationCircleIcon
} from '@heroicons/react/24/outline';

interface ImportLeadsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (file: File) => void;
}

const ImportLeadsModal: React.FC<ImportLeadsModalProps> = ({ isOpen, onClose, onImport }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            validateAndSetFile(files[0]);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            validateAndSetFile(e.target.files[0]);
        }
    };

    const validateAndSetFile = (file: File) => {
        setError(null);
        if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
            setError('Please upload a valid CSV file.');
            setSelectedFile(null);
            return;
        }
        setSelectedFile(file);
    };

    const handleSubmit = () => {
        if (selectedFile) {
            onImport(selectedFile);
            // We'll let the parent handle the success/close
        }
    };

    const removeFile = () => {
        setSelectedFile(null);
        setError(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div
                className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-[32px] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                    <div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white">Import Leads</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Upload your contacts via CSV file</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
                    >
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-8">
                    {!selectedFile ? (
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`relative group cursor-pointer border-2 border-dashed rounded-[24px] p-12 text-center transition-all duration-300 ${isDragging
                                    ? 'border-primary bg-primary/5 scale-[1.02]'
                                    : 'border-slate-200 dark:border-slate-800 hover:border-primary/50 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                }`}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                accept=".csv"
                                className="hidden"
                            />

                            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                                <ArrowUpTrayIcon className="w-10 h-10 text-primary" />
                            </div>

                            <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                                Click or drag CSV here
                            </h4>
                            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium max-w-[240px] mx-auto leading-relaxed">
                                Support for large datasets. Ensure your CSV has
                                <span className="text-primary font-bold"> name </span> and
                                <span className="text-primary font-bold"> phone </span> columns.
                            </p>

                            {/* Decorative elements */}
                            <div className="absolute top-4 right-4 text-[10px] font-black uppercase tracking-widest text-primary/40 bg-primary/5 px-2 py-1 rounded-lg">
                                .CSV ONLY
                            </div>
                        </div>
                    ) : (
                        <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 animate-in slide-in-from-top-4 duration-300">
                            <div className="flex items-center space-x-4">
                                <div className="w-14 h-14 bg-green-500/10 rounded-2xl flex items-center justify-center text-green-500">
                                    <DocumentIcon className="w-7 h-7" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                        {selectedFile.name}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                        {(selectedFile.size / 1024).toFixed(2)} KB
                                    </p>
                                </div>
                                <button
                                    onClick={removeFile}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                                >
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="mt-6 flex items-center space-x-2 text-green-600 dark:text-green-400">
                                <CheckCircleIcon className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-wider">File ready for import</span>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="mt-4 flex items-center space-x-2 text-red-500 bg-red-50 dark:bg-red-900/10 p-4 rounded-xl animate-in fade-in duration-300">
                            <ExclamationCircleIcon className="w-5 h-5" />
                            <span className="text-sm font-bold">{error}</span>
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="mt-8 flex items-center justify-end space-x-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-3 text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            disabled={!selectedFile}
                            onClick={handleSubmit}
                            className={`px-8 py-3 bg-primary text-white rounded-2xl font-black text-sm transition-all shadow-lg shadow-primary/25 transform active:scale-95 ${!selectedFile ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:bg-primary-dark hover:scale-[1.02]'
                                }`}
                        >
                            Start Import
                        </button>
                    </div>
                </div>

                {/* Instructions / Tips */}
                <div className="px-8 py-6 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-start space-x-3">
                        <div className="mt-1 flex-shrink-0">
                            <CheckCircleIcon className="w-4 h-4 text-slate-400" />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                            <span className="font-bold text-slate-700 dark:text-slate-300">Pro Tip:</span>
                            Make sure your CSV is UTF-8 encoded for better compatibility with international names and numbers.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Add Missing TrashIcon for local usage
const TrashIcon = ({ className }: { className: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
);

export default ImportLeadsModal;
