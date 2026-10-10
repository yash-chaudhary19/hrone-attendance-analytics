import React, { useState } from 'react';
import { Modal } from './Modal';
import { punchIn, punchOut } from '../services/api';
import { LogIn, LogOut, AlertCircle, Clock } from 'lucide-react';

export const PunchInModal = ({ isOpen, onClose, employees = [], onSuccess, onError }) => {
  const [empCode, setEmpCode] = useState('');
  const [status, setStatus] = useState('PRESENT');
  const [useCurrentTime, setUseCurrentTime] = useState(true);
  const [customDateTime, setCustomDateTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!empCode) {
      setErrorMsg('Please select or enter an employee code.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      let punchedAt = null;
      if (!useCurrentTime && customDateTime) {
        punchedAt = new Date(customDateTime).getTime();
      }

      const payload = {
        emp_code: empCode.trim(),
        status: status,
      };
      if (punchedAt) {
        payload.punched_at = punchedAt;
      }

      const res = await punchIn(payload);
      onSuccess(`Punch-in successful for ${res.emp_code} on ${res.date}!`);
      onClose();
      setEmpCode('');
    } catch (err) {
      setErrorMsg(err.message);
      if (onError) onError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Employee Punch In (Record Attendance)">
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Employee <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <input
              list="employee-punch-in-options"
              type="text"
              placeholder="Select or enter emp_code (e.g. EMP001)"
              value={empCode}
              onChange={(e) => setEmpCode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
              required
            />
            <datalist id="employee-punch-in-options">
              {employees.map((emp) => (
                <option key={emp.emp_code} value={emp.emp_code}>
                  {emp.name} ({emp.department})
                </option>
              ))}
            </datalist>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Creates attendance record for the calculated shift date (R1, R2).
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Presence Status <span className="text-rose-500">*</span>
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
          >
            <option value="PRESENT">PRESENT - At Office</option>
            <option value="WFH">WFH - Work From Home</option>
            <option value="ON_DUTY">ON_DUTY - On Official Duty</option>
          </select>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={useCurrentTime}
              onChange={(e) => setUseCurrentTime(e.target.checked)}
              className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4"
            />
            <span>Use current instant (now)</span>
          </label>

          {!useCurrentTime && (
            <div className="mt-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Custom Punch-in Timestamp
              </label>
              <input
                type="datetime-local"
                value={customDateTime}
                onChange={(e) => setCustomDateTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                required={!useCurrentTime}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-sm"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>{loading ? 'Recording...' : 'Confirm Punch In'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

export const PunchOutModal = ({ isOpen, onClose, employees = [], onSuccess, onError }) => {
  const [empCode, setEmpCode] = useState('');
  const [useCurrentTime, setUseCurrentTime] = useState(true);
  const [customDateTime, setCustomDateTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!empCode) {
      setErrorMsg('Please select or enter an employee code.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      let punchedAt = null;
      if (!useCurrentTime && customDateTime) {
        punchedAt = new Date(customDateTime).getTime();
      }

      const payload = {
        emp_code: empCode.trim(),
      };
      if (punchedAt) {
        payload.punched_at = punchedAt;
      }

      const res = await punchOut(payload);
      onSuccess(`Punch-out recorded for ${res.emp_code}! Work Hours: ${res.work_hours || 0} hrs, Overtime: ${res.overtime_minutes || 0} mins.`);
      onClose();
      setEmpCode('');
    } catch (err) {
      setErrorMsg(err.message);
      if (onError) onError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Employee Punch Out">
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Employee <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <input
              list="employee-punch-out-options"
              type="text"
              placeholder="Select or enter emp_code (e.g. EMP001)"
              value={empCode}
              onChange={(e) => setEmpCode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
              required
            />
            <datalist id="employee-punch-out-options">
              {employees.map((emp) => (
                <option key={emp.emp_code} value={emp.emp_code}>
                  {emp.name} ({emp.department})
                </option>
              ))}
            </datalist>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Calculates work hours (R4), overtime (R3), and half-day status (R5).
          </p>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={useCurrentTime}
              onChange={(e) => setUseCurrentTime(e.target.checked)}
              className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4"
            />
            <span>Use current instant (now)</span>
          </label>

          {!useCurrentTime && (
            <div className="mt-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Custom Punch-out Timestamp
              </label>
              <input
                type="datetime-local"
                value={customDateTime}
                onChange={(e) => setCustomDateTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                required={!useCurrentTime}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-all shadow-sm"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{loading ? 'Recording...' : 'Confirm Punch Out'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
