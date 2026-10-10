import React, { useState, useEffect } from 'react';
import {
  ClipboardEdit,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  History,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import { regularizeAttendance, listAttendance } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { formatEpochToIST, getCurrentDateStr } from '../utils/formatters';

export const RegularizationPage = ({ initialParams = null, onNotify }) => {
  const [empCode, setEmpCode] = useState(initialParams?.empCode || '');
  const [dateStr, setDateStr] = useState(initialParams?.date || getCurrentDateStr());

  // Existing record preview
  const [currentRecord, setCurrentRecord] = useState(null);
  const [fetchLoading, setFetchLoading] = useState(false);

  // Form values
  const [statusVal, setStatusVal] = useState('');
  const [punchInDt, setPunchInDt] = useState('');
  const [punchOutDt, setPunchOutDt] = useState('');
  const [reason, setReason] = useState('');
  const [regularizedBy, setRegularizedBy] = useState('HR_Manager');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [updatedResult, setUpdatedResult] = useState(null);

  // Auto-fetch if initialParams provided
  useEffect(() => {
    if (initialParams?.empCode && initialParams?.date) {
      setEmpCode(initialParams.empCode);
      setDateStr(initialParams.date);
      checkExistingRecord(initialParams.empCode, initialParams.date);
    }
  }, [initialParams]);

  const checkExistingRecord = async (code = empCode, dt = dateStr) => {
    if (!code || !dt) return;
    setFetchLoading(true);
    setErrorMsg(null);
    setCurrentRecord(null);
    try {
      const res = await listAttendance({
        emp_code: code.trim(),
        date_from: dt,
        date_to: dt,
      });
      if (res.items && res.items.length > 0) {
        const rec = res.items[0];
        setCurrentRecord(rec);
        setStatusVal(rec.status);
      } else {
        setErrorMsg(`No existing attendance record found for ${code} on ${dt}. Regularization requires an existing record.`);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setFetchLoading(false);
    }
  };

  const handleRegularizeSubmit = async (e) => {
    e.preventDefault();
    if (!empCode || !dateStr) {
      setErrorMsg('Employee code and date are required.');
      return;
    }
    if (reason.trim().length < 5) {
      setErrorMsg('Reason must be at least 5 characters long.');
      return;
    }
    if (!regularizedBy.trim()) {
      setErrorMsg('Regularized By is required.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setUpdatedResult(null);

    try {
      const payload = {
        reason: reason.trim(),
        regularized_by: regularizedBy.trim(),
      };

      if (statusVal) {
        payload.status = statusVal;
      }
      if (punchInDt) {
        payload.punch_in = new Date(punchInDt).getTime();
      }
      if (punchOutDt) {
        payload.punch_out = new Date(punchOutDt).getTime();
      }

      const res = await regularizeAttendance(empCode.trim(), dateStr, payload);
      setUpdatedResult(res);
      setCurrentRecord(res);
      onNotify({
        type: 'success',
        message: `Attendance regularized for ${res.emp_code} on ${res.date}! Derived fields recomputed.`,
      });
    } catch (err) {
      setErrorMsg(err.message);
      onNotify({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      {/* Title */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <ClipboardEdit className="w-5 h-5 text-brand-600" />
          <span>Attendance Regularization (PATCH /attendance/{'{emp_code}'}/{'{date}'})</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Adjust punch times or presence status for a given record. Derived fields (work hours,
          late minutes, overtime, half day) are automatically recomputed, and an immutable audit
          entry is appended.
        </p>
      </div>

      {/* Target Lookup Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Search className="w-4 h-4 text-brand-600" />
          <span>Step 1: Select Target Attendance Record</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Employee Code <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. EMP001"
              value={empCode}
              onChange={(e) => setEmpCode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Record Date <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
              required
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => checkExistingRecord()}
              disabled={fetchLoading || !empCode || !dateStr}
              className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-50 transition-colors"
            >
              {fetchLoading ? 'Checking...' : 'Load Existing Record'}
            </button>
          </div>
        </div>

        {/* Existing Record Preview */}
        {currentRecord && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-900">
                Found Record for {currentRecord.emp_code} ({currentRecord.date})
              </span>
              <StatusBadge status={currentRecord.status} halfDay={currentRecord.half_day} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px] text-slate-600">
              <div>
                <span className="text-slate-400 block">Punch In:</span>
                {formatEpochToIST(currentRecord.punch_in)}
              </div>
              <div>
                <span className="text-slate-400 block">Punch Out:</span>
                {formatEpochToIST(currentRecord.punch_out)}
              </div>
              <div>
                <span className="text-slate-400 block">Work Hours:</span>
                {currentRecord.work_hours !== null ? `${currentRecord.work_hours.toFixed(2)}h` : 'null'}
              </div>
              <div>
                <span className="text-slate-400 block">Audit History:</span>
                {currentRecord.history ? currentRecord.history.length : 0} entries
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Regularization Form */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Step 2: Submit Changes & Audit Information</span>
        </h3>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleRegularizeSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                New Status (Optional)
              </label>
              <select
                value={statusVal}
                onChange={(e) => setStatusVal(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              >
                <option value="">(Keep Current Status)</option>
                <option value="PRESENT">PRESENT</option>
                <option value="WFH">WFH</option>
                <option value="ON_DUTY">ON_DUTY</option>
                <option value="LEAVE">LEAVE</option>
                <option value="ABSENT">ABSENT</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                New Punch In Time (Optional)
              </label>
              <input
                type="datetime-local"
                value={punchInDt}
                onChange={(e) => setPunchInDt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                New Punch Out Time (Optional)
              </label>
              <input
                type="datetime-local"
                value={punchOutDt}
                onChange={(e) => setPunchOutDt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Regularization <span className="text-rose-500">* (5–200 characters)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Biometric device malfunction at entry gate"
                minLength={5}
                maxLength={200}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Regularized By <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. HR_Manager or John Doe"
                maxLength={50}
                value={regularizedBy}
                onChange={(e) => setRegularizedBy(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-brand-600 hover:bg-brand-700 text-white shadow-sm shadow-brand-600/30 disabled:opacity-50 transition-all"
            >
              <ClipboardEdit className="w-4 h-4" />
              <span>{submitting ? 'Applying Regularization...' : 'Apply Regularization'}</span>
            </button>
          </div>
        </form>

        {/* Updated Result Card */}
        {updatedResult && (
          <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Record Successfully Updated</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px] text-emerald-900">
              <div>
                <span className="text-emerald-700 block font-sans">Status:</span>
                <StatusBadge status={updatedResult.status} halfDay={updatedResult.half_day} />
              </div>
              <div>
                <span className="text-emerald-700 block font-sans">Work Hours:</span>
                {updatedResult.work_hours !== null ? `${updatedResult.work_hours.toFixed(2)}h` : 'null'}
              </div>
              <div>
                <span className="text-emerald-700 block font-sans">Late / Overtime:</span>
                {updatedResult.late_minutes}m late / {updatedResult.overtime_minutes}m OT
              </div>
              <div>
                <span className="text-emerald-700 block font-sans">Audit Trail:</span>
                {updatedResult.history ? updatedResult.history.length : 0} entries
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
