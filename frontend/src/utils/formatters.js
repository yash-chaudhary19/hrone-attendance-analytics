/**
 * Formats epoch milliseconds to human-readable IST string.
 * R1: Timestamps represent UTC instants, shifts are calculated in IST (UTC+05:30).
 */
export const formatEpochToIST = (epochMs) => {
  if (!epochMs) return '—';
  try {
    const d = new Date(Number(epochMs));
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d) + ' IST';
  } catch (err) {
    return String(epochMs);
  }
};

export const formatEpochTimeOnly = (epochMs) => {
  if (!epochMs) return '—';
  try {
    const d = new Date(Number(epochMs));
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d);
  } catch (err) {
    return '—';
  }
};

export const formatDateStr = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const [y, m, d] = dateStr.split('-');
    const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
    return new Intl.DateTimeFormat('en-IN', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(dateObj);
  } catch (err) {
    return dateStr;
  }
};

export const formatMinutes = (mins) => {
  if (!mins || mins === 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
};

export const getStatusConfig = (status) => {
  switch (status) {
    case 'PRESENT':
      return { label: 'Present', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' };
    case 'WFH':
      return { label: 'Work From Home', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-500' };
    case 'ON_DUTY':
      return { label: 'On Duty', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' };
    case 'LEAVE':
      return { label: 'Leave', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' };
    case 'ABSENT':
      return { label: 'Absent', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' };
    default:
      return { label: status || 'Unknown', bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', dot: 'bg-slate-500' };
  }
};

export const getCurrentMonthStr = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

export const getCurrentDateStr = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
