import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  Calendar,
  Clock,
  Briefcase,
  AlertCircle,
  Percent,
  CheckCircle,
  XCircle,
  TrendingUp,
} from 'lucide-react';
import { getEmployees, getEmployeeMonthly } from '../services/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { formatMinutes, getCurrentMonthStr } from '../utils/formatters';

export const EmployeeAnalyticsPage = ({ onNotify }) => {
  const [employees, setEmployees] = useState([]);
  const [selectedEmpCode, setSelectedEmpCode] = useState('');
  const [month, setMonth] = useState(getCurrentMonthStr());
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Load employee list for the dropdown
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const res = await getEmployees({ page_size: 100 });
        setEmployees(res.items || []);
        if (res.items && res.items.length > 0) {
          setSelectedEmpCode(res.items[0].emp_code);
        }
      } catch (err) {
        onNotify({ type: 'error', message: err.message });
      }
    };
    fetchEmployees();
  }, []);

  const fetchMonthlyAnalytics = async () => {
    if (!selectedEmpCode || !month) return;
    setLoading(true);
    setErrorMsg(null);
    setAnalytics(null);
    try {
      const data = await getEmployeeMonthly(selectedEmpCode.trim(), month);
      setAnalytics(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEmpCode && month) {
      fetchMonthlyAnalytics();
    }
  }, [selectedEmpCode, month]);

  const selectedEmployeeObj = employees.find((e) => e.emp_code === selectedEmpCode);

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-brand-600" />
            <span>Employee Monthly Analytics</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            GET /analytics/employees/{'{emp_code}'}/monthly?month={'{YYYY-MM}'}
          </p>
        </div>

        {/* Selectors */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div>
            <select
              value={selectedEmpCode}
              onChange={(e) => setSelectedEmpCode(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              {employees.map((emp) => (
                <option key={emp.emp_code} value={emp.emp_code}>
                  {emp.emp_code} - {emp.name} ({emp.department})
                </option>
              ))}
            </select>
          </div>

          <div>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner text={`Computing analytics for ${selectedEmpCode} for ${month}...`} />
      ) : errorMsg ? (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Unable to fetch analytics</div>
            <div className="text-xs text-amber-700 mt-0.5">{errorMsg}</div>
          </div>
        </div>
      ) : !analytics ? (
        <EmptyState title="No analytics loaded" description="Select an employee and calendar month." />
      ) : (
        <div className="space-y-6">
          {/* Employee Info Header */}
          {selectedEmployeeObj && (
            <div className="p-4 rounded-2xl bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center font-bold text-sm">
                  {selectedEmployeeObj.emp_code.slice(-2)}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{selectedEmployeeObj.name}</h3>
                  <div className="text-xs text-slate-400">
                    {selectedEmployeeObj.department} • Joined: {selectedEmployeeObj.joined_on} • Shift:{' '}
                    {selectedEmployeeObj.shift_start} - {selectedEmployeeObj.shift_end}
                  </div>
                </div>
              </div>
              <div className="text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-brand-300 self-start sm:self-auto">
                Month: {analytics.month}
              </div>
            </div>
          )}

          {/* Rate Highlight Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-brand-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg flex flex-col justify-between">
              <span className="text-xs font-semibold text-brand-200 uppercase tracking-wider">
                Attendance Percentage
              </span>
              <div className="my-4">
                <div className="text-4xl font-extrabold">
                  {analytics.attendance_pct !== null ? `${analytics.attendance_pct.toFixed(2)}%` : 'N/A'}
                </div>
                <p className="text-xs text-brand-100 mt-1">
                  R8 Half-up rounded • present_days / working_days * 100
                </p>
              </div>
              <div className="w-full bg-black/20 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(analytics.attendance_pct || 0, 100)}%` }}
                />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Working vs Present Days
                </span>
                <Briefcase className="w-4 h-4 text-brand-600" />
              </div>
              <div className="my-3">
                <div className="text-2xl font-bold text-slate-900">
                  {analytics.present_days.toFixed(1)}{' '}
                  <span className="text-sm font-normal text-slate-400">/ {analytics.working_days} days</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  R7 Monday–Friday working calendar (leaves: {analytics.leave_days}d)
                </div>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Half days count as 0.5 present day
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Punctuality & Overtime
                </span>
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <div className="my-3">
                <div className="text-2xl font-bold text-slate-900">
                  {analytics.late_count}{' '}
                  <span className="text-sm font-normal text-slate-400">late occurrences</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Total Late: {formatMinutes(analytics.total_late_minutes)}
                </div>
              </div>
              <div className="text-[11px] text-indigo-600 font-semibold font-mono">
                Overtime: {formatMinutes(analytics.total_overtime_minutes)} ({analytics.total_overtime_minutes}m)
              </div>
            </div>
          </div>

          {/* Breakdown Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Complete Metrics Summary (R1–R8)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-xs text-slate-500">Working Days (R7)</div>
                <div className="text-lg font-bold text-slate-800 mt-1">{analytics.working_days}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Mon–Fri calendar</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-xs text-slate-500">Present Days (R5-R7)</div>
                <div className="text-lg font-bold text-emerald-600 mt-1">
                  {analytics.present_days.toFixed(1)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">PRESENT, WFH, ON_DUTY</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-xs text-slate-500">Leave Days</div>
                <div className="text-lg font-bold text-amber-600 mt-1">{analytics.leave_days}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Status = LEAVE</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-xs text-slate-500">Attendance Rate (R8)</div>
                <div className="text-lg font-bold text-brand-600 mt-1">
                  {analytics.attendance_pct !== null ? `${analytics.attendance_pct}%` : 'N/A'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">2 decimals half-up</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-xs text-slate-500">Late Days (R2)</div>
                <div className="text-lg font-bold text-rose-600 mt-1">{analytics.late_count}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">&gt; 10m grace period</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-xs text-slate-500">Total Late Minutes</div>
                <div className="text-lg font-bold text-rose-600 mt-1">
                  {analytics.total_late_minutes}m
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Measured from shift_start</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-xs text-slate-500">Overtime Minutes (R3)</div>
                <div className="text-lg font-bold text-indigo-600 mt-1">
                  {analytics.total_overtime_minutes}m
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">&gt;= 30m past shift_end</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-xs text-slate-500">Employee Code</div>
                <div className="text-lg font-mono font-bold text-slate-800 mt-1">
                  {analytics.emp_code}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Target resource</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
