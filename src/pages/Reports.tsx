import React, { useState, useEffect } from 'react';
import {
  Plus, Calendar, BarChart3, Filter, FileText, Download,
  Search, ArrowDownRight, ArrowUpRight, AlertTriangle, RefreshCw,
  Building2, ClipboardList, Users, Coins, TrendingUp
} from 'lucide-react';
import { api } from '../api/client';

export default function ReportsPage() {
  const [reportType, setReportType] = useState<'project' | 'task_expense' | 'labour' | 'payouts' | 'profit_loss' | 'pending' | 'monthly' | 'vendor_worker'>('project');

  // Data layers
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [summaryStats, setSummaryStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [projectFilter, setProjectFilter] = useState<string>('All');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const [pRes, tRes, expRes, attRes, payRes, sumRes] = await Promise.all([
        api.getProjects(),
        api.getTasks(),
        api.getExpenses(),
        api.getAttendance(),
        api.getPayments(),
        api.getReportSummary()
      ]);

      setProjects(pRes.projects || []);
      setTasks(tRes.tasks || []);
      setExpenses(expRes.expenses || []);
      setAttendance(attRes.attendance || []);
      setPayments(payRes.payments || []);
      setSummaryStats(sumRes.stats || null);
    } catch (err) {
      console.error("Error generating reports payload", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCur = (num: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(num);
  };

  // Safe checks for date boundaries
  const isWithinDateBounds = (dateStr: string) => {
    if (!dateStr) return true;
    if (startDate && dateStr < startDate) return false;
    if (endDate && dateStr > endDate) return false;
    return true;
  };

  // Filtered queries based on selections
  const filteredProjects = projects.filter(p => {
    const matchProject = projectFilter === 'All' || p.id === projectFilter;
    const matchStart = !startDate || p.startDate >= startDate;
    const matchEnd = !endDate || p.expectedEndDate <= endDate;
    return matchProject && matchStart && matchEnd;
  });

  const filteredTasks = tasks.filter(t => {
    const matchProject = projectFilter === 'All' || t.projectId === projectFilter;
    const matchStart = !startDate || t.startDate >= startDate;
    const matchEnd = !endDate || t.endDate <= endDate;
    return matchProject && matchStart && matchEnd;
  });

  const filteredExpenses = expenses.filter(e => {
    const matchProject = projectFilter === 'All' || e.projectId === projectFilter;
    return matchProject && isWithinDateBounds(e.date);
  });

  const filteredAttendance = attendance.filter(a => {
    const matchProject = projectFilter === 'All' || a.projectId === projectFilter;
    return matchProject && isWithinDateBounds(a.date);
  });

  const filteredPayments = payments.filter(pay => {
    const matchProject = projectFilter === 'All' || pay.projectId === projectFilter;
    return matchProject && isWithinDateBounds(pay.paymentDate);
  });

  return (
    <div className="space-y-6 font-sans">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-950">Reports & Analytics</h1>
          <p className="text-xs sm:text-sm text-zinc-500">Generate statements, margin summaries, tax reports and payroll checks</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchReportData}
            className="p-2.5 bg-white border rounded-xl hover:bg-zinc-50 text-zinc-600 transition-colors"
            title="Reload metrics"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-zinc-950 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Print Statement / PDF</span>
          </button>
        </div>
      </div>

      {/* Select Report statement type */}
      <div className="bg-white border rounded-2xl p-3 shadow-sm overflow-x-auto whitespace-nowrap scrollbar-none">
        <div className="flex gap-1">
          <button
            onClick={() => setReportType('project')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${reportType === 'project' ? 'bg-zinc-900 text-white shadow-sm' : 'hover:bg-zinc-100 text-zinc-600'
              }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Projects Summary</span>
          </button>
          <button
            onClick={() => setReportType('task_expense')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${reportType === 'task_expense' ? 'bg-zinc-900 text-white shadow-sm' : 'hover:bg-zinc-100 text-zinc-600'
              }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Tasks & Expenses</span>
          </button>
          <button
            onClick={() => setReportType('labour')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${reportType === 'labour' ? 'bg-zinc-900 text-white shadow-sm' : 'hover:bg-zinc-100 text-zinc-600'
              }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Labour Wages</span>
          </button>
          <button
            onClick={() => setReportType('payouts')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${reportType === 'payouts' ? 'bg-zinc-900 text-white shadow-sm' : 'hover:bg-zinc-100 text-zinc-600'
              }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>Disbursements</span>
          </button>
          <button
            onClick={() => setReportType('profit_loss')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${reportType === 'profit_loss' ? 'bg-zinc-900 text-white shadow-sm' : 'hover:bg-zinc-100 text-zinc-600'
              }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Margins (Profit/Loss)</span>
          </button>
          <button
            onClick={() => setReportType('pending')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${reportType === 'pending' ? 'bg-zinc-900 text-white shadow-sm' : 'hover:bg-zinc-100 text-zinc-600'
              }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Pending Balances</span>
          </button>
          <button
            onClick={() => setReportType('monthly')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${reportType === 'monthly' ? 'bg-zinc-900 text-white shadow-sm' : 'hover:bg-zinc-100 text-zinc-600'
              }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Monthly Summary</span>
          </button>
          <button
            onClick={() => setReportType('vendor_worker')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${reportType === 'vendor_worker' ? 'bg-zinc-900 text-white shadow-sm' : 'hover:bg-zinc-100 text-zinc-600'
              }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Vendor/Worker Detail</span>
          </button>

        </div>
      </div>

      {/* Auditing bounds filtering block */}
      <div className="bg-white border rounded-xl p-4 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-0.5">Focus Project</label>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs font-semibold text-zinc-700 outline-none"
          >
            <option value="All">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.projectName}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-0.5">Start Date Limit</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 text-xs font-semibold text-zinc-700 outline-none text-zinc-950"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-0.5">End Date Limit</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 text-xs font-semibold text-zinc-700 outline-none text-zinc-950"
          />
        </div>
      </div>

      {/* Content statement sheets loaded dynamically based on selecting above state */}
      {loading ? (
        <div className="flex justify-center items-center py-16">
          <div className="w-8 h-8 border-4 border-zinc-900/15 border-t-zinc-900 rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="bg-white border rounded-2xl p-4 sm:p-6 shadow-sm space-y-4 overflow-hidden print:border-none print:shadow-none">

          {/* Print statement logo/header */}
          <div className="hidden print:flex items-center justify-between border-b pb-4 mb-4">
            <div>
              <h2 className="text-xl font-bold text-zinc-900">CONSTRUCT ERP SUMMARY REPORT</h2>
              <p className="text-xs text-zinc-500">Date Range: {startDate || 'All timeline'} to {endDate || 'Present'}</p>
            </div>
            <div className="text-right text-xs">
              <span className="font-bold block">Generated: {new Date().toISOString().split('T')[0]}</span>
            </div>
          </div>

          {/* Type 1: Project summary report */}
          {reportType === 'project' && (
            <div className="space-y-4">
              <h3 className="text-sm sm:text-base font-bold text-zinc-900 tracking-tight">Active Projects Summary</h3>

              {/* Mobile Card List */}
              <div className="space-y-3 md:hidden">
                {filteredProjects.map((p) => (
                  <div key={p.id} className="bg-zinc-50 border border-zinc-250/60 rounded-xl p-3.5 space-y-2 text-xs">
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-zinc-950 text-sm leading-tight">{p.projectName}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${p.status === 'Completed' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                        {p.status}
                      </span>
                    </div>
                    <div className="text-zinc-500 space-y-1">
                      <p>Location: <b className="text-zinc-805 font-semibold">{p.location}</b></p>
                      <p>Timeline: <b className="text-zinc-805 font-semibold">{p.startDate} to {p.expectedEndDate}</b></p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-200/50">
                      <div>
                        <span className="text-[9px] text-zinc-400 uppercase block font-bold">Budget Limit</span>
                        <span className="font-bold text-zinc-900">{formatCur(p.totalBudget)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-zinc-400 uppercase block font-bold">Site Costs</span>
                        <span className="font-bold text-zinc-900">{formatCur(p.totalExpenses)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-zinc-400 uppercase block font-bold">Actual Paid</span>
                        <span className="font-bold text-zinc-900 text-emerald-800">{formatCur(p.totalPaidAmount)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-zinc-400 uppercase block font-bold">Operate Margin</span>
                        <span className={`font-bold ${p.profitLoss >= 0 ? 'text-emerald-700' : 'text-red-650'}`}>
                          {formatCur(p.profitLoss)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredProjects.length === 0 && (
                  <p className="text-xs text-zinc-400 italic text-center py-6 bg-zinc-50 rounded-xl border border-dashed border-zinc-200">No projects recorded today.</p>
                )}
              </div>

              {/* Desktop view */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs text-left text-zinc-600 border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 text-zinc-400 uppercase font-bold text-[9px] border-b">
                      <th className="py-2.5 px-3">Project Title</th>
                      <th className="py-2.5 px-3">Location</th>
                      <th className="py-2.5 px-3">Timeline</th>
                      <th className="py-2.5 px-3 text-right">Combined Budget</th>
                      <th className="py-2.5 px-3 text-right">Site Expenses</th>
                      <th className="py-2.5 px-3 text-right">Actual Paid</th>
                      <th className="py-2.5 px-3 text-right">Operate Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-zinc-900">
                    {filteredProjects.map((p) => (
                      <tr key={p.id} className="hover:bg-zinc-50/40">
                        <td className="py-3 px-3 font-bold">{p.projectName}</td>
                        <td className="py-3 px-3 text-zinc-500">{p.location}</td>
                        <td className="py-3 px-3 text-zinc-500">{p.startDate} to {p.expectedEndDate}</td>
                        <td className="py-3 px-3 text-right font-medium">{formatCur(p.totalBudget)}</td>
                        <td className="py-3 px-3 text-right font-medium">{formatCur(p.totalExpenses)}</td>
                        <td className="py-3 px-3 text-right font-medium text-emerald-800">{formatCur(p.totalPaidAmount)}</td>
                        <td className={`py-3 px-3 text-right font-bold ${p.profitLoss >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {formatCur(p.profitLoss)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Type 2: Task-wise expense report */}
          {reportType === 'task_expense' && (
            <div className="space-y-4">
              <h3 className="text-sm sm:text-base font-bold text-zinc-900 tracking-tight">Expenditures Report</h3>

              {/* Mobile Card List */}
              <div className="space-y-3 md:hidden">
                {filteredExpenses.map((e) => (
                  <div key={e.id} className="bg-zinc-50 border border-zinc-250/60 rounded-xl p-3.5 space-y-2 text-xs">
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-zinc-950 text-sm leading-tight">{e.paidTo}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-200 text-zinc-700">
                        {e.category}
                      </span>
                    </div>
                    <div className="space-y-1 text-[11px] text-zinc-500">
                      <p>Task: <b className="text-zinc-800 font-semibold">{e.taskName}</b></p>
                      <p>Date: {e.date} • Method: {e.paymentMethod}</p>
                      {e.notes && <p className="italic bg-white border p-1.5 rounded text-[10px] text-zinc-600">&quot;{e.notes}&quot;</p>}
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-zinc-200/50">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase">Allocated Outflow</span>
                      <span className="font-black text-zinc-950 text-sm">{formatCur(e.amount)}</span>
                    </div>
                  </div>
                ))}
                {filteredExpenses.length === 0 && (
                  <p className="text-xs text-zinc-400 italic text-center py-6 bg-zinc-50 rounded-xl border border-dashed border-zinc-200">No expenses found.</p>
                )}
              </div>

              {/* Desktop view */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs text-left text-zinc-600 border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 text-zinc-400 uppercase font-bold text-[9px] border-b">
                      <th className="py-2.5 px-3">Voucher Date</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Task Scope</th>
                      <th className="py-2.5 px-3">Vendor / Payee</th>
                      <th className="py-2.5 px-3">Disburse Method</th>
                      <th className="py-2.5 px-3 text-right">Allocated Outflow</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-zinc-900">
                    {filteredExpenses.map((e) => (
                      <tr key={e.id} className="hover:bg-zinc-50/40">
                        <td className="py-3 px-3">{e.date}</td>
                        <td className="py-3 px-3 font-semibold text-zinc-500">{e.category}</td>
                        <td className="py-3 px-3 font-medium">{e.taskName}</td>
                        <td className="py-3 px-3 font-bold">{e.paidTo}</td>
                        <td className="py-3 px-3">{e.paymentMethod}</td>
                        <td className="py-3 px-3 text-right font-black">{formatCur(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Type 3: Labour attendance report */}
          {reportType === 'labour' && (
            <div className="space-y-4">
              <h3 className="text-sm sm:text-base font-bold text-zinc-900 tracking-tight">Labour Wages Sheet</h3>

              {/* Mobile Card List */}
              <div className="space-y-3 md:hidden">
                {filteredAttendance.map((a) => {
                  const finalDue = (a.status === 'Present' ? a.dailyWage : a.status === 'Half Day' ? a.dailyWage * 0.5 : 0) + (a.overtimeAmount || 0);
                  return (
                    <div key={a.id} className="bg-zinc-50 border border-zinc-250/60 rounded-xl p-3.5 space-y-2 text-xs">
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-zinc-950 text-sm leading-tight">{a.workerName}</span>
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${a.status === 'Present' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                          }`}>
                          {a.status}
                        </span>
                      </div>
                      <div className="space-y-1 text-[11px] text-zinc-500">
                        <p>Task: <b className="text-zinc-800 font-semibold">{a.taskName}</b></p>
                        <p>Date: {a.date} • Payout: <b className="text-zinc-800 font-semibold">{a.paymentStatus}</b></p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-200/50">
                        <div>
                          <span className="text-[9px] text-zinc-400 uppercase block font-bold">Overtime Wage</span>
                          <span className="font-semibold text-zinc-700">{formatCur(a.overtimeAmount || 0)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] text-zinc-400 uppercase block font-bold">Total Priced Wage</span>
                          <span className="font-extrabold text-zinc-950 text-sm">{formatCur(finalDue)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredAttendance.length === 0 && (
                  <p className="text-xs text-zinc-400 italic text-center py-6 bg-zinc-50 rounded-xl border border-dashed border-zinc-200">No attendance logs found.</p>
                )}
              </div>

              {/* Desktop view */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs text-left text-zinc-600 border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 text-zinc-400 uppercase font-bold text-[9px] border-b">
                      <th className="py-2.5 px-3">Log Date</th>
                      <th className="py-2.5 px-3">Worker Name</th>
                      <th className="py-2.5 px-3">Scope Area</th>
                      <th className="py-2.5 px-3">Check-In Status</th>
                      <th className="py-2.5 px-3 text-center">Overtime amount</th>
                      <th className="py-2.5 px-3 text-right">Priced Wage</th>
                      <th className="py-2.5 px-3 text-right">Payouts status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-zinc-900">
                    {filteredAttendance.map((a) => {
                      const finalDue = (a.status === 'Present' ? a.dailyWage : a.status === 'Half Day' ? a.dailyWage * 0.5 : 0) + (a.overtimeAmount || 0);
                      return (
                        <tr key={a.id} className="hover:bg-zinc-50/40">
                          <td className="py-3 px-3">{a.date}</td>
                          <td className="py-3 px-3 font-bold">{a.workerName}</td>
                          <td className="py-3 px-3 font-medium">{a.taskName}</td>
                          <td className="py-3 px-3">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${a.status === 'Present' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                              }`}>
                              {a.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center text-zinc-500">{formatCur(a.overtimeAmount || 0)}</td>
                          <td className="py-3 px-3 text-right font-black">{formatCur(finalDue)}</td>
                          <td className="py-3 px-3 text-right font-bold text-zinc-700">{a.paymentStatus}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Type 4: Payment report */}
          {reportType === 'payouts' && (
            <div className="space-y-4">
              <h3 className="text-sm sm:text-base font-bold text-zinc-900 tracking-tight">Subcontractor Payouts</h3>

              {/* Mobile Card List */}
              <div className="space-y-3 md:hidden">
                {filteredPayments.map((p) => (
                  <div key={p.id} className="bg-zinc-50 border border-zinc-250/60 rounded-xl p-3.5 space-y-2 text-xs">
                    <div className="flex justify-between items-start">
                      <span className="font-extrabold text-zinc-950 text-sm leading-tight">{p.payeeName}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-200 text-zinc-700 uppercase tracking-tight">
                        {p.payeeType}
                      </span>
                    </div>
                    <div className="space-y-1 text-[11px] text-zinc-500">
                      <p>Linked Task: <b className="text-zinc-800 font-semibold">{p.taskName}</b></p>
                      <p>Date: {p.paymentDate} • Method: {p.paymentMethod}</p>
                      <p>Status: <span className={`font-semibold ${p.paymentStatus === 'Paid' ? 'text-emerald-700' : 'text-amber-700'}`}>{p.paymentStatus}</span></p>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-zinc-200/50">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase">Disbursed Amount</span>
                      <span className="font-black text-emerald-800 text-sm">{formatCur(p.amount)}</span>
                    </div>
                  </div>
                ))}
                {filteredPayments.length === 0 && (
                  <p className="text-xs text-zinc-400 italic text-center py-6 bg-zinc-50 rounded-xl border border-dashed border-zinc-200">No payout records found.</p>
                )}
              </div>

              {/* Desktop view */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs text-left text-zinc-600 border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 text-zinc-400 uppercase font-bold text-[9px] border-b">
                      <th className="py-2.5 px-3">Transfer Date</th>
                      <th className="py-2.5 px-3">Payee Type</th>
                      <th className="py-2.5 px-3">Payee Designation</th>
                      <th className="py-2.5 px-3">Task Scope</th>
                      <th className="py-2.5 px-3">Payment Method</th>
                      <th className="py-2.5 px-3 text-right">Transfer status</th>
                      <th className="py-2.5 px-3 text-right">Disbursed Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-zinc-900">
                    {filteredPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-zinc-50/40">
                        <td className="py-3 px-3">{p.paymentDate}</td>
                        <td className="py-3 px-3 font-bold text-zinc-500">{p.payeeType}</td>
                        <td className="py-3 px-3 font-extrabold">{p.payeeName}</td>
                        <td className="py-3 px-3 font-medium text-zinc-600">{p.taskName}</td>
                        <td className="py-3 px-3 text-zinc-500">{p.paymentMethod}</td>
                        <td className="py-3 px-3 text-right font-bold text-zinc-600">{p.paymentStatus}</td>
                        <td className="py-3 px-3 text-right font-black text-emerald-800">{formatCur(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Type 5: Profit and Loss Tracking */}
          {reportType === 'profit_loss' && (
            <div className="space-y-4">
              <h3 className="text-sm sm:text-base font-bold text-zinc-900 tracking-tight">Financial Profit & Loss Sheet</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-zinc-50 rounded-xl p-3.5 border border-zinc-200/60">
                  <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Most Profitable Tasks</h4>
                  <div className="space-y-2">
                    {filteredTasks.slice().sort((a, b) => (b.profitLoss - a.profitLoss)).slice(0, 3).map(k => (
                      <div key={k.id} className="flex justify-between text-xs font-semibold">
                        <span className="text-zinc-800 truncate max-w-[170px]">{k.taskName}</span>
                        <span className="text-emerald-700">{formatCur(k.profitLoss)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-rose-50/40 rounded-xl p-3.5 border border-rose-100">
                  <h4 className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-2">Deficit Task Scopes</h4>
                  <div className="space-y-2">
                    {filteredTasks.filter(k => k.profitLoss < 0).map(k => (
                      <div key={k.id} className="flex justify-between text-xs font-semibold">
                        <span className="text-zinc-800 truncate max-w-[170px]">{k.taskName}</span>
                        <span className="text-rose-700 font-bold">{formatCur(k.profitLoss)}</span>
                      </div>
                    ))}
                    {filteredTasks.filter(k => k.profitLoss < 0).length === 0 && (
                      <p className="text-[11px] text-zinc-400 italic">No loss-making tasks recorded ! All scopes are in green.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Mobile Card List */}
              <div className="space-y-3 md:hidden">
                {filteredTasks.map((t) => {
                  const expensesSum = (t.directExpenses || 0) + (t.labourCost || 0) + (t.outsideLabourCost || 0) + (t.pendingExpenses || 0) + (t.pendingOutsideLabourCost || 0);
                  const isProfit = t.profitLoss >= 0;
                  return (
                    <div key={t.id} className="bg-zinc-50 border border-zinc-250/60 rounded-xl p-3.5 space-y-2 text-xs">
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-zinc-950 text-sm leading-tight">{t.taskName}</span>
                        <span className="text-[10px] text-zinc-500">{t.projectName}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-200/50">
                        <div>
                          <span className="text-[9px] text-zinc-400 uppercase block font-bold">Budget Limit</span>
                          <span className="font-bold text-zinc-900">{formatCur(t.assignedBudget)}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-zinc-400 uppercase block font-bold">Outflow Cost</span>
                          <span className="font-bold text-zinc-950">{formatCur(expensesSum)}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-zinc-400 uppercase block font-bold">Active Balance</span>
                          <span className={`font-bold ${t.remainingBudget >= 0 ? 'text-zinc-700' : 'text-rose-600'}`}>
                            {formatCur(t.remainingBudget)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] text-zinc-400 uppercase block font-bold">Net Profit</span>
                          <span className={`font-black ${isProfit ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {formatCur(t.profitLoss)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop view */}
              <div className="hidden md:block overflow-x-auto pt-2">
                <table className="w-full text-xs text-left text-zinc-600 border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 text-zinc-400 uppercase font-bold text-[9px] border-b">
                      <th className="py-2.5 px-3">Task Name</th>
                      <th className="py-2.5 px-3">Parent project</th>
                      <th className="py-2.5 px-3 text-right">Assigned Budget</th>
                      <th className="py-2.5 px-3 text-right">Sum Outflow Costs</th>
                      <th className="py-2.5 px-3 text-right">Labour portion</th>
                      <th className="py-2.5 px-3 text-right">Out. Labour</th>
                      <th className="py-2.5 px-3 text-right">Active Balance</th>
                      <th className="py-2.5 px-3 text-right">Profit / Deficit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-zinc-900">
                    {filteredTasks.map((t) => {
                      const expensesSum = (t.directExpenses || 0) + (t.labourCost || 0) + (t.outsideLabourCost || 0) + (t.pendingExpenses || 0) + (t.pendingOutsideLabourCost || 0);
                      const isProfit = t.profitLoss >= 0;
                      return (
                        <tr key={t.id} className="hover:bg-zinc-50/40">
                          <td className="py-3 px-3 font-bold">{t.taskName}</td>
                          <td className="py-3 px-3 text-zinc-500">{t.projectName}</td>
                          <td className="py-3 px-3 text-right font-medium">{formatCur(t.assignedBudget)}</td>
                          <td className="py-3 px-3 text-right font-medium">{formatCur(expensesSum)}</td>
                          <td className="py-3 px-3 text-right text-zinc-500">{formatCur(t.labourCost || 0)}</td>
                          <td className="py-3 px-3 text-right text-zinc-500">{formatCur((t.outsideLabourCost || 0) + (t.pendingOutsideLabourCost || 0))}</td>
                          <td className={`py-3 px-3 text-right font-bold ${t.remainingBudget >= 0 ? 'text-zinc-700' : 'text-red-500'}`}>
                            {formatCur(t.remainingBudget)}
                          </td>
                          <td className={`py-3 px-3 text-right font-black ${isProfit ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {formatCur(t.profitLoss)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Type 6: Pending payment report */}
          {reportType === 'pending' && (
            <div className="space-y-4">
              <h3 className="text-sm sm:text-base font-bold text-zinc-900 tracking-tight flex items-center gap-2">
                <AlertTriangle className="w-4.5 h-4.5 text-amber-500" />
                <span>Outstanding Unpaid Balances</span>
              </h3>

              {/* Mobile Card List */}
              <div className="space-y-3 md:hidden">
                {/* Retrieve both pending bills and unpaid labor attendances */}
                {filteredPayments.filter(p => p.paymentStatus !== 'Paid').map((p) => (
                  <div key={p.id} className="bg-zinc-50 border border-zinc-250/60 rounded-xl p-3.5 space-y-2 text-xs">
                    <div className="flex justify-between items-start">
                      <span className="font-extrabold text-zinc-950 text-sm leading-tight">{p.payeeName}</span>
                      <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold uppercase">High Risk</span>
                    </div>
                    <div className="space-y-1 text-[11px] text-zinc-500">
                      <p>Liability: <b className="text-zinc-800 font-semibold">{p.payeeType} Liability</b></p>
                      <p>Linked Task: {p.taskName}</p>
                      <p>Due Date: {p.paymentDate}</p>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-zinc-200/50">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase">Outstanding Debt</span>
                      <span className="font-black text-rose-700 text-sm">{formatCur(p.amount)}</span>
                    </div>
                  </div>
                ))}
                {filteredAttendance.filter(a => a.paymentStatus !== 'Paid').map((a) => {
                  const laborWage = (a.status === 'Present' ? a.dailyWage : a.status === 'Half Day' ? a.dailyWage * 0.5 : 0) + (a.overtimeAmount || 0);
                  return (
                    <div key={a.id} className="bg-zinc-50 border border-zinc-250/60 rounded-xl p-3.5 space-y-2 text-xs">
                      <div className="flex justify-between items-start">
                        <span className="font-extrabold text-zinc-950 text-sm leading-tight">{a.workerName}</span>
                        <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase">Standard</span>
                      </div>
                      <div className="space-y-1 text-[11px] text-zinc-500">
                        <p>Liability: <b className="text-zinc-800 font-semibold">Labour Wage ({a.status})</b></p>
                        <p>Linked Task: {a.taskName}</p>
                        <p>Log Date: {a.date}</p>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-zinc-200/50">
                        <span className="text-[10px] text-zinc-400 font-bold uppercase">Outstanding Debt</span>
                        <span className="font-black text-rose-700 text-sm">{formatCur(laborWage)}</span>
                      </div>
                    </div>
                  );
                })}
                {filteredPayments.filter(p => p.paymentStatus !== 'Paid').length === 0 &&
                  filteredAttendance.filter(a => a.paymentStatus !== 'Paid').length === 0 && (
                    <p className="text-xs text-zinc-400 italic text-center py-6 bg-zinc-50 rounded-xl border border-dashed border-zinc-200">No outstanding unpaid balances recorded.</p>
                  )}
              </div>

              {/* Desktop view */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs text-left text-zinc-600 border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 text-zinc-400 uppercase font-bold text-[9px] border-b">
                      <th className="py-2.5 px-3">Date Flagged</th>
                      <th className="py-2.5 px-3">Obligation Type</th>
                      <th className="py-2.5 px-3">Creditor designations</th>
                      <th className="py-2.5 px-3">Linked Task scope</th>
                      <th className="py-2.5 px-3 text-right">Risk Factor</th>
                      <th className="py-2.5 px-3 text-right">Outstanding Debt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-zinc-900">
                    {filteredPayments.filter(p => p.paymentStatus !== 'Paid').map((p) => (
                      <tr key={p.id} className="hover:bg-zinc-50/40">
                        <td className="py-3 px-3">{p.paymentDate}</td>
                        <td className="py-3 px-3 text-zinc-500 font-bold">{p.payeeType} Liability</td>
                        <td className="py-3 px-3 font-extrabold">{p.payeeName}</td>
                        <td className="py-3 px-3 font-medium">{p.taskName}</td>
                        <td className="py-3 px-3 text-right"><span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-black uppercase">High</span></td>
                        <td className="py-3 px-3 text-right font-black text-rose-700">{formatCur(p.amount)}</td>
                      </tr>
                    ))}
                    {filteredAttendance.filter(a => a.paymentStatus !== 'Paid').map((a) => {
                      const laborWage = (a.status === 'Present' ? a.dailyWage : a.status === 'Half Day' ? a.dailyWage * 0.5 : 0) + (a.overtimeAmount || 0);
                      return (
                        <tr key={a.id} className="hover:bg-zinc-50/40">
                          <td className="py-3 px-3">{a.date}</td>
                          <td className="py-3 px-3 text-zinc-500 font-semibold">Labour Crew</td>
                          <td className="py-3 px-3 font-bold">{a.workerName}</td>
                          <td className="py-3 px-3 font-medium">{a.taskName}</td>
                          <td className="py-3 px-3 text-right"><span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-bold uppercase">Standard</span></td>
                          <td className="py-3 px-3 text-right font-black text-rose-700">{formatCur(laborWage)}</td>
                        </tr>
                      );
                    })}
                    {filteredPayments.filter(p => p.paymentStatus !== 'Paid').length === 0 &&
                      filteredAttendance.filter(a => a.paymentStatus !== 'Paid').length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-zinc-400 font-medium italic">
                            No pending balances outstanding.
                          </td>
                        </tr>
                      )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {reportType === 'monthly' && (
            <div className="space-y-4">
              <h3 className="text-sm sm:text-base font-bold text-zinc-900 tracking-tight">Monthly Cashflow Summary</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-zinc-600 border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 text-zinc-400 uppercase font-bold text-[9px] border-b">
                      <th className="py-2.5 px-3">Month</th>
                      <th className="py-2.5 px-3 text-right">Total Inflow (₹)</th>
                      <th className="py-2.5 px-3 text-right">Direct Expenses (₹)</th>
                      <th className="py-2.5 px-3 text-right">Labour Wages (₹)</th>
                      <th className="py-2.5 px-3 text-right">Net Cashflow (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-zinc-900">
                    {Array.from(new Set(expenses.map(e => e.date.slice(0, 7)))).sort().reverse().map(month => {
                      const mInflow = summaryStats?.officeTransactions?.filter(t => t.date.startsWith(month) && t.type === 'Cash In').reduce((s, t) => s + t.amount, 0) || 0;
                      const mExp = expenses.filter(e => e.date.startsWith(month)).reduce((s, e) => s + e.amount, 0);
                      const mWage = attendance.filter(a => a.date.startsWith(month)).reduce((s, a) => s + ((a.status === 'Present' ? a.dailyWage : a.status === 'Half Day' ? a.dailyWage * 0.5 : 0) + (a.overtimeAmount || 0)), 0);
                      return (
                        <tr key={month} className="hover:bg-zinc-50/40">
                          <td className="py-3 px-3 font-bold">{month}</td>
                          <td className="py-3 px-3 text-right text-emerald-700 font-bold">{formatCur(mInflow)}</td>
                          <td className="py-3 px-3 text-right">{formatCur(mExp)}</td>
                          <td className="py-3 px-3 text-right">{formatCur(mWage)}</td>
                          <td className={`py-3 px-3 text-right font-black ${mInflow - (mExp + mWage) >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {formatCur(mInflow - (mExp + mWage))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {reportType === 'vendor_worker' && (
            <div className="space-y-4">
              <h3 className="text-sm sm:text-base font-bold text-zinc-900 tracking-tight">Payee Detailed Ledger</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-zinc-600 border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 text-zinc-400 uppercase font-bold text-[9px] border-b">
                      <th className="py-2.5 px-3">Payee Name</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 text-right">Total Allocated (Bills)</th>
                      <th className="py-2.5 px-3 text-right">Total Paid (Payouts)</th>
                      <th className="py-2.5 px-3 text-right">Outstanding Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-zinc-900">
                    {Array.from(new Set([...expenses.map(e => e.paidTo), ...payments.map(p => p.payeeName)])).sort().map(name => {
                      const totalBilled = expenses.filter(e => e.paidTo === name).reduce((s, e) => s + e.amount, 0);
                      const totalPaid = payments.filter(p => p.payeeName === name && p.paymentStatus === 'Paid').reduce((s, p) => s + p.amount, 0);
                      const wageBilled = attendance.filter(a => a.workerName === name).reduce((s, a) => s + ((a.status === 'Present' ? a.dailyWage : a.status === 'Half Day' ? a.dailyWage * 0.5 : 0) + (a.overtimeAmount || 0)), 0);
                      const totalAllocated = totalBilled + wageBilled;
                      return (
                        <tr key={name} className="hover:bg-zinc-50/40">
                          <td className="py-3 px-3 font-bold">{name}</td>
                          <td className="py-3 px-3 text-zinc-500">
                            {payments.find(p => p.payeeName === name)?.payeeType || (wageBilled > 0 ? 'Worker' : 'Vendor')}
                          </td>
                          <td className="py-3 px-3 text-right">{formatCur(totalAllocated)}</td>
                          <td className="py-3 px-3 text-right text-emerald-700 font-bold">{formatCur(totalPaid)}</td>
                          <td className={`py-3 px-3 text-right font-black ${totalAllocated - totalPaid >= 0 ? 'text-rose-600' : 'text-zinc-900'}`}>
                            {formatCur(totalAllocated - totalPaid)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}


        </div>
      )}

    </div>
  );
}
