import React, { useState, useEffect } from 'react';
import { 
  Plus, Calendar, CheckSquare, Search, Trash2, Edit2, CheckCircle2, 
  X, ShieldAlert, Users, PlusCircle, BookmarkCheck, ArrowLeft 
} from 'lucide-react';
import { api } from '../api/client';
import { Attendance, AttendanceStatus } from '../types';

interface AttendanceProps {
  initialProjectId?: string;
  initialTaskId?: string;
}

export default function AttendancePage({ initialProjectId, initialTaskId }: AttendanceProps) {
  const [attendance, setAttendance] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [projectFilter, setProjectFilter] = useState<string>(initialProjectId || 'All');
  const [taskFilter, setTaskFilter] = useState<string>(initialTaskId || 'All');
  const [dateFilter, setDateFilter] = useState<string>(new Date().toISOString().split('T')[0]);

  // Form states
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Field states (Bulk markup)
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Bulks - seed some standard worker helpers
  const [bulkWorkers, setBulkWorkers] = useState<any[]>([
    { workerName: 'Dave Cooper', status: 'Present', dailyWage: 250, overtimeAmount: 0 },
    { workerName: 'Manny Ramirez', status: 'Present', dailyWage: 200, overtimeAmount: 0 },
    { workerName: 'Samuel Jackson', status: 'Present', dailyWage: 220, overtimeAmount: 0 },
    { workerName: 'Arnie S.', status: 'Present', dailyWage: 300, overtimeAmount: 0 }
  ]);

  // Single edit states
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [workerName, setWorkerName] = useState('');
  const [editStatus, setEditStatus] = useState<AttendanceStatus>('Present');
  const [editWage, setEditWage] = useState(0);
  const [editOvertime, setEditOvertime] = useState(0);
  const [editPaymentStatus, setEditPaymentStatus] = useState<'Paid' | 'Pending'>('Pending');
  const [editNotes, setEditNotes] = useState('');

  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, [projectFilter, taskFilter, dateFilter]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const prjs = await api.getProjects();
      setProjects(prjs.projects || []);

      const attRes = await api.getAttendance(
        projectFilter !== 'All' ? projectFilter : undefined,
        taskFilter !== 'All' ? taskFilter : undefined,
        dateFilter || undefined
      );
      setAttendance(attRes.attendance || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to download attendance logs');
    } finally {
      setLoading(false);
    }
  };

  // Sync tasks list when project is changed
  useEffect(() => {
    if (projectId) {
      api.getTasks(projectId).then(res => {
        setTasks(res.tasks || []);
        if (res.tasks && res.tasks.length > 0) {
          setTaskId(res.tasks[0].id);
        }
      });
    } else {
      setTasks([]);
    }
  }, [projectId]);

  const handleOpenBulk = () => {
    setProjectId(projects[0]?.id || '');
    setDate(new Date().toISOString().split('T')[0]);
    setSubmitError(null);
    setIsBulkOpen(true);
  };

  const handleAddWorkerRow = () => {
    setBulkWorkers([
      ...bulkWorkers,
      { workerName: '', status: 'Present', dailyWage: 200, overtimeAmount: 0 }
    ]);
  };

  const handleRemoveWorkerRow = (idx: number) => {
    setBulkWorkers(bulkWorkers.filter((_, i) => i !== idx));
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim() !== '');
      
      // Assume CSV format: Worker Name, Daily Wage, Overtime, Status
      // Skip header if it exists
      const startIdx = (lines[0].toLowerCase().includes('name')) ? 1 : 0;
      
      const importedWorkers = lines.slice(startIdx).map(line => {
        const [name, wage, overtime, status] = line.split(',').map(s => s.trim());
        return {
          workerName: name || '',
          dailyWage: Number(wage) || 200,
          overtimeAmount: Number(overtime) || 0,
          status: (status === 'Absent' || status === 'Half Day') ? status : 'Present'
        };
      });

      setBulkWorkers([...bulkWorkers, ...importedWorkers]);
      setIsImporting(false);
    };
    reader.readAsText(file);
  };

  const handleWorkerFieldChange = (idx: number, field: string, val: any) => {
    const updated = [...bulkWorkers];
    updated[idx] = { ...updated[idx], [field]: val };
    setBulkWorkers(updated);
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !taskId || !date) {
      setSubmitError('Project, Task, and Check-in Date are required.');
      return;
    }

    // Filter out blank worker names
    const filteredWorkers = bulkWorkers.filter(w => w.workerName.trim() !== '');
    if (filteredWorkers.length === 0) {
      setSubmitError('At least one worker name must be registered.');
      return;
    }

    try {
      setSubmitError(null);
      await api.bulkAttendance({
        projectId,
        taskId,
        date,
        workers: filteredWorkers
      });
      setIsBulkOpen(false);
      fetchInitialData();
    } catch (err: any) {
      setSubmitError(err?.message || 'Error occurred while batch-submitting workers check-in');
    }
  };

  const handleOpenEditSingle = (record: any) => {
    setEditingRecord(record);
    setWorkerName(record.workerName);
    setEditStatus(record.status);
    setEditWage(record.dailyWage);
    setEditOvertime(record.overtimeAmount || 0);
    setEditPaymentStatus(record.paymentStatus);
    setEditNotes(record.notes || '');
    setSubmitError(null);
    setIsEditOpen(true);
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;

    try {
      setSubmitError(null);
      await api.updateAttendance(editingRecord.id, {
        workerName,
        status: editStatus,
        dailyWage: Number(editWage),
        overtimeAmount: Number(editOvertime),
        paymentStatus: editPaymentStatus,
        notes: editNotes
      });
      setIsEditOpen(false);
      fetchInitialData();
    } catch (err: any) {
      setSubmitError(err?.message || 'Error syncing single attendance entry');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Erase this labor check-in slot? This will reduce the calculated task labour cost.')) {
      return;
    }
    try {
      await api.deleteAttendance(id);
      fetchInitialData();
    } catch (err: any) {
      alert(err.message || 'Error occurred');
    }
  };

  const togglePaymentStatus = async (record: any) => {
    try {
      const nextPayStatus = record.paymentStatus === 'Paid' ? 'Pending' : 'Paid';
      await api.updateAttendance(record.id, {
        status: record.status,
        dailyWage: record.dailyWage,
        overtimeAmount: record.overtimeAmount,
        paymentStatus: nextPayStatus
      });
      fetchInitialData();
    } catch (err: any) {
      alert(err.message || 'Error updating payout status');
    }
  };

  // Calculations
  const calculatedAttendanceCost = attendance.reduce((sum, att) => {
    let portion = att.status === 'Present' ? 1 : att.status === 'Half Day' ? 0.5 : 0;
    return sum + (att.dailyWage * portion) + (att.overtimeAmount || 0);
  }, 0);

  const formatCur = (num: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(num);
  };

  return (
    <div className="space-y-6 font-sans">
      
      {!isBulkOpen && !isEditOpen && (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-zinc-950">Daily Labor Crew</h1>
              <p className="text-xs sm:text-sm text-zinc-500">Track on-site personnel attendance, overtime, wages, and payouts status</p>
            </div>
            
            <button
              onClick={handleOpenBulk}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-zinc-950 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-zinc-800 transition-colors"
            >
              <CheckSquare className="w-4 h-4" />
              <span>Mark Today’s Crew</span>
            </button>
          </div>

          {/* Quick Stats banner */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border rounded-xl p-4 flex flex-col justify-between shadow-sm">
              <span className="text-[10px] text-zinc-400 font-bold uppercase block tracking-wider">Logged present</span>
              <span className="text-2xl font-black text-zinc-950 block mt-1">{attendance.filter(a => a.status !== 'Absent').length} workers</span>
            </div>
            <div className="bg-white border rounded-xl p-4 flex flex-col justify-between shadow-sm">
              <span className="text-[10px] text-zinc-400 font-bold uppercase block tracking-wider">Accumulated Wage Costs</span>
              <span className="text-2xl font-black text-emerald-700 block mt-1">{formatCur(calculatedAttendanceCost)}</span>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white border rounded-xl p-4 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-0.5">Filter project</label>
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
              <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-0.5">Focus Date</label>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs font-semibold text-zinc-700 outline-none text-zinc-950"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={() => {
                  setProjectFilter('All');
                  setTaskFilter('All');
                  setDateFilter(new Date().toISOString().split('T')[0]);
                }}
                className="w-full text-center py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs rounded-xl font-semibold transition-all"
              >
                Reset Focused Scope
              </button>
            </div>
          </div>

          {/* Attendance Ledger entries */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-zinc-900/10 border-t-zinc-900 rounded-full animate-spin"></div>
            </div>
          ) : attendance.length === 0 ? (
            <div className="p-8 border border-dashed rounded-2xl text-center bg-zinc-50">
              <Users className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
              <p className="text-xs text-zinc-500">No personnel booked for this selection on {dateFilter}. Click &quot;Mark Today&apos;s Crew&quot; to check workers in.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {attendance.map((att) => {
                const totalDue = (att.status === 'Present' ? att.dailyWage : att.status === 'Half Day' ? att.dailyWage * 0.5 : 0) + (att.overtimeAmount || 0);
                return (
                  <div 
                    key={att.id}
                    className="bg-white border rounded-xl p-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold tracking-tight uppercase ${
                          att.status === 'Present' ? 'bg-emerald-50 text-emerald-700' :
                          att.status === 'Half Day' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {att.status}
                        </span>
                        <h4 className="text-sm font-extrabold text-zinc-950">{att.workerName}</h4>
                      </div>
                      <p className="text-[10px] text-zinc-400 font-semibold mt-1">
                        Task: {att.taskName} • Project: {att.projectName}
                      </p>
                      {att.notes && (
                        <p className="text-[11px] text-zinc-400 mt-1 italic">&quot;{att.notes}&quot;</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-0 pt-2.5 sm:pt-0 border-zinc-100">
                      <div className="text-left sm:text-right">
                        <span className="text-xs text-zinc-400 font-semibold block">Total Due:</span>
                        <span className="text-sm sm:text-base font-extrabold text-zinc-950 block">{formatCur(totalDue)}</span>
                      </div>

                      {/* Payment Toggle Switch directly on interface */}
                      <div>
                        <button
                          onClick={() => togglePaymentStatus(att)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold w-24 text-center cursor-pointer transition-colors ${
                            att.paymentStatus === 'Paid' 
                              ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800' 
                              : 'bg-amber-50 hover:bg-amber-100 text-amber-800'
                          }`}
                        >
                          {att.paymentStatus === 'Paid' ? 'Paid ✓' : 'Pending'}
                        </button>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1.5">
                        <button 
                          onClick={() => handleOpenEditSingle(att)}
                          className="p-1.5 bg-zinc-50 border text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
                          title="Edit Personnel entry"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleDelete(att.id)}
                          className="p-1.5 bg-zinc-50 border text-rose-500 hover:text-rose-900 rounded-lg hover:bg-rose-50 transition-colors"
                          title="Erase check-in slot"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* FORM MODAL: Bulk Check-in today */}
      {isBulkOpen && (
        <div className="bg-white border rounded-2xl p-5 sm:p-6 shadow-md max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between border-b pb-3 border-zinc-100">
            <h2 className="text-base sm:text-lg font-extrabold text-zinc-950 flex items-center gap-1.5">
              <CheckSquare className="w-5 h-5 text-zinc-600" />
              <span>Mark Attendance (On-Site Personnel)</span>
            </h2>
            <button 
              onClick={() => setIsBulkOpen(false)}
              className="px-2.5 py-1.5 bg-zinc-100 font-bold hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs transition-colors"
            >
              Cancel
            </button>
          </div>

          {submitError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs sm:text-sm">
              {submitError}
            </div>
          )}

          <form onSubmit={handleBulkSubmit} className="space-y-4 text-xs sm:text-sm">
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                  Active Project Scope
                </label>
                <select
                  required
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none"
                >
                  <option value="" disabled>Select project...</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.projectName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                  Task Segment
                </label>
                <select
                  required
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none"
                >
                  <option value="" disabled>Select task...</option>
                  {tasks.map(t => (
                    <option key={t.id} value={t.id}>{t.taskName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                  Work Check-In Date
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none"
                />
              </div>
            </div>

            {/* Attendance Roster */}
            <div className="space-y-3 sm:space-y-0 sm:border sm:border-zinc-200 sm:rounded-2xl sm:overflow-hidden">
              <div className="hidden sm:grid bg-zinc-50 p-2.5 border-b font-bold text-[10px] text-zinc-400 uppercase tracking-wider grid-cols-12 gap-2 text-center">
                <div className="col-span-4 text-left pl-1">Worker Name</div>
                <div className="col-span-3">Status</div>
                <div className="col-span-2">Daily Wage (₹)</div>
                <div className="col-span-2">Overtime (₹)</div>
                <div className="col-span-1">Action</div>
              </div>

              <div className="space-y-3 sm:space-y-0 sm:divide-y max-h-[350px] sm:max-h-[250px] overflow-y-auto">
                {bulkWorkers.map((w, idx) => (
                  <div key={idx} className="bg-white border sm:border-0 rounded-xl p-3.5 sm:p-2 flex flex-col sm:grid sm:grid-cols-12 gap-3 sm:gap-2 items-stretch sm:items-center text-center shadow-sm sm:shadow-none">
                    <div className="sm:col-span-4 text-left">
                      <label className="block sm:hidden text-[9px] font-bold text-zinc-400 uppercase mb-1">Worker Name</label>
                      <input
                        type="text"
                        required
                        placeholder="Worker name"
                        value={w.workerName}
                        onChange={(e) => handleWorkerFieldChange(idx, 'workerName', e.target.value)}
                        className="w-full px-3 py-2 sm:py-1.5 bg-white border border-zinc-200 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-zinc-900"
                      />
                    </div>
                    <div className="sm:col-span-3 text-left sm:text-center">
                      <label className="block sm:hidden text-[9px] font-bold text-zinc-400 uppercase mb-1">Status</label>
                      <select
                        value={w.status}
                        onChange={(e) => handleWorkerFieldChange(idx, 'status', e.target.value as AttendanceStatus)}
                        className="w-full px-3 py-2 sm:py-1.5 border border-zinc-200 rounded-xl text-xs font-semibold bg-white cursor-pointer focus:ring-1 focus:ring-zinc-900"
                      >
                        <option value="Present">Present</option>
                        <option value="Absent">Absent</option>
                        <option value="Half Day">Half Day</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2 text-left sm:text-center">
                      <label className="block sm:hidden text-[9px] font-bold text-zinc-400 uppercase mb-1">Daily Wage (₹)</label>
                      <input
                        type="number"
                        required
                        min="0"
                        value={w.dailyWage}
                        onChange={(e) => handleWorkerFieldChange(idx, 'dailyWage', Number(e.target.value))}
                        className="w-full px-3 py-2 sm:py-1.5 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-left sm:text-center focus:ring-1 focus:ring-zinc-900"
                      />
                    </div>
                    <div className="sm:col-span-2 text-left sm:text-center">
                      <label className="block sm:hidden text-[9px] font-bold text-zinc-400 uppercase mb-1">Overtime (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={w.overtimeAmount}
                        onChange={(e) => handleWorkerFieldChange(idx, 'overtimeAmount', Number(e.target.value))}
                        className="w-full px-3 py-2 sm:py-1.5 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-left sm:text-center focus:ring-1 focus:ring-zinc-900"
                      />
                    </div>
                    <div className="sm:col-span-1 flex justify-end items-center mt-1 sm:mt-0">
                      <button
                        type="button"
                        onClick={() => handleRemoveWorkerRow(idx)}
                        disabled={bulkWorkers.length <= 1}
                        className="p-1 px-3 sm:px-1 py-1.5 rounded bg-rose-50 text-rose-600 sm:bg-transparent sm:text-zinc-300 hover:text-red-600 disabled:opacity-40 transition-colors cursor-pointer w-full sm:w-auto text-xs font-bold sm:font-normal flex items-center justify-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span className="sm:hidden">Remove Worker</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

             <div className="flex justify-between items-center">
               <button
                 type="button"
                 onClick={handleAddWorkerRow}
                 className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
               >
                 <PlusCircle className="w-4 h-4 text-zinc-600" />
                 <span>Add On-Site Laborer</span>
               </button>

               <div className="flex items-center gap-2">
                 <label className="cursor-pointer px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-600 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 border border-zinc-200">
                   <Users className="w-4 h-4" />
                   <span>{isImporting ? 'Importing...' : 'Import CSV'}</span>
                   <input 
                     type="file" 
                     accept=".csv" 
                     className="hidden" 
                     onChange={handleImportCSV} 
                     disabled={isImporting}
                   />
                 </label>
                 
                 <button
                   type="submit"
                   className="px-5 py-2 bg-zinc-950 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-zinc-800"
                 >
                   <BookmarkCheck className="w-4 h-4" />
                   <span>Synchronize Attendances</span>
                 </button>
               </div>
             </div>

          </form>
        </div>
      )}

      {/* SINGLE FORM MODAL: Edit personnel check-in */}
      {isEditOpen && editingRecord && (
        <div className="bg-white border rounded-2xl p-5 sm:p-6 shadow-md max-w-md mx-auto space-y-4 font-sans">
          <div className="flex items-center justify-between border-b pb-3 border-zinc-100">
            <h2 className="text-base font-extrabold text-zinc-950">Modify Worker Entry</h2>
            <button 
              onClick={() => setIsEditOpen(false)}
              className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleSingleSubmit} className="space-y-4 text-xs sm:text-sm">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Worker Name</label>
              <input
                type="text"
                required
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as AttendanceStatus)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl"
                >
                  <option value="Present">Present</option>
                  <option value="Absent">Absent</option>
                  <option value="Half Day">Half Day</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Daily Standard Wage (₹)</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={editWage}
                  onChange={(e) => setEditWage(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Overtime amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={editOvertime}
                  onChange={(e) => setEditOvertime(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Payment status</label>
                <select
                  value={editPaymentStatus}
                  onChange={(e) => setEditPaymentStatus(e.target.value as 'Paid' | 'Pending')}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950"
                >
                  <option value="Pending">Pending</option>
                  <option value="Paid">Paid</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Internal Notes</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
                placeholder="masonry helper, overtime explanation, etc."
                className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-xs"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-zinc-950 hover:bg-zinc-900 text-white font-bold rounded-xl transition-colors"
            >
              Verify Personnel updates
            </button>
          </form>
        </div>
      )}

    </div>
  );
}
