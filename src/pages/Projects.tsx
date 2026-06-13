import React, { useState, useEffect } from 'react';
import {
  Plus, Search, Edit2, Trash2, Calendar, MapPin, Building,
  ChevronRight, ArrowLeft, RefreshCw, AlertTriangle, Briefcase,
  Receipt, TrendingUp, PlusCircle, DollarSign, Eye,
  UploadCloud, X, ChevronDown, CheckCircle2, FileText, Trash,
  Image as ImageIcon
} from 'lucide-react';
import { api } from '../api/client';
import { onRequestsUpdate, offRequestsUpdate } from '../api/socket';
import { Project, ProjectStatus, Task, TaskStatus, Expense, ExpenseCategory, PaymentRequest, PurchaseLineItem } from '../types';
import { notify } from '../utils/toast';
import { useConfirm } from '../context/ConfirmContext';
import TaskAttendanceSection from '../components/TaskAttendanceSection';

const expenseCategoryToPaymentCategory = (cat: ExpenseCategory): PaymentRequest['category'] => {
  if (cat === 'Material' || cat === 'Tools') return 'Vendor';
  if (cat === 'Labour') return 'Worker';
  if (cat === 'Transport') return 'Transportation';
  if (cat === 'Vendor Payment') return 'Vendor Payment';
  if (cat === 'Purchase') return 'Purchase';
  return 'Other';
};

const parseNumericQty = (qty: string) => parseFloat(qty.replace(/[^0-9.]/g, '')) || 0;

interface ProjectsProps {
  onNavigate: (page: string, params?: any) => void;
  userRole: string;
  initialParams?: any;
}

