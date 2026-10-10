import React from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingSpinner = ({ text = 'Loading data...' }) => (
  <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-3">
    <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
    <span className="text-sm font-medium text-slate-500">{text}</span>
  </div>
);
