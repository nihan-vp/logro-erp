import React, { useEffect, useState } from 'react';
import {
  Landmark, Clock, CheckCircle2, ArrowUpRight, ArrowDownRight,
  RefreshCw, Send, ClipboardList, Building2, DollarSign, Wallet,
  ChevronRight, AlertTriangle, Bell
} from 'lucide-react';
import { api } from '../api/client';
import { notify } from '../utils/toast';
import { OfficeTransaction, PaymentRequest } from '../types';
import { onRequestsUpdate, offRequestsUpdate } from '../api/socket';

type EnrichedPaymentRequest = PaymentRequest & { projectName: string; taskName: string };

const formatCur = (num: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);

const cardClass = 'bg-white border border-zinc-200/80 rounded-xl p-5 shadow-sm h-full flex flex-col';
const cardLabelClass = 'text-xs font-semibold text-zinc-500 uppercase tracking-wider';
const cardValueClass = 'text-2xl font-bold text-zinc-950';

const getPriorityStyle = (priority: PaymentRequest['priority']) => {
  switch (priority) {
    case 'High': return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'Medium': return 'bg-amber-50 text-amber-700 border-amber-200';
    default: return 'bg-zinc-100 text-zinc-600 border-zinc-200';
  }
};

interface AccountantOverviewProps {
  onNavigate: (tab: string, params?: any) => void;
}

