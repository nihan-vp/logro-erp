import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building2, Briefcase, FileText, Users, DollarSign,
  Receipt, BarChart3, LogOut, ShieldAlert, ChevronDown, Landmark,
  ShieldCheck
} from 'lucide-react';
import SuperadminDashboard from './pages/SuperadminDashboard';
import { getAuthToken, getCurrentUser, setAuthToken, setCurrentUser as setClientUser } from './api/client';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Tasks from './pages/Tasks';
import AttendancePage from './pages/Attendance';
import ReportsPage from './pages/Reports';
import AccountantDashboard from './pages/AccountantDashboard';
import AccountantOverview from './pages/AccountantOverview';
import FinanceHub from './pages/FinanceHub';
import OfflineScreen from './pages/OfflineScreen';
import AppToasts from './components/AppToasts';
import { useConfirm } from './context/ConfirmContext';

export default function App() {
  const confirm = useConfirm();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>(() => localStorage.getItem('erp_activeTab') || 'dashboard');
  const [tabParams, setTabParams] = useState<any>(() => {
    const saved = localStorage.getItem('erp_tabParams');
    return saved ? JSON.parse(saved) : null;
  });
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('erp_activeTab', activeTab);
    if (tabParams) {
      localStorage.setItem('erp_tabParams', JSON.stringify(tabParams));
    } else {
      localStorage.removeItem('erp_tabParams');
    }
  }, [activeTab, tabParams]);

  useEffect(() => {
    const token = getAuthToken();
    const user = getCurrentUser();
    if (token && user) {
      setCurrentUser(user);
    }
  }, []);

  const handleLoginSuccess = (user: any) => {
    setCurrentUser(user);
    const isSuper = user.id === 'superadmin';
    // Only set default tab if no tab is stored, otherwise keep the one from localStorage
    if (!localStorage.getItem('erp_activeTab') || isSuper) {
      if (isSuper) {
        setActiveTab('superadmin');
      } else if (user.role === 'accountant') {
        setActiveTab('dashboard');
      } else if (user.role === 'manager') {
        setActiveTab('projects');
      } else {
        setActiveTab('dashboard');
      }
    }
  };

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'You will need to sign in again to access the ERP.',
      confirmLabel: 'Sign Out',
      variant: 'warning',
    });
    if (!ok) return;

    setAuthToken(null);
    setClientUser(null);
    setCurrentUser(null);
    setActiveTab('dashboard');
    localStorage.removeItem('erp_activeTab');
    localStorage.removeItem('erp_tabParams');
  };

  const navigateTo = useCallback((tab: string, params: any = null) => {
    setActiveTab(tab);
    setTabParams(params);
  }, []);

  const userRole = currentUser?.role || 'manager';
  const isSuperAdmin = currentUser?.id === 'superadmin';

  const projectsComponent = useMemo(() => (
    <Projects
      onNavigate={navigateTo}
      userRole={userRole}
      initialParams={tabParams}
    />
  ), [userRole, tabParams, navigateTo]);
  
  const superadminComponent = useMemo(() => (
    <SuperadminDashboard />
  ), []);

  const dashboardComponent = useMemo(() => (
    <Dashboard onNavigate={navigateTo} userRole={userRole} />
  ), [userRole, navigateTo]);

  const accountantOverviewComponent = useMemo(() => (
    <AccountantOverview onNavigate={navigateTo} />
  ), [navigateTo]);


  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const displayName = userRole === 'admin' ? 'Admin' : (currentUser.name || 'User');

  const navItems = [
    ...(isSuperAdmin ? [
      { id: 'superadmin', label: 'System Admin', icon: ShieldCheck },
    ] : userRole === 'admin' ? [
      { id: 'dashboard', label: 'Overview', icon: BarChart3 },
      { id: 'projects', label: 'Projects', icon: Building2 },
      { id: 'attendance', label: 'Crew', icon: Users },
      { id: 'reports', label: 'Audits', icon: FileText },
      { id: 'finance', label: 'Finance Hub', icon: DollarSign },
    ] : userRole === 'manager' ? [
      { id: 'projects', label: 'Projects', icon: Building2 },
      { id: 'attendance', label: 'Crew', icon: Users },
    ] : userRole === 'accountant' ? [
      { id: 'dashboard', label: 'Overview', icon: BarChart3 },
      { id: 'finance', label: 'Finance Hub', icon: DollarSign },
      { id: 'projects', label: 'Projects', icon: Building2 },
      { id: 'accountant', label: 'Accountant', icon: Landmark },
    ] : []),
  ];

  const renderContent = () => {
    if (isSuperAdmin) return superadminComponent;
    switch (activeTab) {
      case 'dashboard':
        if (userRole === 'admin') return dashboardComponent;
        if (userRole === 'accountant') return accountantOverviewComponent;
        return projectsComponent;
      case 'projects': return projectsComponent;
      case 'attendance':
        if (tabParams?.projectId && tabParams?.taskId) {
          return (
            <Projects
              onNavigate={navigateTo}
              userRole={userRole}
              initialParams={{ projectId: tabParams.projectId, taskId: tabParams.taskId, openSubTab: 'tasks' }}
            />
          );
        }
        return <AttendancePage />;
      case 'reports': return <ReportsPage />;
      case 'accountant': return <AccountantDashboard onNavigate={navigateTo} />;
      case 'finance': return <FinanceHub userRole={userRole} isActive={activeTab === 'finance'} />;
      default:
        if (userRole === 'admin') return dashboardComponent;
        if (userRole === 'accountant') return accountantOverviewComponent;
        return projectsComponent;
    }
  };

  return (
    <div id="app-root" className="min-h-screen bg-zinc-50 flex flex-col font-sans">
      <nav id="navbar" className="bg-white border-b border-zinc-200/80 sticky top-0 z-40 select-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center gap-2 cursor-pointer" onClick={() => navigateTo('dashboard')}>
                <div className="w-8 h-8 bg-zinc-950 text-white rounded-xl flex items-center justify-center">
                  <Landmark className="w-4.5 h-4.5" />
                </div>
                <div className="text-left leading-none">
                  <span className="text-sm font-black text-zinc-950 block tracking-tight">LOGRO ERP</span>
                </div>
              </div>

              <div className="hidden md:flex md:space-x-1 ml-6 items-center">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => navigateTo(item.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${isActive
                          ? 'bg-zinc-950 text-white shadow-sm'
                          : 'text-zinc-650 hover:bg-zinc-100 hover:text-zinc-900'
                        }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                  className="flex items-center gap-2 bg-zinc-50 border hover:bg-zinc-100 px-3 py-1.5 rounded-xl cursor-pointer text-xs font-semibold text-zinc-800 transition-colors"
                >
                  <div className="w-5 h-5 bg-zinc-250 text-zinc-800 border rounded-full flex items-center justify-center font-bold text-[10px]">
                    {displayName[0].toUpperCase()}
                  </div>
                  <span className="max-w-[70px] sm:max-w-[120px] truncate">{displayName}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                </button>

                {isProfileDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white border rounded-2xl shadow-lg py-2.5 z-50 text-xs text-zinc-700 animate-fade-in font-semibold border-zinc-200/60">
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 hover:bg-rose-50 hover:text-rose-600 transition-all text-zinc-700 font-bold flex items-center gap-2 cursor-pointer mt-1"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-500" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-20 md:pb-6">
        {userRole === 'manager' && (
          <div className="mb-4 bg-zinc-55 border border-zinc-200/60 rounded-xl p-2.5 text-[11px] text-zinc-500 flex items-center gap-2 select-none">
            <ShieldAlert className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>Site Manager Mode.</span>
          </div>
        )}
        {userRole === 'accountant' && (
          <div className="mb-4 bg-zinc-55 border border-zinc-200/60 rounded-xl p-2.5 text-[11px] text-zinc-500 flex items-center gap-2 select-none">
            <Landmark className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>Accountant Mode — manage office funds and payment approvals.</span>
          </div>
        )}
        <div className="bg-transparent">
          {renderContent()}
        </div>
      </main>

      <footer className="hidden md:block bg-white border-t py-4 text-center text-[10px] text-zinc-400 font-semibold select-none self-end w-full">
        <span>&copy; {new Date().getFullYear()} Construct ERP. All rights reserved.</span>
      </footer>

      <div id="mobile-bottom-nav" className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-zinc-200/80 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] px-1 py-1.5 z-40 flex justify-around items-center h-16 select-none">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigateTo(item.id)}
              className={`flex flex-col items-center justify-center flex-1 py-1 px-0.5 rounded-xl transition-all cursor-pointer ${isActive
                  ? 'text-zinc-950 scale-105'
                  : 'text-zinc-400 hover:text-zinc-600'
                }`}
            >
              <div className={`p-1.5 rounded-xl transition-all duration-300 ${isActive ? 'bg-zinc-950 text-white shadow-sm' : 'text-zinc-400'}`}>
                <Icon className="w-4 h-4" />
              </div>
              <span className={`text-[8.5px] font-bold tracking-tight truncate max-w-[50px] text-center mt-0.5 transition-all ${isActive ? 'text-zinc-950 font-black' : 'text-zinc-500'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
      <OfflineScreen />
      <AppToasts />
    </div>
  );
}