export default function Projects({ onNavigate, userRole, initialParams }: ProjectsProps) {
  const confirm = useConfirm();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dashboard overall filter/search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Expanded project panel details
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [viewTab, setViewTab] = useState<'tasks' | 'expenses'>('tasks');

  // Parallel child states of selected project
  const [projectTasks, setProjectTasks] = useState<any[]>([]);
  const [projectExpenses, setProjectExpenses] = useState<any[]>([]);

  // Specified Task focus overlay
  const [activeTask, setActiveTask] = useState<any | null>(null);

  // Sub-filters for Project Sub-tabs
  const [tasksSearch, setTasksSearch] = useState('');
  const [tasksStatus, setTasksStatus] = useState('All');

  const [expensesSearch, setExpensesSearch] = useState('');
  const [expensesCategory, setExpensesCategory] = useState('All');
  const [expensesPayMethod, setExpensesPayMethod] = useState('All');

  // --- CRUD Form states ---
  // A. Overall Project Form
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [projEditId, setProjEditId] = useState<string | null>(null);
  const [projName, setProjName] = useState('');
  const [projClient, setProjClient] = useState('');
  const [projLocation, setProjLocation] = useState('');
  const [projStartDate, setProjStartDate] = useState('');
  const [projEndDate, setProjEndDate] = useState('');
  const [projStatus, setProjStatus] = useState<ProjectStatus>('Pending');
  const [projNotes, setProjNotes] = useState('');
  const [projSubmitError, setProjSubmitError] = useState<string | null>(null);

  // B. Child Task Form
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [taskEditId, setTaskEditId] = useState<string | null>(null);
  const [taskFormName, setTaskFormName] = useState('');
  const [taskFormDesc, setTaskFormDesc] = useState('');
  const [taskFormBudget, setTaskFormBudget] = useState<number>(0);
  const [taskFormStartDate, setTaskFormStartDate] = useState('');
  const [taskFormEndDate, setTaskFormEndDate] = useState('');
  const [taskFormProgress, setTaskFormProgress] = useState<number>(0);
  const [taskFormStatus, setTaskFormStatus] = useState<TaskStatus>('Pending');
  const [taskFormNotes, setTaskFormNotes] = useState('');
  const [taskSubmitError, setTaskSubmitError] = useState<string | null>(null);

  // Custom multi-staff picker in Task Editor
  const [taskAssignedStaffList, setTaskAssignedStaffList] = useState<string[]>([]);
  const [crewSuggestions, setCrewSuggestions] = useState<string[]>([]);
  const [taskMemberInput, setTaskMemberInput] = useState('');
  const [showTaskSuggestions, setShowTaskSuggestions] = useState(false);

  // C. Child Expense Form
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(false);
  const [expenseEditId, setExpenseEditId] = useState<string | null>(null);
  const [isEditingPaidExpense, setIsEditingPaidExpense] = useState(false);
  const [expenseTaskId, setExpenseTaskId] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('Material');
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [expensePaidTo, setExpensePaidTo] = useState('');
  const [expensePaymentMethod, setExpensePaymentMethod] = useState('Bank Transfer');
  const [expenseDate, setExpenseDate] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [expenseBillImage, setExpenseBillImage] = useState<string>('');
  const [expenseSubmitError, setExpenseSubmitError] = useState<string | null>(null);
  const [officeBalance, setOfficeBalance] = useState(0);

  // Custom category fields (expense form)
  const [expenseMaterialName, setExpenseMaterialName] = useState('');
  const [expenseMaterialQty, setExpenseMaterialQty] = useState('');
  const [expenseFromLocation, setExpenseFromLocation] = useState('');
  const [expenseToLocation, setExpenseToLocation] = useState('');
  const [expenseTools, setExpenseTools] = useState<string[]>([]);
  const [expenseToolInput, setExpenseToolInput] = useState('');
  const [expenseVendorTotalToPay, setExpenseVendorTotalToPay] = useState<number>(0);
  const [expenseVendorPaid, setExpenseVendorPaid] = useState<number>(0);
  const [expensePurchaseItems, setExpensePurchaseItems] = useState<PurchaseLineItem[]>([{ materialName: '', qty: '', pricePerCount: 0, total: 0 }]);
  const [vendorsList, setVendorsList] = useState<any[]>([]);
  const [showExpenseVendorSuggestions, setShowExpenseVendorSuggestions] = useState(false);
  const [showExpenseCrewSuggestions, setShowExpenseCrewSuggestions] = useState(false);

  // Receipt Preview
  const [isReceiptPreviewOpen, setIsReceiptPreviewOpen] = useState(false);
  const [previewExpenseImage, setPreviewExpenseImage] = useState('');

  // Pending deep linking actions
  const [pendingTaskIdToOpen, setPendingTaskIdToOpen] = useState<string | null>(null);

  // Fetch projects initially
  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    const handleUpdate = () => {
      if (selectedProject?.id) {
        reloadProjectData(selectedProject.id);
      } else {
        fetchProjects();
      }
    };
    onRequestsUpdate(handleUpdate);
    return () => {
      offRequestsUpdate(handleUpdate);
    };
  }, [selectedProject?.id]);

  // Handle incoming deep links (initialParams) from Dashboard etc.
  const hasLoadedInitialParams = React.useRef(false);
  useEffect(() => {
    if (initialParams && initialParams.projectId && projects.length > 0 && !hasLoadedInitialParams.current) {
      const proj = projects.find(p => p.id === initialParams.projectId);
      if (proj) {
        loadProjectDetails(proj);
        if (initialParams.openSubTab && initialParams.openSubTab !== 'payouts') {
          setViewTab(initialParams.openSubTab);
        }
        if (initialParams.taskId) {
          setPendingTaskIdToOpen(initialParams.taskId);
        }
      }
      hasLoadedInitialParams.current = true;
    }
  }, [initialParams, projects]);

  // Handle pending task deep opening
  useEffect(() => {
    if (pendingTaskIdToOpen && projectTasks.length > 0) {
      const matchingTask = projectTasks.find(t => t.id === pendingTaskIdToOpen);
      if (matchingTask) {
        setActiveTask(matchingTask);
      }
      setPendingTaskIdToOpen(null);
    }
  }, [pendingTaskIdToOpen, projectTasks]);

  const fetchProjects = async () => {
    try {
      if (!hasLoaded) setLoading(true);
      setError(null);
      const [res, crewRes, vendorsRes] = await Promise.all([
        api.getProjects(),
        api.getCrew('active').catch(() => ({ crew: [] })),
        api.getVendors('active').catch(() => ({ vendors: [] }))
      ]);
      setProjects(res.projects || []);
      setCrewSuggestions((crewRes.crew || []).map((c: any) => c.name));
      setVendorsList(vendorsRes.vendors || []);
      setHasLoaded(true);
    } catch (err: any) {
      const message = err?.message || 'Failed to download projects tracker data.';
      setError(message);
      notify.error(message);
    } finally {
      setLoading(false);
    }
  };

  const loadProjectDetails = async (project: any) => {
    try {
      setLoadingDetails(true);
      setSelectedProject(project);
      setIsViewOpen(true);

      const [taskRes, expenseRes] = await Promise.all([
        api.getTasks(project.id),
        api.getExpenses(project.id),
      ]);

      setProjectTasks(taskRes.tasks || []);
      setProjectExpenses(expenseRes.expenses || []);
    } catch (err: any) {
      notify.error(err?.message || 'Failed to download project details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const reloadProjectData = async (projId: string) => {
    try {
      const [projRes, taskRes, expenseRes] = await Promise.all([
        api.getProjects(),
        api.getTasks(projId),
        api.getExpenses(projId),
      ]);

      setProjects(projRes.projects || []);
      const updatedProj = (projRes.projects || []).find((p: any) => p.id === projId);
      if (updatedProj) {
        setSelectedProject(updatedProj);
      }

      setProjectTasks(taskRes.tasks || []);
      setProjectExpenses(expenseRes.expenses || []);

      if (activeTask) {
        const updatedTask = (taskRes.tasks || []).find((t: any) => t.id === activeTask.id);
        if (updatedTask) {
          setActiveTask(updatedTask);
        } else {
          setActiveTask(null);
        }
      }
    } catch (err: any) {
      notify.error(err?.message || 'Error synchronizing project data');
    }
  };

  // --- OVERARCHING PROJECT ACTION HANDLERS ---
  const handleOpenCreateProject = () => {
    setProjEditId(null);
    setProjName('');
    setProjClient('');
    setProjLocation('');
    setProjStartDate(new Date().toISOString().split('T')[0]);
    setProjEndDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setProjStatus('Pending');
    setProjNotes('');
    setProjSubmitError(null);
    setIsFormOpen(true);
  };

  const handleOpenEditProject = (p: Project) => {
    setProjEditId(p.id);
    setProjName(p.projectName);
    setProjClient(p.clientName);
    setProjLocation(p.location);
    setProjStartDate(p.startDate);
    setProjEndDate(p.expectedEndDate);
    setProjStatus(p.status);
    setProjNotes(p.notes || '');
    setProjSubmitError(null);
    setIsFormOpen(true);
  };

  const handleDeleteProject = async (id: string) => {
    const project = projects.find(p => p.id === id);
    const ok = await confirm({
      title: 'Delete project?',
      message: project
        ? `Delete "${project.projectName}"? All tasks, expenses, attendance, and labour records will be permanently erased.`
        : 'Delete this project? All related data will be permanently erased.',
      confirmLabel: 'Delete Project',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await api.deleteProject(id);
      setProjects(projects.filter(p => p.id !== id));
      if (selectedProject?.id === id) {
        setIsViewOpen(false);
      }
      notify.success('Project deleted.');
    } catch (err: any) {
      notify.error(err?.message || 'Error occurred deleting project scope data.');
    }
  };

  const handleProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projName || !projClient || !projLocation || !projStartDate || !projEndDate) {
      notify.warning('Core fields are required.');
      return;
    }

    const payload = {
      projectName: projName,
      clientName: projClient,
      location: projLocation,
      startDate: projStartDate,
      expectedEndDate: projEndDate,
      status: projStatus,
      notes: projNotes
    };

    try {
      setProjSubmitError(null);
      if (projEditId) {
        await api.updateProject(projEditId, payload);
        notify.success('Project updated.');
      } else {
        await api.createProject(payload);
        notify.success('Project created.');
      }
      setIsFormOpen(false);
      fetchProjects();
    } catch (err: any) {
      const message = err?.message || 'Failed saving project structure.';
      setProjSubmitError(message);
      notify.error(message);
    }
  };

  // --- CHILD TASK ACTION HANDLERS ---
  const handleOpenCreateTask = () => {
    setTaskEditId(null);
    setTaskFormName('');
    setTaskFormDesc('');
    setTaskFormBudget(0);
    setTaskAssignedStaffList([]);
    setTaskMemberInput('');
    setShowTaskSuggestions(false);
    setTaskFormStartDate(new Date().toISOString().split('T')[0]);
    setTaskFormEndDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setTaskFormProgress(0);
    setTaskFormStatus('Pending');
    setTaskFormNotes('');
    setTaskSubmitError(null);
    setIsTaskFormOpen(true);
  };

  const handleOpenEditTask = (task: any) => {
    setTaskEditId(task.id);
    setTaskFormName(task.taskName);
    setTaskFormDesc(task.description || '');
    setTaskFormBudget(task.assignedBudget);

    const parsedStaff = task.assignedStaff
      ? task.assignedStaff.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];
    setTaskAssignedStaffList(parsedStaff);
    setTaskMemberInput('');
    setShowTaskSuggestions(false);

    setTaskFormStartDate(task.startDate);
    setTaskFormEndDate(task.endDate);
    setTaskFormProgress(task.progress);
    setTaskFormStatus(task.status);
    setTaskFormNotes(task.notes || '');
    setTaskSubmitError(null);
    setIsTaskFormOpen(true);
  };

  const handleTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskFormName || taskFormBudget === undefined || !taskFormStartDate || !taskFormEndDate) {
      notify.warning('Task name, budget envelope, and schedule dates are required.');
      return;
    }

    const payload = {
      projectId: selectedProject.id,
      taskName: taskFormName,
      description: taskFormDesc,
      assignedBudget: Number(taskFormBudget),
      assignedStaff: taskAssignedStaffList.join(', '),
      startDate: taskFormStartDate,
      endDate: taskFormEndDate,
      progress: Number(taskFormProgress),
      status: taskFormStatus,
      notes: taskFormNotes
    };

    try {
      setTaskSubmitError(null);
      if (taskEditId) {
        await api.updateTask(taskEditId, payload);
        notify.success('Task updated.');
      } else {
        await api.createTask(payload);
        notify.success('Task created.');
      }
      setIsTaskFormOpen(false);
      reloadProjectData(selectedProject.id);
    } catch (err: any) {
      const message = err?.message || 'Failed saving task requirements.';
      setTaskSubmitError(message);
      notify.error(message);
    }
  };

  const handleDeleteTask = async (id: string) => {
    const task = projectTasks.find(t => t.id === id);
    const ok = await confirm({
      title: 'Delete task?',
      message: task
        ? `Delete "${task.taskName}"? Linked expenses and payroll logs will be removed.`
        : 'Delete this task? Linked expenses and payroll logs will be removed.',
      confirmLabel: 'Delete Task',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await api.deleteTask(id);
      setIsTaskFormOpen(false);
      reloadProjectData(selectedProject.id);
      notify.success('Task deleted.');
    } catch (err: any) {
      notify.error(err?.message || 'Error occurred deleting selected task.');
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
      reloadProjectData(selectedProject.id);
      notify.success('Task status updated.');
    } catch (err: any) {
      notify.error('Failed updating task status: ' + err.message);
    }
  };

  const handleQuickProgressUpdate = async (task: any, newProg: number) => {
    const minMaxProg = Math.min(Math.max(newProg, 0), 100);
    const updatedStatus = minMaxProg >= 100 ? 'Completed' : task.status === 'Completed' ? 'In Progress' : task.status;

    setProjectTasks(prev => prev.map(t => {
      if (t.id === task.id) {
        return { ...t, progress: minMaxProg, status: updatedStatus };
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
      reloadProjectData(selectedProject.id);
    } catch (err: any) {
      notify.error(err?.message || 'Failed to sync task progress');
    }
  };

  // Staff picker utilities
  const handleAddStaffMember = (name: string) => {
    const trimmed = name.trim();
    if (trimmed && !taskAssignedStaffList.includes(trimmed)) {
      setTaskAssignedStaffList([...taskAssignedStaffList, trimmed]);
    }
    setTaskMemberInput('');
    setShowTaskSuggestions(false);
  };

  const handleRemoveStaffMember = (name: string) => {
    setTaskAssignedStaffList(taskAssignedStaffList.filter(m => m !== name));
  };


  const refreshOfficeBalance = async () => {
    try {
      const res = await api.getOfficeFunds();
      setOfficeBalance(res.officeFunds[0]?.balance ?? 0);
    } catch {
      // non-blocking
    }
  };

  // --- CHILD EXPENSE ACTION HANDLERS ---
  const handleOpenCreateExpense = (initialTaskId?: string) => {
    setExpenseEditId(null);
    setIsEditingPaidExpense(false);
    setExpenseTaskId(initialTaskId || (projectTasks[0]?.id || ''));
    setExpenseCategory('Material');
    setExpenseAmount(0);
    setExpensePaidTo('');
    setExpensePaymentMethod('Bank Transfer');
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setExpenseNotes('');
    setExpenseBillImage('');
    setExpenseSubmitError(null);
    setExpenseMaterialName('');
    setExpenseMaterialQty('');
    setExpenseFromLocation('');
    setExpenseToLocation('');
    setExpenseTools([]);
    setExpenseToolInput('');
    setExpenseVendorTotalToPay(0);
    setExpenseVendorPaid(0);
    setExpensePurchaseItems([{ materialName: '', qty: '', pricePerCount: 0, total: 0 }]);
    setShowExpenseVendorSuggestions(false);
    setShowExpenseCrewSuggestions(false);
    setIsExpenseFormOpen(true);
    refreshOfficeBalance();
  };

  const handleOpenEditExpense = (exp: any) => {
    if (!exp.isPendingRequest) {
      setIsEditingPaidExpense(true);
    } else {
      setIsEditingPaidExpense(false);
    }
    setExpenseEditId(exp.id);
    setExpenseTaskId(exp.taskId);
    setExpenseCategory(exp.category);
    setExpenseAmount(exp.amount);
    setExpensePaidTo(exp.paidTo);
    setExpensePaymentMethod(exp.paymentMethod);
    setExpenseDate(exp.date);
    setExpenseNotes(exp.notes || '');
    setExpenseBillImage(exp.billImage || '');
    setExpenseSubmitError(null);
    setExpenseMaterialName(exp.materialName || '');
    setExpenseMaterialQty(exp.materialQty || '');
    setExpenseFromLocation(exp.fromLocation || '');
    setExpenseToLocation(exp.toLocation || '');
    setExpenseTools(exp.tools || []);
    setExpenseToolInput('');
    setExpenseVendorTotalToPay(exp.vendorTotalToPay || 0);
    setExpenseVendorPaid(exp.vendorPaid || 0);
    if (exp.purchaseItems && exp.purchaseItems.length > 0) {
      setExpensePurchaseItems(exp.purchaseItems);
    } else if (exp.materialName && exp.category === 'Purchase') {
      setExpensePurchaseItems([{
        materialName: exp.materialName || '',
        qty: exp.materialQty || '',
        pricePerCount: exp.purchasePricePerCount || 0,
        total: exp.purchaseTotalFull || 0,
      }]);
    } else {
      setExpensePurchaseItems([{ materialName: '', qty: '', pricePerCount: 0, total: 0 }]);
    }
    setShowExpenseVendorSuggestions(false);
    setShowExpenseCrewSuggestions(false);
    setIsExpenseFormOpen(true);
    refreshOfficeBalance();
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseTaskId || !expenseCategory || !expensePaidTo || !expenseDate) {
      notify.warning('Task context, category, payee, and date are required.');
      return;
    }
    if (expenseCategory === 'Vendor Payment' || expenseCategory === 'Purchase') {
      if (expenseVendorTotalToPay <= 0 || expenseVendorPaid <= 0) {
        notify.warning('Total to pay and Paid amount must be greater than 0.');
        return;
      }
    } else if (expenseAmount <= 0) {
      notify.warning('Spent amount must be greater than 0.');
      return;
    }

    const titleText = isEditingPaidExpense 
      ? 'Submit edit approval request?' 
      : expenseEditId 
        ? 'Update payment request?' 
        : 'Submit expense request?';

    const messageText = isEditingPaidExpense
      ? `Submit a request to edit the paid expense ${expenseEditId} to ${formatCur(expenseAmount)}? It will require review and approval by the accountant/admin.`
      : expenseEditId
        ? `Update this pending ${expenseCategory} request of ${formatCur(expenseAmount)} for ${expensePaidTo}?`
        : `Submit a ${expenseCategory} expense of ${formatCur(expenseAmount)} for ${expensePaidTo}? It will appear in Finance Hub and be paid from office funds after accountant approval.`;

    const confirmLabelText = isEditingPaidExpense
      ? 'Submit Edit Request'
      : expenseEditId
        ? 'Save Changes'
        : 'Submit Request';

    const ok = await confirm({
      title: titleText,
      message: messageText,
      confirmLabel: confirmLabelText,
      variant: 'warning',
    });
    if (!ok) return;

    const paymentRequestPayload = {
      projectId: selectedProject.id,
      taskId: expenseTaskId,
      payeeName: expensePaidTo,
      category: expenseCategoryToPaymentCategory(expenseCategory),
      amount: Number(expenseAmount),
      description: expenseNotes,
      fromLocation: expenseCategory === 'Transport' ? expenseFromLocation : undefined,
      toLocation: expenseCategory === 'Transport' ? expenseToLocation : undefined,
      dueDate: expenseDate,
      priority: 'Medium' as const,
      paymentMethod: expensePaymentMethod,
      billImage: expenseBillImage,
      materialName: (expenseCategory === 'Material') ? expenseMaterialName : (expenseCategory === 'Purchase' && expensePurchaseItems.length > 0) ? expensePurchaseItems[0].materialName : undefined,
      materialQty: (expenseCategory === 'Material') ? expenseMaterialQty : (expenseCategory === 'Purchase' && expensePurchaseItems.length > 0) ? expensePurchaseItems[0].qty : undefined,
      tools: expenseCategory === 'Tools' ? expenseTools : undefined,
      vendorTotalToPay: (expenseCategory === 'Vendor Payment' || expenseCategory === 'Purchase') ? Number(expenseVendorTotalToPay) : undefined,
      vendorPaid: (expenseCategory === 'Vendor Payment' || expenseCategory === 'Purchase') ? Number(expenseVendorPaid) : undefined,
      vendorRemaining: (expenseCategory === 'Vendor Payment' || expenseCategory === 'Purchase') ? Number(expenseVendorTotalToPay - expenseVendorPaid) : undefined,
      purchasePricePerCount: expenseCategory === 'Purchase' && expensePurchaseItems.length > 0 ? expensePurchaseItems[0].pricePerCount : undefined,
      purchaseTotalFull: expenseCategory === 'Purchase' ? expensePurchaseItems.reduce((s, it) => s + it.total, 0) : undefined,
      purchaseTotal: expenseCategory === 'Purchase' ? Number(expenseVendorPaid) : undefined,
      purchaseItems: expenseCategory === 'Purchase' ? expensePurchaseItems : undefined,
    };

    try {
      setExpenseSubmitError(null);
      if (isEditingPaidExpense) {
        const adjustmentRequestPayload = {
          projectId: selectedProject.id,
          taskId: expenseTaskId,
          payeeName: expensePaidTo,
          category: 'Other' as const,
          amount: Number(expenseAmount),
          description: `Edit request: Modify approved expense ${expenseEditId}. Notes: ${expenseNotes}`,
          dueDate: expenseDate,
          priority: 'Medium' as const,
          paymentMethod: expensePaymentMethod,
          status: 'Pending' as const,
          adjustmentType: 'Edit' as const,
          targetExpenseId: expenseEditId!,
          adjustmentData: JSON.stringify(paymentRequestPayload)
        };
        await api.createPaymentRequest(adjustmentRequestPayload);
        notify.success('Edit request submitted to Finance Hub for approval.');
      } else if (expenseEditId) {
        await api.updatePaymentRequest(expenseEditId, paymentRequestPayload);
        notify.success('Payment request updated.');
      } else {
        await api.createPaymentRequest(paymentRequestPayload);
        notify.success('Expense submitted to Finance Hub for office fund approval.');
      }
      setIsExpenseFormOpen(false);
      reloadProjectData(selectedProject.id);
    } catch (err: any) {
      const message = err?.message || 'Failed saving ledger expense details.';
      setExpenseSubmitError(message);
      notify.error(message);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    const expense = projectExpenses.find(e => e.id === id);
    if (expense && !expense.isPendingRequest) {
      const ok = await confirm({
        title: 'Request deletion of paid expense?',
        message: `Submit a request to delete and refund the paid ${expense.category} expense of ${formatCur(expense.amount)} for ${expense.paidTo}? It will require review and approval by the accountant/admin.`,
        confirmLabel: 'Submit Delete Request',
        variant: 'danger',
      });
      if (!ok) return;

      try {
        await api.createPaymentRequest({
          projectId: selectedProject.id,
          taskId: expense.taskId,
          payeeName: expense.paidTo,
          category: 'Other',
          amount: expense.amount,
          description: `Delete request: Cancel and refund paid expense ${expense.id} of ${formatCur(expense.amount)}.`,
          dueDate: expense.date,
          priority: 'Medium',
          status: 'Pending',
          adjustmentType: 'Delete',
          targetExpenseId: expense.id
        });
        notify.success('Deletion request submitted to Finance Hub for approval.');
      } catch (err: any) {
        notify.error(err?.message || 'Error submitting deletion request.');
      }
      return;
    }
    const ok = await confirm({
      title: 'Cancel payment request?',
      message: expense
        ? `Cancel the pending ${expense.category} request of ${formatCur(expense.amount)} for ${expense.paidTo}?`
        : 'Cancel this pending payment request?',
      confirmLabel: 'Cancel Request',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      if (id.startsWith('pr_')) {
        await api.deletePaymentRequest(id);
      } else {
        await api.deleteExpense(id);
      }
      reloadProjectData(selectedProject.id);
      notify.success('Payment request cancelled.');
    } catch (err: any) {
      notify.error(err?.message || 'Error deleting expense.');
    }
  };

  const handleExpenseReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      notify.warning('File limits exceeded. Please upload lightweight receipt images up to 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setExpenseBillImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Currency helpers
  const formatCur = (num: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(num);
  };

  // Filter computations
  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.location.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredTasksList = projectTasks.filter(t => {
    const matchesSearch = t.taskName.toLowerCase().includes(tasksSearch.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(tasksSearch.toLowerCase()) ||
      (t.assignedStaff || '').toLowerCase().includes(tasksSearch.toLowerCase());
    const matchesStatus = tasksStatus === 'All' || t.status === tasksStatus;
    return matchesSearch && matchesStatus;
  });

  const filteredExpensesList = projectExpenses.filter(e => {
    const matchesSearch = e.paidTo.toLowerCase().includes(expensesSearch.toLowerCase()) ||
      (e.notes || '').toLowerCase().includes(expensesSearch.toLowerCase()) ||
      (e.taskName || '').toLowerCase().includes(expensesSearch.toLowerCase());
    const matchesCat = expensesCategory === 'All' || e.category === expensesCategory;
    const matchesPay = expensesPayMethod === 'All' || e.paymentMethod === expensesPayMethod;
    return matchesSearch && matchesCat && matchesPay;
  });

  const totalFilteredExpense = filteredExpensesList.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6 font-sans">

      {/* 1. ARCHITECTURAL HEADER & SEARCH (MAIN SCREEN) */}
      {!isFormOpen && !isViewOpen && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-zinc-950">Projects </h1>
              <p className="text-xs sm:text-sm text-zinc-500 font-medium">Coordinate construction projects, scopes and expenditures</p>
            </div>
            {userRole === 'admin' && (
              <button
                onClick={handleOpenCreateProject}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-zinc-950 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-zinc-850 transition-colors cursor-pointer shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Project</span>
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search by name, authority client, or site..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs sm:text-sm pl-9 pr-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 transition-all text-zinc-900"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 font-bold whitespace-nowrap">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white border border-zinc-200 rounded-xl px-3 py-1.5 text-xs font-bold text-zinc-700 outline-none focus:ring-1 focus:ring-zinc-900"
              >
                <option value="All">All Projects</option>
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="On Hold">On Hold</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-20">
              <div className="w-9 h-9 border-4 border-zinc-900/10 border-t-zinc-900 rounded-full animate-spin"></div>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center text-zinc-500">
              <p className="text-sm font-semibold">No registered projects match current filters.</p>
              {userRole === 'admin' && (
                <button
                  onClick={handleOpenCreateProject}
                  className="mt-4 px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition"
                >
                  Initiate Project Scope
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredProjects.map((p) => {
                const profit = p.profitLoss || 0;
                const isOver = profit < 0;
                return (
                  <div
                    key={p.id}
                    className="bg-white border border-zinc-200/80 rounded-2xl p-4 sm:p-5 shadow-sm hover:border-zinc-300 transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight ${p.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/40' :
                              p.status === 'In Progress' ? 'bg-zinc-100 text-zinc-800 border border-zinc-200/40' :
                                p.status === 'On Hold' ? 'bg-amber-50 text-amber-700 border border-amber-200/40' : 'bg-zinc-50 text-zinc-500'
                            }`}>
                            {p.status}
                          </span>
                          <h2
                            onClick={() => loadProjectDetails(p)}
                            className="text-sm sm:text-base font-bold text-zinc-900 hover:text-zinc-700 cursor-pointer tracking-tight mt-1"
                          >
                            {p.projectName}
                          </h2>
                        </div>
                        <span className="text-[10px] font-bold text-zinc-400 bg-zinc-100 px-2.5 py-1 rounded">
                          {p.taskCount || 0} Task{p.taskCount !== 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs text-zinc-500">
                        <div className="flex items-center gap-1.5">
                          <Building className="w-3.5 h-3.5" />
                          <span>Client: <b className="text-zinc-850 font-semibold">{p.clientName}</b></span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>Location: <b className="text-zinc-850 font-semibold">{p.location}</b></span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Timeline: <b className="text-zinc-850 font-semibold">{p.startDate} to {p.expectedEndDate}</b></span>
                        </div>
                      </div>

                      {userRole !== 'manager' && (
                      <div className="grid grid-cols-2 gap-2 bg-zinc-50 p-2.5 rounded-xl text-[11px] font-bold border border-zinc-100">
                        <div>
                          <span className="text-zinc-400 block text-[9px] uppercase tracking-wider">Project Budget</span>
                          <span className="text-zinc-900">{formatCur(p.totalBudget || 0)}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400 block text-[9px] uppercase tracking-wider">Total Expenses</span>
                          <span className="text-zinc-900">{formatCur(p.totalExpenses || 0)}</span>
                        </div>
                      </div>
                    )}
                    </div>

                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-100 text-xs">
                      {userRole !== 'manager' && (
                        <div className="flex items-center gap-1">
                          <span className="text-zinc-400 font-semibold">Net Profit/Loss: </span>
                          <span className={`font-bold ${isOver ? 'text-rose-600' : 'text-emerald-700'}`}>
                            {formatCur(profit)}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => loadProjectDetails(p)}
                          className="text-xs font-bold text-zinc-900 hover:underline flex items-center gap-0.5 cursor-pointer"
                        >
                          Manage Project <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        {userRole === 'admin' && (
                          <>
                            <button
                              onClick={() => handleOpenEditProject(p)}
                              className="p-1 text-zinc-500 hover:text-zinc-900 rounded bg-zinc-50 border border-zinc-200/40"
                              title="Edit Details"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteProject(p.id)}
                              className="p-1 text-rose-500 hover:text-rose-700 rounded bg-zinc-50 border border-zinc-200/40"
                              title="Erase project"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
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

      {/* 2. OVERRIDING VIEW MODE: THE INTEGRATED PROJECT DECK */}
      {isViewOpen && selectedProject && (
        <div className="space-y-6">
          <button
            onClick={() => setIsViewOpen(false)}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Project Tracker
          </button>

          {/* Core Profile Details */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-3 border-b border-zinc-100">
              <div>
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">ACTIVE CONTRACT PROFILE</span>
                <h1 className="text-lg sm:text-xl font-bold text-zinc-950 tracking-tight mt-0.5">{selectedProject.projectName}</h1>
                <p className="text-xs text-zinc-500 font-medium flex items-center gap-1.5 mt-1">
                  <MapPin className="w-3 h-3 text-zinc-400" /> {selectedProject.location}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${selectedProject.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50' :
                    selectedProject.status === 'In Progress' ? 'bg-zinc-100 text-zinc-800 border' :
                      selectedProject.status === 'On Hold' ? 'bg-amber-50 text-amber-700 border border-amber-200/50' : 'bg-zinc-50 text-zinc-500'
                  }`}>
                  {selectedProject.status}
                </span>
                {userRole === 'admin' && (
                  <button
                    onClick={() => {
                      handleOpenEditProject(selectedProject);
                      setIsViewOpen(false);
                    }}
                    className="px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 text-zinc-700 text-xs font-bold rounded-lg hover:bg-zinc-100 transition-colors"
                  >
                    Edit Info
                  </button>
                )}
              </div>
            </div>

            {/* Micro financials overview ledger */}
            {userRole !== 'manager' && (
              <>
                <div className="grid grid-cols-2 gap-3 bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                  <div>
                    <span className="text-[10px] text-zinc-400 font-bold uppercase block">Task Budgets</span>
                    <span className="text-base font-bold text-zinc-950 block">{formatCur(selectedProject.totalBudget || 0)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 font-bold uppercase block">Outflow spent</span>
                    <span className="text-base font-bold text-zinc-950 block">{formatCur(selectedProject.totalExpenses || 0)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs bg-zinc-900 text-white p-3.5 rounded-xl">
                  <div>
                    <span className="block text-[9px] text-zinc-400 font-bold uppercase">Combined Performance Margin</span>
                    <span className={`text-sm sm:text-base font-extrabold ${selectedProject.profitLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatCur(selectedProject.profitLoss || 0)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[9px] text-zinc-400 font-bold uppercase">Operating Profit</span>
                    <span className="text-sm font-bold text-zinc-100">
                      {selectedProject.profitPercentage ? selectedProject.profitPercentage.toFixed(1) : '0.0'}%
                    </span>
                  </div>
                </div>
              </>
            )}

            {selectedProject.notes && (
              <div className="text-xs bg-zinc-50 border border-zinc-100 rounded-xl p-3 text-zinc-650">
                <span className="font-bold text-zinc-800 uppercase text-[9px] block mb-1">Notes</span>
                {selectedProject.notes}
              </div>
            )}
          </div>

          {/* THE INTEGRATION TAB NAVIGATORS */}
          <div className="flex border-b border-zinc-200">
            <button
              onClick={() => setViewTab('tasks')}
              className={`px-4 py-2.5 font-bold text-xs sm:text-sm border-b-2 flex items-center gap-1.5 transition-all outline-none ${viewTab === 'tasks' ? 'border-zinc-950 text-zinc-950' : 'border-transparent text-zinc-400 hover:text-zinc-650'
                }`}
            >
              <Briefcase className="w-4 h-4" />
              <span>Tasks ({projectTasks.length})</span>
            </button>
            {userRole !== 'manager' && (
              <button
                onClick={() => setViewTab('expenses')}
                className={`px-4 py-2.5 font-bold text-xs sm:text-sm border-b-2 flex items-center gap-1.5 transition-all outline-none ${viewTab === 'expenses' ? 'border-zinc-950 text-zinc-950' : 'border-transparent text-zinc-400 hover:text-zinc-650'
                  }`}
              >
                <Receipt className="w-4 h-4" />
                <span>Expenses ({projectExpenses.length})</span>
              </button>
            )}
          </div>

          {/* TAB 1: INTEGRATED CHILD TASKS LIST */}
          {viewTab === 'tasks' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-72">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">
                      <Search className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="text"
                      placeholder="Search tasks..."
                      value={tasksSearch}
                      onChange={(e) => setTasksSearch(e.target.value)}
                      className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-zinc-200 rounded-xl focus:outline-none"
                    />
                  </div>
                  <select
                    value={tasksStatus}
                    onChange={(e) => setTasksStatus(e.target.value)}
                    className="bg-white border rounded-xl px-2 py-1 text-xs outline-none"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="On Hold">On Hold</option>
                  </select>
                </div>

                                {userRole === 'admin' && (
                                  <button
                                    onClick={handleOpenCreateTask}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 text-white text-xs font-bold rounded-xl hover:bg-zinc-800 transition shadow-sm"
                                  >
                                    <Plus className="w-3.5 h-3.5" /> Add Task
                                  </button>
                                )}

              </div>

               {loadingDetails ? (
                 <div className="flex justify-center p-8">
                   <div className="w-7 h-7 border-4 border-zinc-900/10 border-t-zinc-900 rounded-full animate-spin"></div>
                 </div>
               ) : filteredTasksList.length === 0 ? (
                 <div className="bg-zinc-50 border border-dashed rounded-2xl p-10 text-center">
                   <p className="text-xs text-zinc-500">No project tasks found. {userRole === 'admin' && 'Click Add Task to add.'}</p>
                 </div>
               ) : (

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredTasksList.map((t) => {
                    const taskCommitted = t.totalCommitted ?? t.totalExpenses ?? 0;
                    const isOver = taskCommitted > t.assignedBudget;
                    const isNearing = !isOver && t.assignedBudget > 0 && (taskCommitted / t.assignedBudget) > 0.85;
                    return (
                      <div key={t.id} className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-3 shadow-none hover:border-zinc-300 transition flex flex-col justify-between">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-1">
                            <div>
                              <h3
                                onClick={() => setActiveTask(t)}
                                className="text-xs sm:text-sm font-bold text-zinc-900 hover:underline cursor-pointer"
                              >
                                {t.taskName}
                              </h3>
                              <p className="text-[10px] text-zinc-400 font-medium">Workers assigned: {t.assignedStaff || 'None Assigned'}</p>
                            </div>
                            <select
                              value={t.status}
                              onChange={(e) => handleQuickStatusUpdate(t, e.target.value as TaskStatus)}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full outline-none border cursor-pointer ${t.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                  t.status === 'In Progress' ? 'bg-zinc-100 text-zinc-800 border-zinc-200' :
                                    t.status === 'On Hold' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-zinc-100 text-zinc-500 border-zinc-200'
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

                          {userRole !== 'manager' && isOver && (
                            <div className="bg-red-50 text-red-700 text-[10px] p-2 rounded-lg flex items-center gap-1.5 font-bold">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                              <span>Overbudget Spent {formatCur(taskCommitted - t.assignedBudget)} extra.</span>
                            </div>
                          )}

                          {userRole !== 'manager' && isNearing && (
                            <div className="bg-amber-50 text-amber-800 text-[10px] p-2 rounded-lg flex items-center gap-1.5 font-bold">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>Ceiling reached ({(taskCommitted / t.assignedBudget * 100).toFixed(0)}% committed)</span>
                            </div>
                          )}

                          {userRole !== 'manager' && (
                            <div className="grid grid-cols-3 gap-2 bg-zinc-50 p-2.5 rounded-xl text-[10px] font-bold border border-zinc-100">
                              <div>
                                <span className="text-zinc-400 block text-[9px] uppercase tracking-wider">Est Budget</span>
                                <span className="text-zinc-900 block">{formatCur(t.assignedBudget)}</span>
                              </div>
                              <div>
                                <span className="text-zinc-400 block text-[9px] uppercase tracking-wider">Actual Cost</span>
                                <span className="text-zinc-900 block">{formatCur(taskCommitted)}</span>
                                {(t.pendingExpenses || 0) > 0 && (
                                  <span className="text-[9px] text-amber-600 block">{formatCur(t.pendingExpenses)} pending</span>
                                )}
                              </div>
                              <div>
                                <span className="text-zinc-400 block text-[9px] uppercase tracking-wider">Balance</span>
                                <span className={`block ${isOver ? 'text-rose-600' : 'text-emerald-700'}`}>
                                  {formatCur(t.assignedBudget - taskCommitted)}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Instant Slider */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-zinc-400 font-bold uppercase text-[9px]">Task Progress</span>
                              <span className="text-zinc-950 font-black block bg-zinc-150 px-1.5 py-0.5 rounded text-[10px]">{t.progress}%</span>
                            </div>
                            <div className="w-full flex items-center">
                              <input
                                type="range"
                                min="0"
                                max="100"
                                step="5"
                                value={t.progress}
                                onChange={(e) => handleQuickProgressUpdate(t, Number(e.target.value))}
                                className="w-full accent-zinc-950 h-1.5 rounded-full appearance-none cursor-pointer outline-none bg-zinc-200"
                                style={{ background: `linear-gradient(to right, #181c20 0%, #181c20 ${t.progress}%, #e4e4e7 ${t.progress}%, #e4e4e7 100%)` }}
                                title="Slide left/right to adjust progress instantly"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-100 text-xs">
                          <span className="text-[10px] text-zinc-400 font-semibold">{t.startDate} - {t.endDate}</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setActiveTask(t)}
                              className="text-xs font-black text-zinc-900 hover:underline cursor-pointer flex items-center gap-0.5"
                            >
                              <span>Details</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                               <button
                                 onClick={() => handleOpenEditTask(t)}
                                 className={`p-1 text-zinc-500 hover:text-zinc-900 rounded bg-zinc-50 border border-zinc-200/40 ${userRole !== 'admin' ? 'hidden' : ''}`}
                                 title="Edit"
                               >
                                 <Edit2 className="w-3.5 h-3.5" />
                               </button>
                               {userRole === 'admin' && (
                                 <button
                                   onClick={() => handleDeleteTask(t.id)}
                                   className="p-1 text-rose-500 hover:text-rose-700 bg-zinc-50 border border-zinc-200/40 rounded"
                                   title="Delete"
                                 >
                                   <Trash2 className="w-3.5 h-3.5" />
                                 </button>
                               )}

                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: INTEGRATED CHILD SITE EXPENSES */}
          {viewTab === 'expenses' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-56">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">
                      <Search className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="text"
                      placeholder="Search expenses..."
                      value={expensesSearch}
                      onChange={(e) => setExpensesSearch(e.target.value)}
                      className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-zinc-200 rounded-xl focus:outline-none"
                    />
                  </div>
                  <select
                    value={expensesCategory}
                    onChange={(e) => setExpensesCategory(e.target.value)}
                    className="bg-white border rounded-xl px-2 py-1 text-xs outline-none"
                  >
                    <option value="All">All Categories</option>
                    <option value="Material">Material</option>
                    <option value="Labour">Labour</option>
                    <option value="Transport">Transport</option>
                    <option value="Tools">Tools</option>
                    <option value="Company Payment">Company Payment</option>
                    <option value="Other">Other</option>
                  </select>
                  <select
                    value={expensesPayMethod}
                    onChange={(e) => setExpensesPayMethod(e.target.value)}
                    className="bg-white border rounded-xl px-2 py-1 text-xs outline-none"
                  >
                    <option value="All">All Methods</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>

                    <div className="flex gap-2">
                      {userRole === 'admin' && (
                        <button
                          onClick={() => handleOpenCreateExpense()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 text-white text-xs font-bold rounded-xl hover:bg-zinc-800 transition shadow-sm cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Log Expenditure
                        </button>
                      )}
                    </div>

              </div>

              {/* Total Aggregate box */}
              {userRole !== 'manager' && (
                <div className="bg-zinc-900 text-white px-4 py-3 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Filtered Total Cost</span>
                    <span className="text-lg font-black">{formatCur(totalFilteredExpense)}</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 font-bold bg-white/10 px-2 py-0.5 rounded">
                    {filteredExpensesList.length} logs
                  </span>
                </div>
              )}

              {filteredExpensesList.length === 0 ? (
                <div className="p-8 border border-dashed rounded-2xl text-center bg-zinc-50">
                  <p className="text-xs text-zinc-500">No project expense logs match parameters.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredExpensesList.map((e) => (
                    <div
                      key={e.id}
                      className="bg-white border border-zinc-200 rounded-xl p-3.5 shadow-none flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-zinc-300 transition"
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{e.category}</span>
                          <span className="text-zinc-200">•</span>
                          <span className="text-[10px] font-bold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">{e.taskName}</span>
                          {e.isPendingRequest ? (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                              Pending — Office Fund
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Paid
                            </span>
                          )}
                        </div>
                        <h3 className="text-xs sm:text-sm font-bold text-zinc-950">
                          Paid to: <b className="text-zinc-900 font-extrabold">{e.paidTo}</b>
                        </h3>
                        {e.notes && (
                          <p className="text-[11px] text-zinc-500 bg-zinc-50/70 p-1.5 rounded italic">
                            &quot;{e.notes}&quot;
                          </p>
                        )}
                        <p className="text-[9.5px] text-zinc-400 font-semibold">
                          Date: {e.date} • Method: {e.paymentMethod}
                        </p>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-0 border-zinc-100">
                        {e.billImage ? (
                          <button
                            onClick={() => { setPreviewExpenseImage(e.billImage); setIsReceiptPreviewOpen(true); }}
                            className="p-1 px-2 rounded bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border text-[10px] font-bold flex items-center gap-1 transition"
                          >
                            <ImageIcon className="w-3 h-3 text-zinc-600" />
                            <span>View Receipt</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-zinc-300 italic font-semibold">No receipt doc</span>
                        )}

                        <div className="text-right flex items-center sm:block gap-2">
                          <span className="text-sm font-bold text-zinc-950 block">{formatCur(e.amount)}</span>
                             <div className="flex items-center gap-1 justify-end mt-1">
                              {userRole === 'admin' && (
                                <button
                                  onClick={() => handleOpenEditExpense(e)}
                                  className="p-1 bg-zinc-50 hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900 border rounded"
                                  title={e.isPendingRequest ? "Edit request" : "Request Edit (Paid Expense)"}
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              )}
                              {userRole === 'admin' && (
                                <button
                                  onClick={() => handleDeleteExpense(e.id)}
                                  className="p-1 bg-zinc-50 hover:bg-rose-50 text-rose-500 hover:text-rose-700 border rounded"
                                  title={e.isPendingRequest ? "Cancel request" : "Request Delete (Paid Expense)"}
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
            </div>
          )}

        </div>
      )}

      {/* 3. MODAL: FULL DETAILS CARD FOR A SPECIFIED TASK */}
      {activeTask && (
        <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto space-y-4 border border-zinc-200/80 shadow-2xl animate-fade-in relative font-sans">
            <button
              onClick={() => setActiveTask(null)}
              className="absolute top-5 right-5 p-1 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition"
            >
              <X className="w-5 h-5 pointer-events-none" />
            </button>

            <div>
              <span className="text-[10px] text-zinc-400 font-bold uppercase block tracking-wider">{selectedProject.projectName}</span>
              <h2 className="text-lg sm:text-xl font-bold text-zinc-900 tracking-tight mt-0.5 flex items-center gap-1.5">
                <Briefcase className="w-5 h-5 text-zinc-500" />
                <span>Task Assessment: {activeTask.taskName}</span>
              </h2>
              {activeTask.description && (
                <p className="text-xs sm:text-sm text-zinc-500 mt-1.5 leading-relaxed">{activeTask.description}</p>
              )}
            </div>

            {/* Quick stats specific to this active task */}
            {userRole !== 'manager' && (
              <>
                <div className="grid grid-cols-3 gap-3 bg-zinc-50 p-4 rounded-xl border border-zinc-100/50">
                  <div>
                    <span className="text-[10px] text-zinc-400 font-bold uppercase block">Budget</span>
                    <span className="text-base font-bold text-zinc-950 block">{formatCur(activeTask.assignedBudget)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 font-bold uppercase block">Task Overheads</span>
                    <span className="text-base font-bold text-zinc-950 block">{formatCur(activeTask.totalExpenses || 0)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 font-bold uppercase block">Difference</span>
                    <span className={`text-base font-bold block ${(activeTask.assignedBudget - (activeTask.totalExpenses || 0)) >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {formatCur(activeTask.assignedBudget - (activeTask.totalExpenses || 0))}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-zinc-950 text-white rounded-xl flex items-center justify-between">
                  <div>
                    <span className="block text-[8.5px] text-zinc-400 font-bold uppercase tracking-wider">Sub-Contract Margin</span>
                    <span className="text-sm font-bold block">{formatCur(activeTask.assignedBudget - (activeTask.totalExpenses || 0))}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold text-zinc-900 ${(activeTask.assignedBudget - (activeTask.totalExpenses || 0)) >= 0 ? 'bg-emerald-400' : 'bg-red-400'
                    }`}>
                    {(activeTask.assignedBudget - (activeTask.totalExpenses || 0)) >= 0 ? 'Profitable' : 'Deficit'}
                  </span>
                </div>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {userRole !== 'manager' && (
                <div className="p-3 bg-zinc-950 text-white rounded-xl flex items-center justify-between">
                  <div>
                    <span className="block text-[8.5px] text-zinc-400 font-bold uppercase tracking-wider">Sub-Contract Margin</span>
                    <span className="text-sm font-bold block">{formatCur(activeTask.assignedBudget - (activeTask.totalExpenses || 0))}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold text-zinc-900 ${(activeTask.assignedBudget - (activeTask.totalExpenses || 0)) >= 0 ? 'bg-emerald-400' : 'bg-red-400'
                    }`}>
                    {(activeTask.assignedBudget - (activeTask.totalExpenses || 0)) >= 0 ? 'Profitable' : 'Deficit'}
                  </span>
                </div>
              )}

              <div className="p-3 bg-zinc-100 border border-zinc-200/40 rounded-xl flex items-center justify-between">
                <div>
                  <span className="block text-[8.5px] text-zinc-400 font-bold uppercase tracking-wider font-semibold">Scheduled Range</span>
                  <span className="text-xs font-bold text-zinc-800">
                    {activeTask.startDate} to {activeTask.endDate}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500 font-bold bg-white px-2 py-0.5 rounded border border-zinc-200/50">Workers: {activeTask.assignedStaff || 'Unassigned'}</span>
              </div>
            </div>

            {/* NESTED MANAGEMENT INSIDE SPECIFIED TASK */}
            {userRole !== 'manager' && (
              <div className="space-y-4 border-t border-zinc-150 pt-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-[11px] font-black text-zinc-900 uppercase tracking-wide flex items-center gap-1">
                      <Receipt className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Expenses ({projectExpenses.filter(e => e.taskId === activeTask.id).length})</span>
                    </span>
                    {userRole === 'admin' && (
                      <button
                        onClick={() => handleOpenCreateExpense(activeTask.id)}
                        className="p-1 px-1.5 bg-zinc-100 hover:bg-zinc-200 rounded text-[9.5px] text-zinc-700 font-bold flex items-center gap-0.5 transition"
                      >
                        <Plus className="w-3 h-3" /> Expense
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {projectExpenses.filter(e => e.taskId === activeTask.id).length === 0 ? (
                      <p className="text-[10px] text-zinc-400 italic text-center py-4 select-none">No expenses recorded for this task scope.</p>
                    ) : (
                      projectExpenses.filter(e => e.taskId === activeTask.id).map(e => (
                        <div key={e.id} className="p-2 bg-zinc-50 border rounded-lg flex items-center justify-between text-[11px]">
                          <div>
                            <span className="font-bold text-zinc-800 block">{e.paidTo}</span>
                            <span className="text-[9.5px] text-zinc-400">{e.category} • {e.date}</span>
                            {e.isPendingRequest && (
                              <span className="text-[8.5px] font-bold text-amber-700 uppercase">Pending office fund</span>
                            )}
                          </div>
                          <div className="text-right flex items-center gap-1.5">
                            <span className="font-black text-zinc-950">{formatCur(e.amount)}</span>
                            {e.isPendingRequest && userRole === 'admin' && (
                              <button
                                onClick={() => handleOpenEditExpense(e)}
                                className="p-0.5 hover:bg-zinc-200 rounded"
                                title="Edit request"
                              >
                                <Edit2 className="w-3 h-3 text-zinc-500" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <TaskAttendanceSection
                  projectId={selectedProject.id}
                  taskId={activeTask.id}
                  assignedStaff={activeTask.assignedStaff}
                  onSaved={() => selectedProject && reloadProjectData(selectedProject.id)}
                />
              </div>
            )}
            {userRole === 'manager' && (
              <div className="border-t border-zinc-150 pt-4">
                <TaskAttendanceSection
                  projectId={selectedProject.id}
                  taskId={activeTask.id}
                  assignedStaff={activeTask.assignedStaff}
                  onSaved={() => selectedProject && reloadProjectData(selectedProject.id)}
                />
              </div>
            )}

                    <div className="flex justify-end gap-2 border-t pt-4">
                      {userRole === 'admin' && (
                        <button
                          onClick={() => { handleOpenEditTask(activeTask); }}
                          className="px-3 py-1.5 bg-zinc-100 text-zinc-800 hover:bg-zinc-200 rounded-xl text-xs font-bold transition"
                        >
                          Modify Task
                        </button>
                      )}
                      <button
                        onClick={() => setActiveTask(null)}
                        className="px-4 py-1.5 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition"
                      >
                        Done
                      </button>
                    </div>

          </div>
        </div>
      )}


      {/* --- FORM DIALOGS --- */}

      {/* PROJECT FORM MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border text-xs sm:text-sm border-zinc-200 rounded-3xl p-5 sm:p-6 shadow-2xl max-w-xl w-full space-y-4 font-sans animate-fade-in relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsFormOpen(false)}
              className="absolute top-5 right-5 text-zinc-400 hover:text-zinc-650"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="border-b pb-3 border-zinc-100">
              <h2 className="text-base sm:text-lg font-bold text-zinc-900">
                {projEditId ? 'Configure Project Parameters' : 'Register New Construction Project'}
              </h2>
            </div>

            {projSubmitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs sm:text-sm font-semibold">
                {projSubmitError}
              </div>
            )}

            <form onSubmit={handleProjectSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  placeholder=""
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Client Name</label>
                  <input
                    type="text"
                    required
                    placeholder=""
                    value={projClient}
                    onChange={(e) => setProjClient(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Site Location</label>
                  <input
                    type="text"
                    required
                    placeholder=""
                    value={projLocation}
                    onChange={(e) => setProjLocation(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={projStartDate}
                    onChange={(e) => setProjStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    value={projEndDate}
                    onChange={(e) => setProjEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Current Status</label>
                  <select
                    value={projStatus}
                    onChange={(e) => setProjStatus(e.target.value as ProjectStatus)}
                    className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none"
                  >
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="On Hold">On Hold</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Notes</label>
                <textarea
                  placeholder=""
                  value={projNotes}
                  onChange={(e) => setProjNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none text-xs sm:text-sm"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer"
              >
                Synchronize Project Profile
              </button>
            </form>
          </div>
        </div>
      )}


      {/* TASK FORM MODAL */}
      {isTaskFormOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border text-xs sm:text-sm border-zinc-200 rounded-3xl p-5 sm:p-6 shadow-2xl max-w-xl w-full space-y-4 font-sans animate-fade-in relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsTaskFormOpen(false)}
              className="absolute top-5 right-5 text-zinc-400 hover:text-zinc-650"
            >
              <X className="w-5 h-5 pointer-events-none" />
            </button>
            <div className="border-b pb-3 border-zinc-100">
              <h2 className="text-base sm:text-lg font-bold text-zinc-900">
                {taskEditId ? 'Configure Task Scope' : 'Add Task Scope under active Project'}
              </h2>
            </div>

            {taskSubmitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs sm:text-sm font-bold">
                {taskSubmitError}
              </div>
            )}

            <form onSubmit={handleTaskSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Task Name</label>
                <input
                  type="text"
                  required
                  placeholder=""
                  value={taskFormName}
                  onChange={(e) => setTaskFormName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-955 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Target Budget (₹)</label>
                <input
                  type="number"
                  required
                  min={0}
                  placeholder="e.g. 50000"
                  value={taskFormBudget}
                  onChange={(e) => setTaskFormBudget(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-955 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Assigned Workers</label>

                  {/* Crew Badges */}
                  <div className="flex flex-wrap gap-1 mb-2 bg-zinc-55 border border-zinc-200 p-1.5 rounded-xl min-h-[38px] items-center">
                    {taskAssignedStaffList.map((m) => (
                      <span
                        key={m}
                        className="inline-flex items-center gap-1 bg-zinc-900 text-white text-[10px] font-bold pl-2 pr-1 py-0.5 rounded-lg"
                      >
                        <span>{m}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStaffMember(m)}
                          className="hover:text-red-300 font-extrabold w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-white/10"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {taskAssignedStaffList.length === 0 && (
                      <span className="text-[10px] text-zinc-400 italic font-medium pl-1">No Worker Selected</span>
                    )}
                  </div>

                  <div className="flex gap-1.5">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Type name or find below..."
                        value={taskMemberInput}
                        onChange={(e) => {
                          setTaskMemberInput(e.target.value);
                          setShowTaskSuggestions(true);
                        }}
                        onFocus={() => setShowTaskSuggestions(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (taskMemberInput.trim()) {
                              handleAddStaffMember(taskMemberInput.trim());
                            }
                          }
                        }}
                        className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-xs focus:outline-none"
                      />

                      {showTaskSuggestions && (
                        <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white border border-zinc-200 rounded-xl shadow-lg z-50 text-xs divide-y divide-zinc-100">
                          {crewSuggestions
                            .filter(worker =>
                              (!taskMemberInput || worker.toLowerCase().includes(taskMemberInput.toLowerCase())) &&
                              !taskAssignedStaffList.includes(worker)
                            )
                            .map(worker => (
                              <button
                                key={worker}
                                type="button"
                                onClick={() => handleAddStaffMember(worker)}
                                className="w-full text-left px-3 py-2 hover:bg-zinc-150 text-zinc-800 transition-colors flex items-center justify-between font-semibold"
                              >
                                <span>{worker}</span>
                                <span className="text-[9px] text-zinc-400 font-bold uppercase">Staff</span>
                              </button>
                            ))
                          }
                          {taskMemberInput.trim() && !taskAssignedStaffList.includes(taskMemberInput.trim()) && (
                            <button
                              type="button"
                              onClick={() => handleAddStaffMember(taskMemberInput.trim())}
                              className="w-full text-left px-3 py-2 hover:bg-zinc-150 text-zinc-950 font-bold flex items-center justify-between italic"
                            >
                              <span>Assign &quot;{taskMemberInput}&quot;</span>
                              <span className="text-[9px] text-emerald-600 font-bold">+ New</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (taskMemberInput.trim()) {
                          handleAddStaffMember(taskMemberInput.trim());
                        }
                      }}
                      className="px-3 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Workflow Status</label>
                  <select
                    value={taskFormStatus}
                    onChange={(e) => {
                      const st = e.target.value as TaskStatus;
                      setTaskFormStatus(st);
                      if (st === 'Completed') {
                        setTaskFormProgress(100);
                      }
                    }}
                    className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-955 focus:outline-none"
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
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Scheduled Start</label>
                  <input
                    type="date"
                    required
                    value={taskFormStartDate}
                    onChange={(e) => setTaskFormStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-955 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Milestone Finish</label>
                  <input
                    type="date"
                    required
                    value={taskFormEndDate}
                    onChange={(e) => setTaskFormEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-955 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Task Progress ({taskFormProgress}%)</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={taskFormProgress}
                  onChange={(e) => {
                    const pr = Number(e.target.value);
                    setTaskFormProgress(pr);
                    if (pr === 100) {
                      setTaskFormStatus('Completed');
                    } else if (pr < 100 && taskFormStatus === 'Completed') {
                      setTaskFormStatus('In Progress');
                    }
                  }}
                  className="w-full h-1.5 bg-zinc-200 accent-zinc-950 rounded-lg appearance-none cursor-pointer outline-none"
                  style={{ background: `linear-gradient(to right, #181c20 0%, #181c20 ${taskFormProgress}%, #e4e4e7 ${taskFormProgress}%, #e4e4e7 100%)` }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Instructions</label>
                <textarea
                  placeholder="Provide precise instructions, structural drawings references..."
                  value={taskFormDesc}
                  onChange={(e) => setTaskFormDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-955 text-xs sm:text-sm focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer"
              >
                Determine Task Requirements
              </button>
            </form>
          </div>
        </div>
      )}


      {/* EXPENSE FORM MODAL */}
      {isExpenseFormOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border text-xs sm:text-sm border-zinc-200 rounded-3xl p-5 sm:p-6 shadow-2xl max-w-xl w-full space-y-4 font-sans animate-fade-in relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsExpenseFormOpen(false)}
              className="absolute top-5 right-5 text-zinc-400 hover:text-zinc-650"
            >
              <X className="w-5 h-5 pointer-events-none" />
            </button>
            <div className="border-b pb-3 border-zinc-100">
              <h2 className="text-base sm:text-lg font-bold text-zinc-900">
                {expenseEditId ? 'Configure Site Expense Ledger' : 'Log Expenditure Checkout'}
              </h2>
              <span className="text-[10px] text-zinc-400 block font-bold mt-0.5">Project Context: {selectedProject.projectName}</span>
            </div>

            {expenseSubmitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs sm:text-sm font-bold animate">
                {expenseSubmitError}
              </div>
            )}

            {userRole === 'admin' && expenseAmount > 0 && expenseAmount > officeBalance && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-xs sm:text-sm flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <p className="font-bold">Insufficient office funds</p>
                  <p className="mt-0.5 font-medium leading-relaxed">
                    Available office balance is <span className="font-bold">{formatCur(officeBalance)}</span>, but this
                    request is for <span className="font-bold">{formatCur(expenseAmount)}</span>. You can still submit —
                    the accountant may need to record a cash inflow before approval.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleExpenseSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Under Specified Task Scope</label>
                  <select
                    required
                    value={expenseTaskId}
                    onChange={(e) => setExpenseTaskId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl focus:outline-none text-zinc-950"
                  >
                    <option value="" disabled>Select task scope...</option>
                    {projectTasks.map(t => (
                      <option key={t.id} value={t.id}>{t.taskName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Expense Category</label>
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value as ExpenseCategory)}
                    className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl focus:outline-none"
                  >
                    <option value="Material">Material</option>
                    <option value="Labour">Labour</option>
                    <option value="Transport">Transport</option>
                    <option value="Tools">Tools</option>
                    <option value="Company Payment">Company Payment</option>
                    <option value="Vendor Payment">Vendor Payment</option>
                    <option value="Purchase">Purchase</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Material fields */}
              {expenseCategory === 'Material' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Material Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Cement, Steel Bars"
                      value={expenseMaterialName}
                      onChange={(e) => setExpenseMaterialName(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Quantity</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 50 bags"
                      value={expenseMaterialQty}
                      onChange={(e) => setExpenseMaterialQty(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Transport fields */}
              {expenseCategory === 'Transport' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">From Location</label>
                    <input
                      type="text"
                      placeholder="e.g. Site A"
                      value={expenseFromLocation}
                      onChange={(e) => setExpenseFromLocation(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">To Location</label>
                    <input
                      type="text"
                      placeholder="e.g. Warehouse B"
                      value={expenseToLocation}
                      onChange={(e) => setExpenseToLocation(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Tools fields */}
              {expenseCategory === 'Tools' && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Tools List</label>
                  <div className="flex flex-wrap gap-1.5 p-2 bg-zinc-50 border border-zinc-200 rounded-xl min-h-[38px] items-center">
                    {expenseTools.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 bg-zinc-900 text-white text-[10px] font-bold pl-2 pr-1 py-0.5 rounded-lg">
                        <span>{t}</span>
                        <button
                          type="button"
                          onClick={() => setExpenseTools(expenseTools.filter(x => x !== t))}
                          className="hover:text-red-300 font-extrabold w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-white/10"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {expenseTools.length === 0 && (
                      <span className="text-[10px] text-zinc-400 italic">No tools added yet. Type below and click Add.</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Hammer, Drill, Mixer"
                      value={expenseToolInput}
                      onChange={(e) => setExpenseToolInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (expenseToolInput.trim() && !expenseTools.includes(expenseToolInput.trim())) {
                            setExpenseTools([...expenseTools, expenseToolInput.trim()]);
                            setExpenseToolInput('');
                          }
                        }
                      }}
                      className="flex-1 px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (expenseToolInput.trim() && !expenseTools.includes(expenseToolInput.trim())) {
                          setExpenseTools([...expenseTools, expenseToolInput.trim()]);
                          setExpenseToolInput('');
                        }
                      }}
                      className="px-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition"
                    >
                      Add Tool
                    </button>
                  </div>
                </div>
              )}

              {/* Vendor Payment fields */}
              {expenseCategory === 'Vendor Payment' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Total to Pay (₹)</label>
                    <input
                      type="number"
                      required
                      min={0.01}
                      step="any"
                      placeholder="e.g. 50000"
                      value={expenseVendorTotalToPay || ''}
                      onChange={(e) => setExpenseVendorTotalToPay(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Paid (₹)</label>
                    <input
                      type="number"
                      required
                      min={0.01}
                      step="any"
                      placeholder="e.g. 20000"
                      value={expenseVendorPaid || ''}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setExpenseVendorPaid(val);
                        setExpenseAmount(val);
                      }}
                      className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Remaining (₹)</label>
                    <input
                      type="text"
                      disabled
                      readOnly
                      value={formatCur(Math.max(0, expenseVendorTotalToPay - expenseVendorPaid))}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-500 font-bold"
                    />
                  </div>
                </div>
              )}

              {/* Purchase fields — multi-line items table */}
              {expenseCategory === 'Purchase' && (
                <div className="space-y-4">
                  <div className="border border-zinc-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-zinc-50 text-zinc-500 font-bold uppercase tracking-wider text-[10px]">
                          <th className="text-left px-3 py-2.5 w-[30%]">Material</th>
                          <th className="text-left px-3 py-2.5 w-[18%]">Qty</th>
                          <th className="text-right px-3 py-2.5 w-[20%]">Price / Unit (₹)</th>
                          <th className="text-right px-3 py-2.5 w-[20%]">Total (₹)</th>
                          <th className="px-2 py-2.5 w-[12%]"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {expensePurchaseItems.map((item, idx) => (
                          <tr key={idx} className="group hover:bg-zinc-50/50 transition-colors">
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                required
                                placeholder="e.g. Cement"
                                value={item.materialName}
                                onChange={(e) => {
                                  const items = [...expensePurchaseItems];
                                  items[idx] = { ...items[idx], materialName: e.target.value };
                                  setExpensePurchaseItems(items);
                                }}
                                className="w-full px-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-950 focus:outline-none focus:border-zinc-400 text-xs"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                required
                                placeholder="e.g. 100 bags"
                                value={item.qty}
                                onChange={(e) => {
                                  const items = [...expensePurchaseItems];
                                  const numericQty = parseNumericQty(e.target.value);
                                  const total = numericQty * items[idx].pricePerCount;
                                  items[idx] = { ...items[idx], qty: e.target.value, total };
                                  setExpensePurchaseItems(items);
                                  const grandTotal = items.reduce((s, it) => s + it.total, 0);
                                  setExpenseVendorTotalToPay(grandTotal);
                                }}
                                className="w-full px-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-950 focus:outline-none focus:border-zinc-400 text-xs"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="number"
                                required
                                min={0}
                                step="any"
                                placeholder="400"
                                value={item.pricePerCount || ''}
                                onChange={(e) => {
                                  const items = [...expensePurchaseItems];
                                  const price = Number(e.target.value);
                                  const numericQty = parseNumericQty(items[idx].qty);
                                  const total = numericQty * price;
                                  items[idx] = { ...items[idx], pricePerCount: price, total };
                                  setExpensePurchaseItems(items);
                                  const grandTotal = items.reduce((s, it) => s + it.total, 0);
                                  setExpenseVendorTotalToPay(grandTotal);
                                }}
                                className="w-full px-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-950 text-right focus:outline-none focus:border-zinc-400 text-xs"
                              />
                            </td>
                            <td className="px-3 py-1.5 text-right font-bold text-zinc-700">
                              {formatCur(item.total)}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {expensePurchaseItems.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const items = expensePurchaseItems.filter((_, i) => i !== idx);
                                    setExpensePurchaseItems(items);
                                    const grandTotal = items.reduce((s, it) => s + it.total, 0);
                                    setExpenseVendorTotalToPay(grandTotal);
                                  }}
                                  className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                                  title="Remove row"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-zinc-200 bg-zinc-50">
                          <td colSpan={3} className="px-3 py-2 text-right font-bold text-zinc-600 uppercase text-[10px] tracking-wider">Grand Total</td>
                          <td className="px-3 py-2 text-right font-black text-zinc-900">{formatCur(expensePurchaseItems.reduce((s, it) => s + it.total, 0))}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpensePurchaseItems([...expensePurchaseItems, { materialName: '', qty: '', pricePerCount: 0, total: 0 }])}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Material</span>
                  </button>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Total to Pay (₹)</label>
                      <input
                        type="number"
                        disabled
                        readOnly
                        value={expenseVendorTotalToPay || ''}
                        className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-500 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Total Paid (₹)</label>
                      <input
                        type="number"
                        required
                        min={0.01}
                        step="any"
                        placeholder="e.g. 15000"
                        value={expenseVendorPaid || ''}
                        onChange={(e) => {
                          const paid = Number(e.target.value);
                          setExpenseVendorPaid(paid);
                          setExpenseAmount(paid);
                        }}
                        className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Remaining (₹)</label>
                      <input
                        type="text"
                        disabled
                        readOnly
                        value={formatCur(Math.max(0, expenseVendorTotalToPay - expenseVendorPaid))}
                        className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-500 font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Paid To</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alliance Steel Builders"
                    value={expensePaidTo}
                    onChange={(e) => {
                      setExpensePaidTo(e.target.value);
                      if (expenseCategory === 'Labour') setShowExpenseCrewSuggestions(true);
                      else if (expenseCategory === 'Vendor Payment' || expenseCategory === 'Purchase') setShowExpenseVendorSuggestions(true);
                    }}
                    onFocus={() => {
                      if (expenseCategory === 'Labour') setShowExpenseCrewSuggestions(true);
                      else if (expenseCategory === 'Vendor Payment' || expenseCategory === 'Purchase') setShowExpenseVendorSuggestions(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        setShowExpenseCrewSuggestions(false);
                        setShowExpenseVendorSuggestions(false);
                      }, 200);
                    }}
                    className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none"
                  />
                  {expenseCategory === 'Labour' && showExpenseCrewSuggestions && crewSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white border border-zinc-200 rounded-xl shadow-lg z-50 text-xs divide-y divide-zinc-100">
                      {crewSuggestions
                        .filter(worker => !expensePaidTo || worker.toLowerCase().includes(expensePaidTo.toLowerCase()))
                        .map(worker => (
                          <button
                            key={worker}
                            type="button"
                            onClick={() => {
                              setExpensePaidTo(worker);
                              setShowExpenseCrewSuggestions(false);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-zinc-100 text-zinc-800 transition-colors flex items-center justify-between font-semibold"
                          >
                            <span>{worker}</span>
                            <span className="text-[9px] text-zinc-400 font-bold uppercase">Crew</span>
                          </button>
                        ))
                      }
                    </div>
                  )}
                  {(expenseCategory === 'Vendor Payment' || expenseCategory === 'Purchase') && showExpenseVendorSuggestions && vendorsList.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white border border-zinc-200 rounded-xl shadow-lg z-50 text-xs divide-y divide-zinc-100">
                      {vendorsList
                        .filter(v => !expensePaidTo || v.name.toLowerCase().includes(expensePaidTo.toLowerCase()))
                        .map(v => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => {
                              setExpensePaidTo(v.name);
                              setShowExpenseVendorSuggestions(false);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-zinc-100 text-zinc-800 transition-colors flex items-center justify-between font-semibold"
                          >
                            <span>{v.name}</span>
                            <span className="text-[9px] text-zinc-400 font-bold uppercase">{v.trade}</span>
                          </button>
                        ))
                      }
                    </div>
                  )}
                </div>

                {expenseCategory !== 'Vendor Payment' && expenseCategory !== 'Purchase' && (
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Spent Amount (₹)</label>
                    <input
                      type="number"
                      required
                      min={0.01}
                      step="any"
                      placeholder="e.g. 1500"
                      value={expenseAmount || ''}
                      onChange={(e) => setExpenseAmount(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Payment date</label>
                  <input
                    type="date"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Payment Method</label>
                  <select
                    value={expensePaymentMethod}
                    onChange={(e) => setExpensePaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl"
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Cash">Cash</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Upload Doc</label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 flex flex-col items-center justify-center border border-zinc-300 border-dashed rounded-xl px-2 py-3.5 cursor-pointer bg-zinc-50 hover:bg-zinc-100 transition text-center text-xs text-zinc-600 font-bold gap-1 mt-1">
                    <UploadCloud className="w-5 h-5 text-zinc-400" />
                    <span>{expenseBillImage ? 'Receipt Doc uploaded ✓' : 'Upload invoice file (Max 2MB)'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleExpenseReceiptUpload}
                      className="hidden"
                    />
                  </label>
                  {expenseBillImage && (
                    <button
                      type="button"
                      onClick={() => setExpenseBillImage('')}
                      className="p-3 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-xl transition"
                      title="Erase attachment"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Ledger Memo</label>
                <textarea
                  placeholder="Enter purchase specifications, voucher tracking numbers, machinery serial..."
                  value={expenseNotes}
                  onChange={(e) => setExpenseNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none text-xs sm:text-sm"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer"
              >
                Site Expense
              </button>
            </form>
          </div>
        </div>
      )}


      {/* RECEIPT PREVIEW MODAL */}
      {isReceiptPreviewOpen && (
        <div className="fixed inset-0 bg-black/65 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-4 max-w-lg w-full space-y-4 inline-block shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsReceiptPreviewOpen(false)}
              className="absolute top-3 right-3 p-1 rounded-full text-zinc-400 hover:text-zinc-650 hover:bg-zinc-100 transition"
            >
              <X className="w-5 h-5 pointer-events-none" />
            </button>
            <div>
              <h3 className="text-xs text-zinc-400 font-bold uppercase block">Expenditure Voucher</h3>
              <span className="text-xs text-zinc-400 block font-semibold">Verification scan</span>
            </div>
            <div className="w-full max-h-[400px] overflow-auto bg-zinc-50 border rounded-xl flex justify-center items-center p-2">
              <img
                src={previewExpenseImage}
                alt="Verification scan file attachment"
                className="max-w-full max-h-[380px] object-contain rounded-lg"
              />
            </div>
            <button
              onClick={() => setIsReceiptPreviewOpen(false)}
              className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
