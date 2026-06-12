import React, { useEffect, useState } from 'react';
import { 
  Building2, Briefcase, CheckCircle2,
  ArrowUpRight, ArrowDownRight, Receipt, RefreshCw, Landmark 
} from 'lucide-react';
import { api } from '../api/client';
import { notify } from '../utils/toast';

interface DashboardProps {
  onNavigate: (page: string, params?: any) => void;
  userRole: string;
}

export default function Dashboard({ onNavigate, userRole }: DashboardProps) {
  const [stats, setStats] = useState<any>(null);
  const [taskSummary, setTaskSummary] = useState<any[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getReportSummary();
      const summary = res.taskSummary || [];
      const apiStats = res.stats || {};
      setStats({
        ...apiStats,
        totalTasks: apiStats.totalTasks ?? summary.length,
        activeTasks: apiStats.activeTasks ?? summary.filter((t: any) => t.status === 'In Progress').length,
        completedTasks: apiStats.completedTasks ?? summary.filter((t: any) => t.status === 'Completed').length,
        pendingTasks: summary.filter((t: any) => t.status === 'Pending').length,
      });
      setTaskSummary(summary);
      setRecentExpenses(res.recentExpenses || []);
    } catch (err: any) {
      const message = err?.message || 'Failed to update summary dashboard';
      setError(message);
      notify.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Format currency helpers
  const formatCur = (num: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(num);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="w-10 h-10 border-4 border-zinc-900/10 border-t-zinc-900 rounded-full animate-spin"></div>
        <p className="text-zinc-500 text-sm mt-3 font-medium">Loading details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-center max-w-lg mx-auto my-12">
        <p className="text-sm font-semibold text-red-800">Refresh Error</p>
        <p className="text-xs text-red-600 mt-1">{error}</p>
        <button 
          onClick={fetchDashboardData}
          className="mt-3 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors"
        >
          Retry Load
        </button>
      </div>
    );
  }

  const profitLoss = stats?.overallProfitLoss || 0;
  const isProfit = profitLoss >= 0;

  const cardClass = 'bg-white border border-zinc-200/80 rounded-xl p-5 shadow-sm h-full flex flex-col';
  const cardLabelClass = 'text-xs font-semibold text-zinc-500 uppercase tracking-wider';
  const cardValueClass = 'text-2xl font-bold text-zinc-950';
  const sectionGridClass = 'grid gap-4';

  return (
    <div className="space-y-4 font-sans">
      
      {/* Upper Refresh Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950">Enterprise Overview</h1>
          <p className="text-xs sm:text-sm text-zinc-500">Overview metrics for active projects</p>
        </div>
        <button 
          onClick={fetchDashboardData}
          className="p-2 bg-white hover:bg-zinc-100 border border-zinc-200/80 rounded-xl transition-colors text-zinc-600 focus:outline-none"
          title="Refresh dashboard"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Main KPI Summary widgets */}
      <div className={`${sectionGridClass} grid-cols-2 md:grid-cols-4`}>
        {/* Total Projects */}
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-3">
            <span className={cardLabelClass}>Projects</span>
            <span className="p-1.5 rounded-lg bg-zinc-100 text-zinc-700">
              <Building2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-auto">
            <span className={`${cardValueClass} block`}>{stats?.totalProjects || 0}</span>
            <span className="text-[10px] text-zinc-400 font-medium block mt-1">Total registered</span>
          </div>
        </div>

        {/* Total Tasks */}
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-3">
            <span className={cardLabelClass}>Total Tasks</span>
            <span className="p-1.5 rounded-lg bg-zinc-100 text-zinc-700">
              <Briefcase className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-auto">
            <span className={`${cardValueClass} block`}>{stats?.totalTasks || 0}</span>
            <span className="text-[10px] text-zinc-500 font-medium flex items-center gap-1.5 mt-1 flex-wrap">
              {(stats?.pendingTasks || 0) > 0 && <span>{stats.pendingTasks} pending</span>}
              {(stats?.pendingTasks || 0) > 0 && (stats?.activeTasks || 0) > 0 && <span className="text-zinc-300">•</span>}
              {(stats?.activeTasks || 0) > 0 && <span>{stats.activeTasks} in progress</span>}
              {((stats?.pendingTasks || 0) > 0 || (stats?.activeTasks || 0) > 0) && (stats?.completedTasks || 0) > 0 && <span className="text-zinc-300">•</span>}
              {(stats?.completedTasks || 0) > 0 && (
                <span className="text-emerald-600 font-semibold flex items-center gap-0.5">
                  <CheckCircle2 className="w-3 h-3" />
                  {stats.completedTasks} complete
                </span>
              )}
              {(stats?.totalTasks || 0) > 0 && !(stats?.pendingTasks || stats?.activeTasks || stats?.completedTasks) && (
                <span>Across all projects</span>
              )}
            </span>
          </div>
        </div>

        {/* Total expenses */}
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-3">
            <span className={cardLabelClass}>Total Expenses</span>
            <span className="p-1.5 rounded-lg bg-zinc-100 text-zinc-700">
              <Receipt className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-auto">
            <span className={`${cardValueClass} block`}>{formatCur(stats?.totalExpenses || 0)}</span>
            <span className="text-[10px] text-amber-600 font-medium block mt-1">
              {(stats?.totalAssignedBudget && stats.totalExpenses) ? Math.round((stats.totalExpenses / stats.totalAssignedBudget) * 100) : 0}% of budget utilized
            </span>
          </div>
        </div>
        
        {/* Office Balance */}
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-3">
            <span className={cardLabelClass}>Office Balance</span>
            <span className="p-1.5 rounded-lg bg-zinc-100 text-zinc-700">
              <Landmark className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-auto">
            <span className={`${cardValueClass} block`}>{formatCur(stats?.officeBalance || 0)}</span>
            <span className="text-[10px] text-zinc-400 font-medium block mt-1">Available funds</span>
          </div>
        </div>
      </div>

      {/* Financial Health Checks */}
      <div className={`${sectionGridClass} grid-cols-1 md:grid-cols-2`}>
        {/* Profit/Loss Card */}
        <div className={`${cardClass} gap-3`}>
          <h2 className={cardLabelClass}>Operating Margin</h2>
          <div className="flex items-baseline gap-2">
            <span className={`${cardValueClass} tracking-tight ${isProfit ? 'text-emerald-700' : 'text-rose-700'}`}>
              {formatCur(profitLoss)}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${isProfit ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {isProfit ? <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> : <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />}
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed mt-auto">
            Calculated as total assigned budget less combined hardware, labor overheads, transport and materials costs.
          </p>
        </div>

        {/* Today's Labor Telemetry Card */}
        <div className={`${cardClass} gap-3`}>
          <h2 className={cardLabelClass}>Labor Attendance (Today)</h2>
          <div className="flex items-center justify-between">
            <div>
              <span className={`${cardValueClass} block`}>{stats?.todaysAttendanceCount || 0}</span>
              <span className="text-[10px] text-zinc-400 font-medium block mt-1">Workers logged present</span>
            </div>
            <div className="text-right">
              <span className={`${cardValueClass} block`}>{formatCur(stats?.todaysLabourCost || 0)}</span>
              <span className="text-[10px] text-zinc-400 font-medium block mt-1">Direct labor invoice today</span>
            </div>
          </div>
          {(userRole === 'admin' || userRole === 'manager') && (
            <button 
              onClick={() => onNavigate('attendance')}
              className="w-full text-center py-2 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 text-xs font-semibold rounded-lg border border-zinc-200/40 transition-colors mt-auto"
            >
              Manage Crew Roster
            </button>
          )}
        </div>
      </div>

      {/* Task wise progress summary and lists */}
      <div className={`${sectionGridClass} grid-cols-1 lg:grid-cols-2`}>
        {/* Task progress cards */}
        <div className={`${cardClass} gap-4 min-h-[320px]`}>
          <div className="flex items-center justify-between shrink-0">
            <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">Active Tasks</h2>
            <button 
              onClick={() => onNavigate('projects')}
              className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              View All Tasks
            </button>
          </div>

          <div className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-1">
            {taskSummary.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-8">No tasks recorded yet. Create a project and tasks to begin.</p>
            ) : (
              taskSummary.map((t: any) => {
                const percentage = t.budget > 0 ? (t.expenses / t.budget) * 100 : 0;
                const isOver = t.expenses > t.budget;
                return (
                  <div key={t.taskId} className="p-3 bg-zinc-50 rounded-xl space-y-2 border border-zinc-200/20">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-xs font-semibold text-zinc-900">{t.taskName}</h3>
                        <p className="text-[10px] text-zinc-500">{t.projectName}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        t.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' :
                        t.status === 'In Progress' ? 'bg-zinc-100 text-zinc-800' :
                        t.status === 'On Hold' ? 'bg-amber-50 text-amber-700' : 'bg-zinc-50 text-zinc-500'
                      }`}>
                        {t.status}
                      </span>
                    </div>

                    {/* Progress tracking */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-zinc-500">
                        <span>Work Done: <b className="text-zinc-950 font-medium">{t.progress}%</b></span>
                        <span className={isOver ? 'text-red-600 font-semibold' : 'text-zinc-500'}>
                          Spent: <b>{formatCur(t.expenses)}</b> / {formatCur(t.budget)}
                        </span>
                      </div>
                      <div className="w-full bg-zinc-200/80 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-300 ${isOver ? 'bg-rose-500' : 'bg-zinc-900'}`} 
                          style={{ width: `${Math.min(t.progress, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Expenses List */}
        <div className={`${cardClass} gap-4 min-h-[320px]`}>
          <div className="flex items-center justify-between shrink-0">
            <h2 className="text-sm font-semibold text-zinc-900 tracking-tight flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-zinc-500" />
              <span>Recent Expenses Logged</span>
            </h2>
            <button 
              onClick={() => onNavigate('finance')}
              className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              Log New
            </button>
          </div>

          <div className="divide-y divide-zinc-100 flex-1 min-h-0 overflow-y-auto pr-1">
            {recentExpenses.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-8">No expenses submitted yet.</p>
            ) : (
              recentExpenses.map((e: any) => (
                <div key={e.id} className="py-2.5 flex items-center justify-between text-xs font-medium">
                  <div>
                    <span className="text-zinc-900 font-semibold block">{e.paidTo}</span>
                    <span className="text-zinc-400 text-[10px] block">{e.category} • {e.taskName}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-zinc-900 font-bold block">{formatCur(e.amount)}</span>
                    <span className="text-zinc-400 text-[10px] block">{e.date}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
