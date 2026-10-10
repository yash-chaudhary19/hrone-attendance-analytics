import React, { useState, useEffect } from 'react';
import {
  Award,
  Clock,
  Filter,
  Medal,
  Building,
  Flame,
  AlertCircle,
} from 'lucide-react';
import { getLateLeaderboard, getEmployees } from '../services/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { getCurrentMonthStr, formatMinutes } from '../utils/formatters';

export const LeaderboardPage = ({ onNotify }) => {
  const [month, setMonth] = useState(getCurrentMonthStr());
  const [limit, setLimit] = useState(10);
  const [department, setDepartment] = useState('');
  const [departments, setDepartments] = useState([]);
  const [leaderboardItems, setLeaderboardItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // Load department options
  useEffect(() => {
    const loadDepts = async () => {
      try {
        const empRes = await getEmployees({ page_size: 100 });
        const uniqueDepts = Array.from(
          new Set((empRes.items || []).map((e) => e.department).filter(Boolean))
        );
        setDepartments(uniqueDepts);
      } catch (err) {
        // non-blocking
      }
    };
    loadDepts();
  }, []);

  const fetchLeaderboard = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await getLateLeaderboard(month, limit, department || null);
      setLeaderboardItems(data.items || []);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, [month, limit, department]);

  const top3 = leaderboardItems.slice(0, 3);

  const getRankBadge = (rank) => {
    if (rank === 1) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
          <Medal className="w-3.5 h-3.5 text-amber-600" />
          <span>Rank 1</span>
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-800 border border-slate-300">
          <Medal className="w-3.5 h-3.5 text-slate-600" />
          <span>Rank 2</span>
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200">
          <Medal className="w-3.5 h-3.5 text-amber-700" />
          <span>Rank 3</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 font-mono">
        #{rank}
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            <span>Late Arrivals Leaderboard</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Standard competition ranking with ties (1, 2, 2, 4). Tied cutoff rows are included.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            />
          </div>

          <div>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              <option value={5}>Top 5</option>
              <option value={10}>Top 10</option>
              <option value={20}>Top 20</option>
              <option value={50}>Top 50</option>
            </select>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <LoadingSpinner text="Aggregating late leaderboard rankings..." />
      ) : leaderboardItems.length === 0 ? (
        <EmptyState
          title="No late incidents found"
          description={`Great news! No employees have recorded late minutes for month ${month}.`}
        />
      ) : (
        <div className="space-y-6">
          {/* Top 3 Podium Cards */}
          {top3.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {top3.map((item, i) => (
                <div
                  key={`${item.emp_code}-${i}`}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-3">
                    {getRankBadge(item.rank)}
                    <span className="font-mono text-xs font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                      {item.emp_code}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900">{item.name}</h3>
                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <Building className="w-3.5 h-3.5 text-slate-400" />
                      <span>{item.department}</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Total Late</span>
                      <span className="font-bold text-rose-600">
                        {item.total_late_minutes} mins ({formatMinutes(item.total_late_minutes)})
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px]">Frequency</span>
                      <span className="font-bold text-slate-700">{item.late_count} days</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Leaderboard Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between text-xs font-bold text-slate-800">
              <span>Full Leaderboard Table (limit={limit})</span>
              <span className="text-slate-500 font-normal">
                {leaderboardItems.length} Ranked Employees
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-[11px] font-semibold uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-5">Rank</th>
                    <th className="py-3 px-5">Employee Code</th>
                    <th className="py-3 px-5">Employee Name</th>
                    <th className="py-3 px-5">Department</th>
                    <th className="py-3 px-5">Total Late Minutes</th>
                    <th className="py-3 px-5">Late Count (Days)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leaderboardItems.map((item, idx) => (
                    <tr key={`${item.emp_code}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-5">{getRankBadge(item.rank)}</td>
                      <td className="py-3.5 px-5 font-mono text-xs font-bold text-brand-700">
                        {item.emp_code}
                      </td>
                      <td className="py-3.5 px-5 font-semibold text-slate-900 text-xs">{item.name}</td>
                      <td className="py-3.5 px-5 text-xs text-slate-600">{item.department}</td>
                      <td className="py-3.5 px-5 text-xs font-bold text-rose-600">
                        {item.total_late_minutes} mins{' '}
                        <span className="text-[11px] font-normal text-slate-500">
                          ({formatMinutes(item.total_late_minutes)})
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-xs font-semibold text-slate-700">
                        {item.late_count} occurrences
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
