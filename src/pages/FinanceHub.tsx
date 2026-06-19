import React, { useState, useEffect } from 'react';
import {
  Plus, Search, FileText, X, Trash, UploadCloud, Eye, Clock, CheckCircle2, XCircle, AlertCircle, AlertTriangle,
  ChevronLeft, ChevronRight, Edit2, Trash2, ChevronDown, Send
} from 'lucide-react';
import { api } from '../api/client';
import { ExpenseCategory, PaymentRequest, PurchaseLineItem } from '../types';
import { notify } from '../utils/toast';
import { useConfirm } from '../context/ConfirmContext';
import { onRequestsUpdate, offRequestsUpdate } from '../api/socket';

type EnrichedPaymentRequest = PaymentRequest & { projectName: string; taskName: string };

const ROWS_PER_PAGE_OPTIONS = [5, 10, 25, 50];
const ROWS_PER_PAGE_STORAGE_KEY = 'erp_finance_rows_per_page';
const TABLE_ROW_HEIGHT_PX = 56;

const getStoredRowsPerPage = (): number => {
  const stored = localStorage.getItem(ROWS_PER_PAGE_STORAGE_KEY);
  if (!stored) return 10;
  const parsed = Number(stored);
  return ROWS_PER_PAGE_OPTIONS.includes(parsed) ? parsed : 10;
};

const getStatusStyle = (status: PaymentRequest['status']) => {
  switch (status) {
    case 'Paid': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Pending': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Partially Paid': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'Cancelled': return 'bg-zinc-100 text-zinc-500 border-zinc-200';
    case 'Deleted': return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'Draft': return 'bg-zinc-100 text-zinc-700 border-zinc-300';
    default: return 'bg-zinc-50 text-zinc-600 border-zinc-200';
  }
};

const getStatusIcon = (status: PaymentRequest['status']) => {
  switch (status) {
    case 'Paid': return CheckCircle2;
    case 'Pending': return Clock;
    case 'Partially Paid': return AlertCircle;
    case 'Cancelled': return XCircle;
    case 'Deleted': return XCircle;
    case 'Draft': return Clock;
    default: return Clock;
  }
};

const expenseCategoryToPaymentCategory = (cat: ExpenseCategory): PaymentRequest['category'] => {
  if (cat === 'Material') return 'Purchase';
  if (cat === 'Tools') return 'Vendor';
  if (cat === 'Labour') return 'Worker';
  if (cat === 'Transport') return 'Transportation';
  if (cat === 'Vendor Payment') return 'Vendor Payment';
  return 'Other';
};

const paymentCategoryToExpenseCategory = (cat: PaymentRequest['category'], item?: { tools?: any[], purchaseItems?: any[] }): ExpenseCategory => {
  if (cat === 'Vendor') {
    // If the request explicitly lists tools, map back to 'Tools', otherwise map back to 'Other' or 'Tools' based on context
    if ((item?.tools && item.tools.length > 0) || (item?.purchaseItems && item.purchaseItems.length > 0)) {
      return 'Tools';
    }
    return 'Tools'; // Since the request is 'Tools' category, map Vendor to Tools
  }
  if (cat === 'Worker') return 'Labour';
  if (cat === 'Transportation') return 'Transport';
  if (cat === 'Vendor Payment') return 'Vendor Payment';
  if (cat === 'Purchase') return 'Material';
  return 'Other';
};

const getStatusMessage = (status: PaymentRequest['status']) => {
  switch (status) {
    case 'Paid': return 'Approved and payment has been recorded by the accountant.';
    case 'Pending': return 'Submitted and awaiting accountant review.';
    case 'Partially Paid': return 'A partial payment has been processed for this request.';
    case 'Cancelled': return 'This request was cancelled and will not be processed.';
    case 'Deleted': return 'This request was approved for deletion and the amount has been refunded to office funds.';
    case 'Draft': return 'This is a draft expense request. It needs to be sent by an admin before the accountant can see and approve it.';
    default: return 'Status update pending.';
  }
};

const formatCur = (num: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);

const parseNumericQty = (qty: string) => parseFloat(qty.replace(/[^0-9.]/g, '')) || 0;

interface FinanceHubProps {
  initialProjectId?: string;
  initialTaskId?: string;
  userRole: string;
  isActive?: boolean;
}

