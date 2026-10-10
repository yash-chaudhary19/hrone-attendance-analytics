import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export const NotificationToast = ({ notification, onClose }) => {
  if (!notification) return null;

  const { type = 'info', message } = notification;

  const typeConfig = {
    success: {
      bg: 'bg-emerald-50 border-emerald-200 text-emerald-900',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
    },
    error: {
      bg: 'bg-rose-50 border-rose-200 text-rose-900',
      icon: <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />,
    },
    info: {
      bg: 'bg-blue-50 border-blue-200 text-blue-900',
      icon: <Info className="w-5 h-5 text-blue-600 shrink-0" />,
    },
  }[type] || {
    bg: 'bg-slate-50 border-slate-200 text-slate-900',
    icon: <Info className="w-5 h-5 text-slate-600 shrink-0" />,
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md animate-slide-up shadow-xl rounded-xl">
      <div className={`flex items-start gap-3 p-4 rounded-xl border ${typeConfig.bg}`}>
        {typeConfig.icon}
        <div className="flex-1 text-sm font-medium">{message}</div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
