import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { NotificationToast } from './components/NotificationToast';
import { PunchInModal, PunchOutModal } from './components/PunchModals';
import { checkHealth, getEmployees } from './services/api';

import { OverviewPage } from './pages/OverviewPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { AttendancePage } from './pages/AttendancePage';
import { RegularizationPage } from './pages/RegularizationPage';
import { EmployeeAnalyticsPage } from './pages/EmployeeAnalyticsPage';
import { DepartmentAnalyticsPage } from './pages/DepartmentAnalyticsPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';

export function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHealthy, setIsHealthy] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notification, setNotification] = useState(null);

  // Global modals
  const [isPunchInOpen, setIsPunchInOpen] = useState(false);
  const [isPunchOutOpen, setIsPunchOutOpen] = useState(false);
  const [employees, setEmployees] = useState([]);

  // Cross-page navigation parameters (e.g. from attendance to regularization)
  const [regularizationParams, setRegularizationParams] = useState(null);

  const notify = (notif) => {
    setNotification(notif);
    if (notif.duration !== 0) {
      setTimeout(() => {
        setNotification(null);
      }, notif.duration || 4500);
    }
  };

  // Health check polling
  const runHealthCheck = async () => {
    try {
      const res = await checkHealth();
      setIsHealthy(res.status === 'ok');
    } catch (err) {
      setIsHealthy(false);
    }
  };

  // Load employee list for modals
  const loadEmployeesForModals = async () => {
    try {
      const res = await getEmployees({ page_size: 100 });
      setEmployees(res.items || []);
    } catch (err) {
      // non-blocking
    }
  };

  useEffect(() => {
    runHealthCheck();
    loadEmployeesForModals();
    const interval = setInterval(runHealthCheck, 15000); // 15s health ping
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([runHealthCheck(), loadEmployeesForModals()]);
    // Allow state to trigger child component refetches
    setTimeout(() => {
      setIsRefreshing(false);
      notify({ type: 'info', message: 'Dashboard data refreshed.' });
    }, 500);
  };

  const handleNavigate = (tabId, params = null) => {
    if (tabId === 'regularization' && params) {
      setRegularizationParams(params);
    }
    setActiveTab(tabId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderActivePage = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <OverviewPage
            onNavigate={handleNavigate}
            onOpenPunchIn={() => setIsPunchInOpen(true)}
            onOpenPunchOut={() => setIsPunchOutOpen(true)}
          />
        );
      case 'employees':
        return <EmployeesPage onNotify={notify} />;
      case 'attendance':
        return (
          <AttendancePage
            onNavigate={handleNavigate}
            onOpenPunchIn={() => setIsPunchInOpen(true)}
            onOpenPunchOut={() => setIsPunchOutOpen(true)}
            onNotify={notify}
          />
        );
      case 'regularization':
        return (
          <RegularizationPage
            initialParams={regularizationParams}
            onNotify={notify}
          />
        );
      case 'employee-analytics':
        return <EmployeeAnalyticsPage onNotify={notify} />;
      case 'dept-analytics':
        return <DepartmentAnalyticsPage onNotify={notify} />;
      case 'leaderboard':
        return <LeaderboardPage onNotify={notify} />;
      case 'diagnostics':
        return <DiagnosticsPage onNotify={notify} />;
      default:
        return (
          <OverviewPage
            onNavigate={handleNavigate}
            onOpenPunchIn={() => setIsPunchInOpen(true)}
            onOpenPunchOut={() => setIsPunchOutOpen(true)}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        isHealthy={isHealthy}
      />

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen">
        <Header
          activeTab={activeTab}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onOpenPunchIn={() => setIsPunchInOpen(true)}
          onOpenPunchOut={() => setIsPunchOutOpen(true)}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />

        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          {renderActivePage()}
        </main>

        {/* Global Footer */}
        <footer className="border-t border-slate-200 bg-white py-4 px-6 text-center text-xs text-slate-500">
          <span>HROne Employee Attendance & Analytics API • Built with FastAPI, MongoDB 7.0 & React Vite</span>
        </footer>
      </div>

      {/* Quick Punch In Modal */}
      <PunchInModal
        isOpen={isPunchInOpen}
        onClose={() => setIsPunchInOpen(false)}
        employees={employees}
        onSuccess={(msg) => {
          notify({ type: 'success', message: msg });
          handleRefresh();
        }}
        onError={(msg) => notify({ type: 'error', message: msg })}
      />

      {/* Quick Punch Out Modal */}
      <PunchOutModal
        isOpen={isPunchOutOpen}
        onClose={() => setIsPunchOutOpen(false)}
        employees={employees}
        onSuccess={(msg) => {
          notify({ type: 'success', message: msg });
          handleRefresh();
        }}
        onError={(msg) => notify({ type: 'error', message: msg })}
      />

      {/* Notification Toast */}
      <NotificationToast notification={notification} onClose={() => setNotification(null)} />
    </div>
  );
}

export default App;
