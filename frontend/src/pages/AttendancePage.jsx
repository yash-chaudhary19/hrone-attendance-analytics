import React, { useState, useEffect } from 'react';
import {
  CalendarCheck,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  History,
  Clock,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import { listAttendance } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { formatEpochToIST, formatMinutes } from '../utils/formatters';

export const AttendancePage = ({ onNavigate, onOpenPunchIn, onOpenPunchOut, onNotify }) => {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Filters
  const [empCodeFilter, setEmpCodeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [loading, setLoading] = useState(true);
  const [selectedRecordHistory, setSelectedRecordHistory] = useState(null);

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const params = { page, page_size: pageSize };
      if (empCodeFilter.trim()) params.emp_code = empCodeFilter.trim();
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (statusFilter) params.status = statusFilter;

      const data = await listAttendance(params);
      setRecords(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      onNotify({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [page, pageSize, statusFilter]);

  const handleApplyFilters = (e) => {
    e.preventDefault();
    setPage(1);
    fetchAttendance();
  };

  const handleResetFilters = () => {
    setEmpCodeFilter('');
    setDateFrom('');
    setDateTo('');
    setStatusFilter('');
    setPage(1);
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-brand-600" />
            <span>Attendance Logs</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Indexed records sorted by date descending, then emp_code ascending. Total: {total}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenPunchIn}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all"
          >
            <LogIn className="w-4 h-4" />
            <span>Punch In</span>
          </button>
          <button
            onClick={onOpenPunchOut}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Punch Out</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <form
        onSubmit={handleApplyFilters}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-white p-4 rounded-xl border border-slate-200 text-xs"
      >
        <div>
          <label className="block text-slate-600 font-semibold mb-1">Employee Code</label>
          <input
            type="text"
            placeholder="e.g. EMP001"
            value={empCodeFilter}
            onChange={(e) => setEmpCodeFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
          />
        </div>

        <div>
          <label className="block text-slate-600 font-semibold mb-1">Date From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-slate-600 font-semibold mb-1">Date To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-slate-600 font-semibold mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
          >
            <option value="">All Statuses</option>
            <option value="PRESENT">PRESENT</option>
            <option value="WFH">WFH</option>
            <option value="ON_DUTY">ON_DUTY</option>
            <option value="LEAVE">LEAVE</option>
            <option value="ABSENT">ABSENT</option>
          </select>
        </div>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="flex-1 py-2 px-3 rounded-lg font-semibold bg-brand-600 hover:bg-brand-700 text-white transition-colors"
          >
            Apply Filters
          </button>
          <button
            type="button"
            onClick={handleResetFilters}
            className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
            title="Reset filters"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Attendance Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <LoadingSpinner text="Fetching attendance records..." />
        ) : records.length === 0 ? (
          <EmptyState
            title="No attendance records found"
            description="No logs match your filter criteria. Try adjusting the date range or employee code."
            action={
              <button
                onClick={handleResetFilters}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Reset Filters
              </button>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-[11px] font-semibold uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-5">Date</th>
                    <th className="py-3 px-5">Emp Code</th>
                    <th className="py-3 px-5">Status</th>
                    <th className="py-3 px-5">Punch In</th>
                    <th className="py-3 px-5">Punch Out</th>
                    <th className="py-3 px-5">Work Hours (R4)</th>
                    <th className="py-3 px-5">Late (R2) / OT (R3)</th>
                    <th className="py-3 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((r, idx) => (
                    <tr key={`${r.emp_code}-${r.date}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-5 font-mono text-xs font-bold text-slate-900">
                        {r.date}
                      </td>
                      <td className="py-3.5 px-5 font-mono text-xs font-bold text-brand-700">
                        {r.emp_code}
                      </td>
                      <td className="py-3.5 px-5">
                        <StatusBadge status={r.status} halfDay={r.half_day} />
                      </td>
                      <td className="py-3.5 px-5 text-xs text-slate-600">
                        {formatEpochToIST(r.punch_in)}
                      </td>
                      <td className="py-3.5 px-5 text-xs text-slate-600">
                        {formatEpochToIST(r.punch_out)}
                      </td>
                      <td className="py-3.5 px-5 text-xs font-semibold text-slate-800">
                        {r.work_hours !== null && r.work_hours !== undefined
                          ? `${r.work_hours.toFixed(2)} hrs`
                          : '—'}
                      </td>
                      <td className="py-3.5 px-5 text-xs">
                        <div className="flex flex-col gap-0.5">
                          {r.late_minutes > 0 ? (
                            <span className="text-amber-600 font-semibold">
                              +{r.late_minutes}m late
                            </span>
                          ) : (
                            <span className="text-slate-400">On time</span>
                          )}
                          {r.overtime_minutes > 0 && (
                            <span className="text-indigo-600 font-semibold">
                              +{r.overtime_minutes}m OT
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {r.history && r.history.length > 0 && (
                            <button
                              onClick={() => setSelectedRecordHistory(r)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                              title={`View ${r.history.length} audit history entries`}
                            >
                              <History className="w-4 h-4 text-brand-600" />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              onNavigate('regularization', {
                                empCode: r.emp_code,
                                date: r.date,
                              });
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-brand-600 hover:bg-brand-50 border border-brand-200 transition-colors"
                          >
                            Regularize
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
              <div>
                Showing <span className="font-semibold">{records.length}</span> of{' '}
                <span className="font-semibold">{total}</span> attendance records
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-medium px-2">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Audit History Modal */}
      {selectedRecordHistory && (
        <Modal
          isOpen={!!selectedRecordHistory}
          onClose={() => setSelectedRecordHistory(null)}
          title={`Audit History: ${selectedRecordHistory.emp_code} (${selectedRecordHistory.date})`}
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              Immutable history entries appended during regularization (PATCH /attendance/{selectedRecordHistory.emp_code}/{selectedRecordHistory.date}):
            </p>
            <div className="space-y-3">
              {selectedRecordHistory.history.map((h, i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5 font-semibold text-slate-800">
                    <span className="text-brand-700">Modified by: {h.by}</span>
                    <span className="text-slate-500 font-mono text-[11px]">{formatEpochToIST(h.at)}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">Reason:</span>{' '}
                    <span className="italic text-slate-600">{h.reason}</span>
                  </div>
                  {h.changes && Object.keys(h.changes).length > 0 && (
                    <div className="pt-1">
                      <span className="font-semibold text-slate-700 block mb-1">Field Changes:</span>
                      <div className="space-y-1">
                        {Object.entries(h.changes).map(([field, delta]) => (
                          <div
                            key={field}
                            className="flex items-center gap-2 font-mono text-[11px] bg-white px-2 py-1 rounded border border-slate-200"
                          >
                            <span className="font-semibold text-slate-700">{field}:</span>
                            <span className="line-through text-rose-600">
                              {delta.from === null ? 'null' : String(delta.from)}
                            </span>
                            <span className="text-slate-400">→</span>
                            <span className="text-emerald-600 font-bold">
                              {delta.to === null ? 'null' : String(delta.to)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
