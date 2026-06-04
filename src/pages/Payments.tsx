import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Edit2, Trash2, Calendar, ClipboardCheck, 
  ArrowLeft, RefreshCw, AlertTriangle, Coins, CheckCircle2,
  DollarSign, Briefcase, PlusCircle, X
} from 'lucide-react';
import { api } from '../api/client';
import { Payment, PayeeType, PaymentStatus } from '../types';

interface PaymentsProps {
  initialProjectId?: string;
  initialTaskId?: string;
  userRole: string;
}

export default function PaymentsPage({ initialProjectId, initialTaskId, userRole }: PaymentsProps) {
  const [payments, setPayments] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [crew, setCrew] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState<string>(initialProjectId || 'All');
  const [payeeFilter, setPayeeFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  // Fields
  const [editId, setEditId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [payeeType, setPayeeType] = useState<PayeeType>('Worker');
  const [payeeName, setPayeeName] = useState('');
  const [manualPayeeName, setManualPayeeName] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Paid');
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [prjs, pays] = await Promise.all([
        api.getProjects(),
        api.getPayments()
      ]);
      setProjects(prjs.projects || []);
      setPayments(pays.payments || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to download payments hub');
    } finally {
      setLoading(false);
    }
  };

  // Sync tasks on project changes
  useEffect(() => {
    if (projectId) {
      api.getTasks(projectId).then(res => {
        setTasks(res.tasks || []);
        if (res.tasks && res.tasks.length > 0) {
          setTaskId(res.tasks[0].id);
        } else {
          setTaskId('');
        }
      });
    } else {
      setTasks([]);
    }
  }, [projectId]);

  // Load crew (attendance) for selected task to offer as payee choices
  useEffect(() => {
    const loadCrew = async () => {
      if (!projectId || !taskId) {
        setCrew([]);
        return;
      }
      try {
        const res = await api.getAttendance(projectId, taskId);
        const names = (res || []).map((a: any) => a.workerName).filter(Boolean);
        const unique = Array.from(new Set(names));
        setCrew(unique);
      } catch (err) {
        setCrew([]);
      }
    };
    loadCrew();
  }, [projectId, taskId]);

  const handleOpenCreate = () => {
    setEditId(null);
    setProjectId(projects[0]?.id || '');
    setPayeeType('Worker');
    setPayeeName('');
    setManualPayeeName('');
    setAmount(0);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('Bank Transfer');
    setPaymentStatus('Paid');
    setNotes('');
    setSubmitError(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (p: any) => {
    setEditId(p.id);
    setProjectId(p.projectId);
    setTaskId(p.taskId);
    setPayeeType(p.payeeType);
    setPayeeName(p.payeeName);
    setManualPayeeName('');
    setAmount(p.amount);
    setPaymentDate(p.paymentDate);
    setPaymentMethod(p.paymentMethod);
    setPaymentStatus(p.paymentStatus);
    setNotes(p.notes || '');
    setSubmitError(null);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this payout item from system?')) {
      return;
    }
    try {
      await api.deletePayment(id);
      fetchInitialData();
    } catch (err: any) {
      alert(err.message || 'Error deleting payout');
    }
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const finalPayeeName = payeeName === '__other' ? manualPayeeName.trim() : payeeName;

    if (!projectId || !taskId || !payeeType || !finalPayeeName || amount <= 0 || !paymentDate || !paymentMethod || !paymentStatus) {
      setSubmitError('All fields are required.');
      return;
    }

    const payload = {
      projectId,
      taskId,
      payeeType,
      payeeName: finalPayeeName,
      amount: Number(amount),
      paymentDate,
      paymentMethod,
      paymentStatus,
      notes
    };

    try {
      setSubmitError(null);
      if (editId) {
        await api.updatePayment(editId, payload);
      } else {
        await api.createPayment(payload);
      }
      setIsFormOpen(false);
      fetchInitialData();
    } catch (err: any) {
      setSubmitError(err?.message || 'Error occurred while saving payout ledger');
    }
  };

  // Computations
  const filteredPayments = payments.filter(p => {
    const matchesSearch = p.payeeName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (p.notes || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.taskName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesProject = projectFilter === 'All' || p.projectId === projectFilter;
    const matchesPayee = payeeFilter === 'All' || p.payeeType === payeeFilter;
    const matchesStatus = statusFilter === 'All' || p.paymentStatus === statusFilter;

    return matchesSearch && matchesProject && matchesPayee && matchesStatus;
  });

  const totalPaid = filteredPayments.filter(p => p.paymentStatus === 'Paid').reduce((sum, p) => sum + p.amount, 0);
  const totalPending = filteredPayments.filter(p => p.paymentStatus === 'Pending' || p.paymentStatus === 'Partial').reduce((sum, p) => sum + p.amount, 0);

  const formatCur = (num: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(num);
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-zinc-950">Payments</h1>
              <p className="text-xs sm:text-sm text-zinc-500">Track payments.</p>
            </div>
            
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-zinc-950 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-zinc-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Record Payment</span>
            </button>
          </div>

          {/* Quick Metrics display */}
          <div className="grid grid-cols-2 gap-3.5">
            <div className="bg-zinc-900 text-white p-4 rounded-xl flex flex-col justify-between shadow-sm">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Completed Payments</span>
              <span className="text-xl sm:text-2xl font-black block mt-1">{formatCur(totalPaid)}</span>
            </div>
            <div className="bg-white border rounded-xl p-4 flex flex-col justify-between shadow-sm">
              <span className="text-[10px] text-zinc-400 font-bold uppercase block tracking-wider">Pending Payments</span>
              <span className="text-xl sm:text-2xl font-black text-rose-700 block mt-1">{formatCur(totalPending)}</span>
            </div>
          </div>

          {/* Advanced filters */}
          <div className="bg-white border rounded-2xl p-4 shadow-sm space-y-3">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search payees, tasks or payment descriptions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs sm:text-sm pl-9 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:bg-white transition-all text-zinc-900"
              />
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
              <div>
                <label className="block text-[9px] font-bold text-zinc-400 uppercase mb-0.5">Project Filter</label>
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 outline-none text-zinc-700"
                >
                  <option value="All">All Projects</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.projectName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-zinc-400 uppercase mb-0.5">Payee Type</label>
                <select
                  value={payeeFilter}
                  onChange={(e) => setPayeeFilter(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 outline-none text-zinc-700"
                >
                  <option value="All">All Payees</option>
                  <option value="Worker">Worker</option>
                  <option value="Company">Company</option>
                  <option value="Subcontractor">Subcontractor</option>
                  <option value="Supplier">Supplier</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-zinc-400 uppercase mb-0.5">Payment Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 outline-none text-zinc-700"
                >
                  <option value="All">All Statuses</option>
                  <option value="Paid">Paid</option>
                  <option value="Pending">Pending</option>
                  <option value="Partial">Partial</option>
                </select>
              </div>
            </div>
          </div>

          {/* Cards feed */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-zinc-900/10 border-t-zinc-900 rounded-full animate-spin"></div>
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="p-8 border border-dashed rounded-2xl text-center bg-zinc-50">
              <Coins className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
              <p className="text-xs text-zinc-500">No Payments recorded yet under this filter set.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPayments.map((p) => (
                <div 
                  key={p.id}
                  className="bg-white border rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-zinc-300 transition-all"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider truncate max-w-[130px]">{p.projectName}</span>
                      <span className="text-zinc-300">•</span>
                      <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-100 px-2.5 py-0.5 rounded">{p.payeeType}</span>
                    </div>

                    <h3 className="text-xs sm:text-sm font-extrabold text-zinc-950">
                      Paid to: <b>{p.payeeName}</b>
                    </h3>

                    <p className="text-[11px] text-zinc-500">
                      Task: <b className="text-zinc-800 font-medium">{p.taskName}</b>
                    </p>

                    {p.notes && (
                      <p className="text-[11px] text-zinc-400 bg-zinc-50 p-2 rounded italic">
                        &quot;{p.notes}&quot;
                      </p>
                    )}

                    <div className="text-[10px] text-zinc-400 flex items-center gap-3 font-semibold pt-1">
                      <span>Date: <b>{p.paymentDate}</b></span>
                      <span>Method: <b>{p.paymentMethod}</b></span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-0 pt-2.5 sm:pt-0 border-zinc-100">
                    <div className="text-left sm:text-right">
                      <span className="text-sm sm:text-base font-black text-zinc-950 block">{formatCur(p.amount)}</span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-tight uppercase ${
                        p.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-700' :
                        p.paymentStatus === 'Partial' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                      }`}>
                        {p.paymentStatus}
                      </span>
                    </div>

                    <div className="flex gap-1">
                      <button 
                        onClick={() => handleOpenEdit(p)}
                        className="p-1.5 bg-zinc-50 text-zinc-500 hover:text-zinc-900 border rounded-lg hover:bg-zinc-100 transition-colors"
                        title="Edit entry"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {userRole === 'admin' && (
                        <button 
                          onClick={() => handleDelete(p.id)}
                          className="p-1.5 bg-zinc-50 text-rose-500 hover:text-rose-900 border rounded-lg hover:bg-rose-50 transition-colors"
                          title="Erase payment log"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

      {/* FORM: Create or Edit payment log */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border text-xs sm:text-sm border-zinc-200 rounded-3xl p-5 sm:p-6 shadow-2xl max-w-xl w-full space-y-4 font-sans animate-fade-in relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setIsFormOpen(false)}
              className="absolute top-5 right-5 text-zinc-400 hover:text-zinc-650 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="border-b pb-3 border-zinc-100 pr-8">
              <h2 className="text-base sm:text-lg font-bold text-zinc-900">
                {editId ? 'Verify & Update Disbursement' : 'Log Disbursement Checkout'}
              </h2>
            </div>

          {submitError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs sm:text-sm">
              {submitError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Project Contract</label>
                <select
                  required
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none"
                >
                  <option value="" disabled>Select parent project...</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.projectName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Task Scope Segment</label>
                <select
                  required
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none"
                >
                  <option value="" disabled>Select task scope...</option>
                  {tasks.map(t => (
                    <option key={t.id} value={t.id}>{t.taskName}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Payee</label>
                <select
                  value={payeeType}
                  onChange={(e) => setPayeeType(e.target.value as PayeeType)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl"
                >
                  <option value="Worker">Worker</option>
                  <option value="Company">Company</option>
                  <option value="Subcontractor">Subcontractor</option>
                  <option value="Supplier">Supplier</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Payee Name</label>
                {payeeType === 'Worker' && crew && crew.length > 0 ? (
                  <>
                    <select
                      value={payeeName}
                      onChange={(e) => {
                        setPayeeName(e.target.value);
                        setManualPayeeName('');
                      }}
                      className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950"
                    >
                      <option value="" disabled>Select crew member...</option>
                      {crew.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                      <option value="__other">Other (manual entry)</option>
                    </select>
                    {payeeName === '__other' && (
                      <input
                        type="text"
                        required
                        value={manualPayeeName}
                        onChange={(e) => {
                          setManualPayeeName(e.target.value);
                        }}
                        placeholder="Enter payee name"
                        className="mt-2 w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950"
                      />
                    )}
                  </>
                ) : (
                  <input
                    type="text"
                    required
                    value={payeeName}
                    onChange={(e) => setPayeeName(e.target.value)}
                    placeholder="Name"
                    className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950"
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Paid amount (₹)</label>
                <input
                  type="number"
                  required
                  min={0}
                  placeholder=""
                  value={amount || ''}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Payment status</label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl"
                >
                  <option value="Paid">Paid</option>
                  <option value="Pending">Pending</option>
                  <option value="Partial">Partial</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Paid Date</label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl"
                >
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Cash">Cash</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Payment Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Payment details..."
                rows={3}
                className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-xs sm:text-sm"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              Log Payment
            </button>
          </form>
        </div>
      </div>
    )}

    </div>
  );
}
