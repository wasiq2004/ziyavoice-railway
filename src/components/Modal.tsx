
import React from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    maxWidth?: string;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, maxWidth = "max-w-lg" }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 overflow-y-auto" onClick={onClose}>
            <div className="min-h-screen px-4 text-center flex items-center justify-center">
                <div
                    className={`inline-block w-full ${maxWidth} p-6 sm:p-8 my-8 text-left align-middle transition-all transform bg-surface dark:bg-darkbg-light shadow-google-hover rounded-xl border border-gray-100 dark:border-gray-700 animate-scale-in`}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center pb-4 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="text-xl font-medium text-slate-800 dark:text-white">{title}</h3>
                        <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-darkbg-lighter transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div className="mt-6">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Modal;