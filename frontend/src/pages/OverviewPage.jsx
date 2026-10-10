import React, { useState, useEffect } from 'react';
import {
  Users,
  CalendarCheck,
  Clock,
  Flame,
  Award,
  ArrowRight,
  TrendingUp,
  LogIn,
  LogOut,
  AlertTriangle,
  Building2,
} from 'lucide-react';
import { getEmployees, listAttendance, getDepartmentSummary } from '../services/api';
import { formatEpochToIST, formatMinutes, getCurrentMonthStr, getCurrentDateStr } from '../utils/formatters';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

export const OverviewPage = ({ onNavigate, onOpenPunchIn, onOpenPunchOut }) => {
  const [loading, setLoading] = useState(true);
  const [employeesTotal, setEmployeesTotal] = useState(0);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [attendanceTotal, setAttendanceTotal] = useState(0);
  const [deptSummaryItems, setDeptSummaryItems] = useState([]);
  const [error, setError] = useState(null);

  const currentMonth = getCurrentMonthStr();
  const currentDate = getCurrentDateStr();

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [empRes, attRes, deptRes] = await Promise.all([
        getEmployees({ page: 1, page_size: 1 }),
        listAttendance({ page: 1, page_size: 10 }),
        getDepartmentSummary(currentMonth).catch(() => ({ items: [] })),
      ]);

      setEmployeesTotal(empRes.total || 0);
      setAttendanceRecords(attRes.items || []);
      setAttendanceTotal(attRes.total || 0);
      setDeptSummaryItems(deptRes.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return <LoadingSpinner text="Fetching overview analytics and live attendance data..." />;
  }

  // Calculate high-level KPIs from attendance logs
  const totalLateCount = deptSummaryItems.reduce((acc, d) => acc + (d.late_count || 0), 0);
  const totalLateMinutes = deptSummaryItems.reduce((acc, d) => acc + (d.total_late_minutes || 0), 0);
  const totalPresentDays = deptSummaryItems.reduce((acc, d) => acc + (d.present_days || 0), 0);
  const totalHeadcount = deptSummaryItems.reduce((acc, d) => acc + (d.headcount || 0), employeesTotal);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-navy-900 to-brand-950 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 flex items-center pr-10 pointer-events-none">
          <Building2 className="w-64 h-64 text-white" />
        </div>
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/20 text-brand-300 text-xs font-semibold mb-3 border border-brand-500/30">
            Reporting Period: {currentMonth} (Today: {currentDate})
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white mb-2">
            Employee Attendance & Operational Pulse
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed mb-5">
            Real-time attendance calculations governed by R1–R10 domain rules, multi-collection
            aggregations, automated shift transitions, and instant audit trails.
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={onOpenPunchIn}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 transition-all"
            >
              <LogIn className="w-4 h-4" />
              <span>Record Punch In</span>
            </button>
            <button
              onClick={onOpenPunchOut}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20 transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span>Record Punch Out</span>
            </button>
            <button
              onClick={() => onNavigate('regularization')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white backdrop-blur border border-white/20 transition-all"
            >
              <span>Regularize Record</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <span>Note: {error} (Displaying available records)</span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Employees */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Workforce
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-brand-600 flex items-center justify-center border border-blue-100">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">{totalHeadcount}</div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <span>{employeesTotal} registered in database</span>
            </div>
          </div>
        </div>

        {/* Total Present Days */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Present Days ({currentMonth})
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <CalendarCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">{totalPresentDays.toFixed(1)}</div>
            <div className="text-xs text-slate-500 mt-1">
              <span>Across all active departments</span>
            </div>
          </div>
        </div>

        {/* Total Late Records */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Late Incidents
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">{totalLateCount}</div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <span>{formatMinutes(totalLateMinutes)} total late minutes</span>
            </div>
          </div>
        </div>

        {/* Total Attendance Logs */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Log Entries
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">{attendanceTotal}</div>
            <div className="text-xs text-slate-500 mt-1">
              <span>Indexed under compound key</span>
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Chart & Department Highlights */}
      {deptSummaryItems.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Department Headcount vs Present Days
                </h3>
                <p className="text-xs text-slate-500">
                  Aggregated from live MongoDB records for month {currentMonth}
                </p>
              </div>
              <button
                onClick={() => onNavigate('dept-analytics')}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
              >
                <span>Full Analytics</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptSummaryItems} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="department" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="headcount" name="Headcount (R9)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="present_days" name="Present Days" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quick Department Breakdown List */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 mb-1">Active Departments</h3>
              <p className="text-xs text-slate-500 mb-4">Summary statistics by department</p>
              <div className="space-y-3">
                {deptSummaryItems.slice(0, 4).map((d) => (
                  <div
                    key={d.department}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-800">{d.department}</div>
                      <div className="text-[11px] text-slate-500">
                        Avg Work: {d.avg_work_hours !== null ? `${d.avg_work_hours}h` : '—'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold text-brand-600">{d.headcount} staff</div>
                      <div className="text-[11px] text-slate-400">{d.late_count} late</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => onNavigate('dept-analytics')}
              className="mt-4 w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors text-center"
            >
              View Department Trends & Moving Avg
            </button>
          </div>
        </div>
      )}

      {/* Recent Attendance Activity Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Recent Attendance Activity</h3>
            <p className="text-xs text-slate-500">Latest punch logs sorted by date DESC and employee code</p>
          </div>
          <button
            onClick={() => onNavigate('attendance')}
            className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
          >
            <span>View All Logs</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {attendanceRecords.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No attendance records found yet. Use the buttons above to record a punch in!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-[11px] font-semibold uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="py-3 px-5">Date</th>
                  <th className="py-3 px-5">Employee</th>
                  <th className="py-3 px-5">Status</th>
                  <th className="py-3 px-5">Punch In</th>
                  <th className="py-3 px-5">Punch Out</th>
                  <th className="py-3 px-5">Work Hours</th>
                  <th className="py-3 px-5">Late / Overtime</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attendanceRecords.map((item, index) => (
                  <tr key={`${item.emp_code}-${item.date}-${index}`} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-5 font-mono text-xs text-slate-800 font-medium">
                      {item.date}
                    </td>
                    <td className="py-3.5 px-5 font-mono text-xs font-semibold text-brand-700">
                      {item.emp_code}
                    </td>
                    <td className="py-3.5 px-5">
                      <StatusBadge status={item.status} halfDay={item.half_day} />
                    </td>
                    <td className="py-3.5 px-5 text-xs text-slate-600">
                      {formatEpochToIST(item.punch_in)}
                    </td>
                    <td className="py-3.5 px-5 text-xs text-slate-600">
                      {formatEpochToIST(item.punch_out)}
                    </td>
                    <td className="py-3.5 px-5 text-xs font-semibold text-slate-700">
                      {item.work_hours !== null && item.work_hours !== undefined
                        ? `${item.work_hours.toFixed(2)}h`
                        : '—'}
                    </td>
                    <td className="py-3.5 px-5 text-xs text-slate-600">
                      {item.late_minutes > 0 && (
                        <span className="text-amber-600 font-medium mr-2">
                          +{item.late_minutes}m late
                        </span>
                      )}
                      {item.overtime_minutes > 0 && (
                        <span className="text-indigo-600 font-medium">
                          +{item.overtime_minutes}m OT
                        </span>
                      )}
                      {item.late_minutes === 0 && item.overtime_minutes === 0 && (
                        <span className="text-slate-400">On time</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
