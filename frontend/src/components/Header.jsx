import React, { useState, useEffect } from 'react';
import { Menu, Clock, LogIn, LogOut, RefreshCw } from 'lucide-react';
import { navItems } from './Sidebar';

export const Header = ({
  activeTab,
  onOpenSidebar,
  onOpenPunchIn,
  onOpenPunchOut,
  onRefresh,
  isRefreshing,
}) => {
  const [currentTimeIST, setCurrentTimeIST] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(now);
      setCurrentTimeIST(`${timeStr} IST`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const currentNav = navItems.find((n) => n.id === activeTab) || { label: 'Dashboard' };

  return (
    <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-30 px-4 md:px-8 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">
            {currentNav.label}
          </h1>
          <p className="hidden md:block text-xs text-slate-500">
            Real-time Employee Attendance & Analytics
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 md:gap-3">
        {/* IST Clock */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-600">
          <Clock className="w-3.5 h-3.5 text-brand-600" />
          <span>{currentTimeIST}</span>
        </div>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors"
          title="Refresh current data"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-brand-600' : ''}`} />
        </button>

        {/* Quick Punch In Button */}
        <button
          onClick={onOpenPunchIn}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-all"
        >
          <LogIn className="w-3.5 h-3.5" />
          <span>Punch In</span>
        </button>

        {/* Quick Punch Out Button */}
        <button
          onClick={onOpenPunchOut}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 shadow-sm transition-all"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Punch Out</span>
        </button>
      </div>
    </header>
  );
};
