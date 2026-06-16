import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { onRequestsUpdate, offRequestsUpdate } from '../api/socket';
import {
  Wallet, Send, ClipboardList, Plus, X, CheckCircle2, Clock,
  RefreshCw, Landmark, ArrowDownRight, ArrowUpRight, Search,
  ChevronLeft, ChevronRight, Building2
} from 'lucide-react';
import { notify } from '../utils/toast';
import { useConfirm } from '../context/ConfirmContext';
import { OfficeTransaction, PaymentRequest, Project, Task } from '../types';

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

const inputClass =
  'w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-zinc-950 text-xs sm:text-sm';
const labelClass = 'block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1';

const ROWS_PER_PAGE_OPTIONS = [5, 10, 25, 50];
const ROWS_PER_PAGE_STORAGE_KEY = 'erp_accountant_rows_per_page';
const TABLE_ROW_HEIGHT_PX = 56;

const getStoredRowsPerPage = (): number => {
  const stored = localStorage.getItem(ROWS_PER_PAGE_STORAGE_KEY);
  if (!stored) return 10;
  const parsed = Number(stored);
  return ROWS_PER_PAGE_OPTIONS.includes(parsed) ? parsed : 10;
};

function TablePagination({
  totalItems,
  rowsPerPage,
  currentPage,
  onRowsPerPageChange,
  onPageChange,
  idPrefix,
}: {
  totalItems: number;
  rowsPerPage: number;
  currentPage: number;
  onRowsPerPageChange: (n: number) => void;
  onPageChange: (page: number) => void;
  idPrefix: string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / rowsPerPage));
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * rowsPerPage;
  const rangeStart = totalItems === 0 ? 0 : startIndex + 1;
  const rangeEnd = Math.min(startIndex + rowsPerPage, totalItems);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3 py-3 border-t border-zinc-100 bg-zinc-50/50 rounded-b-xl">
      <p className="text-[11px] text-zinc-500 font-medium">
        Showing <span className="font-semibold text-zinc-700">{rangeStart}–{rangeEnd}</span> of{' '}
        <span className="font-semibold text-zinc-700">{totalItems}</span>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor={`${idPrefix}-rows-per-page`} className="text-[10px] font-bold text-zinc-400 uppercase whitespace-nowrap">
            Rows per page
          </label>
          <select
            id={`${idPrefix}-rows-per-page`}
            value={rowsPerPage}
            onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
            className="bg-white border border-zinc-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-zinc-700 outline-none focus:ring-1 focus:ring-zinc-900"
          >
            {ROWS_PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, activePage - 1))}
            disabled={activePage <= 1}
            className="p-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-zinc-600 min-w-[72px] text-center">
            {activePage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, activePage + 1))}
            disabled={activePage >= totalPages}
            className="p-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AccountantDashboard({ onNavigate }: { onNavigate: (tab: string, params?: any) => void }) {
  const confirm = useConfirm();
  const [funds, setFunds] = useState<{ balance: number } | null>(null);
  const [transactions, setTransactions] = useState<OfficeTransaction[]>([]);
  const [requests, setRequests] = useState<EnrichedPaymentRequest[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInflowForm, setShowInflowForm] = useState(false);
  const [inflowAmount, setInflowAmount] = useState('');
  const [inflowDesc, setInflowDesc] = useState('');
  const [inflowDate, setInflowDate] = useState(new Date().toISOString().slice(0, 16));
  const [inflowProject, setInflowProject] = useState('');
  const [inflowSource, setInflowSource] = useState('');
  const [inflowMethod, setInflowMethod] = useState('');
  const [inflowRef, setInflowRef] = useState('');
  const [inflowType, setInflowType] = useState('client payment');
  const [inflowSubmitError, setInflowSubmitError] = useState<string | null>(null);
  const [requestSearch, setRequestSearch] = useState('');
  const [txnSearch, setTxnSearch] = useState('');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rowsPerPage, setRowsPerPage] = useState(getStoredRowsPerPage);
  const [reqPage, setReqPage] = useState(1);
  const [txnPage, setTxnPage] = useState(1);

  // Partial Payment Modal States
  const [activeRequest, setActiveRequest] = useState<EnrichedPaymentRequest | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payNowAmount, setPayNowAmount] = useState('');
  const [payNowMethod, setPayNowMethod] = useState('Bank Transfer');
  const [payNowNotes, setPayNowNotes] = useState('');
  const [payNowError, setPayNowError] = useState<string | null>(null);

  const fetchAccountantData = async () => {
    if (!hasLoaded) setLoading(true);
    setError(null);
    try {
      const [fundRes, reqRes, projRes, taskRes] = await Promise.all([
        api.getOfficeFunds(),
        api.getPaymentRequests(),
        api.getProjects(),
        api.getTasks(),
      ]);
      const projectList: Project[] = projRes.projects || [];
      const taskList: Task[] = taskRes.tasks || [];
      setFunds(fundRes.officeFunds[0] || { balance: 0 });
      setTransactions(fundRes.officeTransactions || []);
      setRequests(
        (reqRes.paymentRequests || []).map((r: PaymentRequest) => ({
          ...r,
          projectName: projectList.find(p => p.id === r.projectId)?.projectName || 'Unknown Project',
          taskName: taskList.find(t => t.id === r.taskId)?.taskName || 'Unknown Task',
        }))
      );
      setProjects(projectList);
      setHasLoaded(true);
    } catch (err: any) {
      const message = err?.message || 'Failed to fetch accountant data';
      setError(message);
      notify.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccountantData();
  }, []);

  useEffect(() => {
    const handleUpdate = () => {
      fetchAccountantData();
    };
    onRequestsUpdate(handleUpdate);
    return () => {
      offRequestsUpdate(handleUpdate);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(ROWS_PER_PAGE_STORAGE_KEY, String(rowsPerPage));
  }, [rowsPerPage]);

  useEffect(() => {
    setReqPage(1);
  }, [requestSearch, rowsPerPage]);

  useEffect(() => {
    setTxnPage(1);
  }, [txnSearch, rowsPerPage]);

  const handleApprove = async (request: EnrichedPaymentRequest) => {
    if (!request.adjustmentType) {
      const history = request.paymentHistory || [];
      const paidSoFar = history.reduce((sum, item) => sum + item.amount, 0);
      const remaining = Math.max(0, request.amount - paidSoFar);

      setActiveRequest(request);
      setPayNowAmount(String(remaining));
      setPayNowMethod('Bank Transfer');
      setPayNowNotes('');
      setPayNowError(null);
      setShowPayModal(true);
      return;
    }

    let title = 'Approve and pay?';
    let message = `Process payment of ${formatCur(request.amount)} to ${request.payeeName}? This will record the payout and update office funds.`;
    let confirmLabel = 'Approve & Pay';
    let variant: 'default' | 'warning' | 'danger' = 'warning';

    if (request.adjustmentType === 'Edit') {
      title = 'Approve edit request?';
      message = `Are you sure you want to approve the edit request for ${request.payeeName}? This will modify the original expense to ${formatCur(request.amount)} and adjust office funds accordingly.`;
      confirmLabel = 'Approve & Edit';
      variant = 'warning';
    } else if (request.adjustmentType === 'Delete') {
      title = 'Approve deletion request?';
      message = `Are you sure you want to approve the deletion request for ${request.payeeName}? This will delete the original expense/payment and refund the amount back to office funds.`;
      confirmLabel = 'Approve & Delete';
      variant = 'danger';
    }

    const ok = await confirm({
      title,
      message,
      confirmLabel,
      variant,
    });
    if (!ok) return;

    setApprovingId(request.id);
    try {
      await api.createPayment({
        projectId: request.projectId,
        taskId: request.taskId,
        payeeType: request.category === 'Worker' ? 'Worker' : 'Supplier',
        payeeName: request.payeeName,
        amount: request.amount,
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'Bank Transfer',
        paymentStatus: 'Paid',
        notes: request.description,
        requestId: request.id,
      });
      fetchAccountantData();
      notify.success(
        request.adjustmentType === 'Edit'
          ? 'Edit request approved and processed successfully.'
          : request.adjustmentType === 'Delete'
            ? 'Deletion request approved and processed successfully.'
            : 'Payment processed successfully.'
      );
    } catch (err: any) {
      notify.error(err.message || 'Error processing payment.');
    } finally {
      setApprovingId(null);
    }
  };

  const handlePartialPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRequest) return;

    const amt = Number(payNowAmount);
    const history = activeRequest.paymentHistory || [];
    const paidSoFar = history.reduce((sum, item) => sum + item.amount, 0);
    const remaining = Math.max(0, activeRequest.amount - paidSoFar);

    if (isNaN(amt) || amt <= 0) {
      setPayNowError('Payment amount must be greater than 0.');
      return;
    }

    if (amt > remaining) {
      setPayNowError(`Payment amount cannot exceed the remaining balance of ₹${remaining.toLocaleString('en-IN')}.`);
      return;
    }

    if (funds && funds.balance < amt) {
      setPayNowError(`Insufficient office balance. Available fund: ₹${funds.balance.toLocaleString('en-IN')}.`);
      return;
    }

    setPayNowError(null);
    setApprovingId(activeRequest.id);

    try {
      await api.createPayment({
        projectId: activeRequest.projectId,
        taskId: activeRequest.taskId,
        payeeType: activeRequest.category === 'Worker' ? 'Worker' : 'Supplier',
        payeeName: activeRequest.payeeName,
        amount: amt,
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: payNowMethod,
        paymentStatus: 'Paid',
        notes: payNowNotes || activeRequest.description,
        requestId: activeRequest.id,
      });

      setShowPayModal(false);
      setActiveRequest(null);
      fetchAccountantData();
      notify.success('Payment installment processed successfully.');
    } catch (err: any) {
      setPayNowError(err.message || 'Error processing installment payment.');
    } finally {
      setApprovingId(null);
    }
  };

  const handleDecline = async (request: EnrichedPaymentRequest) => {
    const ok = await confirm({
      title: 'Decline and cancel request?',
      message: `Are you sure you want to decline and cancel the request for ${formatCur(request.amount)} to ${request.payeeName}? This action cannot be undone.`,
      confirmLabel: 'Decline Request',
      variant: 'danger',
    });
    if (!ok) return;

    setApprovingId(request.id);
    try {
      await api.deletePaymentRequest(request.id);
      fetchAccountantData();
      notify.success('Payment request declined and cancelled.');
    } catch (err: any) {
      notify.error(err.message || 'Error declining payment request.');
    } finally {
      setApprovingId(null);
    }
  };

  const resetInflowForm = () => {
    setInflowAmount('');
    setInflowDesc('');
    setInflowDate(new Date().toISOString().slice(0, 16));
    setInflowProject('');
    setInflowSource('');
    setInflowMethod('');
    setInflowRef('');
    setInflowType('client payment');
    setInflowSubmitError(null);
  };

  const handleInflowSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const ok = await confirm({
      title: 'Record cash inflow?',
      message: `Record ${formatCur(Number(inflowAmount))} cash inflow${inflowDesc ? ` for "${inflowDesc}"` : ''}? Office balance will be updated.`,
      confirmLabel: 'Record Inflow',
      variant: 'default',
    });
    if (!ok) return;

    try {
      setInflowSubmitError(null);
      await api.postOfficeFund({
        type: 'Cash In',
        amount: Number(inflowAmount),
        description: inflowDesc,
        date: inflowDate,
        projectId: inflowProject,
        source: inflowSource,
        paymentMethod: inflowMethod,
        reference: inflowRef,
        inflowType,
      });
      resetInflowForm();
      setShowInflowForm(false);
      fetchAccountantData();
      notify.success('Inflow recorded successfully.');
    } catch (err: any) {
      const message = err.message || 'Error recording inflow.';
      setInflowSubmitError(message);
      notify.error(message);
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const pendingRequests = requests.filter(r => (r.status === 'Pending' || r.status === 'Partially Paid') && !r.adjustmentType);
  const totalPendingAmount = pendingRequests.reduce((sum, r) => {
    const paid = (r.paymentHistory || []).reduce((s, item) => s + item.amount, 0);
    return sum + (r.amount - paid);
  }, 0);
  const processedToday = transactions.filter(t => t.date?.startsWith(today)).length;
  const todayInflow = transactions
    .filter(t => t.type === 'Cash In' && t.date?.startsWith(today))
    .reduce((sum, t) => sum + t.amount, 0);
  const todayOutflow = transactions
    .filter(t => t.type === 'Cash Out' && t.date?.startsWith(today))
    .reduce((sum, t) => sum + t.amount, 0);

  const filteredPending = pendingRequests.filter(r => {
    const q = requestSearch.toLowerCase();
    return (
      r.payeeName.toLowerCase().includes(q) ||
      r.projectName.toLowerCase().includes(q) ||
      r.taskName.toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q)
    );
  });

  const filteredTransactions = [...transactions]
    .reverse()
    .filter(t => {
      const q = txnSearch.toLowerCase();
      return (
        (t.description || '').toLowerCase().includes(q) ||
        (t.source || '').toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q)
      );
    });

  const reqTotalPages = Math.max(1, Math.ceil(filteredPending.length / rowsPerPage));
  const reqActivePage = Math.min(reqPage, reqTotalPages);
  const reqStartIndex = (reqActivePage - 1) * rowsPerPage;
  const paginatedPending = filteredPending.slice(reqStartIndex, reqStartIndex + rowsPerPage);
  const reqEmptyRowCount = Math.max(0, rowsPerPage - paginatedPending.length);
  const reqTableBodyHeight = rowsPerPage * TABLE_ROW_HEIGHT_PX;

  const txnTotalPages = Math.max(1, Math.ceil(filteredTransactions.length / rowsPerPage));
  const txnActivePage = Math.min(txnPage, txnTotalPages);
  const txnStartIndex = (txnActivePage - 1) * rowsPerPage;
  const paginatedTransactions = filteredTransactions.slice(txnStartIndex, txnStartIndex + rowsPerPage);
  const txnEmptyRowCount = Math.max(0, rowsPerPage - paginatedTransactions.length);
  const txnTableBodyHeight = rowsPerPage * TABLE_ROW_HEIGHT_PX;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="w-10 h-10 border-4 border-zinc-900/10 border-t-zinc-900 rounded-full animate-spin" />
        <p className="text-zinc-500 text-sm mt-3 font-medium">Loading accountant data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-center max-w-lg mx-auto my-12">
        <p className="text-sm font-semibold text-red-800">Load Error</p>
        <p className="text-xs text-red-600 mt-1">{error}</p>
        <button
          onClick={() => fetchAccountantData()}
          className="mt-3 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950">Accountant</h1>
          <p className="text-xs sm:text-sm text-zinc-500">Office funds, payment approvals & transaction ledger</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            onClick={() => fetchAccountantData()}
            className="p-2.5 bg-white hover:bg-zinc-100 border border-zinc-200/80 rounded-xl transition-colors text-zinc-600"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => { resetInflowForm(); setShowInflowForm(true); }}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-zinc-950 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-zinc-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Record Inflow</span>
          </button>
        </div>
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
            <span className={`${cardValueClass} block`}>{formatCur(funds?.balance || 0)}</span>
            <span className="text-[10px] text-zinc-400 font-medium block mt-1">Available funds</span>
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between mb-3">
            <span className={cardLabelClass}>Pending Requests</span>
            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-700">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-auto">
            <span className={`${cardValueClass} block`}>{pendingRequests.length}</span>
            <span className="text-[10px] text-amber-600 font-medium block mt-1">
              {formatCur(totalPendingAmount)} awaiting approval
            </span>
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between mb-3">
            <span className={cardLabelClass}>Today's Inflow</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
              <ArrowUpRight className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-auto">
            <span className={`${cardValueClass} block text-emerald-700`}>{formatCur(todayInflow)}</span>
            <span className="text-[10px] text-emerald-600 font-medium block mt-1">
              {processedToday} transaction{processedToday !== 1 ? 's' : ''} today
            </span>
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between mb-3">
            <span className={cardLabelClass}>Today's Outflow</span>
            <span className="p-1.5 rounded-lg bg-rose-50 text-rose-700">
              <ArrowDownRight className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-auto">
            <span className={`${cardValueClass} block text-rose-700`}>{formatCur(todayOutflow)}</span>
            <span className="text-[10px] text-rose-600 font-medium block mt-1">Payments processed today</span>
          </div>
        </div>
      </div>

      {/* Pending Payment Requests */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-900 tracking-tight flex items-center gap-1.5">
            <Send className="w-4 h-4 text-zinc-500" />
            Pending Payment Requests
          </h2>
          <button
            onClick={() => onNavigate('finance')}
            className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 transition-colors text-left sm:text-right"
          >
            View Finance Hub
          </button>
        </div>

        <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm">
          <div className="relative mb-3">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Search payee, project or task..."
              value={requestSearch}
              onChange={e => setRequestSearch(e.target.value)}
              className="w-full text-xs sm:text-sm pl-9 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:bg-white transition-all text-zinc-900"
            />
          </div>

          {filteredPending.length === 0 ? (
            <div className="p-8 border border-dashed rounded-xl text-center bg-zinc-50">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-xs text-zinc-500 font-medium">No pending payment requests.</p>
              <p className="text-[10px] text-zinc-400 mt-1">All caught up — new requests appear here from Finance Hub.</p>
            </div>
          ) : (
            <div className="border border-zinc-200/80 rounded-xl overflow-hidden -mx-1">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-zinc-600 border-collapse min-w-[640px]">
                  <thead>
                    <tr className="bg-zinc-50 text-zinc-400 uppercase font-bold text-[9px] border-b border-zinc-200">
                      <th className="py-3 px-3">Payee</th>
                      <th className="py-3 px-3">Project / Task</th>
                      <th className="py-3 px-3">Category</th>
                      <th className="py-3 px-3 text-right">Amount</th>
                      <th className="py-3 px-3">Due</th>
                      <th className="py-3 px-3">Priority</th>
                      <th className="py-3 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody
                    className="divide-y divide-zinc-100 text-zinc-900"
                    style={{ height: reqTableBodyHeight }}
                  >
                    {paginatedPending.map(r => (
                      <tr key={r.id} className="hover:bg-zinc-50/50 transition-colors" style={{ height: TABLE_ROW_HEIGHT_PX }}>
                        <td className="px-3 align-middle">
                          <span className="font-bold text-zinc-950 block">{r.payeeName}</span>
                          {r.description && (
                            <span className="text-[10px] text-zinc-400 italic line-clamp-1 block mt-0.5">{r.description}</span>
                          )}
                        </td>
                        <td className="px-3 align-middle">
                          <span className="font-medium text-zinc-700 block">{r.projectName}</span>
                          <span className="text-[10px] text-zinc-400 block">{r.taskName}</span>
                        </td>
                        <td className="px-3 align-middle">
                          <span className="text-[10px] font-semibold text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded">{r.category}</span>
                        </td>
                        <td className="px-3 align-middle text-right whitespace-nowrap">
                          {(() => {
                            const paid = (r.paymentHistory || []).reduce((s, it) => s + it.amount, 0);
                            const remaining = Math.max(0, r.amount - paid);
                            return (
                              <div className="flex flex-col items-end">
                                <span className="font-extrabold text-zinc-950">{formatCur(r.amount)}</span>
                                {paid > 0 && (
                                  <div className="flex flex-col items-end mt-0.5 leading-none">
                                    <span className="text-[9px] text-emerald-600 font-semibold">Paid: {formatCur(paid)}</span>
                                    <span className="text-[9px] text-amber-600 font-semibold mt-0.5">Remaining: {formatCur(remaining)}</span>
                                  </div>
                                )}
                                {r.status === 'Partially Paid' && paid === 0 && (
                                  <span className="text-[9px] text-blue-600 font-semibold mt-0.5">Partially Paid</span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-3 align-middle text-zinc-600 whitespace-nowrap">{r.dueDate}</td>
                        <td className="px-3 align-middle">
                          <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getPriorityStyle(r.priority)}`}>
                            {r.priority}
                          </span>
                        </td>
                        <td className="px-3 align-middle text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleApprove(r)}
                              disabled={approvingId === r.id}
                              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-[10px] font-semibold transition-all disabled:opacity-50 whitespace-nowrap ${r.adjustmentType === 'Delete'
                                ? 'bg-rose-600 hover:bg-rose-700'
                                : r.status === 'Partially Paid'
                                  ? 'bg-blue-600 hover:bg-blue-700'
                                  : 'bg-emerald-600 hover:bg-emerald-700'
                                }`}
                            >
                              <Wallet className="w-3.5 h-3.5" />
                              {approvingId === r.id
                                ? 'Processing...'
                                : r.adjustmentType === 'Edit'
                                  ? 'Approve & Edit'
                                  : r.adjustmentType === 'Delete'
                                    ? 'Approve & Delete'
                                    : r.status === 'Partially Paid'
                                      ? 'Pay Installment'
                                      : 'Approve & Pay'}
                            </button>
                            <button
                              onClick={() => handleDecline(r)}
                              disabled={approvingId === r.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100 text-[10px] font-semibold transition-all disabled:opacity-50 whitespace-nowrap"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Decline</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {Array.from({ length: reqEmptyRowCount }).map((_, i) => (
                      <tr key={`req-empty-${i}`} style={{ height: TABLE_ROW_HEIGHT_PX }} aria-hidden="true">
                        <td colSpan={7} className="px-3 align-middle">&nbsp;</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePagination
                idPrefix="req"
                totalItems={filteredPending.length}
                rowsPerPage={rowsPerPage}
                currentPage={reqPage}
                onRowsPerPageChange={setRowsPerPage}
                onPageChange={setReqPage}
              />
            </div>
          )}
        </div>
      </div>

      {/* Transaction History */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900 tracking-tight flex items-center gap-1.5">
          <ClipboardList className="w-4 h-4 text-zinc-500" />
          Transaction Ledger
        </h2>

        <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm">
          <div className="relative mb-3">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Search transactions..."
              value={txnSearch}
              onChange={e => setTxnSearch(e.target.value)}
              className="w-full text-xs sm:text-sm pl-9 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:bg-white transition-all text-zinc-900"
            />
          </div>

          {filteredTransactions.length === 0 ? (
            <div className="p-8 border border-dashed rounded-xl text-center bg-zinc-50">
              <ClipboardList className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
              <p className="text-xs text-zinc-500">No transactions recorded yet.</p>
            </div>
          ) : (
            <div className="border border-zinc-200/80 rounded-xl overflow-hidden -mx-1">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-zinc-600 border-collapse min-w-[560px]">
                  <thead>
                    <tr className="bg-zinc-50 text-zinc-400 uppercase font-bold text-[9px] border-b border-zinc-200">
                      <th className="py-3 px-3">Date</th>
                      <th className="py-3 px-3">Description</th>
                      <th className="py-3 px-3">Type</th>
                      <th className="py-3 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody
                    className="divide-y divide-zinc-100 text-zinc-900"
                    style={{ height: txnTableBodyHeight }}
                  >
                    {paginatedTransactions.map(t => (
                      <tr key={t.id} className="hover:bg-zinc-50/50 transition-colors" style={{ height: TABLE_ROW_HEIGHT_PX }}>
                        <td className="px-3 align-middle text-zinc-600 whitespace-nowrap">
                          {new Date(t.date).toLocaleString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td className="px-3 align-middle">
                          <span className="font-medium text-zinc-800 block">{t.description}</span>
                          {t.type === 'Cash In' && t.source && (
                            <span className="text-[10px] text-emerald-700 font-semibold block mt-0.5">From: {t.source}</span>
                          )}
                          {t.type === 'Cash In' && t.inflowType && (
                            <span className="inline-flex items-center text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded mt-1">
                              {t.inflowType}
                            </span>
                          )}
                          {t.type === 'Cash Out' && t.description?.includes('Payment to ') && (
                            <span className="text-[10px] text-zinc-500 block mt-0.5">
                              To: {t.description.split('Payment to ')[1]?.split(' for')[0]}
                            </span>
                          )}
                          {t.reference && (
                            <span className="text-[10px] text-zinc-400 block mt-0.5">Ref: {t.reference}</span>
                          )}
                        </td>
                        <td className="px-3 align-middle">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${t.type === 'Cash In'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}>
                            {t.type === 'Cash In' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {t.type}
                          </span>
                        </td>
                        <td className={`px-3 align-middle text-right font-extrabold whitespace-nowrap ${t.type === 'Cash In' ? 'text-emerald-700' : 'text-rose-700'
                          }`}>
                          {t.type === 'Cash In' ? '+' : '−'} {formatCur(t.amount)}
                        </td>
                      </tr>
                    ))}
                    {Array.from({ length: txnEmptyRowCount }).map((_, i) => (
                      <tr key={`txn-empty-${i}`} style={{ height: TABLE_ROW_HEIGHT_PX }} aria-hidden="true">
                        <td colSpan={4} className="px-3 align-middle">&nbsp;</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePagination
                idPrefix="txn"
                totalItems={filteredTransactions.length}
                rowsPerPage={rowsPerPage}
                currentPage={txnPage}
                onRowsPerPageChange={setRowsPerPage}
                onPageChange={setTxnPage}
              />
            </div>
          )}
        </div>
      </div>

      {/* Inflow Modal */}
      {showInflowForm && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-3xl p-5 sm:p-6 shadow-2xl max-w-md w-full space-y-4 font-sans animate-fade-in relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => { setShowInflowForm(false); setInflowSubmitError(null); }}
              className="absolute top-5 right-5 text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="border-b pb-3 border-zinc-100 pr-8">
              <h2 className="text-base sm:text-lg font-bold text-zinc-900">Record Cash Inflow</h2>
              <p className="text-[10px] text-zinc-400 font-medium mt-0.5">Funds received into office account</p>
            </div>

            {inflowSubmitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs font-semibold">
                {inflowSubmitError}
              </div>
            )}

            <form onSubmit={handleInflowSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Amount (₹)</label>
                  <input
                    type="number"
                    required
                    min={0.01}
                    step="any"
                    placeholder="e.g. 50000"
                    value={inflowAmount}
                    onChange={e => setInflowAmount(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Inflow Type</label>
                  <select
                    value={inflowType}
                    onChange={e => {
                      const val = e.target.value;
                      setInflowType(val);
                      if (val === 'credit') {
                        setInflowProject('');
                      }
                    }}
                    required
                    className={inputClass}
                  >
                    <option value="client payment">Client Payment</option>
                    <option value="credit">Credit</option>
                    <option value="custom">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Client advance payment"
                  value={inflowDesc}
                  onChange={e => setInflowDesc(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Source</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Client name, owner"
                  value={inflowSource}
                  onChange={e => setInflowSource(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Method</label>
                  <select
                    value={inflowMethod}
                    onChange={e => setInflowMethod(e.target.value)}
                    required
                    className={inputClass}
                  >
                    <option value="">Select...</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cash">Cash</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Ref / Cheque #</label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={inflowRef}
                    onChange={e => setInflowRef(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Date & Time</label>
                <input
                  type="datetime-local"
                  required
                  value={inflowDate}
                  onChange={e => setInflowDate(e.target.value)}
                  className={inputClass}
                />
              </div>

              {inflowType !== 'credit' && (
                <div>
                  <label className={labelClass}>Project</label>
                  <select
                    value={inflowProject}
                    onChange={e => setInflowProject(e.target.value)}
                    required
                    className={inputClass}
                  >
                    <option value="">Select project...</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.projectName}</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs sm:text-sm font-bold transition-colors"
              >
                Record Inflow
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Partial Payment Modal */}
      {showPayModal && activeRequest && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-zinc-200 rounded-2xl w-full max-w-md shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <div>
                <h3 className="font-bold text-zinc-950 text-sm">Process Payment Installment</h3>
                <p className="text-[10px] text-zinc-400 font-medium">Payee: {activeRequest.payeeName}</p>
              </div>
              <button
                onClick={() => { setShowPayModal(false); setActiveRequest(null); }}
                className="p-1 rounded-lg hover:bg-zinc-100 transition-colors text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Summary details */}
              {(() => {
                const paid = (activeRequest.paymentHistory || []).reduce((s, it) => s + it.amount, 0);
                const remaining = Math.max(0, activeRequest.amount - paid);
                return (
                  <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <span className="block text-[10px] text-zinc-400 font-bold uppercase">Requested</span>
                      <span className="font-extrabold text-zinc-950 mt-1 block">{formatCur(activeRequest.amount)}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-zinc-400 font-bold uppercase">Paid So Far</span>
                      <span className="font-bold text-emerald-600 mt-1 block">{formatCur(paid)}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-zinc-400 font-bold uppercase">Remaining</span>
                      <span className="font-bold text-amber-600 mt-1 block">{formatCur(remaining)}</span>
                    </div>
                  </div>
                );
              })()}

              {payNowError && (
                <div className="bg-rose-50 border border-rose-100 text-rose-700 rounded-lg p-2.5 text-[11px] font-semibold">
                  {payNowError}
                </div>
              )}

              <form onSubmit={handlePartialPaymentSubmit} className="space-y-3">
                <div>
                  <label className={labelClass}>Pay Now (₹)</label>
                  <input
                    type="number"
                    required
                    min={0.01}
                    step="any"
                    value={payNowAmount}
                    onChange={e => setPayNowAmount(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Payment Method</label>
                  <select
                    value={payNowMethod}
                    onChange={e => setPayNowMethod(e.target.value)}
                    required
                    className={inputClass}
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cash">Cash</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Notes / Reference</label>
                  <input
                    type="text"
                    placeholder="Optional details, cheque number, or transaction ID"
                    value={payNowNotes}
                    onChange={e => setPayNowNotes(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowPayModal(false); setActiveRequest(null); }}
                    className="px-4 py-2 bg-white hover:bg-zinc-100 border border-zinc-200/80 rounded-xl text-xs font-semibold text-zinc-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={approvingId === activeRequest.id}
                    className="px-4 py-2 bg-zinc-950 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition-colors disabled:opacity-50"
                  >
                    {approvingId === activeRequest.id ? 'Paying...' : `Pay ₹${Number(payNowAmount || 0).toLocaleString('en-IN')}`}
                  </button>
                </div>
              </form>

              {/* Payment History List inside modal */}
              {activeRequest.paymentHistory && activeRequest.paymentHistory.length > 0 && (
                <div className="pt-4 border-t border-zinc-100">
                  <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Installment History</h4>
                  <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                    {activeRequest.paymentHistory.map((item, idx) => (
                      <div key={item.id} className="flex justify-between items-center text-xs p-2 bg-zinc-50 border border-zinc-100 rounded-lg">
                        <div>
                          <span className="font-semibold text-zinc-800">Installment #{idx + 1}</span>
                          <span className="text-[10px] text-zinc-400 block mt-0.5">
                            {new Date(item.paidAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} • {item.paymentMethod}
                          </span>
                          {item.notes && <span className="text-[10px] text-zinc-500 italic block mt-0.5">"{item.notes}"</span>}
                        </div>
                        <span className="font-extrabold text-emerald-600">{formatCur(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