export default function AccountantOverview({ onNavigate }: AccountantOverviewProps) {
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<OfficeTransaction[]>([]);
  const [requests, setRequests] = useState<EnrichedPaymentRequest[]>([]);
  const [totalProjects, setTotalProjects] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);

  const fetchData = async () => {
    if (!hasLoaded) setLoading(true);
    setError(null);
    try {
      const [fundRes, reqRes, projRes, taskRes, summaryRes] = await Promise.all([
        api.getOfficeFunds(),
        api.getPaymentRequests(),
        api.getProjects(),
        api.getTasks(),
        api.getReportSummary(),
      ]);
      const projectList = projRes.projects || [];
      const taskList = taskRes.tasks || [];
      setBalance(fundRes.officeFunds[0]?.balance || 0);
      setTransactions(fundRes.officeTransactions || []);
      setRequests(
        (reqRes.paymentRequests || []).map((r: PaymentRequest) => ({
          ...r,
          projectName: projectList.find((p: { id: string }) => p.id === r.projectId)?.projectName || 'Unknown Project',
          taskName: taskList.find((t: { id: string }) => t.id === r.taskId)?.taskName || 'Unknown Task',
        }))
      );
      setTotalProjects(summaryRes.stats?.totalProjects || projectList.length);
      setTotalExpenses(summaryRes.stats?.totalExpenses || 0);
      setHasLoaded(true);
    } catch (err: any) {
      const message = err?.message || 'Failed to load dashboard';
      setError(message);
      notify.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const handleUpdate = () => {
      fetchData();
    };
    onRequestsUpdate(handleUpdate);
    return () => {
      offRequestsUpdate(handleUpdate);
    };
  }, []);

  const today = new Date().toISOString().split('T')[0];
  const pendingRequests = requests.filter(r => r.status === 'Pending' && !r.adjustmentType);
  const paidRequests = requests.filter(r => r.status === 'Paid' && !r.adjustmentType);
  const totalPendingAmount = pendingRequests.reduce((sum, r) => sum + r.amount, 0);
  const totalPaidAmount = paidRequests.reduce((sum, r) => sum + r.amount, 0);
  const highPriorityPending = pendingRequests.filter(r => r.priority === 'High').length;

  const todayInflow = transactions
    .filter(t => t.type === 'Cash In' && t.date?.startsWith(today))
    .reduce((sum, t) => sum + t.amount, 0);
  const todayOutflow = transactions
    .filter(t => t.type === 'Cash Out' && t.date?.startsWith(today))
    .reduce((sum, t) => sum + t.amount, 0);
  const todayNet = todayInflow - todayOutflow;

  const latestPendingRequest = [...pendingRequests]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;

  const urgentPending = [...pendingRequests]
    .sort((a, b) => {
      if (latestPendingRequest) {
        if (a.id === latestPendingRequest.id) return -1;
        if (b.id === latestPendingRequest.id) return 1;
      }
      const priorityOrder = { High: 0, Medium: 1, Low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .slice(0, 5);

  const recentTransactions = [...transactions].reverse().slice(0, 5);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="w-10 h-10 border-4 border-zinc-900/10 border-t-zinc-900 rounded-full animate-spin" />
        <p className="text-zinc-500 text-sm mt-3 font-medium">Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-center max-w-lg mx-auto my-12">
        <p className="text-sm font-semibold text-red-800">Load Error</p>
        <p className="text-xs text-red-600 mt-1">{error}</p>
        <button
          onClick={() => fetchData()}
          className="mt-3 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const quickActions = [
    {
      label: 'Payment Approvals',
      desc: `${pendingRequests.length} pending`,
      icon: Wallet,
      tab: 'accountant',
      accent: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Finance Hub',
      desc: 'View all requests',
      icon: DollarSign,
      tab: 'finance',
      accent: 'bg-zinc-100 text-zinc-700',
    },
    {
      label: 'Projects',
      desc: `${totalProjects} active sites`,
      icon: Building2,
      tab: 'projects',
      accent: 'bg-blue-50 text-blue-700',
    },
  ];

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950">Finance Overview</h1>
          <p className="text-xs sm:text-sm text-zinc-500">Office funds, approvals and daily cash flow at a glance</p>
        </div>
        <button
          onClick={() => fetchData()}
          className="p-2.5 bg-white hover:bg-zinc-100 border border-zinc-200/80 rounded-xl transition-colors text-zinc-600 self-start sm:self-auto"
          title="Refresh dashboard"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Latest payment request alert */}
      {latestPendingRequest && (
        <div
          className={`relative overflow-hidden rounded-2xl border-2 p-4 sm:p-5 shadow-sm animate-fade-in ${
            latestPendingRequest.priority === 'High'
              ? 'bg-rose-50/80 border-rose-300 ring-2 ring-rose-200/60'
              : latestPendingRequest.priority === 'Medium'
                ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-200/60'
                : 'bg-sky-50/80 border-sky-300 ring-2 ring-sky-200/60'
          }`}
          role="alert"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <span className={`p-2.5 rounded-xl shrink-0 ${
                latestPendingRequest.priority === 'High'
                  ? 'bg-rose-100 text-rose-700'
                  : latestPendingRequest.priority === 'Medium'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-sky-100 text-sky-700'
              }`}>
                <Bell className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-950 text-white">
                    Latest Request
                  </span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${getPriorityStyle(latestPendingRequest.priority)}`}>
                    {latestPendingRequest.priority} Priority
                  </span>
                  <span className="text-[10px] text-zinc-500 font-medium">
                    Submitted {new Date(latestPendingRequest.createdAt).toLocaleString('en-IN', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-sm sm:text-base font-bold text-zinc-950">
                  New payment request — {formatCur(latestPendingRequest.amount)} to {latestPendingRequest.payeeName}
                </p>
                <p className="text-xs text-zinc-600 mt-1">
                  <span className="font-semibold">{latestPendingRequest.projectName}</span>
                  {' · '}
                  {latestPendingRequest.taskName}
                  {' · '}
                  <span className="capitalize">{latestPendingRequest.category}</span>
                  {latestPendingRequest.dueDate && (
                    <> · Due <span className="font-semibold">{latestPendingRequest.dueDate}</span></>
                  )}
                </p>
                {latestPendingRequest.description && (
                  <p className="text-[11px] text-zinc-500 mt-1.5 italic line-clamp-2">{latestPendingRequest.description}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => onNavigate('accountant')}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl text-xs sm:text-sm font-bold transition-colors shrink-0 w-full sm:w-auto"
            >
              <Wallet className="w-4 h-4" />
              Review & Pay
            </button>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {quickActions.map(action => {
          const Icon = action.icon;
          return (
            <button
              key={action.tab}
              onClick={() => onNavigate(action.tab)}
              className="flex items-center gap-3 p-4 bg-white border border-zinc-200/80 rounded-xl shadow-sm hover:border-zinc-300 hover:shadow transition-all text-left group"
            >
              <span className={`p-2.5 rounded-xl shrink-0 ${action.accent}`}>
                <Icon className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-zinc-950 block">{action.label}</span>
                <span className="text-[10px] text-zinc-500 font-medium">{action.desc}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-600 transition-colors shrink-0" />
            </button>
          );
        })}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-3">
            <span className={cardLabelClass}>Office Balance</span>
            <span className="p-1.5 rounded-lg bg-zinc-100 text-zinc-700">
              <Landmark className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-auto">
            <span className={`${cardValueClass} block`}>{formatCur(balance)}</span>
            <span className="text-[10px] text-zinc-400 font-medium block mt-1">Available funds</span>
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between mb-3">
            <span className={cardLabelClass}>Pending Approvals</span>
            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-700">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-auto">
            <span className={`${cardValueClass} block`}>{pendingRequests.length}</span>
            <span className="text-[10px] text-amber-600 font-medium block mt-1">
              {formatCur(totalPendingAmount)} awaiting
              {highPriorityPending > 0 && ` · ${highPriorityPending} urgent`}
            </span>
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between mb-3">
            <span className={cardLabelClass}>Total Paid Out</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-auto">
            <span className={`${cardValueClass} block`}>{formatCur(totalPaidAmount)}</span>
            <span className="text-[10px] text-emerald-600 font-medium block mt-1">
              {paidRequests.length} request{paidRequests.length !== 1 ? 's' : ''} processed
            </span>
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between mb-3">
            <span className={cardLabelClass}>Today's Net Flow</span>
            <span className={`p-1.5 rounded-lg ${todayNet >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {todayNet >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            </span>
          </div>
          <div className="mt-auto">
            <span className={`${cardValueClass} block ${todayNet >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {todayNet >= 0 ? '+' : '−'} {formatCur(Math.abs(todayNet))}
            </span>
            <span className="text-[10px] text-zinc-400 font-medium block mt-1">
              In {formatCur(todayInflow)} · Out {formatCur(todayOutflow)}
            </span>
          </div>
        </div>
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`${cardClass} gap-3`}>
          <h2 className={cardLabelClass}>Enterprise Spend</h2>
          <span className={`${cardValueClass} text-zinc-950`}>{formatCur(totalExpenses)}</span>
          <p className="text-xs text-zinc-400 leading-relaxed mt-auto">
            Combined materials, labour and operational costs across {totalProjects} registered project{totalProjects !== 1 ? 's' : ''}.
          </p>
        </div>

        <div className={`${cardClass} gap-3`}>
          <h2 className={cardLabelClass}>Action Required</h2>
          {pendingRequests.length === 0 ? (
            <div className="flex items-center gap-2 mt-1">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              <span className="text-sm font-semibold text-emerald-700">All payments are up to date</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              <span className="text-sm font-semibold text-zinc-900">
                {pendingRequests.length} payment{pendingRequests.length !== 1 ? 's' : ''} need your review
              </span>
            </div>
          )}
          <button
            onClick={() => onNavigate('accountant')}
            className="w-full text-center py-2 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 text-xs font-semibold rounded-lg border border-zinc-200/40 transition-colors mt-auto"
          >
            Open Accountant Workspace
          </button>
        </div>
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${cardClass} gap-4 min-h-[300px]`}>
          <div className="flex items-center justify-between shrink-0">
            <h2 className="text-sm font-semibold text-zinc-900 tracking-tight flex items-center gap-1.5">
              <Send className="w-4 h-4 text-zinc-500" />
              Urgent Pending Requests
            </h2>
            <button
              onClick={() => onNavigate('accountant')}
              className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              View All
            </button>
          </div>
          <div className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-1">
            {urgentPending.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-8">No pending requests. You're all caught up.</p>
            ) : (
              urgentPending.map(r => {
                const isLatest = r.id === latestPendingRequest?.id;
                return (
                <div
                  key={r.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                    isLatest
                      ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-200/70 shadow-sm'
                      : 'bg-zinc-50 border-zinc-200/20'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-zinc-950 truncate">{r.payeeName}</span>
                      {isLatest && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-zinc-950 text-white">
                          Latest
                        </span>
                      )}
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${getPriorityStyle(r.priority)}`}>
                        {r.priority}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 truncate mt-0.5">{r.projectName} · {r.taskName}</p>
                    <p className="text-[10px] text-zinc-400">Due {r.dueDate}</p>
                  </div>
                  <span className={`text-sm font-extrabold shrink-0 ${isLatest ? 'text-amber-800' : 'text-zinc-950'}`}>
                    {formatCur(r.amount)}
                  </span>
                </div>
              );
              })
            )}
          </div>
        </div>

        <div className={`${cardClass} gap-4 min-h-[300px]`}>
          <div className="flex items-center justify-between shrink-0">
            <h2 className="text-sm font-semibold text-zinc-900 tracking-tight flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4 text-zinc-500" />
              Recent Transactions
            </h2>
            <button
              onClick={() => onNavigate('accountant')}
              className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              Full Ledger
            </button>
          </div>
          <div className="divide-y divide-zinc-100 flex-1 min-h-0 overflow-y-auto pr-1">
            {recentTransactions.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-8">No transactions recorded yet.</p>
            ) : (
              recentTransactions.map(t => (
                <div key={t.id} className="py-2.5 flex items-center justify-between text-xs font-medium">
                  <div className="min-w-0 flex-1 pr-3">
                    <span className="text-zinc-900 font-semibold block truncate">{t.description}</span>
                    <span className="text-zinc-400 text-[10px] block">
                      {new Date(t.date).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <span className={`font-bold shrink-0 ${t.type === 'Cash In' ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {t.type === 'Cash In' ? '+' : '−'} {formatCur(t.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
