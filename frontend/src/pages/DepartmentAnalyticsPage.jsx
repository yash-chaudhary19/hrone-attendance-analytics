import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  BarChart2,
  Calendar,
  Building,
  Users,
  Clock,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { getDepartmentSummary, getDepartmentTrend, getEmployees } from '../services/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { getCurrentMonthStr, formatMinutes } from '../utils/formatters';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

export const DepartmentAnalyticsPage = ({ onNotify }) => {
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'trend'
  const [month, setMonth] = useState(getCurrentMonthStr());
  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState('Engineering');

  // Summary state
  const [summaryData, setSummaryData] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Trend state
  const [trendFrom, setTrendFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [trendTo, setTrendTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [trendData, setTrendData] = useState([]);
  const [trendLoading, setTrendLoading] = useState(false);

  const [errorMsg, setErrorMsg] = useState(null);

  // Load department options from employees
  useEffect(() => {
    const loadDepts = async () => {
      try {
        const empRes = await getEmployees({ page_size: 100 });
        const uniqueDepts = Array.from(
          new Set((empRes.items || []).map((e) => e.department).filter(Boolean))
        );
        if (uniqueDepts.length > 0) {
          setDepartments(uniqueDepts);
          if (!uniqueDepts.includes(selectedDept)) {
            setSelectedDept(uniqueDepts[0]);
          }
        }
      } catch (err) {
        // non-blocking
      }
    };
    loadDepts();
  }, []);

  // Fetch Summary
  const fetchSummary = async () => {
    setSummaryLoading(true);
    setErrorMsg(null);
    try {
      const data = await getDepartmentSummary(month);
      setSummaryData(data.items || []);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSummaryLoading(false);
    }
  };

  // Fetch Trend
  const fetchTrend = async () => {
    if (!selectedDept || !trendFrom || !trendTo) return;
    setTrendLoading(true);
    setErrorMsg(null);
    try {
      const data = await getDepartmentTrend(selectedDept, trendFrom, trendTo);
      setTrendData(data.items || []);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setTrendLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'summary') {
      fetchSummary();
    } else {
      fetchTrend();
    }
  }, [activeTab, month, selectedDept]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-brand-600" />
            <span>Department Analytics & Operations</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cross-collection aggregations, R9 headcount calculations, gap filling ($densify), and 7-day moving averages.
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('summary')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'summary'
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Monthly Summary
          </button>
          <button
            onClick={() => setActiveTab('trend')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'trend'
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Daily Trend & Moving Avg
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* TAB 1: SUMMARY */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
            <span className="text-xs font-bold text-slate-700">Filter Month:</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            />
          </div>

          {summaryLoading ? (
            <LoadingSpinner text={`Aggregating department summary for ${month}...`} />
          ) : summaryData.length === 0 ? (
            <EmptyState
              title="No department summary records"
              description={`No employees or logs found for ${month}.`}
            />
          ) : (
            <>
              {/* Summary Chart */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Department Comparison: Headcount (R9) vs Present Days
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Headcount includes employees with zero logs who joined on or before {month}-end
                </p>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summaryData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="department" stroke="#94a3b8" fontSize={12} />
                      <YAxis stroke="#94a3b8" fontSize={12} />
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
                      <Bar dataKey="late_count" name="Late Occurrences" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Department Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {summaryData.map((d) => (
                  <div
                    key={d.department}
                    className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                          <Building className="w-4 h-4 text-brand-600" />
                          <span>{d.department}</span>
                        </span>
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {d.headcount} Staff
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                          <div className="text-slate-500 text-[11px]">Avg Work Hours</div>
                          <div className="text-sm font-bold text-slate-800 mt-0.5">
                            {d.avg_work_hours !== null ? `${d.avg_work_hours.toFixed(2)}h` : '—'}
                          </div>
                          <div className="text-[10px] text-slate-400">Over records (R8)</div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                          <div className="text-slate-500 text-[11px]">Present Days</div>
                          <div className="text-sm font-bold text-emerald-600 mt-0.5">
                            {d.present_days.toFixed(1)}d
                          </div>
                          <div className="text-[10px] text-slate-400">Mon–Fri only (R7)</div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                          <div className="text-slate-500 text-[11px]">Late Incidents</div>
                          <div className="text-sm font-bold text-amber-600 mt-0.5">
                            {d.late_count} ({formatMinutes(d.total_late_minutes)})
                          </div>
                          <div className="text-[10px] text-slate-400">Late minutes (R2)</div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                          <div className="text-slate-500 text-[11px]">Leave / Duty</div>
                          <div className="text-sm font-bold text-purple-600 mt-0.5">
                            {d.leave_count} / {d.on_duty_count}
                          </div>
                          <div className="text-[10px] text-slate-400">LEAVE vs ON_DUTY</div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedDept(d.department);
                        setActiveTab('trend');
                      }}
                      className="mt-4 w-full py-2 px-3 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors text-center"
                    >
                      View {d.department} Trend Series →
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: TREND */}
      {activeTab === 'trend' && (
        <div className="space-y-6">
          {/* Trend Controls */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Target Department:</label>
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                >
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">From Date:</label>
                <input
                  type="date"
                  value={trendFrom}
                  onChange={(e) => setTrendFrom(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">To Date:</label>
                <input
                  type="date"
                  value={trendTo}
                  onChange={(e) => setTrendTo(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <button
              onClick={fetchTrend}
              className="py-2 px-4 rounded-lg font-bold bg-brand-600 hover:bg-brand-700 text-white self-end transition-colors"
            >
              Update Trend Chart
            </button>
          </div>

          {trendLoading ? (
            <LoadingSpinner text={`Computing daily series with $densify and moving average...`} />
          ) : trendData.length === 0 ? (
            <EmptyState
              title="No trend data returned"
              description={`Ensure the department exists and the date range is <= 92 days.`}
            />
          ) : (
            <>
              {/* Trend Chart */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {selectedDept}: Attendance Rate & 7-Day Moving Average
                    </h3>
                    <p className="text-xs text-slate-500">
                      Calculated across whole date range via MongoDB $densify and $setWindowFields
                    </p>
                  </div>
                  <div className="text-xs font-mono px-3 py-1 rounded bg-slate-100 text-slate-600">
                    {trendData.length} Calendar Days
                  </div>
                </div>

                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={trendData.map((t) => ({
                        ...t,
                        attendanceRatePct: t.attendance_rate !== null ? Number((t.attendance_rate * 100).toFixed(2)) : null,
                        movingAvgPct: t.moving_avg_7d !== null ? Number((t.moving_avg_7d * 100).toFixed(2)) : null,
                      }))}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                      <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} unit="%" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Line
                        type="monotone"
                        dataKey="attendanceRatePct"
                        name="Daily Attendance Rate %"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="movingAvgPct"
                        name="7-Day Moving Avg %"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Trend Series Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 font-bold text-xs text-slate-800">
                  Daily Densified Series Table ({selectedDept})
                </div>
                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 text-[11px] font-semibold uppercase tracking-wider sticky top-0 border-b border-slate-100">
                      <tr>
                        <th className="py-2.5 px-4">Date</th>
                        <th className="py-2.5 px-4">Working Day?</th>
                        <th className="py-2.5 px-4">Headcount</th>
                        <th className="py-2.5 px-4">Present Count</th>
                        <th className="py-2.5 px-4">Late Count</th>
                        <th className="py-2.5 px-4">Daily Rate</th>
                        <th className="py-2.5 px-4">7d Moving Avg</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {trendData.map((item) => (
                        <tr key={item.date} className="hover:bg-slate-50">
                          <td className="py-2 px-4 font-bold text-slate-900">{item.date}</td>
                          <td className="py-2 px-4">
                            {item.is_working_day ? (
                              <span className="text-emerald-600 font-sans font-semibold">Weekday</span>
                            ) : (
                              <span className="text-slate-400 font-sans">Weekend</span>
                            )}
                          </td>
                          <td className="py-2 px-4 text-slate-700">{item.headcount}</td>
                          <td className="py-2 px-4 text-slate-700">{item.present_count}</td>
                          <td className="py-2 px-4 text-slate-700">{item.late_count}</td>
                          <td className="py-2 px-4 font-semibold text-brand-600">
                            {item.attendance_rate !== null ? `${(item.attendance_rate * 100).toFixed(2)}%` : '—'}
                          </td>
                          <td className="py-2 px-4 font-semibold text-emerald-600">
                            {item.moving_avg_7d !== null ? `${(item.moving_avg_7d * 100).toFixed(2)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