export default function FinanceHub({ initialProjectId, initialTaskId, userRole, isActive = true }: FinanceHubProps) {
  const confirm = useConfirm();
  // Shared Data
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Payment Requests State
  const [requests, setRequests] = useState<EnrichedPaymentRequest[]>([]);
  const [reqSearchQuery, setReqSearchQuery] = useState('');
  const [reqProjectFilter, setReqProjectFilter] = useState<string>(initialProjectId || 'All');
  const [reqTaskFilter, setReqTaskFilter] = useState<string>(initialTaskId || 'All');
  const [reqCategoryFilter, setReqCategoryFilter] = useState<string>('All');
  const [reqStatusFilter, setReqStatusFilter] = useState<string>('All');
  const [rowsPerPage, setRowsPerPage] = useState(getStoredRowsPerPage);
  const [currentPage, setCurrentPage] = useState(1);
  const [isReqFormOpen, setIsReqFormOpen] = useState(false);
  const [reqEditId, setReqEditId] = useState<string | null>(null);
  const [isEditingPaidExpense, setIsEditingPaidExpense] = useState(false);
  const [reqPriority, setReqPriority] = useState<PaymentRequest['priority']>('Medium');
  const [selectedPaymentRequest, setSelectedPaymentRequest] = useState<EnrichedPaymentRequest | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedDraftRequestIds, setSelectedDraftRequestIds] = useState<string[]>([]);
  const [reqProjectId, setReqProjectId] = useState('');
  const [reqTaskId, setReqTaskId] = useState('');
  const [reqCategory, setReqCategory] = useState<ExpenseCategory>('Material');
  const [reqAmount, setReqAmount] = useState<number | ''>('');
  const [reqPaidTo, setReqPaidTo] = useState('');
  const [reqPaymentMethod, setReqPaymentMethod] = useState('Bank Transfer');
  const [reqDate, setReqDate] = useState('');
  const [reqNotes, setReqNotes] = useState('');
  const [reqBillNo, setReqBillNo] = useState('');
  const [reqFromLocation, setReqFromLocation] = useState('');
  const [reqToLocation, setReqToLocation] = useState('');
  const [reqBillImage, setReqBillImage] = useState<string>('');
  const [reqSubmitError, setReqSubmitError] = useState<string | null>(null);
  const [reqSubmitStatus, setReqSubmitStatus] = useState<'Draft' | 'Pending'>('Draft');
  const [officeBalance, setOfficeBalance] = useState(0);

  // Custom category fields
  const [reqMaterialName, setReqMaterialName] = useState('');
  const [reqMaterialQty, setReqMaterialQty] = useState('');
  const [reqTools, setReqTools] = useState<string[]>([]);
  const [reqToolInput, setReqToolInput] = useState('');
  const [reqVendorTotalToPay, setReqVendorTotalToPay] = useState<number | ''>('');
  const [reqVendorPaid, setReqVendorPaid] = useState<number>(0);
  const [reqPurchaseItems, setReqPurchaseItems] = useState<Array<Omit<PurchaseLineItem, 'pricePerCount'> & { pricePerCount: number | '' }>>([{ materialName: '', qty: '', pricePerCount: '', total: 0 }]);
  const [vendorsList, setVendorsList] = useState<any[]>([]);
  const [isVendorDropdownOpen, setIsVendorDropdownOpen] = useState(false);
  const [vendorSearchQuery, setVendorSearchQuery] = useState('');
  const [showVendorSuggestions, setShowVendorSuggestions] = useState(false);
  const [crewSuggestions, setCrewSuggestions] = useState<string[]>([]);
  const [showCrewSuggestions, setShowCrewSuggestions] = useState(false);

  // Quick Add Vendor states
  const [isQuickAddVendorOpen, setIsQuickAddVendorOpen] = useState(false);
  const [quickVendorName, setQuickVendorName] = useState('');
  const [quickVendorTrade, setQuickVendorTrade] = useState('Supplier');
  const [quickVendorPhone, setQuickVendorPhone] = useState('');
  const [quickVendorError, setQuickVendorError] = useState<string | null>(null);
  const [isSavingQuickVendor, setIsSavingQuickVendor] = useState(false);

  const selectedReqProjectName = projects.find(p => p.id === reqProjectId)?.projectName;

  const fetchInitialData = async () => {
    if (!hasLoaded) setLoading(true);
    try {
      const [projectsRes, tasksRes, paymentRequestsRes, crewRes, vendorsRes] = await Promise.all([
        api.getProjects(),
        api.getTasks(),
        api.getPaymentRequests(),
        api.getCrew('active').catch(() => ({ crew: [] })),
        api.getVendors('active').catch(() => ({ vendors: [] }))
      ]);
      const projectList = projectsRes.projects || [];
      const taskList = tasksRes.tasks || [];
      const paymentRequests = paymentRequestsRes.paymentRequests || [];
      setProjects(projectList);
      setRequests(paymentRequests.map((r: PaymentRequest) => ({
        ...r,
        projectName: projectList.find((p: any) => p.id === r.projectId)?.projectName || 'Unknown Project',
        taskName: taskList.find((t: any) => t.id === r.taskId)?.taskName || 'Unknown Task',
      })));
      setCrewSuggestions((crewRes.crew || []).map((c: any) => c.name));
      setVendorsList(vendorsRes.vendors || []);
      setHasLoaded(true);
    } catch (err: any) {
      const message = err?.message || 'Failed to load finance data';
      setError(message);
      notify.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isActive) {
      fetchInitialData();
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    const handleUpdate = () => {
      fetchInitialData();
    };
    onRequestsUpdate(handleUpdate);
    return () => {
      offRequestsUpdate(handleUpdate);
    };
  }, [isActive]);

  useEffect(() => {
    setCurrentPage(1);
  }, [reqSearchQuery, reqProjectFilter, reqTaskFilter, reqCategoryFilter, reqStatusFilter, rowsPerPage]);

  useEffect(() => {
    setSelectedDraftRequestIds((current) => current.filter((id) => requests.some((request) => request.id === id && request.status === 'Draft')));
  }, [requests]);

  useEffect(() => {
    localStorage.setItem(ROWS_PER_PAGE_STORAGE_KEY, String(rowsPerPage));
  }, [rowsPerPage]);

  useEffect(() => {
    if (reqProjectId) {
      api.getTasks(reqProjectId).then(res => {
        setTasks(res.tasks || []);
        if (res.tasks && res.tasks.length > 0) {
          setReqTaskId(res.tasks[0].id);
        } else {
          setReqTaskId('');
        }
      });
    } else {
      setTasks([]);
    }
  }, [reqProjectId]);

  const refreshOfficeBalance = async () => {
    try {
      const res = await api.getOfficeFunds();
      setOfficeBalance(res.officeFunds[0]?.balance ?? 0);
    } catch {
      // non-blocking — warning simply won't show if fetch fails
    }
  };

  const resetRequestForm = () => {
    setReqEditId(null);
    setIsEditingPaidExpense(false);
    setReqProjectId(projects[0]?.id || '');
    setReqCategory('Material');
    setReqAmount('');
    setReqPaidTo('');
    setReqPaymentMethod('Bank Transfer');
    setReqDate(new Date().toISOString().split('T')[0]);
    setReqNotes('');
    setReqBillNo('');
    setReqFromLocation('');
    setReqToLocation('');
    setReqBillImage('');
    setReqPriority('Medium');
    setReqSubmitError(null);
    setReqMaterialName('');
    setReqMaterialQty('');
    setReqTools([]);
    setReqToolInput('');
    setReqVendorTotalToPay('');
    setReqVendorPaid(0);
    setReqPurchaseItems([{ materialName: '', qty: '', pricePerCount: '', total: 0 }]);
    setShowVendorSuggestions(false);
    setShowCrewSuggestions(false);
    setIsVendorDropdownOpen(false);
    setVendorSearchQuery('');
  };

  const handleOpenCreateRequest = () => {
    resetRequestForm();
    setIsReqFormOpen(true);
    refreshOfficeBalance();
  };

  const handleOpenEditRequest = async (request: EnrichedPaymentRequest) => {
    if (request.status === 'Paid') {
      setIsEditingPaidExpense(true);
    } else if (request.status !== 'Pending' && request.status !== 'Draft') {
      notify.warning('Only draft or pending requests can be edited directly.');
      return;
    } else {
      setIsEditingPaidExpense(false);
    }

    setReqEditId(request.id);
    setReqProjectId(request.projectId);
    setReqCategory(paymentCategoryToExpenseCategory(request.category));
    setReqAmount(request.amount);
    setReqPaidTo(request.payeeName);
    setReqPaymentMethod(request.paymentMethod || 'Bank Transfer');
    setReqDate(request.dueDate);
    setReqNotes(request.description || '');
    setReqBillNo(request.billNo || '');
    setReqFromLocation(request.fromLocation || '');
    setReqToLocation(request.toLocation || '');
    setReqBillImage(request.billImage || '');
    setReqPriority(request.priority || 'Medium');
    setReqSubmitError(null);

    setReqMaterialName(request.materialName || '');
    setReqMaterialQty(request.materialQty || '');
    setReqTools(request.tools || []);
    setReqToolInput('');
    setReqVendorTotalToPay(request.vendorTotalToPay === undefined ? '' : request.vendorTotalToPay);
    setReqVendorPaid(request.vendorPaid || 0);
    if (request.purchaseItems && request.purchaseItems.length > 0) {
      setReqPurchaseItems(request.purchaseItems.map(item => ({
        ...item,
        pricePerCount: item.pricePerCount === 0 ? 0 : (item.pricePerCount || '')
      })));
    } else if (request.materialName) {
      // Backward compatibility: convert old single-item data to array
      setReqPurchaseItems([{
        materialName: request.materialName || '',
        qty: request.materialQty || '',
        pricePerCount: request.purchasePricePerCount === undefined ? '' : request.purchasePricePerCount,
        total: request.purchaseTotalFull || 0,
      }]);
    } else if (request.tools && request.tools.length > 0 && paymentCategoryToExpenseCategory(request.category) === 'Tools') {
      setReqPurchaseItems(request.tools.map((t: string) => ({
        materialName: t,
        qty: '1',
        pricePerCount: '',
        total: 0,
      })));
    } else {
      setReqPurchaseItems([{ materialName: '', qty: '', pricePerCount: '', total: 0 }]);
    }
    setShowVendorSuggestions(false);
    setShowCrewSuggestions(false);
    setIsVendorDropdownOpen(false);
    setVendorSearchQuery('');

    try {
      const res = await api.getTasks(request.projectId);
      setTasks(res.tasks || []);
      setReqTaskId(request.taskId);
    } catch {
      setReqTaskId(request.taskId);
    }

    setIsReqFormOpen(true);
    refreshOfficeBalance();
  };

  const handleDeleteRequest = async (request: EnrichedPaymentRequest) => {
    if (request.status === 'Paid') {
      const ok = await confirm({
        title: 'Request deletion of paid expense?',
        message: `Submit a request to delete and refund the paid ${request.category} expense of ${formatCur(request.amount)} for ${request.payeeName}? It will require review and approval by the accountant/admin.`,
        confirmLabel: 'Submit Delete Request',
        variant: 'danger',
      });
      if (!ok) return;

      try {
        await api.createPaymentRequest({
          projectId: request.projectId,
          taskId: request.taskId,
          payeeName: request.payeeName,
          category: 'Other',
          amount: request.amount,
          description: `Delete request: Cancel and refund paid expense ${request.id} of ${formatCur(request.amount)}.`,
          dueDate: request.dueDate,
          priority: 'Medium',
          status: 'Pending',
          adjustmentType: 'Delete',
          targetExpenseId: request.id
        });
        notify.success('Deletion request submitted to Finance Hub for approval.');
      } catch (err: any) {
        notify.error(err?.message || 'Error submitting deletion request.');
      }
      return;
    }

    if (request.status !== 'Pending' && request.status !== 'Draft') {
      notify.warning('Only draft or pending requests can be deleted.');
      return;
    }

    const ok = await confirm({
      title: 'Delete payment request?',
      message: `Remove the pending request for ${formatCur(request.amount)} to ${request.payeeName}? This cannot be undone.`,
      confirmLabel: 'Delete Request',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await api.deletePaymentRequest(request.id);
      if (selectedPaymentRequest?.id === request.id) {
        setIsStatusModalOpen(false);
        setSelectedPaymentRequest(null);
      }
      fetchInitialData();
      notify.success('Payment request deleted.');
    } catch (err: any) {
      notify.error(err?.message || 'Failed to delete payment request');
    }
  };

  const sendRequestsToAccountant = async (draftRequests: EnrichedPaymentRequest[]) => {
    await Promise.all(draftRequests.map((request) => api.updatePaymentRequest(request.id, {
      ...request,
      status: 'Pending'
    })));
  };

  const handleSendRequest = async (request: EnrichedPaymentRequest) => {
    const ok = await confirm({
      title: 'Send payment request?',
      message: `Send request for ${formatCur(request.amount)} to ${request.payeeName} to the accountant for review?`,
      confirmLabel: 'Send Request',
      variant: 'default',
    });
    if (!ok) return;

    try {
      await sendRequestsToAccountant([request]);
      setSelectedDraftRequestIds((current) => current.filter((id) => id !== request.id));
      fetchInitialData();
      notify.success('Request sent to accountant.');
    } catch (err: any) {
      notify.error(err?.message || 'Failed to send payment request');
    }
  };

  const handleToggleDraftSelection = (requestId: string) => {
    setSelectedDraftRequestIds((current) => (
      current.includes(requestId)
        ? current.filter((id) => id !== requestId)
        : [...current, requestId]
    ));
  };

  const handleToggleAllVisibleDrafts = (draftIds: string[]) => {
    if (draftIds.length === 0) return;
    setSelectedDraftRequestIds((current) => {
      const allSelected = draftIds.every((id) => current.includes(id));
      if (allSelected) {
        return current.filter((id) => !draftIds.includes(id));
      }
      return Array.from(new Set([...current, ...draftIds]));
    });
  };

  const handleSendSelectedDraftRequests = async (draftRequests: EnrichedPaymentRequest[]) => {
    if (draftRequests.length === 0) {
      notify.warning('Select at least one draft request to send.');
      return;
    }

    const ok = await confirm({
      title: 'Send selected draft requests?',
      message: `Send ${draftRequests.length} selected draft request${draftRequests.length > 1 ? 's' : ''} to the accountant for review?`,
      confirmLabel: 'Send Selected',
      variant: 'default',
    });
    if (!ok) return;

    try {
      await sendRequestsToAccountant(draftRequests);
      setSelectedDraftRequestIds((current) => current.filter((id) => !draftRequests.some((request) => request.id === id)));
      fetchInitialData();
      notify.success(`${draftRequests.length} draft request${draftRequests.length > 1 ? 's' : ''} sent to accountant.`);
    } catch (err: any) {
      notify.error(err?.message || 'Failed to send selected draft requests');
    }
  };

  const handleOpenStatusModal = (request: EnrichedPaymentRequest) => {
    setSelectedPaymentRequest(request);
    setIsStatusModalOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      notify.warning('File size exceeds 2MB limit.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setReqBillImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleOpenAddVendorQuick = (initialName: string) => {
    setQuickVendorName(initialName);
    setQuickVendorTrade('Supplier');
    setQuickVendorPhone('');
    setQuickVendorError(null);
    setIsQuickAddVendorOpen(true);
  };

  const handleQuickVendorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickVendorName.trim()) {
      setQuickVendorError('Vendor name is required.');
      return;
    }
    setIsSavingQuickVendor(true);
    setQuickVendorError(null);
    try {
      const payload = {
        name: quickVendorName.trim(),
        trade: quickVendorTrade.trim() || 'Supplier',
        phone: quickVendorPhone.trim(),
        status: 'active',
        notes: 'Added quickly from payment request form'
      };
      await api.createVendor(payload);
      notify.success(`Vendor "${payload.name}" registered.`);

      const vendorsRes = await api.getVendors('active').catch(() => ({ vendors: [] }));
      const updatedList = vendorsRes.vendors || [];
      setVendorsList(updatedList);

      setReqPaidTo(payload.name);
      setIsVendorDropdownOpen(false);
      setVendorSearchQuery('');
      setIsQuickAddVendorOpen(false);
    } catch (err: any) {
      setQuickVendorError(err?.message || 'Failed to register new vendor.');
    } finally {
      setIsSavingQuickVendor(false);
    }
  };

  const handleRequestSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!reqProjectId || !reqTaskId || !reqCategory || !reqPaidTo || !reqPaymentMethod || !reqDate) {
      notify.warning('All core fields are required.');
      return;
    }
    if (reqCategory === 'Material' && !reqBillNo.trim()) {
      notify.warning('Bill No is required for material expenses.');
      return;
    }
    if (reqCategory === 'Material' && !reqPurchaseItems[0]?.materialName.trim()) {
      notify.warning('Material item is required.');
      return;
    }
    if (reqCategory === 'Vendor Payment' || reqCategory === 'Material' || reqCategory === 'Tools') {
      if (reqVendorTotalToPay === '' || reqVendorTotalToPay <= 0) {
        notify.warning('Total to pay must be greater than 0.');
        return;
      }
    } else if (reqAmount === '' || reqAmount <= 0) {
      notify.warning('Spent amount must be greater than 0.');
      return;
    }

    const amountLabel = formatCur(Number(reqAmount));
    const titleText = isEditingPaidExpense
      ? 'Submit edit approval request?'
      : reqEditId
        ? 'Update payment request?'
        : reqSubmitStatus === 'Draft'
          ? 'Save as Draft?'
          : 'Submit Payment Request?';

    const messageText = isEditingPaidExpense
      ? `Submit a request to edit the paid expense ${reqEditId} to ${amountLabel}? It will require review and approval by the accountant/admin.`
      : reqEditId
        ? `Save changes to the ${amountLabel} request for ${reqPaidTo}?`
        : reqSubmitStatus === 'Draft'
          ? `Save this request for ${amountLabel} to ${reqPaidTo} as a draft?`
          : `Submit a request for ${amountLabel} to ${reqPaidTo}? The accountant will review it.`;

    const confirmLabelText = isEditingPaidExpense
      ? 'Submit Edit Request'
      : reqEditId
        ? 'Save Changes'
        : reqSubmitStatus === 'Draft'
          ? 'Save as Draft'
          : 'Submit Request';

    const ok = await confirm({
      title: titleText,
      message: messageText,
      confirmLabel: confirmLabelText,
      variant: 'warning',
    });
    if (!ok) return;

    const payload = {
      projectId: reqProjectId,
      taskId: reqTaskId,
      payeeName: reqPaidTo,
      category: expenseCategoryToPaymentCategory(reqCategory),
      amount: (reqCategory === 'Material' || reqCategory === 'Tools') ? reqPurchaseItems.reduce((s, it) => s + it.total, 0) : Number(reqAmount),
      description: reqNotes,
      fromLocation: reqFromLocation,
      toLocation: reqToLocation,
      dueDate: reqDate,
      priority: reqPriority,
      paymentMethod: reqPaymentMethod,
      billImage: reqBillImage || undefined,
      billNo: reqCategory === 'Material' ? reqBillNo.trim() : undefined,
      materialName: (reqCategory === 'Material' && reqPurchaseItems.length > 0) ? reqPurchaseItems[0].materialName : undefined,
      materialQty: (reqCategory === 'Material' && reqPurchaseItems.length > 0) ? reqPurchaseItems[0].qty : undefined,
      tools: reqCategory === 'Tools' ? reqPurchaseItems.map(it => it.materialName).filter(Boolean) : undefined,
      vendorTotalToPay: (reqCategory === 'Vendor Payment' || reqCategory === 'Material' || reqCategory === 'Tools') ? Number(reqVendorTotalToPay) : undefined,
      purchasePricePerCount: (reqCategory === 'Material' || reqCategory === 'Tools') && reqPurchaseItems.length > 0 ? (reqPurchaseItems[0].pricePerCount === '' ? 0 : Number(reqPurchaseItems[0].pricePerCount)) : undefined,
      purchaseTotalFull: (reqCategory === 'Material' || reqCategory === 'Tools') ? reqPurchaseItems.reduce((s, it) => s + it.total, 0) : undefined,
      purchaseTotal: (reqCategory === 'Material' || reqCategory === 'Tools') ? reqPurchaseItems.reduce((s, it) => s + it.total, 0) : undefined,
      purchaseItems: (reqCategory === 'Material' || reqCategory === 'Tools') ? reqPurchaseItems.map(it => ({ ...it, pricePerCount: it.pricePerCount === '' ? 0 : Number(it.pricePerCount) })) : undefined,
      status: reqSubmitStatus
    };
    try {
      setReqSubmitError(null);
      if (isEditingPaidExpense) {
        const adjustmentRequestPayload = {
          projectId: reqProjectId,
          taskId: reqTaskId,
          payeeName: reqPaidTo,
          category: 'Other' as const,
          amount: Number(reqAmount),
          description: `Edit request: Modify approved expense ${reqEditId}. Notes: ${reqNotes}`,
          dueDate: reqDate,
          priority: 'Medium' as const,
          paymentMethod: reqPaymentMethod,
          status: 'Pending' as const,
          adjustmentType: 'Edit' as const,
          targetExpenseId: reqEditId!,
          adjustmentData: JSON.stringify(payload)
        };
        await api.createPaymentRequest(adjustmentRequestPayload);
        notify.success('Edit request submitted to Finance Hub for approval.');
      } else if (reqEditId) {
        await api.updatePaymentRequest(reqEditId, payload);
        notify.success('Payment request updated.');
      } else {
        await api.createPaymentRequest(payload);
        notify.success(reqSubmitStatus === 'Draft' ? 'Expense saved as draft.' : 'Expense request submitted to accountant.');
      }
      setIsReqFormOpen(false);
      setReqEditId(null);
      fetchInitialData();
    } catch (err: any) {
      const message = err?.message || 'Error saving payment request';
      setReqSubmitError(message);
      notify.error(message);
    }
  };

  const filteredRequests = requests
    .filter(r => {
      const matchesSearch = r.payeeName.toLowerCase().includes(reqSearchQuery.toLowerCase()) ||
        (r.description || '').toLowerCase().includes(reqSearchQuery.toLowerCase()) ||
        r.taskName.toLowerCase().includes(reqSearchQuery.toLowerCase());
      const matchesProject = reqProjectFilter === 'All' || r.projectId === reqProjectFilter;
      const matchesTask = reqTaskFilter === 'All' || r.taskId === reqTaskFilter;
      const matchesCategory = reqCategoryFilter === 'All' || r.category === reqCategoryFilter;
      const matchesStatus = reqStatusFilter === 'All' || r.status === reqStatusFilter;
      return matchesSearch && matchesProject && matchesTask && matchesCategory && matchesStatus;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / rowsPerPage));
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * rowsPerPage;
  const paginatedRequests = filteredRequests.slice(startIndex, startIndex + rowsPerPage);
  const emptyRowCount = Math.max(0, rowsPerPage - paginatedRequests.length);
  const tableBodyHeight = rowsPerPage * TABLE_ROW_HEIGHT_PX;
  const rangeStart = filteredRequests.length === 0 ? 0 : startIndex + 1;
  const rangeEnd = Math.min(startIndex + rowsPerPage, filteredRequests.length);
  const visibleDraftRequests = paginatedRequests.filter((request) => userRole === 'admin' && request.status === 'Draft');
  const visibleDraftRequestIds = visibleDraftRequests.map((request) => request.id);
  const selectedVisibleDraftCount = visibleDraftRequestIds.filter((id) => selectedDraftRequestIds.includes(id)).length;
  const areAllVisibleDraftsSelected = visibleDraftRequestIds.length > 0 && selectedVisibleDraftCount === visibleDraftRequestIds.length;
  const selectedDraftRequests = requests.filter((request) => selectedDraftRequestIds.includes(request.id) && request.status === 'Draft');

  const insufficientOfficeFunds = userRole === 'admin' && reqAmount !== '' && reqAmount > 0 && reqAmount > officeBalance;

  const pendingRequests = filteredRequests.filter(r => r.status === 'Pending' && !r.adjustmentType);
  const paidRequests = filteredRequests.filter(r => r.status === 'Paid' && !r.adjustmentType);
  const totalPendingAmount = pendingRequests.reduce((sum, r) => sum + r.amount, 0);
  const totalPaidAmount = paidRequests.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-950">Finance Hub</h1>
          <p className="text-xs sm:text-sm text-zinc-500">Manage spending requests</p>
        </div>
        {userRole === 'admin' && (
          <button
            onClick={handleOpenCreateRequest}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-zinc-950 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-zinc-800 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Request</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-zinc-200/80 rounded-xl p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Pending</span>
            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-700">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-auto">
            <span className="text-2xl font-bold text-zinc-950 block">{formatCur(totalPendingAmount)}</span>
            <span className="text-[10px] text-amber-600 font-medium block mt-1">
              {pendingRequests.length} request{pendingRequests.length !== 1 ? 's' : ''} awaiting approval
            </span>
          </div>
        </div>

        <div className="bg-white border border-zinc-200/80 rounded-xl p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Paid</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-auto">
            <span className="text-2xl font-bold text-zinc-950 block">{formatCur(totalPaidAmount)}</span>
            <span className="text-[10px] text-emerald-600 font-medium block mt-1">
              {paidRequests.length} request{paidRequests.length !== 1 ? 's' : ''} processed
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm space-y-3">
        {userRole === 'admin' && (
          <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold text-zinc-800">Select draft requests</p>
              <p className="text-[11px] text-zinc-500">
                {selectedDraftRequests.length} draft request{selectedDraftRequests.length !== 1 ? 's' : ''} selected for sending.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleToggleAllVisibleDrafts(visibleDraftRequestIds)}
                disabled={visibleDraftRequestIds.length === 0}
                className="px-3 py-2 rounded-xl border border-zinc-200 bg-white text-[11px] font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {areAllVisibleDraftsSelected ? 'Unselect Page Drafts' : 'Select Page Drafts'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedDraftRequestIds([])}
                disabled={selectedDraftRequestIds.length === 0}
                className="px-3 py-2 rounded-xl border border-zinc-200 bg-white text-[11px] font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear Selected
              </button>
              <button
                type="button"
                onClick={() => handleSendSelectedDraftRequests(selectedDraftRequests)}
                disabled={selectedDraftRequests.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-950 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send Selected</span>
              </button>
            </div>
          </div>
        )}
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Search description, payee or task name..."
            value={reqSearchQuery}
            onChange={(e) => setReqSearchQuery(e.target.value)}
            className="w-full text-xs sm:text-sm pl-9 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:bg-white transition-all text-zinc-900"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-semibold text-zinc-600">
          <div>
            <label className="block text-[9px] font-bold text-zinc-400 uppercase mb-0.5">Project</label>
            <select value={reqProjectFilter} onChange={(e) => { setReqProjectFilter(e.target.value); setReqTaskFilter('All'); }} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 outline-none text-zinc-700">
              <option value="All">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.projectName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-bold text-zinc-400 uppercase mb-0.5">Category</label>
            <select value={reqCategoryFilter} onChange={(e) => setReqCategoryFilter(e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 outline-none text-zinc-700">
              <option value="All">All Categories</option>
              {Array.from(new Set(requests.map(r => r.category))).filter(Boolean).sort().map(cat => (
                <option key={cat} value={cat}>{paymentCategoryToExpenseCategory(cat)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-bold text-zinc-400 uppercase mb-0.5">Status</label>
            <select value={reqStatusFilter} onChange={(e) => setReqStatusFilter(e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2 outline-none text-zinc-700">
              <option value="All">All Statuses</option>
              <option value="Draft">Draft</option>
              <option value="Pending">Pending</option>
              <option value="Paid">Paid</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          <div className="flex flex-col justify-end">
            <label className="block text-[9px] font-bold text-zinc-400 uppercase mb-0.5 invisible select-none" aria-hidden="true">Reset</label>
            <button onClick={() => { setReqProjectFilter('All'); setReqTaskFilter('All'); setReqCategoryFilter('All'); setReqStatusFilter('All'); setReqSearchQuery(''); setSelectedDraftRequestIds([]); setCurrentPage(1); }} className="w-full text-center py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs rounded-xl transition-all font-semibold">Reset</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-zinc-900/10 border-t-zinc-900 rounded-full animate-spin" />
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="p-8 border border-dashed rounded-2xl text-center bg-zinc-50">
          <FileText className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
          <p className="text-xs text-zinc-500">No matching requests found.</p>
        </div>
      ) : (
        <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-zinc-600 border-collapse min-w-[720px]">
              <thead>
                <tr className="bg-zinc-50 text-zinc-400 uppercase font-bold text-[9px] border-b border-zinc-200">
                  {userRole === 'admin' && (
                    <th className="py-3 px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span>Select</span>
                        <input
                          type="checkbox"
                          checked={areAllVisibleDraftsSelected}
                          onChange={() => handleToggleAllVisibleDrafts(visibleDraftRequestIds)}
                          disabled={visibleDraftRequestIds.length === 0}
                          className="h-3.5 w-3.5 cursor-pointer rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 disabled:cursor-not-allowed"
                          aria-label="Select all draft requests on this page"
                        />
                      </div>
                    </th>
                  )}
                  <th className="py-3 px-4">Vendor</th>
                  <th className="py-3 px-4">Project</th>
                  <th className="py-3 px-4">Task</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody
                className="divide-y divide-zinc-100 text-zinc-900"
                style={{ height: tableBodyHeight }}
              >
                {paginatedRequests.map((r) => {
                  const StatusIcon = getStatusIcon(r.status);
                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-zinc-50/50 transition-colors"
                      style={{ height: TABLE_ROW_HEIGHT_PX }}
                    >
                      {userRole === 'admin' && (
                        <td className="px-4 align-middle text-center">
                          {r.status === 'Draft' ? (
                            <input
                              type="checkbox"
                              checked={selectedDraftRequestIds.includes(r.id)}
                              onChange={() => handleToggleDraftSelection(r.id)}
                              className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                              aria-label={`Select draft request for ${r.payeeName}`}
                            />
                          ) : (
                            <span className="text-[10px] text-zinc-300">-</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 align-middle">
                        <span className="font-bold text-zinc-950 block truncate max-w-[160px]">{r.payeeName}</span>
                        {r.description && (
                          <span className="text-[10px] text-zinc-400 italic line-clamp-1 block mt-0.5 max-w-[160px]">{r.description}</span>
                        )}
                      </td>
                      <td className="px-4 align-middle font-medium text-zinc-700 truncate max-w-[120px]">{r.projectName}</td>
                      <td className="px-4 align-middle text-zinc-600 truncate max-w-[120px]">{r.taskName}</td>
                      <td className="px-4 align-middle">
                        <span className="text-[10px] font-semibold text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded">{paymentCategoryToExpenseCategory(r.category, r)}</span>
                      </td>
                      <td className="px-4 align-middle text-right font-extrabold text-zinc-950 whitespace-nowrap">{formatCur(r.amount)}</td>
                      <td className="px-4 align-middle text-zinc-600 whitespace-nowrap">{r.dueDate}</td>
                      <td className="px-4 align-middle text-zinc-600">{r.priority}</td>
                      <td className="px-4 align-middle">
                        <button
                          type="button"
                          onClick={() => handleOpenStatusModal(r)}
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full border whitespace-nowrap ${getStatusStyle(r.status)}`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {r.status}
                        </button>
                      </td>
                      <td className="px-4 align-middle text-center">
                        <div className="inline-flex items-center gap-1">

                          {userRole === 'admin' && (r.status === 'Pending' || r.status === 'Paid' || r.status === 'Draft') && (
                            <>
                              {r.status === 'Draft' && (
                                <button
                                  type="button"
                                  onClick={() => handleSendRequest(r)}
                                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-zinc-950 text-white hover:bg-zinc-800 border text-[10px] font-semibold transition-all whitespace-nowrap"
                                  title="Send request to accountant"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleOpenStatusModal(r)}
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border text-[10px] font-semibold transition-all whitespace-nowrap"
                                title="View details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditRequest(r)}
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border text-[10px] font-semibold transition-all"
                                title={r.status === 'Paid' ? "Request Edit (Paid Expense)" : "Edit request"}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRequest(r)}
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100 text-[10px] font-semibold transition-all"
                                title={r.status === 'Paid' ? "Request Delete (Paid Expense)" : "Delete request"}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {Array.from({ length: emptyRowCount }).map((_, i) => (
                  <tr key={`empty-row-${i}`} style={{ height: TABLE_ROW_HEIGHT_PX }} aria-hidden="true">
                    <td colSpan={userRole === 'admin' ? 10 : 9} className="px-4 align-middle">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-t border-zinc-100 bg-zinc-50/50">
            <p className="text-[11px] text-zinc-500 font-medium">
              Showing <span className="font-semibold text-zinc-700">{rangeStart}–{rangeEnd}</span> of{' '}
              <span className="font-semibold text-zinc-700">{filteredRequests.length}</span>
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label htmlFor="rows-per-page" className="text-[10px] font-bold text-zinc-400 uppercase whitespace-nowrap">
                  Rows per page
                </label>
                <select
                  id="rows-per-page"
                  value={rowsPerPage}
                  onChange={(e) => setRowsPerPage(Number(e.target.value))}
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
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={activePage >= totalPages}
                  className="p-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Requests Form Modal */}
      {isReqFormOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border text-xs sm:text-sm border-zinc-200 rounded-3xl p-5 sm:p-6 shadow-2xl max-w-xl w-full space-y-4 font-sans animate-fade-in relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => { setIsReqFormOpen(false); setReqEditId(null); setReqSubmitError(null); }}
              className="absolute top-5 right-5 text-zinc-400 hover:text-zinc-650"
            >
              <X className="w-5 h-5 pointer-events-none" />
            </button>
            <div className="border-b pb-3 border-zinc-100">
              <h2 className="text-base sm:text-lg font-bold text-zinc-900">
                {reqEditId ? 'Configure Site Expense Ledger' : 'Log Expenditure Checkout'}
              </h2>
              <span className="text-[10px] text-zinc-400 block font-bold mt-0.5">
                Project Context: {selectedReqProjectName || 'Select a project'}
              </span>
            </div>

            {reqSubmitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs sm:text-sm font-bold">
                {reqSubmitError}
              </div>
            )}

            {insufficientOfficeFunds && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-xs sm:text-sm flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <p className="font-bold">Insufficient office funds</p>
                  <p className="mt-0.5 font-medium leading-relaxed">
                    Available office balance is <span className="font-bold">{formatCur(officeBalance)}</span>, but this
                    request is for <span className="font-bold">{formatCur(Number(reqAmount))}</span>. You can still submit —
                    the accountant may need to record a cash inflow before approval.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleRequestSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Project</label>
                  <select
                    required
                    value={reqProjectId}
                    onChange={(e) => setReqProjectId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl focus:outline-none text-zinc-950"
                  >
                    <option value="" disabled>Select project...</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.projectName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Under Specified Task Scope</label>
                  <select
                    required
                    value={reqTaskId}
                    onChange={(e) => setReqTaskId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl focus:outline-none text-zinc-950"
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
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Expense Category</label>
                  <select
                    value={reqCategory}
                    onChange={(e) => {
                      const newCat = e.target.value as ExpenseCategory;
                      setReqCategory(newCat);
                      if (newCat === 'Material' || newCat === 'Tools') {
                        const grandTotal = reqPurchaseItems.reduce((s, it) => s + it.total, 0);
                        setReqVendorTotalToPay(grandTotal);
                        setReqAmount(grandTotal);
                      } else if (newCat === 'Vendor Payment') {
                        setReqAmount(reqVendorTotalToPay);
                      }
                    }}
                    className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl focus:outline-none"
                  >
                    <option value="Material">Material</option>
                    <option value="Transport">Transport</option>
                    <option value="Tools">Tools</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Priority</label>
                  <select
                    value={reqPriority}
                    onChange={(e) => setReqPriority(e.target.value as PaymentRequest['priority'])}
                    className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl focus:outline-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>

              {/* Transport fields */}
              {reqCategory === 'Transport' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">From Location</label>
                    <input
                      type="text"
                      placeholder="e.g. Site A"
                      value={reqFromLocation}
                      onChange={(e) => setReqFromLocation(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">To Location</label>
                    <input
                      type="text"
                      placeholder="e.g. Warehouse B"
                      value={reqToLocation}
                      onChange={(e) => setReqToLocation(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {reqCategory === 'Vendor Payment' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Total to Pay (₹)</label>
                    <input
                      type="number"
                      required
                      min={0.01}
                      step="any"
                      placeholder="e.g. 50000"
                      value={reqVendorTotalToPay}
                      onChange={(e) => {
                        const val = e.target.value === '' ? '' : Number(e.target.value);
                        setReqVendorTotalToPay(val);
                        setReqAmount(val);
                      }}
                      className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-end">
                    <p className="text-[11px] text-zinc-400 leading-relaxed pb-2">
                      The accountant will track how much has been paid and what remains.
                    </p>
                  </div>
                </div>
              )}

              {/* Purchase fields */}
              {reqCategory === 'Material' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Item</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Cement"
                      value={reqPurchaseItems[0]?.materialName || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setReqMaterialName(value);
                        setReqPurchaseItems([{
                          ...(reqPurchaseItems[0] || { materialName: '', qty: '', pricePerCount: '', total: 0 }),
                          materialName: value,
                        }]);
                      }}
                      className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Bill No</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. INV-1024"
                      value={reqBillNo}
                      onChange={(e) => setReqBillNo(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {reqCategory === 'Tools' && (
                <div className="space-y-4">
                  <div className="border border-zinc-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-zinc-50 text-zinc-500 font-bold uppercase tracking-wider text-[10px]">
                          <th className="text-left px-3 py-2.5 w-[30%]">Tool</th>
                          <th className="text-left px-3 py-2.5 w-[18%]">Qty</th>
                          <th className="text-right px-3 py-2.5 w-[20%]">Price / Unit (₹)</th>
                          <th className="text-right px-3 py-2.5 w-[20%]">Total (₹)</th>
                          <th className="px-2 py-2.5 w-[12%]"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {reqPurchaseItems.map((item, idx) => (
                          <tr key={idx} className="group hover:bg-zinc-50/50 transition-colors">
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                required
                                placeholder="e.g. Hammer"
                                value={item.materialName}
                                onChange={(e) => {
                                  const items = [...reqPurchaseItems];
                                  items[idx] = { ...items[idx], materialName: e.target.value };
                                  setReqPurchaseItems(items);
                                }}
                                className="w-full px-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-950 focus:outline-none focus:border-zinc-400 text-xs"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                required
                                placeholder="e.g. 2"
                                value={item.qty}
                                onChange={(e) => {
                                  const items = [...reqPurchaseItems];
                                  const numericQty = parseNumericQty(e.target.value);
                                  const total = numericQty * (items[idx].pricePerCount === '' ? 0 : items[idx].pricePerCount);
                                  items[idx] = { ...items[idx], qty: e.target.value, total };
                                  setReqPurchaseItems(items);
                                  const grandTotal = items.reduce((s, it) => s + it.total, 0);
                                  setReqVendorTotalToPay(grandTotal);
                                  setReqAmount(grandTotal);
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
                                value={item.pricePerCount}
                                onChange={(e) => {
                                  const items = [...reqPurchaseItems];
                                  const price = e.target.value === '' ? '' : Number(e.target.value);
                                  const numericQty = parseNumericQty(items[idx].qty);
                                  const total = numericQty * (price === '' ? 0 : price);
                                  items[idx] = { ...items[idx], pricePerCount: price, total };
                                  setReqPurchaseItems(items);
                                  const grandTotal = items.reduce((s, it) => s + it.total, 0);
                                  setReqVendorTotalToPay(grandTotal);
                                  setReqAmount(grandTotal);
                                }}
                                className="w-full px-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-950 text-right focus:outline-none focus:border-zinc-400 text-xs"
                              />
                            </td>
                            <td className="px-3 py-1.5 text-right font-bold text-zinc-700">
                              {formatCur(item.total)}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {reqPurchaseItems.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const items = reqPurchaseItems.filter((_, i) => i !== idx);
                                    setReqPurchaseItems(items);
                                    const grandTotal = items.reduce((s, it) => s + it.total, 0);
                                    setReqVendorTotalToPay(grandTotal);
                                    setReqAmount(grandTotal);
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
                          <td className="px-3 py-2 text-right font-black text-zinc-900">{formatCur(reqPurchaseItems.reduce((s, it) => s + it.total, 0))}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReqPurchaseItems([...reqPurchaseItems, { materialName: '', qty: '', pricePerCount: '', total: 0 }])}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Tool</span>
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Vendor</label>
                  <input
                    type="text"
                    required
                    value={reqPaidTo}
                    onChange={() => { }}
                    className="absolute opacity-0 pointer-events-none w-0 h-0"
                  />
                  <div
                    onClick={() => setIsVendorDropdownOpen(!isVendorDropdownOpen)}
                    className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 flex items-center justify-between text-xs min-h-[38px] cursor-pointer"
                  >
                    <span className={reqPaidTo ? "text-zinc-950 font-medium" : "text-zinc-400"}>
                      {reqPaidTo || "Select Vendor..."}
                    </span>
                    <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                  </div>

                  {isVendorDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40 cursor-default"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsVendorDropdownOpen(false);
                        }}
                      />
                      <div className="absolute left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg z-50 text-xs flex flex-col max-h-60 overflow-hidden">
                        <div className="p-2 border-b border-zinc-100 flex items-center gap-2 bg-zinc-50">
                          <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <input
                            type="text"
                            placeholder="Search vendor..."
                            value={vendorSearchQuery}
                            onChange={(e) => setVendorSearchQuery(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                const filtered = vendorsList.filter(v =>
                                  v.name.toLowerCase().includes(vendorSearchQuery.toLowerCase()) ||
                                  v.trade.toLowerCase().includes(vendorSearchQuery.toLowerCase())
                                );
                                if (filtered.length > 0) {
                                  setReqPaidTo(filtered[0].name);
                                  setVendorSearchQuery('');
                                  setIsVendorDropdownOpen(false);
                                }
                              }
                            }}
                            className="w-full bg-transparent border-0 p-0 text-xs focus:ring-0 focus:outline-none text-zinc-900"
                            autoFocus
                          />
                          {vendorSearchQuery && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setVendorSearchQuery('');
                              }}
                              className="text-zinc-400 hover:text-zinc-600 font-bold px-1 text-sm"
                            >
                              ×
                            </button>
                          )}
                        </div>
                        <div className="overflow-y-auto divide-y divide-zinc-100 max-h-48">
                          {vendorsList
                            .filter(v => v.name.toLowerCase().includes(vendorSearchQuery.toLowerCase()) || v.trade.toLowerCase().includes(vendorSearchQuery.toLowerCase()))
                            .map(v => (
                              <button
                                key={v.id}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReqPaidTo(v.name);
                                  setVendorSearchQuery('');
                                  setIsVendorDropdownOpen(false);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-zinc-100 text-zinc-800 transition-colors flex items-center justify-between font-semibold"
                              >
                                <span>{v.name}</span>
                                <span className="text-[9px] text-zinc-400 font-bold uppercase">{v.trade}</span>
                              </button>
                            ))
                          }
                          {vendorsList.filter(v => v.name.toLowerCase().includes(vendorSearchQuery.toLowerCase()) || v.trade.toLowerCase().includes(vendorSearchQuery.toLowerCase())).length === 0 && (
                            <div className="p-3 text-zinc-400 text-center font-medium flex flex-col gap-2">
                              <span>No vendors found</span>
                              {vendorSearchQuery.trim() && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenAddVendorQuick(vendorSearchQuery);
                                  }}
                                  className="w-full py-1.5 bg-zinc-950 hover:bg-zinc-800 text-white rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                                >
                                  + Add &quot;{vendorSearchQuery}&quot;
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {reqCategory === 'Tools' ? (
                  <div className="flex flex-col justify-center bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 min-h-[58px]">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Grand Total to Pay</span>
                    <span className="text-sm font-black text-zinc-900 mt-0.5">{formatCur(reqPurchaseItems.reduce((s, it) => s + it.total, 0))}</span>
                  </div>
                ) : reqCategory === 'Material' ? (
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Total Amount (₹)</label>
                    <input
                      type="number"
                      required
                      min={0.01}
                      step="any"
                      placeholder="e.g. 1500"
                      value={reqVendorTotalToPay === '' ? '' : reqVendorTotalToPay}
                      onChange={(e) => {
                        const val = e.target.value === '' ? '' : Number(e.target.value);
                        setReqVendorTotalToPay(val);
                        setReqAmount(val);
                        setReqPurchaseItems([{
                          ...(reqPurchaseItems[0] || { materialName: '', qty: '', pricePerCount: '', total: 0 }),
                          total: val === '' ? 0 : val,
                        }]);
                      }}
                      className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950"
                    />
                  </div>
                ) : (
                  reqCategory !== 'Vendor Payment' && (
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Amount (₹)</label>
                      <input
                        type="number"
                        required
                        min={0.01}
                        step="any"
                        placeholder="e.g. 1500"
                        value={reqAmount}
                        onChange={(e) => setReqAmount(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950"
                      />
                    </div>
                  )
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Upload Doc</label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 flex flex-col items-center justify-center border border-zinc-300 border-dashed rounded-xl px-2 py-3.5 cursor-pointer bg-zinc-50 hover:bg-zinc-100 transition text-center text-xs text-zinc-600 font-bold gap-1 mt-1">
                    <UploadCloud className="w-5 h-5 text-zinc-400" />
                    <span>{reqBillImage ? 'Receipt Doc uploaded ✓' : 'Upload invoice file (Max 2MB)'}</span>
                    <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                  </label>
                  {reqBillImage && (
                    <button
                      type="button"
                      onClick={() => setReqBillImage('')}
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
                  value={reqNotes}
                  onChange={(e) => setReqNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 focus:outline-none text-xs sm:text-sm"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  onClick={() => setReqSubmitStatus('Draft')}
                  className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer"
                >
                  Save as Draft
                </button>
                <button
                  type="submit"
                  onClick={() => setReqSubmitStatus('Pending')}
                  className="w-1/3 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer"
                >
                  Sent
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Request Status Modal */}
      {isStatusModalOpen && selectedPaymentRequest && (() => {
        const StatusIcon = getStatusIcon(selectedPaymentRequest.status);
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setIsStatusModalOpen(false)}>
            <div
              className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
                <div>
                  <h3 className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Payment Request Status</h3>
                  <p className="text-sm font-extrabold text-zinc-950 mt-0.5">{selectedPaymentRequest.payeeName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsStatusModalOpen(false)}
                  className="p-1.5 text-zinc-500 hover:text-zinc-950 rounded-lg hover:bg-zinc-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-4">
                <div className={`flex items-start gap-3 p-4 rounded-xl border ${getStatusStyle(selectedPaymentRequest.status)}`}>
                  <StatusIcon className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold">{selectedPaymentRequest.status}</p>
                    <p className="text-xs mt-1 opacity-80">{getStatusMessage(selectedPaymentRequest.status)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  {(() => {
                    const paid = (selectedPaymentRequest.paymentHistory || []).reduce((s, it) => s + it.amount, 0);
                    const remaining = Math.max(0, selectedPaymentRequest.amount - paid);
                    return paid > 0 ? (
                      <div className="bg-zinc-50 rounded-xl p-3 col-span-2 space-y-2">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <span className="block text-[10px] text-zinc-400 font-bold uppercase">Requested</span>
                            <span className="font-extrabold text-zinc-950 mt-1 block">{formatCur(selectedPaymentRequest.amount)}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-zinc-400 font-bold uppercase">Paid</span>
                            <span className="font-bold text-emerald-600 mt-1 block">{formatCur(paid)}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-zinc-400 font-bold uppercase">Remaining</span>
                            <span className="font-bold text-amber-600 mt-1 block">{formatCur(remaining)}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-zinc-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Amount</p>
                        <p className="font-extrabold text-zinc-950">{formatCur(selectedPaymentRequest.amount)}</p>
                      </div>
                    );
                  })()}
                  <div className="bg-zinc-50 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Priority</p>
                    <p className="font-semibold text-zinc-900">{selectedPaymentRequest.priority}</p>
                  </div>
                  <div className="bg-zinc-50 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Category</p>
                    <p className="font-semibold text-zinc-900">{paymentCategoryToExpenseCategory(selectedPaymentRequest.category, selectedPaymentRequest)}</p>
                  </div>
                  <div className="bg-zinc-50 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Due Date</p>
                    <p className="font-semibold text-zinc-900">{selectedPaymentRequest.dueDate}</p>
                  </div>
                  <div className="bg-zinc-50 rounded-xl p-3 col-span-2">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Project</p>
                    <p className="font-semibold text-zinc-900">{selectedPaymentRequest.projectName}</p>
                  </div>
                  <div className="bg-zinc-50 rounded-xl p-3 col-span-2">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Task</p>
                    <p className="font-semibold text-zinc-900">{selectedPaymentRequest.taskName}</p>
                  </div>
                  {(selectedPaymentRequest.fromLocation || selectedPaymentRequest.toLocation) && (
                    <div className="bg-zinc-50 rounded-xl p-3 col-span-2">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Route</p>
                      <p className="font-semibold text-zinc-900">
                        {selectedPaymentRequest.fromLocation || '—'} → {selectedPaymentRequest.toLocation || '—'}
                      </p>
                    </div>
                  )}
                  {selectedPaymentRequest.category === 'Vendor' && (selectedPaymentRequest.materialName || selectedPaymentRequest.materialQty) && (
                    <div className="bg-zinc-50 rounded-xl p-3 col-span-2">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Material Details</p>
                      <p className="font-semibold text-zinc-900">
                        {selectedPaymentRequest.materialName || '—'} {selectedPaymentRequest.materialQty ? `(Qty: ${selectedPaymentRequest.materialQty})` : ''}
                      </p>
                    </div>
                  )}
                  {selectedPaymentRequest.tools && selectedPaymentRequest.tools.length > 0 && (
                    <div className="bg-zinc-50 rounded-xl p-3 col-span-2">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Tools</p>
                      <p className="font-semibold text-zinc-900">
                        {selectedPaymentRequest.tools.join(', ')}
                      </p>
                    </div>
                  )}
                  {(selectedPaymentRequest.category === 'Vendor Payment' || selectedPaymentRequest.category === 'Purchase' || selectedPaymentRequest.category === 'Vendor') && selectedPaymentRequest.vendorTotalToPay !== undefined && (
                    <div className="bg-zinc-50 rounded-xl p-3 col-span-2">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Total to Pay</p>
                      <p className="font-bold text-zinc-900 text-sm">{formatCur(selectedPaymentRequest.vendorTotalToPay)}</p>
                    </div>
                  )}
                  {selectedPaymentRequest.purchaseItems && selectedPaymentRequest.purchaseItems.length > 0 && (
                    <div className="bg-zinc-50 rounded-xl p-3 col-span-2 space-y-2">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase">
                        {paymentCategoryToExpenseCategory(selectedPaymentRequest.category) === 'Tools' ? 'Purchased Tools' : 'Purchased Materials'}
                      </p>
                      <div className="overflow-x-auto border border-zinc-200/60 rounded-lg">
                        <table className="min-w-full divide-y divide-zinc-200/60 text-[11px]">
                          <thead className="bg-zinc-100/80">
                            <tr>
                              <th className="px-3 py-1.5 text-left font-bold text-zinc-500 uppercase tracking-wider">
                                {paymentCategoryToExpenseCategory(selectedPaymentRequest.category) === 'Tools' ? 'Tool' : 'Material'}
                              </th>
                              <th className="px-3 py-1.5 text-right font-bold text-zinc-500 uppercase tracking-wider">Qty</th>
                              <th className="px-3 py-1.5 text-right font-bold text-zinc-500 uppercase tracking-wider">Price</th>
                              <th className="px-3 py-1.5 text-right font-bold text-zinc-500 uppercase tracking-wider">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-200/50 bg-white">
                            {selectedPaymentRequest.purchaseItems.map((item, idx) => (
                              <tr key={idx}>
                                <td className="px-3 py-1.5 font-medium text-zinc-950">{item.materialName || '—'}</td>
                                <td className="px-3 py-1.5 text-right text-zinc-600">{item.qty || '0'}</td>
                                <td className="px-3 py-1.5 text-right text-zinc-600">{formatCur(item.pricePerCount || 0)}</td>
                                <td className="px-3 py-1.5 text-right font-semibold text-zinc-900">{formatCur(item.total || 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {selectedPaymentRequest.description && (
                    <div className="bg-zinc-50 rounded-xl p-3 col-span-2">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Notes</p>
                      <p className="font-medium text-zinc-700">{selectedPaymentRequest.description}</p>
                    </div>
                  )}
                  {selectedPaymentRequest.paymentHistory && selectedPaymentRequest.paymentHistory.length > 0 && (
                    <div className="bg-zinc-50 rounded-xl p-3 col-span-2 space-y-2">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase">Installment Payment History</p>
                      <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                        {selectedPaymentRequest.paymentHistory.map((item, idx) => (
                          <div key={item.id} className="flex justify-between items-center text-[11px] p-2 bg-white border border-zinc-200/60 rounded-lg">
                            <div>
                              <span className="font-bold text-zinc-800">Installment #{idx + 1}</span>
                              <span className="text-[10px] text-zinc-400 block mt-0.5">
                                {new Date(item.paidAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} • {item.paymentMethod}
                              </span>
                              {item.notes && <span className="text-[9px] text-zinc-500 italic block mt-0.5">"{item.notes}"</span>}
                            </div>
                            <span className="font-extrabold text-emerald-600">{formatCur(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="bg-zinc-50 rounded-xl p-3 col-span-2">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Request ID</p>
                    <p className="font-mono text-[11px] text-zinc-600">{selectedPaymentRequest.id}</p>
                  </div>
                  <div className="bg-zinc-50 rounded-xl p-3 col-span-2">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Submitted On</p>
                    <p className="font-semibold text-zinc-900">{new Date(selectedPaymentRequest.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="px-5 py-4 border-t border-zinc-100 flex gap-2">
                {userRole === 'admin' && selectedPaymentRequest.status === 'Pending' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsStatusModalOpen(false);
                        handleOpenEditRequest(selectedPaymentRequest);
                      }}
                      className="flex-1 py-2.5 bg-zinc-100 text-zinc-800 rounded-xl text-xs font-bold hover:bg-zinc-200 transition-colors inline-flex items-center justify-center gap-1.5"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRequest(selectedPaymentRequest)}
                      className="flex-1 py-2.5 bg-rose-50 text-rose-700 rounded-xl text-xs font-bold hover:bg-rose-100 transition-colors inline-flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setIsStatusModalOpen(false)}
                  className={`py-2.5 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition-colors ${userRole === 'admin' && selectedPaymentRequest.status === 'Pending' ? 'flex-1' : 'w-full'}`}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* QUICK ADD VENDOR MODAL */}
      {isQuickAddVendorOpen && (
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-2 border-zinc-100">
              <h4 className="text-sm font-extrabold text-zinc-950">Add New Vendor</h4>
              <button
                type="button"
                onClick={() => setIsQuickAddVendorOpen(false)}
                className="text-zinc-400 hover:text-zinc-650 font-bold"
              >
                ×
              </button>
            </div>

            {quickVendorError && (
              <div className="bg-rose-50 border border-rose-100 text-rose-600 rounded-lg p-2.5 text-xs">
                {quickVendorError}
              </div>
            )}

            <form onSubmit={handleQuickVendorSubmit} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Vendor Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Raj Steels"
                  value={quickVendorName}
                  onChange={(e) => setQuickVendorName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 text-xs focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Trade/Type</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Steel Supplier"
                  value={quickVendorTrade}
                  onChange={(e) => setQuickVendorTrade(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 text-xs focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Phone (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 9876543210"
                  value={quickVendorPhone}
                  onChange={(e) => setQuickVendorPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 text-xs focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isSavingQuickVendor}
                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
              >
                {isSavingQuickVendor ? "Registering..." : "Register Vendor"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
