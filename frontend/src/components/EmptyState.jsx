import React from 'react';
import { Inbox } from 'lucide-react';

export const EmptyState = ({ title = 'No records found', description = 'There are no items matching your criteria.', action = null }) => (
  <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-xl border border-slate-100">
    <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 mb-3 border border-slate-100">
      <Inbox className="w-6 h-6" />
    </div>
    <h4 className="text-base font-semibold text-slate-800">{title}</h4>
    <p className="text-sm text-slate-500 mt-1 max-w-sm">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);
