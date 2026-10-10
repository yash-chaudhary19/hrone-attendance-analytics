import React from 'react';
import { getStatusConfig } from '../utils/formatters';

export const StatusBadge = ({ status, halfDay = false }) => {
  const config = getStatusConfig(status);
  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
        {config.label}
      </span>
      {halfDay && (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300" title="Work hours < 4.50 hrs (0.5 present day)">
          Half Day (0.5d)
        </span>
      )}
    </div>
  );
};
