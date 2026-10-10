import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Clock,
  Calendar,
  Building,
  Mail,
  AlertCircle,
} from 'lucide-react';
import { getEmployees, createEmployee } from '../services/api';
import { Modal } from '../components/Modal';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { formatDateStr } from '../utils/formatters';

export const EmployeesPage = ({ onNotify }) => {
  const [employees, setEmployees] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New employee form state
  const [newEmp, setNewEmp] = useState({
    emp_code: '',
    name: '',
    email: '',
    department: 'Engineering',
    shift_start: '09:30',
    shift_end: '18:30',
    joined_on: new Date().toISOString().split('T')[0],
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState(null);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const params = { page, page_size: pageSize };
      if (departmentFilter.trim()) {
        params.department = departmentFilter.trim();
      }
      const data = await getEmployees(params);
      setEmployees(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      onNotify({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [page, pageSize, departmentFilter]);

  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    if (newEmp.shift_start === newEmp.shift_end) {
      setAddError('shift_start must differ from shift_end');
      return;
    }

    setAddLoading(true);
    setAddError(null);
    try {
      const created = await createEmployee({
        ...newEmp,
        emp_code: newEmp.emp_code.trim().toUpperCase(),
        name: newEmp.name.trim(),
        email: newEmp.email.trim(),
        department: newEmp.department.trim(),
      });
      onNotify({ type: 'success', message: `Employee ${created.emp_code} (${created.name}) created successfully!` });
      setIsAddModalOpen(false);
      setNewEmp({
        emp_code: '',
        name: '',
        email: '',
        department: 'Engineering',
        shift_start: '09:30',
        shift_end: '18:30',
        joined_on: new Date().toISOString().split('T')[0],
      });
      fetchEmployees();
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAddLoading(false);
    }
  };

  // Filter list by local search query if typed
  const displayedEmployees = employees.filter((emp) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      emp.emp_code.toLowerCase().includes(q) ||
      emp.name.toLowerCase().includes(q) ||
      emp.email.toLowerCase().includes(q) ||
      emp.department.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-600" />
            <span>Employee Directory</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Registered employees sorted by employee code. Total: {total}
          </p>
        </div>

        <button
          onClick={() => {
            setAddError(null);
            setIsAddModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-brand-600 hover:bg-brand-700 text-white shadow-sm shadow-brand-600/30 transition-all self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Employee</span>
        </button>
      </div>

      {/* Filters & Search */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-4 rounded-xl border border-slate-200">
        <div className="relative sm:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search by code, name, email or department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Filter by Department..."
            value={departmentFilter}
            onChange={(e) => {
              setDepartmentFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <LoadingSpinner text="Loading employees from API..." />
        ) : displayedEmployees.length === 0 ? (
          <EmptyState
            title="No employees found"
            description="No employees match your active filters or department criteria."
            action={
              <button
                onClick={() => {
                  setDepartmentFilter('');
                  setSearchQuery('');
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Clear Filters
              </button>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-[11px] font-semibold uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-5">Emp Code</th>
                    <th className="py-3 px-5">Name & Email</th>
                    <th className="py-3 px-5">Department</th>
                    <th className="py-3 px-5">Shift Timings</th>
                    <th className="py-3 px-5">Joined On</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedEmployees.map((emp) => (
                    <tr key={emp.emp_code} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-5">
                        <span className="font-mono text-xs font-bold px-2 py-1 rounded bg-slate-100 text-brand-800 border border-slate-200">
                          {emp.emp_code}
                        </span>
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-slate-900 text-xs">{emp.name}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{emp.email}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          <Building className="w-3 h-3 text-blue-500" />
                          {emp.department}
                        </span>
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-1.5 text-xs text-slate-700 font-mono">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {emp.shift_start} — {emp.shift_end}
                          </span>
                        </div>
                        {emp.shift_end <= emp.shift_start && (
                          <span className="text-[10px] text-purple-600 font-semibold">Overnight Shift</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-xs text-slate-600 font-mono">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatDateStr(emp.joined_on)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
              <div>
                Showing <span className="font-semibold">{displayedEmployees.length}</span> of{' '}
                <span className="font-semibold">{total}</span> employees
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

      {/* Add Employee Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Register New Employee (POST /employees)"
      >
        <form onSubmit={handleCreateEmployee} className="space-y-4">
          {addError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{addError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Employee Code <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="EMP001"
                pattern="^EMP\d{4,6}$"
                title="Must start with EMP followed by 4 to 6 digits (e.g. EMP0001)"
                value={newEmp.emp_code}
                onChange={(e) => setNewEmp({ ...newEmp, emp_code: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                required
              />
              <span className="text-[10px] text-slate-400">Pattern: ^EMP\d{'{4,6}'}$</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="John Doe"
                maxLength={100}
                value={newEmp.name}
                onChange={(e) => setNewEmp({ ...newEmp, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Email Address <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              placeholder="john.doe@company.com"
              maxLength={120}
              value={newEmp.email}
              onChange={(e) => setNewEmp({ ...newEmp, email: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Department <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Engineering"
              maxLength={50}
              value={newEmp.department}
              onChange={(e) => setNewEmp({ ...newEmp, department: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Shift Start (HH:MM) <span className="text-rose-500">*</span>
              </label>
              <input
                type="time"
                value={newEmp.shift_start}
                onChange={(e) => setNewEmp({ ...newEmp, shift_start: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Shift End (HH:MM) <span className="text-rose-500">*</span>
              </label>
              <input
                type="time"
                value={newEmp.shift_end}
                onChange={(e) => setNewEmp({ ...newEmp, shift_end: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Joined On (Date) <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              value={newEmp.joined_on}
              onChange={(e) => setNewEmp({ ...newEmp, joined_on: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addLoading}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {addLoading ? 'Creating...' : 'Create Employee'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
