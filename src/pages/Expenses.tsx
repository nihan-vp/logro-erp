import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Edit2, Trash2, Calendar, DollarSign, Filter,
  FileText, Image as ImageIcon, X, Trash, Eye, UploadCloud 
} from 'lucide-react';
import { api } from '../api/client';
import { Expense, ExpenseCategory } from '../types';

interface ExpensesProps {
  initialProjectId?: string;
  initialTaskId?: string;
  userRole: string;
}

export default function Expenses({ initialProjectId, initialTaskId, userRole }: ExpensesProps) {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState<string>(initialProjectId || 'All');
  const [taskFilter, setTaskFilter] = useState<string>(initialTaskId || 'All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [payMethodFilter, setPayMethodFilter] = useState<string>('All');

  // Form modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Fields
  const [editId, setEditId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Material');
  const [amount, setAmount] = useState<number>(0);
  const [paidTo, setPaidTo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [billImage, setBillImage] = useState<string>(''); // Base64 representation
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [projectsRes, expensesRes] = await Promise.all([
        api.getProjects(),
        api.getExpenses()
      ]);
      setProjects(projectsRes.projects || []);
      setExpenses(expensesRes.expenses || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to download expenses log');
    } finally {
      setLoading(false);
    }
  };

  // Sync tasks on project change
  useEffect(() => {
    if (projectId) {
      api.getTasks(projectId).then(res => {
        setTasks(res.tasks || []);
        // Autofill first task if none selected or if current task doesn't belong
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

  const handleOpenCreate = () => {
    setEditId(null);
    setProjectId(projects[0]?.id || '');
    setCategory('Material');
    setAmount(0);
    setPaidTo('');
    setPaymentMethod('Bank Transfer');
    setDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setFromLocation('');
    setToLocation('');
    setBillImage('');
    setSubmitError(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (e: any) => {
    setEditId(e.id);
    setProjectId(e.projectId);
    setTaskId(e.taskId);
    setCategory(e.category);
    setAmount(e.amount);
    setPaidTo(e.paidTo);
    setPaymentMethod(e.paymentMethod);
    setDate(e.date);
    setNotes(e.notes || '');
    setFromLocation(e.fromLocation || '');
    setToLocation(e.toLocation || '');
    setBillImage(e.billImage || '');
    setSubmitError(null);
    setIsFormOpen(true);
  };

  // Process lightweight base64 conversion of Bill receipts from WebView cameras safely
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('File size exceeds 2MB limit. Please compress receipt images to keep WebView fast.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setBillImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!projectId || !taskId || !category || amount <= 0 || !paidTo || !paymentMethod || !date) {
      setSubmitError('All core fields (Project, Task, Category, Amount, Payee, and Date) are required.');
      return;
    }

    const payload = {
      projectId,
      taskId,
      payeeName: paidTo,
      category: category === 'Material' ? 'Vendor' : category === 'Labour' ? 'Worker' : 'Other',
      amount: Number(amount),
      description: notes,
      fromLocation,
      toLocation,
      dueDate: date,
      priority: 'Medium'
    };
    console.log("Submitting expense request payload:", payload);

    try {
      setSubmitError(null);
      await api.createPaymentRequest(payload);
      setIsFormOpen(false);
      fetchInitialData();
      alert('Expense request submitted to accountant.');
    } catch (err: any) {
      setSubmitError(err?.message || 'Error logging on-site expense');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this expense? The amount will immediately be subtracted from task & project totals.')) {
      return;
    }
    try {
      await api.deleteExpense(id);
      setExpenses(expenses.filter(e => e.id !== id));
    } catch (err: any) {
      alert(err.message || 'Error occurred');
    }
  };

  // Computations
  const filteredExpenses = expenses.filter(e => {
    const matchesSearch = e.paidTo.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (e.notes || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          e.taskName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesProject = projectFilter === 'All' || e.projectId === projectFilter;
    const matchesTask = taskFilter === 'All' || e.taskId === taskFilter;
    const matchesCategory = categoryFilter === 'All' || e.category === categoryFilter;
    const matchesPayMethod = payMethodFilter === 'All' || e.paymentMethod === payMethodFilter;

    return matchesSearch && matchesProject && matchesTask && matchesCategory && matchesPayMethod;
  });

  const aggregateCosts = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  const formatCur = (num: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(num);
  };

  return (
    <div className="space-y-6 font-sans">
      
      {!isFormOpen && (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-zinc-950">Line Expenses</h1>
              <p className="text-xs sm:text-sm text-zinc-500">Log hardware buyouts, site transport, machinery rents, and bills</p>
            </div>
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-zinc-950 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-zinc-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Record Expense</span>
            </button>
          </div>

          {/* Quick Metrics display */}
          <div className="bg-zinc-900 text-white p-4 rounded-xl flex items-center justify-between shadow-sm">
            <div>
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Filtered Total Cost</span>
              <span className="text-xl sm:text-2xl font-black">{formatCur(aggregateCosts)}</span>
            </div>
            <span className="text-[10px] text-zinc-400 font-medium bg-white/10 px-2.5 py-1 rounded">
              {filteredExpenses.length} transaction{filteredExpenses.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Detailed filter block */}
          <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search description, payee or task name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs sm:text-sm pl-9 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:bg-white transition-all text-zinc-900"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-semibold text-zinc-600">
              <div>
                <label className="block text-[9px] font-bold text-zinc-400 uppercase mb-0.5">Project</label>
                <select
                  value={projectFilter}
                  onChange={(e) => {
                    setProjectFilter(e.target.value);
                    setTaskFilter('All'); // reset child filter
                  }}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 outline-none text-zinc-700"
                >
                  <option value="All">All Projects</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.projectName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-zinc-400 uppercase mb-0.5">Category</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 outline-none text-zinc-700"
                >
                  <option value="All">All Categories</option>
                  <option value="Material">Material</option>
                  <option value="Labour">Labour</option>
                  <option value="Transport">Transport</option>
                  <option value="Tools">Tools</option>
                  <option value="Company Payment">Company Payment</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-zinc-400 uppercase mb-0.5">Pay Method</label>
                <select
                  value={payMethodFilter}
                  onChange={(e) => setPayMethodFilter(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 outline-none text-zinc-700"
                >
                  <option value="All">All Methods</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Cash">Cash</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-zinc-400 uppercase mb-0.5">Clear filter</label>
                <button
                  onClick={() => {
                    setProjectFilter('All');
                    setTaskFilter('All');
                    setCategoryFilter('All');
                    setPayMethodFilter('All');
                    setSearchQuery('');
                  }}
                  className="w-full text-center py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs rounded-xl transition-all font-semibold"
                >
                  Reset Filtering
                </button>
              </div>
            </div>
          </div>

          {/* Cards feed */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-zinc-900/10 border-t-zinc-900 rounded-full animate-spin"></div>
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="p-8 border border-dashed rounded-2xl text-center bg-zinc-50">
              <FileText className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
              <p className="text-xs text-zinc-500">No matching expense logs found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredExpenses.map((e) => (
                <div 
                  key={e.id}
                  className="bg-white border border-zinc-200/80 rounded-xl p-3.5 sm:p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide truncate max-w-[150px]">{e.projectName}</span>
                      <span className="text-zinc-300">•</span>
                      <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">{e.category}</span>
                    </div>

                    <h3 className="text-xs sm:text-sm font-bold text-zinc-900">
                      Paid to <b className="text-zinc-950 font-extrabold">{e.paidTo}</b>
                    </h3>

                    <p className="text-[11px] text-zinc-500">
                      Scope: <b className="text-zinc-700 font-medium">{e.taskName}</b>
                    </p>

                    {e.notes && (
                      <p className="text-[11px] text-zinc-400 italic bg-zinc-50/50 p-1.5 rounded line-clamp-1">
                        &quot;{e.notes}&quot;
                      </p>
                    )}

                    <div className="text-[10px] text-zinc-400 flex items-center gap-3 mt-1 font-medium">
                      <span>Date: <b>{e.date}</b></span>
                      <span>Method: <b>{e.paymentMethod}</b></span>
                    </div>
                  </div>

                  {/* Right hand layout containing cost details and optional image logic */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-2.5 sm:pt-0 border-t sm:border-t-0 border-zinc-100">
                    <div className="flex items-center gap-2">
                      {e.billImage ? (
                        <button
                          onClick={() => { setSelectedExpense(e); setIsPreviewOpen(true); }}
                          className="p-1.5 rounded-lg bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border text-xs font-semibold flex items-center gap-1 transition-all"
                          title="Receipt Attached"
                        >
                          <ImageIcon className="w-3.5 h-3.5 text-zinc-600" />
                          <span>View Receipt</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-zinc-300 italic">No bill receipt</span>
                      )}
                    </div>

                    <div className="text-right flex items-center sm:block gap-2 sm:gap-0">
                      <span className="text-sm sm:text-base font-extrabold text-zinc-950 block">{formatCur(e.amount)}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <button 
                          onClick={() => handleOpenEdit(e)}
                          className="p-1 bg-zinc-50 text-zinc-500 hover:text-zinc-900 border rounded"
                          title="Edit"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        {(userRole === 'admin' || userRole === 'accountant') && (
                          <button 
                            onClick={() => handleDelete(e.id)}
                            className="p-1 bg-zinc-50 text-rose-500 hover:text-rose-900 border rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* MODAL: Image Preview */}
      {isPreviewOpen && selectedExpense && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-4 max-w-lg w-full space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs text-zinc-400 font-bold uppercase">Expense receipt</h3>
                <h4 className="text-sm font-extrabold text-zinc-950">{selectedExpense.paidTo} - {formatCur(selectedExpense.amount)}</h4>
              </div>
              <button 
                onClick={() => setIsPreviewOpen(false)}
                className="p-1 text-zinc-500 hover:text-zinc-950 rounded-lg hover:bg-zinc-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="w-full max-h-[350px] overflow-auto bg-zinc-100 rounded-xl flex justify-center items-center">
              <img 
                src={selectedExpense.billImage} 
                alt="Uploaded expense receipt" 
                className="max-w-full max-h-[350px] object-contain rounded-xl"
              />
            </div>
            <button 
              onClick={() => setIsPreviewOpen(false)}
              className="w-full py-2 bg-zinc-900 text-white rounded-xl text-xs font-bold"
            >
              Close Preview
            </button>
          </div>
        </div>
      )}

      {/* FORM: Create or Edit Expense */}
      {isFormOpen && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 sm:p-6 shadow-sm max-w-xl mx-auto space-y-4 font-sans">
          <div className="flex items-center justify-between border-b pb-3 border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              {editId ? 'Verify & Edit Expense' : 'Log Site Expense'}
            </h2>
            <button 
              onClick={() => setIsFormOpen(false)}
              className="px-2 py-1 bg-zinc-100 text-zinc-700 rounded-lg text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>

          {submitError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs sm:text-sm">
              {submitError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                  Active Project
                </label>
                <select
                  required
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900"
                >
                  <option value="" disabled>Select project...</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.projectName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                  Linked Task Segment
                </label>
                <select
                  required
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900"
                >
                  <option value="" disabled>Select task...</option>
                  {tasks.map(t => (
                    <option key={t.id} value={t.id}>{t.taskName}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                >
                  <option value="Material">Material</option>
                  <option value="Labour">Labour</option>
                  <option value="Transport">Transport</option>
                  <option value="Tools">Tools</option>
                  <option value="Company Payment">Company Payment</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                  Outflow Amount (₹)
                </label>
                <input
                  type="number"
                  required
                  min={0.01}
                  step="any"
                  placeholder="0.00"
                  value={amount || ''}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>
            </div>

             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <div>
                 <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                   Paid To / Recipient
                 </label>
                 <input
                   type="text"
                   required
                   placeholder="e.g. Alliance Steel, Local Supplier"
                   value={paidTo}
                   onChange={(e) => setPaidTo(e.target.value)}
                   className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                 />
               </div>
               <div>
                 <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                   Disburse Method
                 </label>
                 <select
                   value={paymentMethod}
                   onChange={(e) => setPaymentMethod(e.target.value)}
                   className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none focus:ring-1"
                 >
                   <option value="Bank Transfer">Bank Transfer</option>
                   <option value="Cheque">Cheque</option>
                   <option value="Cash">Cash</option>
                   <option value="Other">Other</option>
                 </select>
               </div>
             </div>
             {category === 'Transport' && (
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-zinc-50 p-3 rounded-xl border border-zinc-200">
                 <div>
                   <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                     Origin / From
                   </label>
                   <input
                     type="text"
                     placeholder="Start location"
                     value={fromLocation}
                     onChange={(e) => setFromLocation(e.target.value)}
                     className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                   />
                 </div>
                 <div>
                   <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                     Destination / To
                   </label>
                   <input
                     type="text"
                     placeholder="End location"
                     value={toLocation}
                     onChange={(e) => setToLocation(e.target.value)}
                     className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                   />
                 </div>
               </div>
              )}
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                    Payment Date

                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              {/* Advanced lightweight file picker with Base64 converters */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                  Bill Image Receipt (PDF/Image)
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 flex flex-col items-center justify-center border border-zinc-300 border-dashed rounded-xl px-2 py-1.5 cursor-pointer bg-zinc-50 hover:bg-zinc-100 transition-colors text-center text-xs text-zinc-600 font-semibold gap-1">
                    <UploadCloud className="w-5 h-5 text-zinc-500" />
                    <span>{billImage ? 'Uploaded ✓' : 'Upload Image'}</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleFileChange} 
                      className="hidden" 
                    />
                  </label>
                  {billImage && (
                    <button
                      type="button"
                      onClick={() => setBillImage('')}
                      className="p-2 border border-rose-300 hover:bg-rose-50 rounded-xl text-rose-600 transition-all font-semibold"
                      title="Clear attached image"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {billImage && (
              <div className="p-2 border rounded-xl bg-zinc-50 flex items-center justify-between">
                <span className="text-[11px] text-zinc-500 truncate max-w-[200px]">Attached bill image preview</span>
                <span className="text-[10px] text-zinc-400 bg-white border px-1.5 py-0.5 rounded">Compress activated</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                Ledger Notes
              </label>
              <textarea
                placeholder="Include purchase vouchers details, transport kilometers, tool serial numbers..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs sm:text-sm"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              Synchronize Ledger Entry
            </button>
          </form>
        </div>
      )}

    </div>
  );
}
