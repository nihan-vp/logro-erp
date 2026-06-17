import React, { useState, useEffect } from 'react';
import {
  Plus, Search, Trash2, Edit2, Users, X, Phone, Briefcase, Upload, Download, BookmarkCheck, Store,
  Calendar, FileSpreadsheet, Activity, DollarSign, Wallet, ClipboardCheck, FileText,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { api } from '../api/client';
import { generateAllWorkersAttendancePdf, generateSingleWorkerAttendancePdf } from '../utils/pdfGenerator';
import { CrewMember, CrewTrade, CrewMemberStatus } from '../types';
import { notify } from '../utils/toast';
import { useConfirm } from '../context/ConfirmContext';
const formatLocalDate = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const TRADE_OPTIONS: CrewTrade[] = ['Mason', 'Electrician', 'Plumber', 'Carpenter', 'Helper', 'Supervisor', 'Other'];
const ROSTER_ROW_HEIGHT_PX = 53;

const CSV_TEMPLATE = 'Name,Trade,Daily Wage,Phone,Status,Notes\nDave Cooper,Mason,250,9876543210,active,\nManny Ramirez,Helper,200,,active,';

interface CsvCrewRow {
  name: string;
  trade: CrewTrade;
  dailyWage: number;
  phone: string;
  status: CrewMemberStatus;
  notes: string;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  values.push(current.trim());
  return values;
}

function normalizeTrade(value: string): CrewTrade {
  const match = TRADE_OPTIONS.find(t => t.toLowerCase() === value.trim().toLowerCase());
  return match || 'Other';
}

function normalizeStatus(value: string): CrewMemberStatus {
  return value.trim().toLowerCase() === 'inactive' ? 'inactive' : 'active';
}

function parseCrewCsv(text: string): CsvCrewRow[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const firstCols = parseCsvLine(lines[0]).map(c => c.toLowerCase());
  const hasHeader = firstCols.some(c => c.includes('name') || c.includes('trade') || c.includes('wage'));
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map(line => {
    const [name, trade, wage, phone, status, notes] = parseCsvLine(line);
    return {
      name: name || '',
      trade: normalizeTrade(trade || 'Helper'),
      dailyWage: Number(wage) || 200,
      phone: phone || '',
      status: normalizeStatus(status || 'active'),
      notes: notes || ''
    };
  }).filter(row => row.name.trim() !== '');
}

interface CsvVendorRow {
  name: string;
  trade: string;
  phone: string;
  status: 'active' | 'inactive';
  notes: string;
}

function parseVendorCsv(text: string): CsvVendorRow[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const firstCols = parseCsvLine(lines[0]).map(c => c.toLowerCase());
  const hasHeader = firstCols.some(c => c.includes('name') || c.includes('trade') || c.includes('status') || c.includes('phone'));
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map(line => {
    const [name, trade, phone, status, notes] = parseCsvLine(line);
    return {
      name: name || '',
      trade: trade || 'Supplier',
      phone: phone || '',
      status: (status || '').trim().toLowerCase() === 'inactive' ? 'inactive' as const : 'active' as const,
      notes: notes || ''
    };
  }).filter(row => row.name.trim() !== '');
}

export default function AttendancePage() {
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<'crew' | 'vendors' | 'overview'>('crew');

  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | CrewMemberStatus>('All');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [trade, setTrade] = useState<CrewTrade>('Helper');
  const [dailyWage, setDailyWage] = useState(200);
  const [phone, setPhone] = useState('');
  const [memberStatus, setMemberStatus] = useState<CrewMemberStatus>('active');
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<CsvCrewRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Vendor registry states
  const [vendors, setVendors] = useState<any[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorSearchQuery, setVendorSearchQuery] = useState('');
  const [vendorStatusFilter, setVendorStatusFilter] = useState<'All' | 'active' | 'inactive'>('All');

  // Vendor Add/Edit states
  const [isVendorFormOpen, setIsVendorFormOpen] = useState(false);
  const [vendorEditId, setVendorEditId] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState('');
  const [vendorTrade, setVendorTrade] = useState('Supplier');
  const [vendorPhone, setVendorPhone] = useState('');
  const [vendorStatus, setVendorStatus] = useState<'active' | 'inactive'>('active');
  const [vendorNotes, setVendorNotes] = useState('');
  const [vendorSubmitError, setVendorSubmitError] = useState<string | null>(null);

  // Vendor bulk CSV states
  const [isVendorImportOpen, setIsVendorImportOpen] = useState(false);
  const [vendorImportRows, setVendorImportRows] = useState<any[]>([]);
  const [isVendorImporting, setIsVendorImporting] = useState(false);
  const [vendorImportError, setVendorImportError] = useState<string | null>(null);

  // Crew Overview specific states
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  const [overviewFilterType, setOverviewFilterType] = useState<'weekly' | 'monthly'>('monthly');
  const [selectedYearVal, setSelectedYearVal] = useState<number>(new Date().getFullYear());
  const [selectedMonthVal, setSelectedMonthVal] = useState<number>(new Date().getMonth()); // 0-11
  const [selectedWeekOffset, setSelectedWeekOffset] = useState<number>(0); // 0 means current week, negative for past weeks
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [paymentRequestsLogs, setPaymentRequestsLogs] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewPage, setOverviewPage] = useState(1);
  const [isMobileWorkerListOpen, setIsMobileWorkerListOpen] = useState(false);
  const [isPayWagesOpen, setIsPayWagesOpen] = useState(false);
  const [payWagesAmount, setPayWagesAmount] = useState<string>('');
  const [isSubmittingPayWages, setIsSubmittingPayWages] = useState(false);
  const [showSidebarCalendars, setShowSidebarCalendars] = useState(true);
  const [payWagesProjectId, setPayWagesProjectId] = useState<string>('');
  const [payWagesTaskId, setPayWagesTaskId] = useState<string>('');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [selectedCalendarWorkerName, setSelectedCalendarWorkerName] = useState<string | null>(null);
  const [isAllWorkersPdfModalOpen, setIsAllWorkersPdfModalOpen] = useState(false);
  const [pdfStartDate, setPdfStartDate] = useState('');
  const [pdfEndDate, setPdfEndDate] = useState('');
  const [rosterPage, setRosterPage] = useState(1);
  const [rosterRowsPerPage, setRosterRowsPerPage] = useState<number>(() => {
    return Number(localStorage.getItem('roster_rows_per_page')) || 10;
  });

  useEffect(() => {
    localStorage.setItem('roster_rows_per_page', String(rosterRowsPerPage));
  }, [rosterRowsPerPage]);

  useEffect(() => {
    setRosterPage(1);
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    if (isPayWagesOpen) {
      const worker = crew.find(c => c.id === selectedWorkerId) || crew[0];
      if (worker) {
        let startDate: Date;
        let endDate: Date;

        if (overviewFilterType === 'weekly') {
          const curr = new Date();
          const dayOffset = curr.getDay();
          const mondayOffset = dayOffset === 0 ? -6 : 1 - dayOffset;
          startDate = new Date(curr.setDate(curr.getDate() + mondayOffset + (selectedWeekOffset * 7)));
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 6);
          endDate.setHours(23, 59, 59, 999);
        } else {
          startDate = new Date(selectedYearVal, selectedMonthVal, 1, 0, 0, 0, 0);
          endDate = new Date(selectedYearVal, selectedMonthVal + 1, 0, 23, 59, 59, 999);
        }

        const startStr = formatLocalDate(startDate);
        const endStr = formatLocalDate(endDate);

        const workerAtt = attendanceLogs.filter(a =>
          a.workerName === worker.name &&
          a.date >= startStr &&
          a.date <= endStr
        );

        const unpaidLogs = workerAtt.filter(a => !a.paymentStatus || a.paymentStatus === 'Unpaid');
        const firstLog = unpaidLogs[0] || workerAtt[0];
        setPayWagesProjectId(firstLog?.projectId || '');
        setPayWagesTaskId(firstLog?.taskId || '');
      }
    } else {
      setPayWagesProjectId('');
      setPayWagesTaskId('');
    }
  }, [isPayWagesOpen, selectedWorkerId, overviewFilterType, selectedYearVal, selectedMonthVal, selectedWeekOffset, attendanceLogs, crew]);

  useEffect(() => {
    fetchCrew();
    fetchVendors();
  }, []);


  const renderDottedCalendar = (workerName: string, compact: boolean = false) => {
    let days: Date[] = [];
    if (overviewFilterType === 'weekly') {
      const curr = new Date();
      const dayOffset = curr.getDay();
      const mondayOffset = dayOffset === 0 ? -6 : 1 - dayOffset;
      const start = new Date(curr.setDate(curr.getDate() + mondayOffset + (selectedWeekOffset * 7)));
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        days.push(d);
      }
    } else {
      const daysInMonth = new Date(selectedYearVal, selectedMonthVal + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        days.push(new Date(selectedYearVal, selectedMonthVal, i));
      }
    }

    return (
      <div className="flex flex-wrap gap-1 justify-center">
        {days.map((d, i) => {
          const dateStr = formatLocalDate(d);
          const log = attendanceLogs.find(a => a.workerName === workerName && a.date === dateStr);
          const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });

          let colorClass = 'bg-zinc-100 border border-zinc-200';
          if (log) {
            if (log.status === 'Present') colorClass = 'bg-emerald-500 shadow-sm';
            else if (log.status === 'Half Day') colorClass = 'bg-blue-500 shadow-sm';
            else if (log.status === 'Absent') colorClass = 'bg-rose-500 shadow-sm';
          }

          const isToday = formatLocalDate(new Date()) === dateStr;

          const getLocalProjectAbbr = (name: string): string => {
            if (!name) return '';
            return name
              .split(/[\s-_]+/)
              .map(word => word[0])
              .join('')
              .toUpperCase()
              .slice(0, 3);
          };

          const project = log?.projectId ? projects.find(p => p.id === log.projectId) : null;
          const projectAbbr = project ? getLocalProjectAbbr(project.projectName) : '';
          const showProjectAbbr = (log?.status === 'Present' || log?.status === 'Half Day') && projectAbbr;

          if (compact) {
            return (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${colorClass} ${isToday ? 'ring-1 ring-zinc-900 ring-offset-1' : ''} cursor-pointer hover:scale-110 transition-all`}
                title={`${dateStr} (${dayName}): ${log?.status || 'No Log'}${project ? ` at ${project.projectName}` : ''}`}
                onClick={() => {
                  setSelectedCalendarDate(dateStr);
                  setSelectedCalendarWorkerName(workerName);
                }}
              />
            );
          }

          return (
            <div
              key={i}
              className={`w-6 h-6 sm:w-7 sm:h-7 rounded-md ${colorClass} ${isToday ? 'ring-2 ring-zinc-900' : ''} transition-all hover:scale-110 cursor-pointer flex items-center justify-center`}
              title={`${dateStr} (${dayName}): ${log?.status || 'No Log'}${project ? ` at ${project.projectName}` : ''}`}
              onClick={() => {
                setSelectedCalendarDate(dateStr);
                setSelectedCalendarWorkerName(workerName);
              }}
            >
              <span className={`text-[8px] sm:text-[9px] font-black ${log ? 'text-white' : 'text-zinc-500'} truncate max-w-full px-0.5`}>
                {d.getDate()}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const fetchOverviewLogs = async () => {
    try {
      setOverviewLoading(true);
      const [attRes, payRes, projRes, taskRes] = await Promise.all([
        api.getAttendance(),
        api.getPaymentRequests(),
        api.getProjects(),
        api.getTasks()
      ]);
      setAttendanceLogs(attRes.attendance || []);
      setPaymentRequestsLogs(payRes.paymentRequests || []);
      setProjects(projRes.projects || []);
      setTasks(taskRes.tasks || []);
    } catch (err: any) {
      notify.error(err?.message || 'Failed to fetch logs for crew overview');
    } finally {
      setOverviewLoading(false);
    }
  };

  const handleDownloadAllWorkersPdf = (customStartStr: string, customEndStr: string) => {
    generateAllWorkersAttendancePdf({
      customStartStr,
      customEndStr,
      attendanceLogs,
      projects,
      overviewFilterType,
      selectedMonthVal,
      selectedYearVal,
      crew,
    });
  };

  const handleRequestWagesPayment = async (worker: any, unpaidLogs: any[], remainingAmount: number) => {
    const amt = Number(payWagesAmount);
    if (isNaN(amt) || amt <= 0) {
      notify.warning('Please enter a valid amount.');
      return;
    }
    if (amt > remainingAmount) {
      notify.warning(`Amount cannot exceed the remaining due of ${formatCur(remainingAmount)}.`);
      return;
    }

    try {
      setIsSubmittingPayWages(true);

      // Update all unpaid logs to "Pending"
      if (unpaidLogs.length > 0) {
        await Promise.all(
          unpaidLogs.map(log =>
            api.updateAttendance(log.id, {
              workerName: log.workerName,
              status: log.status,
              dailyWage: log.dailyWage,
              overtimeAmount: log.overtimeAmount,
              paymentStatus: 'Pending'
            })
          )
        );
      }

      // Create a single consolidated payment request for the selected worker and period
      const firstLog = unpaidLogs[0] || attendanceLogs.find(l => l.workerName === worker.name);
      const attendanceIds = unpaidLogs.map(log => log.id);

      await api.createPaymentRequest({
        projectId: payWagesProjectId || '',
        taskId: payWagesTaskId || '',
        payeeName: worker.name,
        category: 'Worker',
        amount: amt,
        description: `Wages payment request for ${worker.name} (${overviewFilterType} view: ${firstLog ? firstLog.date : formatLocalDate(new Date())} onwards)`,
        dueDate: firstLog ? firstLog.date : formatLocalDate(new Date()),
        priority: 'Medium',
        paymentMethod: 'Bank Transfer',
        status: 'Pending',
        createdAt: new Date().toISOString(),
        attendanceIds
      });

      notify.success(`Submitted payment request of ${formatCur(amt)} for ${worker.name}.`);
      setIsPayWagesOpen(false);
      setPayWagesAmount('');
      fetchOverviewLogs();
    } catch (err: any) {
      notify.error(err?.message || 'Failed to submit payment request');
    } finally {
      setIsSubmittingPayWages(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'overview') {
      fetchOverviewLogs();
    }
  }, [activeTab]);

  useEffect(() => {
    setOverviewPage(1);
  }, [selectedWorkerId, overviewFilterType, selectedYearVal, selectedMonthVal, selectedWeekOffset]);

  const fetchVendors = async () => {
    try {
      setVendorsLoading(true);
      const res = await api.getVendors();
      setVendors(res.vendors || []);
    } catch (err: any) {
      notify.error(err?.message || 'Failed to load vendors');
    } finally {
      setVendorsLoading(false);
    }
  };

  const fetchCrew = async () => {
    try {
      setLoading(true);
      const res = await api.getCrew();
      setCrew(res.crew || []);
    } catch (err: any) {
      notify.error(err?.message || 'Failed to load crew roster');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditId(null);
    setName('');
    setTrade('Helper');
    setDailyWage(200);
    setPhone('');
    setMemberStatus('active');
    setNotes('');
    setSubmitError(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const handleOpenEdit = (member: CrewMember) => {
    setEditId(member.id);
    setName(member.name);
    setTrade(member.trade);
    setDailyWage(member.dailyWage);
    setPhone(member.phone || '');
    setMemberStatus(member.status);
    setNotes(member.notes || '');
    setSubmitError(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      notify.warning('Worker name is required.');
      return;
    }

    const payload = {
      name: name.trim(),
      trade,
      dailyWage: Number(dailyWage),
      phone,
      status: memberStatus,
      notes
    };

    try {
      setSubmitError(null);
      if (editId) {
        await api.updateCrewMember(editId, payload);
        notify.success('Crew member updated.');
      } else {
        await api.createCrewMember(payload);
        notify.success('Crew member added.');
      }
      setIsFormOpen(false);
      fetchCrew();
    } catch (err: any) {
      const message = err?.message || 'Failed to save crew member';
      setSubmitError(message);
      notify.error(message);
    }
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'crew_import_template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCrewCsv(text);
      if (parsed.length === 0) {
        setImportError('No valid crew rows found in the CSV file.');
        setImportRows([]);
      } else {
        setImportRows(parsed);
      }
      e.target.value = '';
    };
    reader.onerror = () => {
      setImportError('Failed to read the CSV file.');
    };
    reader.readAsText(file);
  };

  const handleOpenImport = () => {
    setImportRows([]);
    setImportError(null);
    setIsImportOpen(true);
  };

  const handleBulkImport = async () => {
    if (importRows.length === 0) {
      notify.warning('Upload a CSV file with at least one crew member.');
      return;
    }

    try {
      setIsImporting(true);
      setImportError(null);
      const res = await api.bulkCrew({ members: importRows });
      const skippedMsg = res.skipped > 0 ? ` ${res.skipped} duplicate(s) skipped.` : '';
      const errorMsg = res.errors?.length ? ` ${res.errors.length} row(s) had errors.` : '';
      notify.success(`Imported ${res.added} crew member(s).${skippedMsg}${errorMsg}`);
      setIsImportOpen(false);
      setImportRows([]);
      fetchCrew();
    } catch (err: any) {
      const message = err?.message || 'Bulk import failed';
      setImportError(message);
      notify.error(message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const member = crew.find(c => c.id === id);
    const ok = await confirm({
      title: 'Remove crew member?',
      message: member
        ? `Remove ${member.name} from the roster? They will no longer appear in crew suggestions.`
        : 'Remove this crew member from the roster?',
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await api.deleteCrewMember(id);
      fetchCrew();
      notify.success('Crew member removed.');
    } catch (err: any) {
      notify.error(err?.message || 'Failed to remove crew member');
    }
  };

  // --- VENDOR OPERATIONS ---
  const resetVendorForm = () => {
    setVendorEditId(null);
    setVendorName('');
    setVendorTrade('Supplier');
    setVendorPhone('');
    setVendorStatus('active');
    setVendorNotes('');
    setVendorSubmitError(null);
  };

  const handleOpenAddVendor = () => {
    resetVendorForm();
    setIsVendorFormOpen(true);
  };

  const handleOpenEditVendor = (vend: any) => {
    setVendorEditId(vend.id);
    setVendorName(vend.name);
    setVendorTrade(vend.trade);
    setVendorPhone(vend.phone || '');
    setVendorStatus(vend.status);
    setVendorNotes(vend.notes || '');
    setVendorSubmitError(null);
    setIsVendorFormOpen(true);
  };

  const handleVendorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName.trim()) {
      notify.warning('Vendor name is required.');
      return;
    }
    if (!vendorTrade.trim()) {
      notify.warning('Vendor supply trade/type is required.');
      return;
    }

    const payload = {
      name: vendorName.trim(),
      trade: vendorTrade.trim(),
      phone: vendorPhone,
      status: vendorStatus,
      notes: vendorNotes
    };

    try {
      setVendorSubmitError(null);
      if (vendorEditId) {
        await api.updateVendor(vendorEditId, payload);
        notify.success('Vendor updated.');
      } else {
        await api.createVendor(payload);
        notify.success('Vendor registered.');
      }
      setIsVendorFormOpen(false);
      fetchVendors();
    } catch (err: any) {
      const message = err?.message || 'Failed to save vendor';
      setVendorSubmitError(message);
      notify.error(message);
    }
  };

  const handleVendorDelete = async (id: string) => {
    const vend = vendors.find(v => v.id === id);
    const ok = await confirm({
      title: 'Remove Vendor?',
      message: vend
        ? `Remove vendor "${vend.name}" from registry? They will no longer appear in vendor suggestions.`
        : 'Remove this vendor?',
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await api.deleteVendor(id);
      fetchVendors();
      notify.success('Vendor removed.');
    } catch (err: any) {
      notify.error(err?.message || 'Failed to remove vendor');
    }
  };

  // Vendor CSV Import Operations
  const handleDownloadVendorTemplate = () => {
    const template = 'Name,Trade,Phone,Status,Notes\nAlpha Steels,Steel Supplier,9876543211,active,Cement supplier\nBeta Materials,Cement Supplier,9876543212,active,Steel supplier';
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vendor_import_template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleVendorCsvFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVendorImportError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseVendorCsv(text);
      if (parsed.length === 0) {
        setVendorImportError('No valid vendor rows found in the CSV file.');
        setVendorImportRows([]);
      } else {
        setVendorImportRows(parsed);
      }
      e.target.value = '';
    };
    reader.onerror = () => {
      setVendorImportError('Failed to read the CSV file.');
    };
    reader.readAsText(file);
  };

  const handleVendorBulkImport = async () => {
    if (vendorImportRows.length === 0) {
      notify.warning('Upload a CSV file with at least one vendor.');
      return;
    }

    try {
      setIsVendorImporting(true);
      setVendorImportError(null);
      const res = await api.bulkVendor({ vendors: vendorImportRows });
      const skippedMsg = res.skipped > 0 ? ` ${res.skipped} duplicate(s) skipped.` : '';
      const errorMsg = res.errors?.length ? ` ${res.errors.length} row(s) had errors.` : '';
      notify.success(`Imported ${res.added} vendor(s).${skippedMsg}${errorMsg}`);
      setIsVendorImportOpen(false);
      setVendorImportRows([]);
      fetchVendors();
    } catch (err: any) {
      const message = err?.message || 'Bulk import failed';
      setVendorImportError(message);
      notify.error(message);
    } finally {
      setIsVendorImporting(false);
    }
  };

  const formatCur = (num: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);

  const filteredCrew = crew.filter(m => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.trade.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.phone || '').includes(searchQuery);
    const matchesStatus = statusFilter === 'All' || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeCount = crew.filter(m => m.status === 'active').length;

  const filteredVendors = vendors.filter(v => {
    const matchesSearch =
      v.name.toLowerCase().includes(vendorSearchQuery.toLowerCase()) ||
      v.trade.toLowerCase().includes(vendorSearchQuery.toLowerCase()) ||
      (v.phone || '').includes(vendorSearchQuery);
    const matchesStatus = vendorStatusFilter === 'All' || v.status === vendorStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeVendorCount = vendors.filter(v => v.status === 'active').length;

  return (
    <div className="space-y-6 font-sans">
      {/* ── Tab Bar ── */}
      <div className="flex flex-wrap gap-1 p-1 bg-zinc-100 rounded-xl w-full sm:w-fit">
        <button
          onClick={() => setActiveTab('crew')}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'crew'
            ? 'bg-white text-zinc-950 shadow-sm'
            : 'text-zinc-500 hover:text-zinc-700'
            }`}
        >
          <Users className="w-4 h-4" />
          <span>Crew Roster</span>
          <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-black ${activeTab === 'crew' ? 'bg-zinc-100 text-zinc-700' : 'bg-zinc-200/60 text-zinc-500'
            }`}>{crew.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('vendors')}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'vendors'
            ? 'bg-white text-zinc-950 shadow-sm'
            : 'text-zinc-500 hover:text-zinc-700'
            }`}
        >
          <Store className="w-4 h-4" />
          <span>Vendors</span>
          <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-black ${activeTab === 'vendors' ? 'bg-zinc-100 text-zinc-700' : 'bg-zinc-200/60 text-zinc-500'
            }`}>{vendors.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'overview'
            ? 'bg-white text-zinc-950 shadow-sm'
            : 'text-zinc-500 hover:text-zinc-700'
            }`}
        >
          <BookmarkCheck className="w-4 h-4" />
          <span>Crew Overview</span>
        </button>
      </div>

      {/* ══════════════════════════════════ CREW TAB ══════════════════════════════════ */}
      {activeTab === 'crew' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-zinc-950">Crew Roster</h1>
              <p className="text-xs sm:text-sm text-zinc-500">Manage on-site workers, trades, and standard daily wages</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleOpenImport}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-zinc-200 text-zinc-800 rounded-xl text-xs sm:text-sm font-semibold hover:bg-zinc-50 transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span>Import CSV</span>
              </button>
              <button
                onClick={handleOpenAdd}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-zinc-950 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-zinc-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add Crew</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border rounded-xl p-4 flex flex-col justify-between shadow-sm">
              <span className="text-[10px] text-zinc-400 font-bold uppercase block tracking-wider">Total crew</span>
              <span className="text-2xl font-black text-zinc-950 block mt-1">{crew.length}</span>
            </div>
            <div className="bg-white border rounded-xl p-4 flex flex-col justify-between shadow-sm">
              <span className="text-[10px] text-zinc-400 font-bold uppercase block tracking-wider">Active workers</span>
              <span className="text-2xl font-black text-emerald-700 block mt-1">{activeCount}</span>
            </div>
          </div>

          <div className="bg-white border rounded-xl p-4 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search by name, trade, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none"
              />
            </div>
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'All' | CrewMemberStatus)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs font-semibold text-zinc-700 outline-none"
              >
                <option value="All">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-zinc-900/10 border-t-zinc-900 rounded-full animate-spin" />
            </div>
          ) : filteredCrew.length === 0 ? (
            <div className="p-8 border border-dashed rounded-2xl text-center bg-zinc-50">
              <Users className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
              <p className="text-xs text-zinc-500">
                {crew.length === 0
                  ? 'No crew members yet. Click "Add Crew" to register your first worker.'
                  : 'No crew members match your search.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-zinc-600 border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 text-zinc-400 uppercase font-bold text-[10px] tracking-wider border-b border-zinc-200">
                        <th className="py-3 px-4">Name</th>
                        <th className="py-3 px-4">Trade</th>
                        <th className="py-3 px-4 text-right">Daily Wage</th>
                        <th className="py-3 px-4">Phone</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4">Notes</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 text-zinc-900">
                      {(() => {
                        const paginatedCrew = filteredCrew.slice(
                          (rosterPage - 1) * rosterRowsPerPage,
                          rosterPage * rosterRowsPerPage
                        );
                        const emptyRowCount = Math.max(0, rosterRowsPerPage - paginatedCrew.length);
                        return (
                          <>
                            {paginatedCrew.map((member) => (
                              <tr key={member.id} className="hover:bg-zinc-50/50 transition-colors" style={{ height: ROSTER_ROW_HEIGHT_PX }}>
                                <td className="py-3 px-4 font-bold text-zinc-950 text-sm align-middle">
                                  {member.name}
                                </td>
                                <td className="py-3 px-4 font-semibold text-zinc-700 align-middle">{member.trade}</td>
                                <td className="py-3 px-4 text-right font-black text-zinc-950 align-middle">{formatCur(member.dailyWage)}</td>
                                <td className="py-3 px-4 font-medium text-zinc-600 align-middle">{member.phone || '—'}</td>
                                <td className="py-3 px-4 text-center align-middle">
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight uppercase ${member.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-zinc-100 text-zinc-500 border border-zinc-200'}`}>
                                    {member.status}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-zinc-400 italic max-w-[200px] truncate align-middle" title={member.notes || ''}>
                                  {member.notes ? `"${member.notes}"` : '—'}
                                </td>
                                <td className="py-3 px-4 text-right align-middle">
                                  <div className="flex gap-1.5 justify-end">
                                    <button
                                      onClick={() => handleOpenEdit(member)}
                                      className="p-1.5 bg-zinc-50 border border-zinc-200 text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
                                      title="Edit crew member"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(member.id)}
                                      className="p-1.5 bg-zinc-50 border border-zinc-200 text-rose-500 hover:text-rose-900 rounded-lg hover:bg-rose-50 transition-colors"
                                      title="Remove crew member"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {Array.from({ length: emptyRowCount }).map((_, idx) => (
                              <tr key={`roster-empty-${idx}`} style={{ height: ROSTER_ROW_HEIGHT_PX }} aria-hidden="true">
                                <td colSpan={7} className="px-4 py-3 align-middle">&nbsp;</td>
                              </tr>
                            ))}
                          </>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* Table Pagination Footer */}
                {(() => {
                  const totalRosterPages = Math.max(1, Math.ceil(filteredCrew.length / rosterRowsPerPage));
                  const activePage = Math.min(rosterPage, totalRosterPages);
                  const startIndex = (activePage - 1) * rosterRowsPerPage;
                  const rangeStart = filteredCrew.length === 0 ? 0 : startIndex + 1;
                  const rangeEnd = Math.min(startIndex + rosterRowsPerPage, filteredCrew.length);
                  return (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-t border-zinc-100 bg-zinc-50/50 rounded-b-2xl">
                      <p className="text-[11px] text-zinc-500 font-medium font-sans">
                        Showing <span className="font-semibold text-zinc-700">{rangeStart}–{rangeEnd}</span> of{' '}
                        <span className="font-semibold text-zinc-700">{filteredCrew.length}</span>
                      </p>
                      <div className="flex flex-wrap items-center gap-3 font-sans">
                        <div className="flex items-center gap-2">
                          <label htmlFor="roster-rows-per-page" className="text-[10px] font-bold text-zinc-400 uppercase whitespace-nowrap">
                            Rows per page
                          </label>
                          <select
                            id="roster-rows-per-page"
                            value={rosterRowsPerPage}
                            onChange={(e) => {
                              setRosterRowsPerPage(Number(e.target.value));
                              setRosterPage(1);
                            }}
                            className="bg-white border border-zinc-200 rounded-lg px-2 py-1 text-xs font-semibold text-zinc-700 outline-none focus:ring-1 focus:ring-zinc-900"
                          >
                            {[5, 10, 25, 50].map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setRosterPage(Math.max(1, activePage - 1))}
                            disabled={activePage <= 1}
                            className="p-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            aria-label="Previous page"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-xs font-semibold text-zinc-600 min-w-[64px] text-center">
                            {activePage} / {totalRosterPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => setRosterPage(Math.min(totalRosterPages, activePage + 1))}
                            disabled={activePage >= totalRosterPages}
                            className="p-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            aria-label="Next page"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </>
      )}

      {/* Crew Import Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border rounded-2xl p-5 sm:p-6 shadow-md max-w-2xl w-full space-y-4 max-h-[90vh] overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-between border-b pb-3 border-zinc-100">
              <h2 className="text-base font-extrabold text-zinc-950 flex items-center gap-1.5">
                <Upload className="w-5 h-5 text-zinc-600" />
                <span>Bulk Import Crew (CSV)</span>
              </h2>
              <button
                onClick={() => setIsImportOpen(false)}
                className="px-2.5 py-1.5 bg-zinc-100 font-bold hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-zinc-500">
              CSV columns: <span className="font-semibold text-zinc-700">Name, Trade, Daily Wage, Phone, Status, Notes</span>.
              Header row is optional. Status accepts <code className="text-[10px] bg-zinc-100 px-1 rounded">active</code> or <code className="text-[10px] bg-zinc-100 px-1 rounded">inactive</code>.
            </p>

            {importError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs">{importError}</div>
            )}

            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 bg-zinc-950 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition-colors">
                <Upload className="w-4 h-4" />
                <span>Choose CSV File</span>
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFileSelect} />
              </label>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download Template</span>
              </button>
            </div>

            {importRows.length > 0 && (
              <div className="space-y-3">
                <div className="hidden sm:grid bg-zinc-50 p-2.5 border rounded-t-xl font-bold text-[10px] text-zinc-400 uppercase tracking-wider grid-cols-6 gap-2">
                  <div className="col-span-2">Name</div>
                  <div>Trade</div>
                  <div>Wage</div>
                  <div>Phone</div>
                  <div>Status</div>
                </div>
                <div className="border rounded-xl sm:rounded-t-none sm:border-t-0 max-h-[280px] overflow-y-auto divide-y">
                  {importRows.map((row, idx) => (
                    <div key={idx} className="p-2.5 sm:grid sm:grid-cols-6 gap-2 text-xs items-center">
                      <div className="sm:col-span-2 font-bold text-zinc-900">{row.name}</div>
                      <div className="text-zinc-600">{row.trade}</div>
                      <div className="text-zinc-600">₹{row.dailyWage}</div>
                      <div className="text-zinc-500 truncate">{row.phone || '—'}</div>
                      <div className="text-zinc-600 capitalize">{row.status}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-400 font-semibold">{importRows.length} worker(s) ready to import. Duplicates will be skipped.</p>
              </div>
            )}

            <button
              onClick={handleBulkImport}
              disabled={isImporting || importRows.length === 0}
              className="w-full py-2.5 bg-zinc-950 hover:bg-zinc-900 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
            >
              <BookmarkCheck className="w-4 h-4" />
              <span>{isImporting ? 'Importing...' : `Import ${importRows.length || ''} Crew Member${importRows.length === 1 ? '' : 's'}`}</span>
            </button>
          </div>
        </div>
      )}

      {/* Crew Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border rounded-2xl p-5 sm:p-6 shadow-md max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-between border-b pb-3 border-zinc-100">
              <h2 className="text-base font-extrabold text-zinc-950">
                {editId ? 'Edit Crew Member' : 'Add Crew Member'}
              </h2>
              <button
                onClick={() => setIsFormOpen(false)}
                className="px-2.5 py-1.5 bg-zinc-100 font-bold hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
            </div>

            {submitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs">{submitError}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="Worker name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Trade / Role</label>
                  <select
                    value={trade}
                    onChange={(e) => setTrade(e.target.value as CrewTrade)}
                    className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl"
                  >
                    {TRADE_OPTIONS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Daily Wage (₹)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={dailyWage}
                    onChange={(e) => setDailyWage(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Phone</label>
                  <input
                    type="tel"
                    placeholder="Optional"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Status</label>
                  <select
                    value={memberStatus}
                    onChange={(e) => setMemberStatus(e.target.value as CrewMemberStatus)}
                    className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Skills, certifications, etc."
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-zinc-950 hover:bg-zinc-900 text-white font-bold rounded-xl transition-colors"
              >
                {editId ? 'Save Changes' : 'Add to Roster'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════ VENDORS TAB ══════════════════════════════════ */}
      {activeTab === 'vendors' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-zinc-950">Vendor Registry</h1>
              <p className="text-xs sm:text-sm text-zinc-500">Manage material suppliers and vendors for purchases</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setVendorImportRows([]); setVendorImportError(null); setIsVendorImportOpen(true); }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-zinc-200 text-zinc-800 rounded-xl text-xs sm:text-sm font-semibold hover:bg-zinc-50 transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span>Import CSV</span>
              </button>
              <button
                onClick={handleOpenAddVendor}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-zinc-950 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-zinc-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add Vendor</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border rounded-xl p-4 flex flex-col justify-between shadow-sm">
              <span className="text-[10px] text-zinc-400 font-bold uppercase block tracking-wider">Total vendors</span>
              <span className="text-2xl font-black text-zinc-950 block mt-1">{vendors.length}</span>
            </div>
            <div className="bg-white border rounded-xl p-4 flex flex-col justify-between shadow-sm">
              <span className="text-[10px] text-zinc-400 font-bold uppercase block tracking-wider">Active vendors</span>
              <span className="text-2xl font-black text-emerald-700 block mt-1">{activeVendorCount}</span>
            </div>
          </div>

          <div className="bg-white border rounded-xl p-4 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search by name, trade, or phone..."
                value={vendorSearchQuery}
                onChange={(e) => setVendorSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none"
              />
            </div>
            <div>
              <select
                value={vendorStatusFilter}
                onChange={(e) => setVendorStatusFilter(e.target.value as 'All' | 'active' | 'inactive')}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs font-semibold text-zinc-700 outline-none"
              >
                <option value="All">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {vendorsLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-zinc-900/10 border-t-zinc-900 rounded-full animate-spin" />
            </div>
          ) : filteredVendors.length === 0 ? (
            <div className="p-8 border border-dashed rounded-2xl text-center bg-zinc-50">
              <Store className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
              <p className="text-xs text-zinc-500">
                {vendors.length === 0
                  ? 'No vendors yet. Click "Add Vendor" to register your first supplier.'
                  : 'No vendors match your search.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredVendors.map((vend) => (
                <div
                  key={vend.id}
                  className="bg-white border rounded-xl p-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold tracking-tight uppercase ${vend.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'
                        }`}>
                        {vend.status}
                      </span>
                      <h4 className="text-sm font-extrabold text-zinc-950">{vend.name}</h4>
                    </div>
                    <p className="text-[10px] text-zinc-400 font-semibold mt-1 flex items-center gap-2">
                      <Store className="w-3 h-3" />
                      <span>{vend.trade}</span>
                      {vend.phone && (
                        <>
                          <span>•</span>
                          <Phone className="w-3 h-3" />
                          <span>{vend.phone}</span>
                        </>
                      )}
                    </p>
                    {vend.notes && (
                      <p className="text-[11px] text-zinc-400 mt-1 italic">&quot;{vend.notes}&quot;</p>
                    )}
                  </div>

                  <div className="flex gap-1.5 justify-end">
                    <button
                      onClick={() => handleOpenEditVendor(vend)}
                      className="p-1.5 bg-zinc-50 border text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
                      title="Edit vendor"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleVendorDelete(vend.id)}
                      className="p-1.5 bg-zinc-50 border text-rose-500 hover:text-rose-900 rounded-lg hover:bg-rose-50 transition-colors"
                      title="Remove vendor"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Vendor Import Modal */}
      {isVendorImportOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border rounded-2xl p-5 sm:p-6 shadow-md max-w-2xl w-full space-y-4 max-h-[90vh] overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-between border-b pb-3 border-zinc-100">
              <h2 className="text-base font-extrabold text-zinc-950 flex items-center gap-1.5">
                <Upload className="w-5 h-5 text-zinc-600" />
                <span>Bulk Import Vendors (CSV)</span>
              </h2>
              <button
                onClick={() => setIsVendorImportOpen(false)}
                className="px-2.5 py-1.5 bg-zinc-100 font-bold hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-zinc-500">
              CSV columns: <span className="font-semibold text-zinc-700">Name, Trade, Phone, Status, Notes</span>.
              Header row is optional. Status accepts <code className="text-[10px] bg-zinc-100 px-1 rounded">active</code> or <code className="text-[10px] bg-zinc-100 px-1 rounded">inactive</code>.
            </p>

            {vendorImportError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs">{vendorImportError}</div>
            )}

            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 bg-zinc-950 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition-colors">
                <Upload className="w-4 h-4" />
                <span>Choose CSV File</span>
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleVendorCsvFileSelect} />
              </label>
              <button
                type="button"
                onClick={handleDownloadVendorTemplate}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download Template</span>
              </button>
            </div>

            {vendorImportRows.length > 0 && (
              <div className="space-y-3">
                <div className="hidden sm:grid bg-zinc-50 p-2.5 border rounded-t-xl font-bold text-[10px] text-zinc-400 uppercase tracking-wider grid-cols-5 gap-2">
                  <div className="col-span-2">Name</div>
                  <div>Trade</div>
                  <div>Phone</div>
                  <div>Status</div>
                </div>
                <div className="border rounded-xl sm:rounded-t-none sm:border-t-0 max-h-[280px] overflow-y-auto divide-y">
                  {vendorImportRows.map((row: CsvVendorRow, idx: number) => (
                    <div key={idx} className="p-2.5 sm:grid sm:grid-cols-5 gap-2 text-xs items-center">
                      <div className="sm:col-span-2 font-bold text-zinc-900">{row.name}</div>
                      <div className="text-zinc-600">{row.trade}</div>
                      <div className="text-zinc-500 truncate">{row.phone || '—'}</div>
                      <div className="text-zinc-600 capitalize">{row.status}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-400 font-semibold">{vendorImportRows.length} vendor(s) ready to import. Duplicates will be skipped.</p>
              </div>
            )}

            <button
              onClick={handleVendorBulkImport}
              disabled={isVendorImporting || vendorImportRows.length === 0}
              className="w-full py-2.5 bg-zinc-950 hover:bg-zinc-900 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
            >
              <BookmarkCheck className="w-4 h-4" />
              <span>{isVendorImporting ? 'Importing...' : `Import ${vendorImportRows.length || ''} Vendor${vendorImportRows.length === 1 ? '' : 's'}`}</span>
            </button>
          </div>
        </div>
      )}

      {/* Vendor Form Modal */}
      {isVendorFormOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border rounded-2xl p-5 sm:p-6 shadow-md max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-between border-b pb-3 border-zinc-100">
              <h2 className="text-base font-extrabold text-zinc-950">
                {vendorEditId ? 'Edit Vendor' : 'Add Vendor'}
              </h2>
              <button
                onClick={() => setIsVendorFormOpen(false)}
                className="px-2.5 py-1.5 bg-zinc-100 font-bold hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
            </div>

            {vendorSubmitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs">{vendorSubmitError}</div>
            )}

            <form onSubmit={handleVendorSubmit} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Vendor / Company Name</label>
                <input
                  type="text"
                  required
                  placeholder="Vendor or company name"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Supply Trade / Type</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Steel, Cement, Electrical"
                    value={vendorTrade}
                    onChange={(e) => setVendorTrade(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Phone</label>
                  <input
                    type="tel"
                    placeholder="Optional"
                    value={vendorPhone}
                    onChange={(e) => setVendorPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Status</label>
                <select
                  value={vendorStatus}
                  onChange={(e) => setVendorStatus(e.target.value as 'active' | 'inactive')}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Notes</label>
                <textarea
                  value={vendorNotes}
                  onChange={(e) => setVendorNotes(e.target.value)}
                  rows={2}
                  placeholder="Payment terms, delivery notes, etc."
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-zinc-950 hover:bg-zinc-900 text-white font-bold rounded-xl transition-colors"
              >
                {vendorEditId ? 'Save Changes' : 'Register Vendor'}
              </button>
            </form>
          </div>
        </div>
      )}
      {/* ══════════════════════════════════ CREW OVERVIEW TAB ══════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-zinc-950">Crew Financial & Attendance Overview</h1>
              <p className="text-xs sm:text-sm text-zinc-500">Track logs, wage distributions, and payment status for individual workers</p>
            </div>
          </div>

          {crew.length === 0 ? (
            <div className="p-8 border border-dashed rounded-2xl text-center bg-zinc-50">
              <Users className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
              <p className="text-xs text-zinc-500">No crew roster matches found. Register workers in Roster first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Workers sidebar - hidden on mobile, shown on lg */}
              <div className="hidden lg:flex lg:col-span-1 bg-white border border-zinc-200/80 rounded-2xl p-4 space-y-4 shadow-sm flex-col lg:self-start">
                <h3 className="font-bold text-zinc-950 text-xs uppercase tracking-wider">Select Crew Worker</h3>
                <div className="space-y-1 overflow-y-auto pr-1 max-h-[740px]">
                  {crew.map(m => {
                    const isSelected = selectedWorkerId === m.id || (!selectedWorkerId && crew[0]?.id === m.id);
                    // Select first worker by default if none selected
                    if (!selectedWorkerId && crew[0]?.id === m.id) {
                      setTimeout(() => setSelectedWorkerId(m.id), 0);
                    }
                    return (
                      <button
                        key={m.id}
                        onClick={() => setSelectedWorkerId(m.id)}
                        className={`w-full text-left p-3 rounded-xl transition-all border text-xs ${isSelected
                          ? 'bg-zinc-950 text-white border-zinc-950 shadow-md font-bold'
                          : 'bg-zinc-50/50 hover:bg-zinc-50 text-zinc-800 border-zinc-150 hover:border-zinc-300'
                          }`}
                      >
                        <span className="block font-bold truncate">{m.name}</span>
                        <span className={`text-[10px] mt-0.5 block ${isSelected ? 'text-zinc-300' : 'text-zinc-500'}`}>
                          {m.trade} • {formatCur(m.dailyWage)}/day
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mobile worker pop-up modal */}
              {isMobileWorkerListOpen && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 lg:hidden">
                  <div className="bg-white border border-zinc-200 rounded-2xl w-full max-w-sm shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
                    <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                      <h3 className="font-bold text-zinc-950 text-sm">Select Crew Worker</h3>
                      <button
                        onClick={() => setIsMobileWorkerListOpen(false)}
                        className="p-1 rounded-lg hover:bg-zinc-100 transition-colors text-zinc-400 hover:text-zinc-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-4 overflow-y-auto space-y-1">
                      {crew.map(m => {
                        const isSelected = selectedWorkerId === m.id || (!selectedWorkerId && crew[0]?.id === m.id);
                        return (
                          <button
                            key={m.id}
                            onClick={() => {
                              setSelectedWorkerId(m.id);
                              setIsMobileWorkerListOpen(false);
                            }}
                            className={`w-full text-left p-3 rounded-xl transition-all border text-xs ${isSelected
                              ? 'bg-zinc-950 text-white border-zinc-950 shadow-md font-bold'
                              : 'bg-zinc-50/50 hover:bg-zinc-50 text-zinc-800 border-zinc-150 hover:border-zinc-300'
                              }`}
                          >
                            <span className="block font-bold truncate">{m.name}</span>
                            <span className={`text-[10px] mt-0.5 block ${isSelected ? 'text-zinc-300' : 'text-zinc-500'}`}>
                              {m.trade} • {formatCur(m.dailyWage)}/day
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Overview Details & Filters Panel */}
              <div className="lg:col-span-3 space-y-6">
                {/* Mobile Selector Bar */}
                {(() => {
                  const worker = crew.find(c => c.id === selectedWorkerId) || crew[0];
                  if (!worker) return null;
                  return (
                    <div className="flex lg:hidden items-center justify-between p-3.5 bg-white border border-zinc-200/80 rounded-2xl shadow-sm">
                      <div>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Selected Worker</span>
                        <span className="font-extrabold text-zinc-950 text-sm mt-0.5 block">{worker.name} ({worker.trade})</span>
                      </div>
                      <button
                        onClick={() => setIsMobileWorkerListOpen(true)}
                        className="px-3.5 py-1.5 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition-colors"
                      >
                        Change
                      </button>
                    </div>
                  );
                })()}

                {(() => {
                  const worker = crew.find(c => c.id === selectedWorkerId) || crew[0];
                  if (!worker) return null;

                  // Date range math
                  let startDate: Date;
                  let endDate: Date;

                  if (overviewFilterType === 'weekly') {
                    // Compute current week matching selectedWeekOffset
                    const curr = new Date();
                    const dayOffset = curr.getDay(); // 0 (Sun) to 6 (Sat)
                    // Let's set start of week to Monday
                    const mondayOffset = dayOffset === 0 ? -6 : 1 - dayOffset;
                    startDate = new Date(curr.setDate(curr.getDate() + mondayOffset + (selectedWeekOffset * 7)));
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(startDate);
                    endDate.setDate(startDate.getDate() + 6);
                    endDate.setHours(23, 59, 59, 999);
                  } else {
                    // Monthly
                    startDate = new Date(selectedYearVal, selectedMonthVal, 1, 0, 0, 0, 0);
                    endDate = new Date(selectedYearVal, selectedMonthVal + 1, 0, 23, 59, 59, 999);
                  }

                  const startStr = formatLocalDate(startDate);
                  const endStr = formatLocalDate(endDate);

                  // Filter attendance logs matching this worker & date range
                  const workerAtt = attendanceLogs.filter(a =>
                    a.workerName === worker.name &&
                    a.date >= startStr &&
                    a.date <= endStr
                  );

                  const workerPayments = paymentRequestsLogs.filter(pr => {
                    const isWorkerMatch = pr.payeeName.trim().toLowerCase() === worker.name.trim().toLowerCase();
                    if (!isWorkerMatch) return false;

                    if (pr.attendanceIds && pr.attendanceIds.length > 0) {
                      const matchesAttendance = pr.attendanceIds.some((id: string) => workerAtt.some(a => a.id === id));
                      if (matchesAttendance) return true;
                    }

                    return pr.dueDate >= startStr && pr.dueDate <= endStr;
                  });

                  // Calculate stats
                  const daysPresent = workerAtt.filter(a => a.status === 'Present').length;
                  const daysHalf = workerAtt.filter(a => a.status === 'Half Day').length;
                  const daysAbsent = workerAtt.filter(a => a.status === 'Absent').length;

                  // Daily wage sums
                  const totalEarned = workerAtt.reduce((sum, a) => {
                    let rate = 0;
                    if (a.status === 'Present') rate = a.dailyWage || worker.dailyWage;
                    else if (a.status === 'Half Day') rate = (a.dailyWage || worker.dailyWage) * 0.5;
                    return sum + rate + (a.overtimeAmount || 0);
                  }, 0);

                  // Paid requests sum
                  const paidWages = workerPayments
                    .filter(pr => pr.status === 'Paid')
                    .reduce((sum, pr) => sum + pr.amount, 0);

                  // Partially paid requests details
                  const partialPaidSum = workerPayments
                    .filter(pr => pr.status === 'Partially Paid')
                    .reduce((sum, pr) => sum + (pr.paymentHistory || []).reduce((s: number, item: any) => s + item.amount, 0), 0);

                  const totalPaid = paidWages + partialPaidSum;
                  const remainingToPay = Math.max(0, totalEarned - totalPaid);

                  // Handle Download CSV
                  const handleDownloadCsv = () => {
                    const csvHeaders = ['Date', 'Project', 'Task', 'Attendance Status', 'Wages Earned (₹)', 'Overtime (₹)', 'Payment Status'];
                    const csvRows = workerAtt.map(a => {
                      let wages = 0;
                      if (a.status === 'Present') wages = a.dailyWage || worker.dailyWage;
                      else if (a.status === 'Half Day') wages = (a.dailyWage || worker.dailyWage) * 0.5;
                      return [
                        a.date,
                        a.projectName,
                        a.taskName,
                        a.status,
                        wages,
                        a.overtimeAmount || 0,
                        a.paymentStatus || 'Unpaid'
                      ];
                    });

                    const csvContent = [
                      [`Worker Financial & Attendance Summary Report: ${worker.name} (${overviewFilterType.toUpperCase()})`],
                      [`Period: ${startStr} to ${endStr}`],
                      [`Trade: ${worker.trade}`],
                      [`Daily Wage Rate: ₹${worker.dailyWage}`],
                      [],
                      csvHeaders,
                      ...csvRows,
                      [],
                      ['SUMMARY STATISTICS'],
                      ['Total Days Present', daysPresent],
                      ['Total Half Days', daysHalf],
                      ['Total Days Absent', daysAbsent],
                      ['Total Wages Earned (₹)', totalEarned],
                      ['Total Wages Paid (₹)', totalPaid],
                      ['Remaining Outstanding (₹)', remainingToPay]
                    ].map(e => e.join(',')).join('\n');

                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `report_${worker.name.toLowerCase().replace(/\s+/g, '_')}_${startStr}_to_${endStr}.csv`;
                    link.click();
                    URL.revokeObjectURL(url);
                    notify.success('Report CSV downloaded.');
                  };

                  const handleDownloadPdf = () => {
                    generateSingleWorkerAttendancePdf({
                      worker,
                      workerAtt,
                      workerPayments,
                      daysPresent,
                      daysHalf,
                      daysAbsent,
                      totalEarned,
                      totalPaid,
                      remainingToPay,
                      startStr,
                      endStr,
                      projects,
                      tasks,
                      overviewFilterType,
                      selectedMonthVal,
                      selectedYearVal,
                      selectedWeekOffset,
                      attendanceLogs,
                    });
                  };

                  return (
                    <div className="space-y-6">
                      {/* Filter panel */}
                      <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setOverviewFilterType('weekly')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${overviewFilterType === 'weekly' ? 'bg-zinc-950 text-white shadow-sm' : 'bg-zinc-50 text-zinc-500 hover:text-zinc-700'
                              }`}
                          >
                            Weekly
                          </button>
                          <button
                            onClick={() => setOverviewFilterType('monthly')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${overviewFilterType === 'monthly' ? 'bg-zinc-950 text-white shadow-sm' : 'bg-zinc-50 text-zinc-500 hover:text-zinc-700'
                              }`}
                          >
                            Monthly
                          </button>
                        </div>

                        {/* Dropdown controls */}
                        <div className="flex flex-wrap items-center gap-2">
                          {overviewFilterType === 'monthly' ? (
                            <>
                              <select
                                value={selectedMonthVal}
                                onChange={e => setSelectedMonthVal(Number(e.target.value))}
                                className="bg-zinc-50 border border-zinc-200 rounded-xl p-2 text-xs font-semibold text-zinc-700 outline-none"
                              >
                                {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, idx) => (
                                  <option key={idx} value={idx}>{m}</option>
                                ))}
                              </select>
                              <select
                                value={selectedYearVal}
                                onChange={e => setSelectedYearVal(Number(e.target.value))}
                                className="bg-zinc-50 border border-zinc-200 rounded-xl p-2 text-xs font-semibold text-zinc-700 outline-none"
                              >
                                {[2024, 2025, 2026, 2027, 2028].map(y => (
                                  <option key={y} value={y}>{y}</option>
                                ))}
                              </select>
                            </>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setSelectedWeekOffset(prev => prev - 1)}
                                className="px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold text-zinc-600 hover:bg-zinc-100"
                              >
                                Prev Week
                              </button>
                              <button
                                onClick={() => setSelectedWeekOffset(0)}
                                className="px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold text-zinc-600 hover:bg-zinc-100"
                              >
                                Current
                              </button>
                              <button
                                onClick={() => setSelectedWeekOffset(prev => prev + 1)}
                                className="px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold text-zinc-600 hover:bg-zinc-100"
                              >
                                Next Week
                              </button>
                            </div>
                          )}

                          <button
                            onClick={handleDownloadCsv}
                            className="inline-flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>CSV</span>
                          </button>

                          <button
                            onClick={handleDownloadPdf}
                            className="inline-flex items-center gap-1 px-3.5 py-2 bg-zinc-950 hover:bg-zinc-900 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>PDF</span>
                          </button>

                          <button
                            onClick={() => {
                              setPdfStartDate(startStr);
                              setPdfEndDate(endStr);
                              setIsAllWorkersPdfModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                            title="Download attendance of all workers"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>All Workers PDF</span>
                          </button>
                        </div>
                      </div>

                      {/* KPI Summary Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white border border-zinc-200/80 rounded-xl p-4 flex flex-col justify-between shadow-sm">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase block tracking-wider">Present / Half / Absent</span>
                          <span className="text-base font-extrabold text-zinc-950 block mt-2">
                            <span className="text-emerald-600">{daysPresent}D</span> • <span className="text-blue-600">{daysHalf}D</span> • <span className="text-rose-600">{daysAbsent}D</span>
                          </span>
                        </div>

                        <div className="bg-white border border-zinc-200/80 rounded-xl p-4 flex flex-col justify-between shadow-sm">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase block tracking-wider">Total Wage Earned</span>
                          <span className="text-lg font-black text-zinc-950 block mt-2">{formatCur(totalEarned)}</span>
                        </div>

                        <div className="bg-white border border-zinc-200/80 rounded-xl p-4 flex flex-col justify-between shadow-sm">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase block tracking-wider">Paid Amount</span>
                          <span className="text-lg font-black text-emerald-600 block mt-2">{formatCur(totalPaid)}</span>
                        </div>

                        <div className="bg-white border border-zinc-200/80 rounded-xl p-4 flex flex-col justify-between shadow-sm">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase block tracking-wider">Remaining Due</span>
                          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mt-2">
                            <span className="text-lg font-black text-amber-600 truncate">{formatCur(remainingToPay)}</span>
                            {remainingToPay > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPayWagesAmount(remainingToPay.toString());
                                  setIsPayWagesOpen(true);
                                }}
                                className="w-full sm:w-auto px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-bold transition-all shadow-sm text-center flex items-center justify-center whitespace-nowrap"
                              >
                                Pay Wages
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Attendance Calendar Visualizer */}
                      <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <h3 className="text-xs font-bold text-zinc-900 tracking-wider uppercase">Attendance Calendar Visualizer</h3>
                          <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold text-zinc-500">
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 block shadow-sm" /> Present</span>
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 block shadow-sm" /> Half Day</span>
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 block shadow-sm" /> Absent</span>
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-zinc-100 block border border-zinc-200" /> No Log</span>
                          </div>
                        </div>
                        <div className="border border-zinc-100 rounded-xl p-4 flex justify-center bg-zinc-50/20">
                          {renderDottedCalendar(worker.name, false)}
                        </div>
                      </div>

                      {/* Wage Payment Requests Table */}
                      <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm space-y-3">
                        <h3 className="text-xs font-bold text-zinc-900 tracking-wider uppercase">Wage Payment Requests</h3>
                        {(() => {
                          // Row limiter (5 rows per page) using parent state
                          const limit = 5;
                          const totalPages = Math.max(1, Math.ceil(workerPayments.length / limit));
                          const currPage = Math.min(overviewPage, totalPages);
                          const paginated = workerPayments.slice((currPage - 1) * limit, currPage * limit);
                          const emptyRows = Math.max(0, limit - paginated.length);

                          return (
                            <div className="border border-zinc-200/80 rounded-xl overflow-hidden">
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left text-zinc-600 border-collapse">
                                  <thead>
                                    <tr className="bg-zinc-50 text-zinc-400 uppercase font-bold text-[9px] border-b border-zinc-200 h-[36px]">
                                      <th className="py-2.5 px-3">Date</th>
                                      <th className="py-2.5 px-3">Project Scope / Memo</th>
                                      <th className="py-2.5 px-3">Method</th>
                                      <th className="py-2.5 px-3 text-right">Requested</th>
                                      <th className="py-2.5 px-3 text-right">Paid</th>
                                      <th className="py-2.5 px-3 text-right">Remaining</th>
                                      <th className="py-2.5 px-3 text-center">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-zinc-100 text-zinc-900 bg-white">
                                    {workerPayments.length === 0 ? (
                                      <tr className="h-[280px]">
                                        <td colSpan={7} className="text-center py-8">
                                          <div className="flex flex-col items-center justify-center">
                                            <ClipboardCheck className="w-8 h-8 text-zinc-400 mb-2" />
                                            <p className="text-xs text-zinc-500 font-medium">No wage payment requests found for this period.</p>
                                          </div>
                                        </td>
                                      </tr>
                                    ) : (
                                      <>
                                        {paginated.map(pr => {
                                          let paidAmt = 0;
                                          if (pr.status === 'Paid') {
                                            paidAmt = pr.amount;
                                          } else if (pr.status === 'Partially Paid') {
                                            paidAmt = (pr.paymentHistory || []).reduce((s: number, item: any) => s + item.amount, 0);
                                          }
                                          const remaining = Math.max(0, pr.amount - paidAmt);

                                          const prjName = projects.find(p => p.id === pr.projectId)?.projectName || 'Unknown Project';
                                          const tskName = tasks.find(t => t.id === pr.taskId)?.taskName || pr.description || '—';

                                          let statusBadgeClass = 'bg-amber-50 text-amber-700';
                                          if (pr.status === 'Paid') statusBadgeClass = 'bg-emerald-50 text-emerald-700';
                                          else if (pr.status === 'Partially Paid') statusBadgeClass = 'bg-blue-50 text-blue-700';
                                          else if (pr.status === 'Cancelled') statusBadgeClass = 'bg-zinc-150 text-zinc-650';

                                          return (
                                            <tr key={pr.id} className="h-[56px] hover:bg-zinc-50/50 transition-colors">
                                              <td className="py-3 px-3 font-semibold whitespace-nowrap">{pr.dueDate}</td>
                                              <td className="py-3 px-3">
                                                <span className="font-bold text-zinc-800 block truncate max-w-[150px]">{prjName}</span>
                                                <span className="text-[10px] text-zinc-400 block mt-0.5 truncate max-w-[150px]">{tskName}</span>
                                              </td>
                                              <td className="py-3 px-3 font-medium text-zinc-600">{pr.paymentMethod || 'Bank Transfer'}</td>
                                              <td className="py-3 px-3 text-right font-medium text-zinc-700">{formatCur(pr.amount)}</td>
                                              <td className="py-3 px-3 text-right font-medium text-emerald-600">{formatCur(paidAmt)}</td>
                                              <td className="py-3 px-3 text-right font-bold text-zinc-950">{formatCur(remaining)}</td>
                                              <td className="py-3 px-3 text-center">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusBadgeClass}`}>
                                                  {pr.status || 'Pending'}
                                                </span>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                        {Array.from({ length: emptyRows }).map((_, i) => (
                                          <tr key={`empty-${i}`} className="h-[56px] opacity-0 select-none">
                                            <td colSpan={7} className="py-3 px-3">&nbsp;</td>
                                          </tr>
                                        ))}
                                      </>
                                    )}
                                  </tbody>
                                </table>
                              </div>

                              {/* Pagination controls */}
                              <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-100 bg-zinc-50/50">
                                <span className="text-[10px] text-zinc-400 font-bold">
                                  Page {currPage} of {totalPages} ({workerPayments.length} items)
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={currPage <= 1}
                                    onClick={() => setOverviewPage(p => Math.max(1, p - 1))}
                                    className="px-2 py-1 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-lg text-[10px] font-semibold text-zinc-600 disabled:opacity-40"
                                  >
                                    Prev
                                  </button>
                                  <button
                                    type="button"
                                    disabled={currPage >= totalPages}
                                    onClick={() => setOverviewPage(p => Math.min(totalPages, p + 1))}
                                    className="px-2 py-1 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-lg text-[10px] font-semibold text-zinc-600 disabled:opacity-40"
                                  >
                                    Next
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {isPayWagesOpen && (() => {
            const worker = crew.find(c => c.id === selectedWorkerId) || crew[0];
            if (!worker) return null;

            // Date range math
            let startDate: Date;
            let endDate: Date;

            if (overviewFilterType === 'weekly') {
              const curr = new Date();
              const dayOffset = curr.getDay();
              const mondayOffset = dayOffset === 0 ? -6 : 1 - dayOffset;
              startDate = new Date(curr.setDate(curr.getDate() + mondayOffset + (selectedWeekOffset * 7)));
              startDate.setHours(0, 0, 0, 0);
              endDate = new Date(startDate);
              endDate.setDate(startDate.getDate() + 6);
              endDate.setHours(23, 59, 59, 999);
            } else {
              startDate = new Date(selectedYearVal, selectedMonthVal, 1, 0, 0, 0, 0);
              endDate = new Date(selectedYearVal, selectedMonthVal + 1, 0, 23, 59, 59, 999);
            }

            const startStr = formatLocalDate(startDate);
            const endStr = formatLocalDate(endDate);

            const workerAtt = attendanceLogs.filter(a =>
              a.workerName === worker.name &&
              a.date >= startStr &&
              a.date <= endStr
            );

            const unpaidLogs = workerAtt.filter(a => !a.paymentStatus || a.paymentStatus === 'Unpaid');

            const totalEarned = workerAtt.reduce((sum, a) => {
              let rate = 0;
              if (a.status === 'Present') rate = a.dailyWage || worker.dailyWage;
              else if (a.status === 'Half Day') rate = (a.dailyWage || worker.dailyWage) * 0.5;
              return sum + rate + (a.overtimeAmount || 0);
            }, 0);

            const workerPayments = paymentRequestsLogs.filter(pr => {
              const isWorkerMatch = pr.payeeName.trim().toLowerCase() === worker.name.trim().toLowerCase();
              if (!isWorkerMatch) return false;

              if (pr.attendanceIds && pr.attendanceIds.length > 0) {
                const matchesAttendance = pr.attendanceIds.some((id: string) => workerAtt.some(a => a.id === id));
                if (matchesAttendance) return true;
              }

              return pr.dueDate >= startStr && pr.dueDate <= endStr;
            });

            const paidWages = workerPayments
              .filter(pr => pr.status === 'Paid')
              .reduce((sum, pr) => sum + pr.amount, 0);

            const partialPaidSum = workerPayments
              .filter(pr => pr.status === 'Partially Paid')
              .reduce((sum, pr) => {
                const history = pr.paymentHistory || [];
                return sum + history.reduce((s: number, item: any) => s + item.amount, 0);
              }, 0);

            const totalPaid = paidWages + partialPaidSum;
            const remainingToPay = Math.max(0, totalEarned - totalPaid);

            return (
              <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white border rounded-2xl p-5 sm:p-6 shadow-md max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto animate-fade-in">
                  <div className="flex items-center justify-between border-b pb-3 border-zinc-100">
                    <h2 className="text-base font-extrabold text-zinc-950">
                      Request Wages Payment
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPayWagesOpen(false);
                        setPayWagesAmount('');
                      }}
                      className="px-2.5 py-1.5 bg-zinc-100 font-bold hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs transition-colors"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="text-xs text-zinc-655 space-y-2">
                    <p><strong>Worker:</strong> {worker.name} ({worker.trade})</p>
                    <p><strong>Outstanding Balance:</strong> {formatCur(remainingToPay)}</p>
                    {unpaidLogs.length > 0 && (
                      <p><strong>Unpaid Days:</strong> {unpaidLogs.length} day(s)</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Project (Optional)</label>
                    <select
                      value={payWagesProjectId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPayWagesProjectId(val);
                        setPayWagesTaskId('');
                      }}
                      className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 text-xs focus:ring-1 focus:ring-zinc-950 outline-none"
                    >
                      <option value="">-- Select Project (Optional) --</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.projectName}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Task (Optional)</label>
                    <select
                      value={payWagesTaskId}
                      onChange={(e) => setPayWagesTaskId(e.target.value)}
                      disabled={!payWagesProjectId}
                      className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 text-xs focus:ring-1 focus:ring-zinc-950 outline-none disabled:bg-zinc-50 disabled:text-zinc-400"
                    >
                      <option value="">-- Select Task (Optional) --</option>
                      {tasks
                        .filter(t => t.projectId === payWagesProjectId)
                        .map(t => (
                          <option key={t.id} value={t.id}>{t.taskName}</option>
                        ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Payment Request Amount (₹)</label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={remainingToPay}
                      placeholder="Enter amount to request"
                      value={payWagesAmount}
                      onChange={(e) => setPayWagesAmount(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 font-bold text-sm"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRequestWagesPayment(worker, unpaidLogs, remainingToPay)}
                    disabled={isSubmittingPayWages || !payWagesAmount || Number(payWagesAmount) <= 0 || Number(payWagesAmount) > remainingToPay}
                    className="w-full py-2.5 bg-zinc-950 hover:bg-zinc-900 disabled:opacity-50 text-white font-bold rounded-xl transition-colors text-xs flex items-center justify-center gap-1.5"
                  >
                    <span>{isSubmittingPayWages ? 'Submitting...' : `Submit Payment Request for ${formatCur(Number(payWagesAmount) || 0)}`}</span>
                  </button>
                </div>
              </div>
            );
          })()}

          {selectedCalendarDate && selectedCalendarWorkerName && (() => {
            const dateLogs = attendanceLogs.filter(
              a => a.workerName === selectedCalendarWorkerName && a.date === selectedCalendarDate
            );

            return (
              <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white border rounded-2xl p-5 sm:p-6 shadow-md max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto animate-fade-in">
                  <div className="flex items-center justify-between border-b pb-3 border-zinc-100">
                    <h2 className="text-base font-extrabold text-zinc-950">
                      Attendance Overview
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCalendarDate(null);
                        setSelectedCalendarWorkerName(null);
                      }}
                      className="px-2.5 py-1.5 bg-zinc-100 font-bold hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs transition-colors"
                    >
                      Close
                    </button>
                  </div>

                  <div className="text-xs text-zinc-600 space-y-3 font-sans">
                    <div className="flex justify-between items-center bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                      <div>
                        <span className="block text-[9px] text-zinc-400 uppercase tracking-wider font-bold">Worker</span>
                        <span className="text-xs font-bold text-zinc-950">{selectedCalendarWorkerName}</span>
                      </div>
                      <div className="text-right">
                        <span className="block text-[9px] text-zinc-400 uppercase tracking-wider font-bold">Date</span>
                        <span className="text-xs font-bold text-zinc-950">{selectedCalendarDate}</span>
                      </div>
                    </div>

                    {dateLogs.length === 0 ? (
                      <div className="p-4 bg-zinc-50 border border-dashed rounded-xl text-center text-zinc-500">
                        <p className="font-semibold text-xs">No attendance recorded on this date.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <span className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Attendance Logs ({dateLogs.length})</span>
                        {dateLogs.map((log, index) => {
                          const project = projects.find(p => p.id === log.projectId);
                          const task = tasks.find(t => t.id === log.taskId);

                          return (
                            <div key={log.id || index} className="p-3 bg-zinc-50 border border-zinc-150 rounded-xl space-y-2">
                              <div className="flex justify-between items-start">
                                <div className="space-y-0.5">
                                  <span className="text-[9px] font-bold text-zinc-400 uppercase block">Site / Project</span>
                                  <span className="font-bold text-zinc-900 text-xs">{project ? project.projectName : 'Unknown Project'}</span>
                                  {task && (
                                    <span className="text-[10px] text-zinc-500 block font-semibold">Task: {task.taskName}</span>
                                  )}
                                </div>
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                  log.status === 'Present' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                  log.status === 'Half Day' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                                  'bg-rose-50 text-rose-700 border border-rose-100'
                                }`}>
                                  {log.status}
                                </span>
                              </div>

                              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-200/60 text-[9px] text-zinc-500 font-bold uppercase tracking-wider">
                                <div>
                                  <span className="text-[8px] text-zinc-400 block">Daily Wage</span>
                                  <span className="text-zinc-950 font-extrabold normal-case">{formatCur(log.dailyWage || 0)}</span>
                                </div>
                                <div>
                                  <span className="text-[8px] text-zinc-400 block">Overtime</span>
                                  <span className="text-zinc-950 font-extrabold normal-case">{formatCur(log.overtimeAmount || 0)}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-[8px] text-zinc-400 block">Payout Status</span>
                                  <span className={`font-extrabold normal-case ${
                                    log.paymentStatus === 'Paid' ? 'text-emerald-700' :
                                    log.paymentStatus === 'Pending' ? 'text-amber-700' :
                                    'text-zinc-500'
                                  }`}>{log.paymentStatus || 'Unpaid'}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {isAllWorkersPdfModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 sm:p-6 shadow-xl max-w-sm w-full space-y-5 animate-fade-in">
            <div className="flex items-center justify-between border-b pb-3 border-zinc-100">
              <h2 className="text-base font-extrabold text-zinc-950 flex items-center gap-1.5 font-sans">
                <FileText className="w-5 h-5 text-zinc-700" />
                <span>Select Date Range</span>
              </h2>
              <button
                onClick={() => setIsAllWorkersPdfModalOpen(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 transition-colors text-zinc-400 hover:text-zinc-600"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 font-sans">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Start Date</label>
                <input
                  type="date"
                  value={pdfStartDate}
                  onChange={(e) => setPdfStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 font-bold text-sm outline-none focus:ring-1 focus:ring-zinc-950"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">End Date</label>
                <input
                  type="date"
                  value={pdfEndDate}
                  onChange={(e) => setPdfEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 font-bold text-sm outline-none focus:ring-1 focus:ring-zinc-950"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2 font-sans">
              <button
                type="button"
                onClick={() => setIsAllWorkersPdfModalOpen(false)}
                className="flex-1 py-2.5 border border-zinc-200 bg-white hover:bg-zinc-50 font-bold text-zinc-700 rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!pdfStartDate || !pdfEndDate) {
                    notify.warning('Please select both start and end dates.');
                    return;
                  }
                  handleDownloadAllWorkersPdf(pdfStartDate, pdfEndDate);
                  setIsAllWorkersPdfModalOpen(false);
                }}
                className="flex-1 py-2.5 bg-zinc-950 hover:bg-zinc-900 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
