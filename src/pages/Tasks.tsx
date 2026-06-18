import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Edit2, Trash2, Calendar, ClipboardList, 
  ChevronRight, ArrowLeft, RefreshCw, AlertTriangle, 
  ChevronDown, DollarSign, Briefcase, PlusCircle 
} from 'lucide-react';
import { api } from '../api/client';
import { Task, TaskStatus } from '../types';
import { notify } from '../utils/toast';
import { useConfirm } from '../context/ConfirmContext';
import TaskAttendanceSection from '../components/TaskAttendanceSection';

interface TasksProps {
  onNavigate: (page: string, params?: any) => void;
  userRole: string;
  initialProjectId?: string; // Pre-filtered project id if coming from project details
}

export default function Tasks({ onNavigate, userRole, initialProjectId }: TasksProps) {
  const confirm = useConfirm();
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [projectFilter, setProjectFilter] = useState<string>(initialProjectId || 'All');

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);

  // Field states
  const [editId, setEditId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState('');
  const [taskName, setTaskName] = useState('');
  const [description, setDescription] = useState('');
  const [assignedBudget, setAssignedBudget] = useState<number>(0);
  const [assignedStaff, setAssignedStaff] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<TaskStatus>('Pending');
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Multi-staff assignment and suggestions
  const [assignedStaffList, setAssignedStaffList] = useState<string[]>([]);
  const [crewSuggestions, setCrewSuggestions] = useState<string[]>([]);
  const [memberInput, setMemberInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, [initialProjectId]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [projectsRes, tasksRes, crewRes] = await Promise.all([
        api.getProjects(),
        api.getTasks(),
        api.getCrew('active').catch(() => ({ crew: [] }))
      ]);
      
      setProjects(projectsRes.projects || []);
      setTasks(tasksRes.tasks || []);
      setCrewSuggestions((crewRes.crew || []).map((c: any) => c.name));
    } catch (err: any) {
      const message = err?.message || 'Failed to sync construction tasks';
      setError(message);
      notify.error(message);
    } finally {
      setLoading(false);
    }
  };

  const syncTasksOnly = async () => {
    try {
      const res = await api.getTasks();
      setTasks(res.tasks || []);
    } catch (err: any) {
      notify.error(err?.message || 'Failed to refresh tasks');
    }
  };

  const handleOpenCreate = () => {
    setEditId(null);
    setProjectId(projectFilter !== 'All' ? projectFilter : (projects[0]?.id || ''));
    setTaskName('');
    setDescription('');
    setAssignedBudget(0);
    setAssignedStaff('');
    setAssignedStaffList([]);
    setMemberInput('');
    setShowSuggestions(false);
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setProgress(0);
    setStatus('Pending');
    setNotes('');
    setSubmitError(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (t: any) => {
    setEditId(t.id);
    setProjectId(t.projectId);
    setTaskName(t.taskName);
    setDescription(t.description || '');
    setAssignedBudget(t.assignedBudget);
    setAssignedStaff(t.assignedStaff || '');
    
    const parsedStaff = t.assignedStaff 
      ? t.assignedStaff.split(',').map((s: string) => s.trim()).filter(Boolean) 
      : [];
    setAssignedStaffList(parsedStaff);
    setMemberInput('');
    setShowSuggestions(false);

    setStartDate(t.startDate);
    setEndDate(t.endDate);
    setProgress(t.progress);
    setStatus(t.status);
    setNotes(t.notes || '');
    setSubmitError(null);
    setIsFormOpen(true);
  };

  const addStaffMember = (name: string) => {
    const trimmed = name.trim();
    if (trimmed && !assignedStaffList.includes(trimmed)) {
      setAssignedStaffList([...assignedStaffList, trimmed]);
    }
    setMemberInput('');
    setShowSuggestions(false);
  };

  const removeStaffMember = (name: string) => {
    setAssignedStaffList(assignedStaffList.filter(m => m !== name));
  };

  const handleDelete = async (id: string) => {
    const task = tasks.find(t => t.id === id) || selectedTask;
    const ok = await confirm({
      title: 'Delete task?',
      message: task
        ? `Delete "${task.taskName}"? Linked expenses, attendance records, and payouts will also be removed.`
        : 'Delete this task? Linked expenses, attendance records, and payouts will also be removed.',
      confirmLabel: 'Delete Task',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await api.deleteTask(id);
      setIsFormOpen(false);
      setIsViewOpen(false);
      fetchInitialData();
      notify.success('Task deleted.');
    } catch (err: any) {
      notify.error(err?.message || 'Error erasing task');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !taskName || assignedBudget === undefined || !startDate || !endDate) {
      notify.warning('Project, Name, Budget, and Timelines are required');
      return;
    }

    const payload = {
      projectId,
      taskName,
      description,
      assignedBudget: Number(assignedBudget),
      assignedStaff: assignedStaffList.join(', '),
      startDate,
      endDate,
      progress: Number(progress),
      status,
      notes
    };

    try {
      setSubmitError(null);
      if (editId) {
        await api.updateTask(editId, payload);
        notify.success('Task updated.');
      } else {
        await api.createTask(payload);
        notify.success('Task created.');
      }
      setIsFormOpen(false);
      fetchInitialData();
    } catch (err: any) {
      const message = err?.message || 'Error submitting task scope';
      setSubmitError(message);
      notify.error(message);
    }
  };

  const handleQuickProgressUpdate = async (task: any, newProg: number) => {
    const minMaxProg = Math.min(Math.max(newProg, 0), 100);
    const updatedStatus = minMaxProg >= 100 ? 'Completed' : task.status === 'Completed' ? 'In Progress' : task.status;

    // Optimistically update the UI instantly (so range slider dragging is extremely smooth)
    setTasks(prevTasks => prevTasks.map(t => {
      if (t.id === task.id) {
        return {
          ...t,
          progress: minMaxProg,
          status: updatedStatus
        };
      }
      return t;
    }));

    try {
      const payload = {
        ...task,
        progress: minMaxProg,
        status: updatedStatus
      };
      await api.updateTask(task.id, payload);
    } catch (err: any) {
      notify.error(err?.message || 'Failed to sync progress to database');
    }
  };

  const handleQuickStatusUpdate = async (task: any, newStatus: TaskStatus) => {
    try {
      const payload = {
        ...task,
        status: newStatus,
        progress: newStatus === 'Completed' ? 100 : task.progress
      };
      await api.updateTask(task.id, payload);
      syncTasksOnly();
      notify.success('Task status updated.');
    } catch (err: any) {
      notify.error('Failed to update status: ' + err.message);
    }
  };

  const formatCur = (num: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(num);
  };

  // Filter computations
  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.taskName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (t.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (t.assignedStaff || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'All' || t.status === statusFilter;
    const matchesProject = projectFilter === 'All' || t.projectId === projectFilter;

    return matchesSearch && matchesStatus && matchesProject;
  });

  return (
    <div className="space-y-6 font-sans">
      
      {!isFormOpen && !isViewOpen && (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-zinc-950">Engineering Scopes</h1>
              <p className="text-xs sm:text-sm text-zinc-500">Track task budgets, on-site expenses and profits</p>
            </div>
             {userRole === 'admin' && (
               <button
                 onClick={handleOpenCreate}
                 className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-zinc-950 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-zinc-800 transition-colors"
               >
                 <Plus className="w-4 h-4" />
                 <span>Add Task Scope</span>
               </button>
             )}

          </div>

          {/* Filtering panels */}
          <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search tasks (e.g. Vindal Sunshade, civil frame, staff...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs sm:text-sm pl-9 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:bg-white transition-all text-zinc-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Filter Project</label>
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-zinc-700 outline-none"
                >
                  <option value="All">All Projects</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.projectName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Task Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-zinc-700 outline-none"
                >
                  <option value="All">All Statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="On Hold">On Hold</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tasks Ledger cards */}
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="w-8 h-8 border-4 border-zinc-900/10 border-t-zinc-900 rounded-full animate-spin"></div>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="bg-zinc-50 border border-dashed rounded-2xl p-10 text-center">
              <ClipboardList className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
               <p className="text-zinc-500 text-xs">No project tasks found. {userRole === 'admin' && 'Click Add Task to register a scope.'}</p>
               {userRole === 'admin' && (
                 <button 
                   onClick={handleOpenCreate} 
                   className="mt-3 px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-semibold hover:bg-zinc-800 transition-colors"
                 >
                   Create Task
                 </button>
               )}

            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTasks.map((t) => {
                const totalExpenses = (t.directExpenses || 0) + (t.labourCost || 0);
                const isOver = totalExpenses > t.assignedBudget;
                const isNearing = !isOver && (totalExpenses / t.assignedBudget) > 0.85;

                return (
                  <div 
                    key={t.id}
                    className="bg-white border border-zinc-200/80 rounded-xl p-4 shadow-sm flex flex-col justify-between hover:border-zinc-300 transition-all"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] text-zinc-400 block font-bold truncate max-w-[200px]">{t.projectName}</span>
                          <h3 
                            className="text-sm font-bold text-zinc-950 mt-0.5 hover:underline cursor-pointer"
                            onClick={() => { setSelectedTask(t); setIsViewOpen(true); }}
                          >
                            {t.taskName}
                          </h3>
                        </div>

                        {/* Status Select dropdown directly for swift quick modifications */}
                        <select
                          value={t.status}
                          onChange={(e) => handleQuickStatusUpdate(t, e.target.value as TaskStatus)}
                          className={`text-[10px] font-semibold px-2 py-1 rounded-full outline-none border cursor-pointer ${
                            t.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            t.status === 'In Progress' ? 'bg-zinc-100 text-zinc-800 border-zinc-200' :
                            t.status === 'On Hold' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-zinc-50 text-zinc-500 border-zinc-200'
                          }`}
                        >
                          <option value="Pending">Pending</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                          <option value="On Hold">On Hold</option>
                        </select>
                      </div>

                      {t.description && (
                        <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                          {t.description}
                        </p>
                      )}

                      {/* Warnings if overbudget */}
                      {isOver && (
                        <div className="bg-red-50 text-red-700 text-[11px] p-2 rounded-lg flex items-center gap-1.5 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          <span>Overbudget Warning! Spent {formatCur(totalExpenses - t.assignedBudget)} extra.</span>
                        </div>
                      )}

                      {isNearing && (
                        <div className="bg-amber-50 text-amber-800 text-[11px] p-2 rounded-lg flex items-center gap-1.5 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Approaching budget ceiling ({(totalExpenses / t.assignedBudget * 100).toFixed(0)}% spent)</span>
                        </div>
                      )}

                      {/* Cost Details bar */}
                      {userRole !== 'manager' && (
                        <div className="grid grid-cols-4 gap-1 sm:gap-2 bg-zinc-50 p-2.5 rounded-xl text-[10px] font-semibold border border-zinc-100">
                          <div>
                            <span className="text-zinc-400 block text-[9px] uppercase tracking-wider">Est Budget</span>
                            <span className="text-zinc-900 block">{formatCur(t.assignedBudget)}</span>
                          </div>
                          <div>
                            <span className="text-zinc-400 block text-[9px] uppercase tracking-wider">Expenses</span>
                            <span className="text-zinc-900 block">{formatCur(t.directExpenses || 0)}</span>
                          </div>
                          <div>
                            <span className="text-zinc-400 block text-[9px] uppercase tracking-wider">Labour</span>
                            <span className="text-zinc-900 block">{formatCur(t.labourCost || 0)}</span>
                          </div>
                          <div>
                            <span className="text-zinc-400 block text-[9px] uppercase tracking-wider">Balance</span>
                            <span className={`block ${isOver ? 'text-rose-600' : 'text-emerald-700'}`}>
                              {formatCur(t.assignedBudget - totalExpenses)}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Progress controller - directly slidable slider for instant progress adjustment */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-zinc-400 font-semibold uppercase text-[9px]">Task Progress</span>
                          <span className="text-zinc-900 font-bold block bg-zinc-100 px-1.5 py-0.5 rounded text-[10px]">{t.progress}%</span>
                        </div>
                        <div className="w-full flex items-center">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={t.progress}
                            onChange={(e) => handleQuickProgressUpdate(t, Number(e.target.value))}
                            className="w-full accent-zinc-950 h-1.5 rounded-full appearance-none cursor-pointer outline-none"
                            style={{ background: `linear-gradient(to right, #18181b 0%, #18181b ${t.progress}%, #e4e4e7 ${t.progress}%, #e4e4e7 100%)` }}
                            title="Slide left/right to adjust progress instantly"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Bottom controls */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-100 text-xs">
                      <span className="text-[10px] text-zinc-400 font-medium">Staff: {t.assignedStaff || 'Unassigned'}</span>
                         <div className="flex items-center gap-2">
                           {userRole === 'admin' && (
                             <button 
                               onClick={() => handleOpenEdit(t)}
                               className="p-1 text-zinc-500 hover:text-zinc-900 rounded bg-zinc-50 border border-zinc-200/40"
                               title="Edit Task"
                             >
                               <Edit2 className="w-3 h-3" />
                             </button>
                           )}
                           {userRole === 'admin' && (
                             <button 
                               onClick={() => handleDelete(t.id)}
                               className="p-1 text-rose-500 hover:text-rose-900 rounded bg-zinc-50 border border-zinc-200/40"
                               title="Delete Task"
                             >
                               <Trash2 className="w-3 h-3" />
                             </button>
                           )}
                         </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* DETAILED LEDGER VIEW: Single Task */}
      {isViewOpen && selectedTask && (
        <div className="space-y-6">
          <button 
            onClick={() => { setIsViewOpen(false); setSelectedTask(null); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Tasks
          </button>

          <div className="bg-white border border-zinc-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
            <div>
              <span className="text-[10px] text-zinc-400 font-bold uppercase block">{selectedTask.projectName}</span>
              <h2 className="text-lg sm:text-xl font-bold text-zinc-900 tracking-tight mt-0.5">{selectedTask.taskName}</h2>
              {selectedTask.description && (
                <p className="text-xs sm:text-sm text-zinc-500 mt-1 leading-relaxed">{selectedTask.description}</p>
              )}
            </div>

            {userRole !== 'manager' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                <div>
                  <span className="text-[10px] text-zinc-400 font-bold uppercase block">Scoped Budget</span>
                  <span className="text-base font-bold text-zinc-950 block">{formatCur(selectedTask.assignedBudget)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 font-bold uppercase block">Materials & Tools</span>
                  <span className="text-base font-bold text-zinc-950 block">{formatCur(selectedTask.directExpenses || 0)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 font-bold uppercase block">Site Attendance Cost</span>
                  <span className="text-base font-bold text-zinc-950 block">{formatCur(selectedTask.labourCost || 0)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 font-bold uppercase block">Payments</span>
                  <span className="text-base font-bold text-zinc-950 block">{formatCur(selectedTask.paymentsPaid || 0)}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {userRole !== 'manager' && (
                <div className="p-3 bg-zinc-900 text-white rounded-xl flex items-center justify-between">
                  <div>
                    <span className="block text-[9px] text-zinc-400 uppercase tracking-wider font-bold">Task Profit / Loss</span>
                    <span className="text-sm sm:text-base font-bold">
                      {formatCur(selectedTask.assignedBudget - ((selectedTask.directExpenses || 0) + (selectedTask.labourCost || 0)))}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold text-zinc-900 ${
                    (selectedTask.assignedBudget - ((selectedTask.directExpenses || 0) + (selectedTask.labourCost || 0))) >= 0 ? 'bg-emerald-400' : 'bg-red-400'
                  }`}>
                    {(selectedTask.assignedBudget - ((selectedTask.directExpenses || 0) + (selectedTask.labourCost || 0))) >= 0 ? 'Profitable' : 'Deficit'}
                  </span>
                </div>
              )}

              <div className="p-3 bg-zinc-50 border border-zinc-100 rounded-xl flex items-center justify-between">
                <div>
                  <span className="block text-[9px] text-zinc-400 uppercase tracking-wider font-semibold">Timeline</span>
                  <span className="text-xs font-bold text-zinc-800">
                    {selectedTask.startDate} to {selectedTask.endDate}
                  </span>
                </div>
              </div>
            </div>

            {selectedTask.notes && (
              <div className="p-3 bg-zinc-50 border rounded-xl text-xs text-zinc-600">
                <span className="font-bold text-zinc-800 uppercase text-[9px] block mb-0.5">Site Supervisor Notes:</span>
                {selectedTask.notes}
              </div>
            )}

            <div className="border-t border-zinc-100 pt-4">
              <TaskAttendanceSection
                projectId={selectedTask.projectId}
                taskId={selectedTask.id}
                assignedStaff={selectedTask.assignedStaff}
                onSaved={fetchInitialData}
              />
            </div>

            {/* Quick Action Short cuts for on-site managers */}
            <div className="border-t border-zinc-100 pt-4">
              <span className="text-[10px] text-zinc-400 font-bold uppercase block mb-2.5">Quick Operations</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button 
                  onClick={() => onNavigate('expenses', { projectId: selectedTask.projectId, taskId: selectedTask.id })}
                  className="px-3 py-2 bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4 text-zinc-500" />
                  Log Task Expense
                </button>
                <button 
                  onClick={() => onNavigate('projects', { projectId: selectedTask.projectId, taskId: selectedTask.id, openSubTab: 'tasks' })}
                  className="px-3 py-2 bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Calendar className="w-4 h-4 text-zinc-500" />
                  Open in Project
                </button>
                <button 
                  onClick={() => onNavigate('payments', { projectId: selectedTask.projectId, taskId: selectedTask.id })}
                  className="px-3 py-2 bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <DollarSign className="w-4 h-4 text-zinc-500" />
                  Process Worker Payout
                </button>
              </div>
            </div>

            <div className="flex gap-2 justify-end border-t border-zinc-100 pt-4">
              <button 
                onClick={() => handleOpenEdit(selectedTask)}
                className="px-3 py-1.5 text-xs font-bold bg-zinc-100 rounded-lg hover:bg-zinc-200 transition-all text-zinc-700"
              >
                Modify Scope
              </button>
              {userRole === 'admin' && (
                <button 
                  onClick={() => handleDelete(selectedTask.id)}
                  className="px-3 py-1.5 text-xs font-bold bg-rose-50 rounded-lg hover:bg-rose-100 hover:text-rose-700 transition-all text-rose-600"
                >
                  Delete Permanently
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FORM: Create or Edit Task */}
      {isFormOpen && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 sm:p-6 shadow-sm max-w-xl mx-auto space-y-4">
          <div className="flex items-center justify-between border-b pb-3 border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              {editId ? 'Modify Task Details' : 'Initialize Task Scope'}
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
            
            {/* If creating fresh, require parenting project selection */}
            {!editId && (
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                  Parent Project Contract
                </label>
                <select
                  required
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900"
                >
                  <option value="" disabled>Select parent Project...</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.projectName}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                Task Scope Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Vindal Sunshade Installation, column curing, wiring..."
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                Target Assigned Budget (₹)
              </label>
              <input
                type="number"
                required
                min={0}
                placeholder="e.g. 45000"
                value={assignedBudget}
                onChange={(e) => setAssignedBudget(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="relative">
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                  Assigned Site Staff / Crew
                </label>
                
                {/* Selected staff badges */}
                <div className="flex flex-wrap gap-1 mb-2 bg-zinc-50 border border-zinc-200/80 p-1.5 rounded-xl min-h-[38px] items-center">
                  {assignedStaffList.map((member) => (
                    <span 
                      key={member} 
                      className="inline-flex items-center gap-1 bg-zinc-900 text-white text-[10px] font-bold pl-2.5 pr-1.5 py-0.5 rounded-lg"
                    >
                      <span>{member}</span>
                      <button
                        type="button"
                        onClick={() => removeStaffMember(member)}
                        className="hover:text-red-300 font-extrabold focus:outline-none w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-white/10"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {assignedStaffList.length === 0 && (
                    <span className="text-[10px] text-zinc-400 italic pl-1 font-medium select-none">No crew assigned yet.</span>
                  )}
                </div>

                {/* Input with inline selection & suggestion list */}
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Type name or select below..."
                      value={memberInput}
                      onChange={(e) => {
                        setMemberInput(e.target.value);
                        setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (memberInput.trim()) {
                            addStaffMember(memberInput.trim());
                          }
                        }
                      }}
                      className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-xs"
                    />
                    
                    {/* Floating suggestions dropdown */}
                    {showSuggestions && (
                      <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-zinc-200 rounded-xl shadow-lg z-50 text-xs font-semibold divide-y divide-zinc-100">
                        {/* Header helper */}
                        <div className="px-3 py-1.5 bg-zinc-50 text-[9px] font-bold text-zinc-400 uppercase tracking-widest flex justify-between items-center">
                          <span>On-Site Crew Suggestions</span>
                          {assignedStaffList.length > 0 && (
                            <span className="text-zinc-500 font-medium">({assignedStaffList.length} assigned)</span>
                          )}
                        </div>

                        {/* Matching suggestions */}
                        {crewSuggestions
                          .filter(worker => 
                            (!memberInput || worker.toLowerCase().includes(memberInput.toLowerCase())) &&
                            !assignedStaffList.includes(worker)
                          )
                          .map(worker => (
                            <button
                              key={worker}
                              type="button"
                              onClick={() => addStaffMember(worker)}
                              className="w-full text-left px-3 py-2 hover:bg-zinc-100 text-zinc-800 transition-colors flex items-center justify-between"
                            >
                              <span>{worker}</span>
                              <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">Crew List</span>
                            </button>
                          ))
                        }
                        
                        {/* Custom input addition fallback */}
                        {memberInput.trim() && !assignedStaffList.includes(memberInput.trim()) && (
                          <button
                            type="button"
                            onClick={() => addStaffMember(memberInput.trim())}
                            className="w-full text-left px-3 py-2 hover:bg-zinc-100 text-zinc-950 font-bold flex items-center justify-between italic"
                          >
                            <span>Add &quot;{memberInput.trim()}&quot;</span>
                            <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">+ Assign</span>
                          </button>
                        )}
                        
                        {/* If no matches are found overall */}
                        {crewSuggestions.filter(worker => 
                          (!memberInput || worker.toLowerCase().includes(memberInput.toLowerCase())) &&
                          !assignedStaffList.includes(worker)
                        ).length === 0 && !memberInput.trim() && (
                          <div className="px-3 py-3 text-zinc-400 italic text-center select-none">All available crew assigned!</div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => {
                      if (memberInput.trim()) {
                        addStaffMember(memberInput.trim());
                      }
                    }}
                    className="px-3 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition-colors shrink-0"
                  >
                    Add
                  </button>
                </div>

                {/* Close recommendation list layout controller */}
                {showSuggestions && (
                  <div className="flex justify-end mt-1">
                    <button 
                      type="button" 
                      onClick={() => setShowSuggestions(false)}
                      className="text-[10px] text-zinc-400 hover:text-zinc-650 font-bold underline"
                    >
                      Hide suggestions
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                  Task Current Status
                </label>
                <select
                  value={status}
                  onChange={(e) => {
                    const newStatus = e.target.value as TaskStatus;
                    setStatus(newStatus);
                    if (newStatus === 'Completed') {
                      setProgress(100);
                    } else if (progress === 100) {
                      setProgress(90);
                    }
                  }}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900"
                >
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="On Hold">On Hold</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                  Scheduled Start Date
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                  Target Finish Date
                </label>
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                Progress Completed ({progress}%)
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={progress}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setProgress(val);
                  if (val === 100) {
                    setStatus('Completed');
                  } else if (val < 100 && status === 'Completed') {
                    setStatus('In Progress');
                  }
                }}
                className="w-full accent-zinc-950 h-1.5 rounded-full appearance-none cursor-pointer outline-none"
                style={{ background: `linear-gradient(to right, #18181b 0%, #18181b ${progress}%, #e4e4e7 ${progress}%, #e4e4e7 100%)` }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                Engineering Description / Instructions
              </label>
              <textarea
                placeholder="Give exact specifications, measurements (e.g. sea-breeze metallic cantilevers for Vindal Sunshade), or specific rules..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-xs sm:text-sm"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              Verify & Save Task Scope
            </button>
          </form>
        </div>
      )}

    </div>
  );
}
