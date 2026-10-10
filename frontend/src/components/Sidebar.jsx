import React from 'react';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  ClipboardEdit,
  UserCheck,
  TrendingUp,
  Award,
  Activity,
  Layers,
  ChevronRight,
  Server
} from 'lucide-react';

export const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'employees', label: 'Employees', icon: Users },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { id: 'regularization', label: 'Regularization', icon: ClipboardEdit },
  { id: 'employee-analytics', label: 'Employee Analytics', icon: UserCheck },
  { id: 'dept-analytics', label: 'Department Analytics', icon: TrendingUp },
  { id: 'leaderboard', label: 'Late Leaderboard', icon: Award },
  { id: 'diagnostics', label: 'API & Diagnostics', icon: Activity },
];

export const Sidebar = ({ activeTab, setActiveTab, isOpen, setIsOpen, isHealthy }) => {
  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand header */}
        <div className="h-16 flex items-center px-6 border-b border-slate-800 gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-brand-500/20">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
              HROne
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400 border border-brand-500/30">
                Pulse
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium">Attendance & Analytics</div>
          </div>
        </div>

        {/* Navigation list */}
        <div className="flex-1 py-4 px-3 overflow-y-auto space-y-1">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Main Menu
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {isActive && <ChevronRight className="w-4 h-4 text-white/70" />}
              </button>
            );
          })}
        </div>

        {/* Backend Connectivity Status Footer */}
        <div className="p-4 border-t border-slate-800">
          <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Server className="w-4 h-4 text-slate-400" />
              <div>
                <div className="text-xs font-semibold text-slate-200">MongoDB API</div>
                <div className="text-[11px] text-slate-400">Atlas 7.0 (IST)</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  isHealthy ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                }`}
              />
              <span
                className={`text-[11px] font-semibold ${
                  isHealthy ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {isHealthy ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
