import React, { useState, useEffect } from 'react';
import {
  Plus, Search, Trash2, Edit2, Users, X, Phone, Briefcase, Upload, Download, BookmarkCheck, Store,
  Calendar, FileSpreadsheet, Activity, DollarSign, Wallet, ClipboardCheck, FileText,
  ChevronLeft, ChevronRight, Undo2
} from 'lucide-react';
import { api } from '../api/client';
import { generateAllWorkersAttendancePdf, generateSingleWorkerAttendancePdf } from '../utils/pdfGenerator';
import { CrewMember, CrewTrade, CrewMemberStatus } from '../types';
import { notify } from '../utils/toast';
import { useConfirm } from '../context/ConfirmContext';
import DatePicker from '../components/DatePicker';
import Select from '../components/Select';
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

interface CsvOutsideLabourRow {
  name: string;
  trade: string;
  phone: string;
  status: 'active' | 'inactive';
  notes: string;
}

function parseOutsideLabourCsv(text: string): CsvOutsideLabourRow[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const firstCols = parseCsvLine(lines[0]).map(c => c.toLowerCase());
  const hasHeader = firstCols.some(c => c.includes('name') || c.includes('trade') || c.includes('status') || c.includes('phone'));
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map(line => {
    const [name, trade, phone, status, notes] = parseCsvLine(line);
    return {
      name: name || '',
      trade: trade || 'Labourer',
      phone: phone || '',
      status: (status || '').trim().toLowerCase() === 'inactive' ? 'inactive' as const : 'active' as const,
      notes: notes || ''
    };
  }).filter(row => row.name.trim() !== '');
}

export default function AttendancePage() {
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<'crew' | 'vendors' | 'outside_labours' | 'overview' | 'payouts'>('crew');

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

  // Outside Labour states
  const [outsideLabours, setOutsideLabours] = useState<any[]>([]);
  const [outsideLaboursLoading, setOutsideLaboursLoading] = useState(false);
  const [outsideLabourSearchQuery, setOutsideLabourSearchQuery] = useState('');
  const [outsideLabourStatusFilter, setOutsideLabourStatusFilter] = useState<'All' | 'active' | 'inactive'>('All');

  // Outside Labour Add/Edit states
  const [isOutsideLabourFormOpen, setIsOutsideLabourFormOpen] = useState(false);
  const [outsideLabourEditId, setOutsideLabourEditId] = useState<string | null>(null);
  const [outsideLabourName, setOutsideLabourName] = useState('');
  const [outsideLabourTrade, setOutsideLabourTrade] = useState('Labourer');
  const [outsideLabourPhone, setOutsideLabourPhone] = useState('');
  const [outsideLabourStatus, setOutsideLabourStatus] = useState<'active' | 'inactive'>('active');
  const [outsideLabourNotes, setOutsideLabourNotes] = useState('');
  const [outsideLabourSubmitError, setOutsideLabourSubmitError] = useState<string | null>(null);

  // Outside Labour bulk CSV states
  const [isOutsideLabourImportOpen, setIsOutsideLabourImportOpen] = useState(false);
  const [outsideLabourImportRows, setOutsideLabourImportRows] = useState<any[]>([]);
  const [isOutsideLabourImporting, setIsOutsideLabourImporting] = useState(false);
  const [outsideLabourImportError, setOutsideLabourImportError] = useState<string | null>(null);

  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('all');
  const [selectedWorkersForPayment, setSelectedWorkersForPayment] = useState<string[]>([]);
  const [overviewFilterType, setOverviewFilterType] = useState<'weekly' | 'monthly'>('monthly');
  const [wageProjectFilter, setWageProjectFilter] = useState<string>('All');
  const [wageTaskFilter, setWageTaskFilter] = useState<string>('All');
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
  const [payDays, setPayDays] = useState<number>(0);
  const [isSubmittingPayWages, setIsSubmittingPayWages] = useState(false);
  const [showSidebarCalendars, setShowSidebarCalendars] = useState(true);
  const [payWagesProjectId, setPayWagesProjectId] = useState<string>('');
  const [payWagesTaskId, setPayWagesTaskId] = useState<string>('');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [selectedCalendarWorkerName, setSelectedCalendarWorkerName] = useState<string | null>(null);
  const [selectedDayPayments, setSelectedDayPayments] = useState<Record<string, boolean>>({});
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerProject, setLedgerProject] = useState('All');
  const [ledgerStatus, setLedgerStatus] = useState<'All' | 'Unpaid' | 'Pending' | 'Paid'>('Unpaid');
  const [ledgerPage, setLedgerPage] = useState(1);
  const [selectedLedgerLogs, setSelectedLedgerLogs] = useState<string[]>([]);
  const [ledgerStartDate, setLedgerStartDate] = useState(() => formatLocalDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [ledgerEndDate, setLedgerEndDate] = useState(() => formatLocalDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)));

  useEffect(() => {
    if (isPayWagesOpen) {
      const initialSelection: Record<string, boolean> = {};
      const { startStr, endStr } = getDateRange();

      const workersToProcess = selectedWorkerId === 'all'
        ? crew.filter(w => selectedWorkersForPayment.includes(w.id))
        : [crew.find(c => c.id === selectedWorkerId) || crew[0]].filter(Boolean);

      workersToProcess.forEach(w => {
        const workerAtt = attendanceLogs.filter(a => {
          const matchesWorker = a.workerName === w.name;
          const matchesDate = a.date >= startStr && a.date <= endStr;
          const matchesProj = wageProjectFilter === 'All' || a.projectId === wageProjectFilter;
          const matchesTsk = wageTaskFilter === 'All' || a.taskId === wageTaskFilter;
          return matchesWorker && matchesDate && matchesProj && matchesTsk;
        });

        const unpaidLogs = workerAtt.filter(a => !a.paymentStatus || a.paymentStatus === 'Unpaid');
        unpaidLogs.forEach(log => {
          if (log.id) {
            initialSelection[log.id] = true;
          }
        });
      });
      setSelectedDayPayments(initialSelection);
    }
  }, [isPayWagesOpen, selectedWorkerId, selectedWorkersForPayment, crew, attendanceLogs, selectedYearVal, selectedMonthVal, selectedWeekOffset, overviewFilterType, wageProjectFilter, wageTaskFilter]);
  const [isAllWorkersPdfModalOpen, setIsAllWorkersPdfModalOpen] = useState(false);
  const [pdfStartDate, setPdfStartDate] = useState('');
  const [pdfEndDate, setPdfEndDate] = useState('');
  const [rosterPage, setRosterPage] = useState(1);
  const [rosterRowsPerPage, setRosterRowsPerPage] = useState<number>(() => {
    return Number(localStorage.getItem('roster_rows_per_page')) || 10;
  });
  const [overviewRowsPerPage, setOverviewRowsPerPage] = useState<number>(() => {
    return Number(localStorage.getItem('overview_rows_per_page')) || 5;
  });
  const [ledgerRowsPerPage, setLedgerRowsPerPage] = useState<number>(() => {
    return Number(localStorage.getItem('ledger_rows_per_page')) || 15;
  });
  const [unpaidWorkersPage, setUnpaidWorkersPage] = useState(1);
  const [unpaidWorkersRowsPerPage, setUnpaidWorkersRowsPerPage] = useState<number>(() => {
    return Number(localStorage.getItem('unpaid_workers_rows_per_page')) || 5;
  });

  useEffect(() => {
    localStorage.setItem('roster_rows_per_page', String(rosterRowsPerPage));
  }, [rosterRowsPerPage]);

  useEffect(() => {
    localStorage.setItem('overview_rows_per_page', String(overviewRowsPerPage));
  }, [overviewRowsPerPage]);

  useEffect(() => {
    localStorage.setItem('ledger_rows_per_page', String(ledgerRowsPerPage));
  }, [ledgerRowsPerPage]);

  useEffect(() => {
    localStorage.setItem('unpaid_workers_rows_per_page', String(unpaidWorkersRowsPerPage));
  }, [unpaidWorkersRowsPerPage]);

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
          const sundayOffset = -dayOffset;
          startDate = new Date(curr.setDate(curr.getDate() + sundayOffset + (selectedWeekOffset * 7)));
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
        const filteredUnpaid = unpaidLogs.filter(a => {
          const matchesProj = wageProjectFilter === 'All' || a.projectId === wageProjectFilter;
          const matchesTsk = wageTaskFilter === 'All' || a.taskId === wageTaskFilter;
          return matchesProj && matchesTsk;
        });
        const firstLog = filteredUnpaid[0] || unpaidLogs[0] || workerAtt[0];
        setPayWagesProjectId(wageProjectFilter !== 'All' ? wageProjectFilter : (firstLog?.projectId || ''));
        setPayWagesTaskId(wageTaskFilter !== 'All' ? wageTaskFilter : (firstLog?.taskId || ''));
      }
    } else {
      setPayWagesProjectId('');
      setPayWagesTaskId('');
    }
  }, [isPayWagesOpen, selectedWorkerId, overviewFilterType, selectedYearVal, selectedMonthVal, selectedWeekOffset, attendanceLogs, crew, wageProjectFilter, wageTaskFilter]);

  useEffect(() => {
    fetchCrew();
    fetchVendors();
    fetchOutsideLabours();
  }, []);


  const renderDottedCalendar = (workerName: string, compact: boolean = false) => {
    let days: Date[] = [];
    if (overviewFilterType === 'weekly') {
      const curr = new Date();
      const dayOffset = curr.getDay();
      const sundayOffset = -dayOffset;
      const start = new Date(curr.setDate(curr.getDate() + sundayOffset + (selectedWeekOffset * 7)));
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
    const selectedLogs = unpaidLogs.filter(log => {
      return !!selectedDayPayments[log.id];
    });

    if (selectedLogs.length === 0) {
      notify.warning('No days selected for payment.');
      return;
    }

    const totalSelectedAmount = selectedLogs.reduce((sum, log) => {
      let rate = 0;
      if (log.status === 'Present') rate = log.dailyWage || worker.dailyWage;
      else if (log.status === 'Half Day') rate = (log.dailyWage || worker.dailyWage) * 0.5;
      return sum + rate + (log.overtimeAmount || 0);
    }, 0);

    const amt = Number(payWagesAmount) || totalSelectedAmount;
    if (isNaN(amt) || amt <= 0) {
      notify.warning('Please enter a valid amount.');
      return;
    }
    if (amt > totalSelectedAmount) {
      notify.warning(`Amount cannot exceed the selected total of ${formatCur(totalSelectedAmount)}.`);
      return;
    }

    try {
      setIsSubmittingPayWages(true);

      // Update all selected unpaid logs to "Pending"
      await Promise.all(
        selectedLogs.map(log =>
          api.updateAttendance(log.id, {
            workerName: log.workerName,
            status: log.status,
            dailyWage: log.dailyWage,
            overtimeAmount: log.overtimeAmount,
            paymentStatus: 'Pending'
          })
        )
      );

      // Group logs by project & task if not explicitly consolidating
      const logsByGroup: Record<string, { projectId: string; taskId: string; logs: any[]; groupTotal: number }> = {};
      if (payWagesProjectId) {
        const key = `${payWagesProjectId}_${payWagesTaskId || ''}`;
        logsByGroup[key] = {
          projectId: payWagesProjectId,
          taskId: payWagesTaskId || '',
          logs: selectedLogs,
          groupTotal: totalSelectedAmount
        };
      } else {
        selectedLogs.forEach(log => {
          const pid = log.projectId || '';
          const tid = log.taskId || '';
          const key = `${pid}_${tid}`;
          if (!logsByGroup[key]) {
            logsByGroup[key] = { projectId: pid, taskId: tid, logs: [], groupTotal: 0 };
          }
          const item = logsByGroup[key];
          item.logs.push(log);
          let rate = 0;
          if (log.status === 'Present') rate = log.dailyWage || worker.dailyWage;
          else if (log.status === 'Half Day') rate = (log.dailyWage || worker.dailyWage) * 0.5;
          item.groupTotal += rate + (log.overtimeAmount || 0);
        });
      }

      const groupItems = Object.values(logsByGroup);
      let allocatedSum = 0;
      const groupAllocations = groupItems.map((item, idx) => {
        if (idx === groupItems.length - 1) {
          return { ...item, allocatedAmount: amt - allocatedSum };
        }
        const allocated = Math.round((item.groupTotal / totalSelectedAmount) * amt);
        allocatedSum += allocated;
        return { ...item, allocatedAmount: allocated };
      });

      for (const group of groupAllocations) {
        if (group.allocatedAmount <= 0) continue;
        const firstLog = group.logs[0];
        await api.createPaymentRequest({
          projectId: group.projectId,
          taskId: group.taskId,
          payeeName: worker.name,
          category: 'Worker',
          amount: group.allocatedAmount,
          description: `Wages payment request for ${worker.name} (${overviewFilterType} view: ${firstLog ? firstLog.date : formatLocalDate(new Date())} onwards)`,
          dueDate: firstLog ? firstLog.date : formatLocalDate(new Date()),
          priority: 'Medium',
          paymentMethod: 'Bank Transfer',
          status: 'Pending',
          createdAt: new Date().toISOString(),
          attendanceIds: group.logs.map(log => log.id)
        });
      }

      notify.success(`Submitted payment requests totaling ${formatCur(amt)} for ${worker.name}.`);
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
    if (activeTab === 'overview' || activeTab === 'payouts') {
      fetchOverviewLogs();
    }
  }, [activeTab]);

  useEffect(() => {
    setOverviewPage(1);
    setUnpaidWorkersPage(1);
  }, [selectedWorkerId, overviewFilterType, selectedYearVal, selectedMonthVal, selectedWeekOffset, wageProjectFilter, wageTaskFilter]);

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

  const fetchOutsideLabours = async () => {
    try {
      setOutsideLaboursLoading(true);
      const res = await api.getOutsideLabours();
      setOutsideLabours(res.outsideLabours || []);
    } catch (err: any) {
      notify.error(err?.message || 'Failed to load outside labours');
    } finally {
      setOutsideLaboursLoading(false);
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

  // Outside Labour Handlers
  const resetOutsideLabourForm = () => {
    setOutsideLabourEditId(null);
    setOutsideLabourName('');
    setOutsideLabourTrade('Labourer');
    setOutsideLabourPhone('');
    setOutsideLabourStatus('active');
    setOutsideLabourNotes('');
    setOutsideLabourSubmitError(null);
  };

  const handleOpenAddOutsideLabour = () => {
    resetOutsideLabourForm();
    setIsOutsideLabourFormOpen(true);
  };

  const handleOpenEditOutsideLabour = (ol: any) => {
    setOutsideLabourEditId(ol.id);
    setOutsideLabourName(ol.name);
    setOutsideLabourTrade(ol.trade);
    setOutsideLabourPhone(ol.phone || '');
    setOutsideLabourStatus(ol.status);
    setOutsideLabourNotes(ol.notes || '');
    setOutsideLabourSubmitError(null);
    setIsOutsideLabourFormOpen(true);
  };

  const handleOutsideLabourSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outsideLabourName.trim()) {
      notify.warning('Name is required.');
      return;
    }
    if (!outsideLabourTrade.trim()) {
      notify.warning('Trade/role is required.');
      return;
    }

    const payload = {
      name: outsideLabourName.trim(),
      trade: outsideLabourTrade.trim(),
      phone: outsideLabourPhone,
      status: outsideLabourStatus,
      notes: outsideLabourNotes
    };

    try {
      setOutsideLabourSubmitError(null);
      if (outsideLabourEditId) {
        await api.updateOutsideLabour(outsideLabourEditId, payload);
        notify.success('Outside labour updated.');
      } else {
        await api.createOutsideLabour(payload);
        notify.success('Outside labour registered.');
      }
      setIsOutsideLabourFormOpen(false);
      fetchOutsideLabours();
    } catch (err: any) {
      const message = err?.message || 'Failed to save outside labour';
      setOutsideLabourSubmitError(message);
      notify.error(message);
    }
  };

  const handleOutsideLabourDelete = async (id: string) => {
    const ol = outsideLabours.find(o => o.id === id);
    const ok = await confirm({
      title: 'Remove Outside Labour?',
      message: ol
        ? `Remove "${ol.name}" from registry?`
        : 'Remove this outside labour?',
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await api.deleteOutsideLabour(id);
      fetchOutsideLabours();
      notify.success('Outside labour removed.');
    } catch (err: any) {
      notify.error(err?.message || 'Failed to remove outside labour');
    }
  };

  // Outside Labour CSV Import Operations
  const handleDownloadOutsideLabourTemplate = () => {
    const template = 'Name,Trade,Phone,Status,Notes\nJohn Doe,Mason,9876543213,active,Outside subcontractor\nJane Smith,Supervisor,,active,Contract supervisor';
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'outside_labour_import_template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleOutsideLabourCsvFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOutsideLabourImportError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseOutsideLabourCsv(text);
      if (parsed.length === 0) {
        setOutsideLabourImportError('No valid rows found in the CSV file.');
        setOutsideLabourImportRows([]);
      } else {
        setOutsideLabourImportRows(parsed);
      }
      e.target.value = '';
    };
    reader.onerror = () => {
      setOutsideLabourImportError('Failed to read the CSV file.');
    };
    reader.readAsText(file);
  };

  const handleOutsideLabourBulkImport = async () => {
    if (outsideLabourImportRows.length === 0) {
      notify.warning('Upload a CSV file with at least one row.');
      return;
    }

    try {
      setIsOutsideLabourImporting(true);
      setOutsideLabourImportError(null);
      const res = await api.bulkOutsideLabour({ outsideLabours: outsideLabourImportRows });
      const skippedMsg = res.skipped > 0 ? ` ${res.skipped} duplicate(s) skipped.` : '';
      const errorMsg = res.errors?.length ? ` ${res.errors.length} row(s) had errors.` : '';
      notify.success(`Imported ${res.added} outside labourer(s).${skippedMsg}${errorMsg}`);
      setIsOutsideLabourImportOpen(false);
      setOutsideLabourImportRows([]);
      fetchOutsideLabours();
    } catch (err: any) {
      const message = err?.message || 'Bulk import failed';
      setOutsideLabourImportError(message);
      notify.error(message);
    } finally {
      setIsOutsideLabourImporting(false);
    }
  };

  const formatCur = (num: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);

  const getDateRange = () => {
    let startDate: Date;
    let endDate: Date;
    if (overviewFilterType === 'weekly') {
      const curr = new Date();
      const dayOffset = curr.getDay();
      const sundayOffset = -dayOffset;
      startDate = new Date(curr.setDate(curr.getDate() + sundayOffset + (selectedWeekOffset * 7)));
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    } else {
      startDate = new Date(selectedYearVal, selectedMonthVal, 1, 0, 0, 0, 0);
      endDate = new Date(selectedYearVal, selectedMonthVal + 1, 0, 23, 59, 59, 999);
    }
    return { startStr: formatLocalDate(startDate), endStr: formatLocalDate(endDate) };
  };

  const handleBulkPayWages = async () => {
    if (selectedWorkersForPayment.length === 0) return;

    try {
      setIsSubmittingPayWages(true);
      const { startStr, endStr } = getDateRange();
      let requestsCreated = 0;

      for (const workerId of selectedWorkersForPayment) {
        const worker = crew.find(c => c.id === workerId);
        if (!worker) continue;

        // Get unpaid logs
        const workerAtt = attendanceLogs.filter(a => {
          const matchesWorker = a.workerName === worker.name;
          const matchesDate = a.date >= startStr && a.date <= endStr;
          const matchesProj = wageProjectFilter === 'All' || a.projectId === wageProjectFilter;
          const matchesTsk = wageTaskFilter === 'All' || a.taskId === wageTaskFilter;
          return matchesWorker && matchesDate && matchesProj && matchesTsk;
        });

        const unpaidLogs = workerAtt.filter(a => !a.paymentStatus || a.paymentStatus === 'Unpaid');

        // Filter based on selectedDayPayments
        const selectedLogs = unpaidLogs.filter(log => {
          return !!selectedDayPayments[log.id];
        });

        if (selectedLogs.length === 0) continue;

        // Group selected logs by project & task
        const logsByGroup: Record<string, { projectId: string; taskId: string; logs: any[] }> = {};
        selectedLogs.forEach(log => {
          const pid = log.projectId || '';
          const tid = log.taskId || '';
          const key = `${pid}_${tid}`;
          if (!logsByGroup[key]) {
            logsByGroup[key] = { projectId: pid, taskId: tid, logs: [] };
          }
          logsByGroup[key].logs.push(log);
        });

        for (const { projectId, taskId, logs: groupLogs } of Object.values(logsByGroup)) {
          const totalAmount = groupLogs.reduce((sum, log) => {
            let rate = 0;
            if (log.status === 'Present') rate = log.dailyWage || worker.dailyWage;
            else if (log.status === 'Half Day') rate = (log.dailyWage || worker.dailyWage) * 0.5;
            return sum + rate + (log.overtimeAmount || 0);
          }, 0);

          // Update logs
          await Promise.all(
            groupLogs.map(log =>
              api.updateAttendance(log.id, {
                workerName: log.workerName,
                status: log.status,
                dailyWage: log.dailyWage,
                overtimeAmount: log.overtimeAmount,
                paymentStatus: 'Pending'
              })
            )
          );

          // Create Payment Request
          await api.createPaymentRequest({
            projectId: wageProjectFilter !== 'All' ? wageProjectFilter : projectId,
            taskId: wageTaskFilter !== 'All' ? wageTaskFilter : taskId,
            payeeName: worker.name,
            category: 'Worker',
            amount: totalAmount,
            description: `Bulk wages payment for ${worker.name} (${overviewFilterType} period)`,
            dueDate: groupLogs[groupLogs.length - 1].date,
            priority: 'Medium',
            paymentMethod: 'Bank Transfer',
            status: 'Pending',
            createdAt: new Date().toISOString(),
            attendanceIds: groupLogs.map(log => log.id)
          });
          requestsCreated++;
        }
      }

      notify.success(`Bulk payment requests initiated: ${requestsCreated} requests created.`);
      setSelectedWorkersForPayment([]);
      fetchOverviewLogs();
    } catch (err: any) {
      notify.error(err?.message || 'Failed to process bulk payment');
    } finally {
      setIsSubmittingPayWages(false);
    }
  };

  const handlePayLedgerDays = async (logIds: string[]) => {
    if (logIds.length === 0) {
      notify.warning('No days selected.');
      return;
    }

    const ok = await confirm({
      title: 'Initiate Payouts?',
      message: `Create consolidated wage payment requests for ${logIds.length} day(s)?`,
      confirmLabel: 'Proceed',
      variant: 'default',
    });
    if (!ok) return;

    try {
      setIsSubmittingPayWages(true);

      const selectedLogs = attendanceLogs.filter(a => logIds.includes(a.id));

      const groups: Record<string, any[]> = {};
      selectedLogs.forEach(log => {
        const key = log.workerName;
        if (!groups[key]) groups[key] = [];
        groups[key].push(log);
      });

      let requestsCreated = 0;
      for (const [workerName, logs] of Object.entries(groups)) {
        const worker = crew.find(c => c.name === workerName);
        const dailyWage = worker?.dailyWage || 200;

        // Group selected logs by project & task
        const logsByGroup: Record<string, { projectId: string; taskId: string; logs: any[] }> = {};
        logs.forEach(log => {
          const pid = log.projectId || '';
          const tid = log.taskId || '';
          const key = `${pid}_${tid}`;
          if (!logsByGroup[key]) {
            logsByGroup[key] = { projectId: pid, taskId: tid, logs: [] };
          }
          logsByGroup[key].logs.push(log);
        });

        for (const { projectId, taskId, logs: groupLogs } of Object.values(logsByGroup)) {
          const totalAmount = groupLogs.reduce((sum, log) => {
            let rate = 0;
            if (log.status === 'Present') rate = log.dailyWage || dailyWage;
            else if (log.status === 'Half Day') rate = (log.dailyWage || dailyWage) * 0.5;
            return sum + rate + (log.overtimeAmount || 0);
          }, 0);

          await Promise.all(
            groupLogs.map(log =>
              api.updateAttendance(log.id, {
                workerName: log.workerName,
                status: log.status,
                dailyWage: log.dailyWage,
                overtimeAmount: log.overtimeAmount,
                paymentStatus: 'Pending'
              })
            )
          );

          await api.createPaymentRequest({
            projectId,
            taskId,
            payeeName: workerName,
            category: 'Worker',
            amount: totalAmount,
            description: `Consolidated wages payout request for ${workerName} (Ledger view: ${groupLogs.length} day(s))`,
            dueDate: groupLogs[groupLogs.length - 1].date,
            priority: 'Medium',
            paymentMethod: 'Bank Transfer',
            status: 'Pending',
            createdAt: new Date().toISOString(),
            attendanceIds: groupLogs.map(log => log.id)
          });
          requestsCreated++;
        }
      }

      notify.success(`Consolidated payment requests created: ${requestsCreated} requests created.`);
      setSelectedLedgerLogs([]);
      fetchOverviewLogs();
    } catch (err: any) {
      notify.error(err?.message || 'Failed to process payments');
    } finally {
      setIsSubmittingPayWages(false);
    }
  };

  const handleUndoPaymentRequest = async (logId: string) => {
    const log = attendanceLogs.find(a => a.id === logId);
    if (!log) return;

    const ok = await confirm({
      title: 'Undo Payment Request?',
      message: `Revert payment status for ${log.workerName} on ${log.date} back to Unpaid? This will update or remove the corresponding finance payment request.`,
      confirmLabel: 'Undo Payout',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      setIsSubmittingPayWages(true);

      const correspondingPr = paymentRequestsLogs.find(pr =>
        pr.attendanceIds && pr.attendanceIds.includes(logId)
      );

      if (correspondingPr) {
        const remainingIds = correspondingPr.attendanceIds.filter((id: string) => id !== logId);

        if (remainingIds.length === 0) {
          await api.deletePaymentRequest(correspondingPr.id);
        } else {
          const worker = crew.find(c => c.name === log.workerName);
          const dailyWageVal = log.dailyWage || worker?.dailyWage || 200;
          let baseWage = 0;
          if (log.status === 'Present') baseWage = dailyWageVal;
          else if (log.status === 'Half Day') baseWage = dailyWageVal * 0.5;
          const totalOwed = baseWage + (log.overtimeAmount || 0);

          const newAmount = Math.max(0, correspondingPr.amount - totalOwed);

          await api.updatePaymentRequest(correspondingPr.id, {
            ...correspondingPr,
            amount: newAmount,
            attendanceIds: remainingIds,
            description: `${correspondingPr.description} (Day ${log.date} removed)`
          });
        }
      }

      await api.updateAttendance(logId, {
        workerName: log.workerName,
        status: log.status,
        dailyWage: log.dailyWage,
        overtimeAmount: log.overtimeAmount,
        paymentStatus: 'Unpaid'
      });

      notify.success('Payment request reverted successfully.');
      fetchOverviewLogs();
    } catch (err: any) {
      notify.error(err?.message || 'Failed to revert payment request');
    } finally {
      setIsSubmittingPayWages(false);
    }
  };

  const handleBulkUndoPaymentRequests = async (logIds: string[]) => {
    if (logIds.length === 0) {
      notify.warning('No days selected.');
      return;
    }

    const ok = await confirm({
      title: 'Undo Multiple Requests?',
      message: `Revert payment status for ${logIds.length} selected day(s) back to Unpaid?`,
      confirmLabel: 'Undo Payouts',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      setIsSubmittingPayWages(true);

      for (const logId of logIds) {
        const log = attendanceLogs.find(a => a.id === logId);
        if (!log) continue;

        const correspondingPr = paymentRequestsLogs.find(pr =>
          pr.attendanceIds && pr.attendanceIds.includes(logId)
        );

        if (correspondingPr) {
          const remainingIds = correspondingPr.attendanceIds.filter((id: string) => id !== logId);

          if (remainingIds.length === 0) {
            await api.deletePaymentRequest(correspondingPr.id);
          } else {
            const worker = crew.find(c => c.name === log.workerName);
            const dailyWageVal = log.dailyWage || worker?.dailyWage || 200;
            let baseWage = 0;
            if (log.status === 'Present') baseWage = dailyWageVal;
            else if (log.status === 'Half Day') baseWage = dailyWageVal * 0.5;
            const totalOwed = baseWage + (log.overtimeAmount || 0);

            const newAmount = Math.max(0, correspondingPr.amount - totalOwed);

            await api.updatePaymentRequest(correspondingPr.id, {
              ...correspondingPr,
              amount: newAmount,
              attendanceIds: remainingIds,
              description: `${correspondingPr.description} (Day ${log.date} removed)`
            });
          }
        }

        await api.updateAttendance(logId, {
          workerName: log.workerName,
          status: log.status,
          dailyWage: log.dailyWage,
          overtimeAmount: log.overtimeAmount,
          paymentStatus: 'Unpaid'
        });
      }

      notify.success(`Reverted payment requests for ${logIds.length} days.`);
      setSelectedLedgerLogs([]);
      fetchOverviewLogs();
    } catch (err: any) {
      notify.error(err?.message || 'Failed to revert payments');
    } finally {
      setIsSubmittingPayWages(false);
    }
  };

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

  const filteredOutsideLabours = outsideLabours.filter(o => {
    const matchesSearch =
      o.name.toLowerCase().includes(outsideLabourSearchQuery.toLowerCase()) ||
      o.trade.toLowerCase().includes(outsideLabourSearchQuery.toLowerCase()) ||
      (o.phone || '').includes(outsideLabourSearchQuery);
    const matchesStatus = outsideLabourStatusFilter === 'All' || o.status === outsideLabourStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeOutsideLabourCount = outsideLabours.filter(o => o.status === 'active').length;

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
          onClick={() => setActiveTab('outside_labours')}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'outside_labours'
            ? 'bg-white text-zinc-950 shadow-sm'
            : 'text-zinc-500 hover:text-zinc-700'
            }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>Outside Labours</span>
          <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-black ${activeTab === 'outside_labours' ? 'bg-zinc-100 text-zinc-700' : 'bg-zinc-200/60 text-zinc-500'
            }`}>{outsideLabours.length}</span>
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
              <Select
                value={statusFilter}
                onChange={(val) => setStatusFilter(val as 'All' | CrewMemberStatus)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs font-semibold text-zinc-700 outline-none"
                options={[
                  { value: 'All', label: 'All Statuses' },
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' }
                ]}
              />
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
                          <Select
                            value={rosterRowsPerPage}
                            onChange={(val) => {
                              setRosterRowsPerPage(Number(val));
                              setRosterPage(1);
                            }}
                            className="bg-white border border-zinc-200 rounded-lg px-2 py-1 text-xs font-semibold text-zinc-700 outline-none"
                            options={[5, 10, 25, 50].map((n) => ({ value: n, label: String(n) }))}
                          />
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
                  <Select
                    value={trade}
                    onChange={(val) => setTrade(val as CrewTrade)}
                    className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl"
                    options={TRADE_OPTIONS.map(t => ({ value: t, label: t }))}
                  />
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
                  <Select
                    value={memberStatus}
                    onChange={(val) => setMemberStatus(val as CrewMemberStatus)}
                    className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl"
                    options={[
                      { value: 'active', label: 'Active' },
                      { value: 'inactive', label: 'Inactive' }
                    ]}
                  />
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
              <Select
                value={vendorStatusFilter}
                onChange={(val) => setVendorStatusFilter(val as 'All' | 'active' | 'inactive')}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs font-semibold text-zinc-700 outline-none"
                options={[
                  { value: 'All', label: 'All Statuses' },
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' }
                ]}
              />
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
            <div className="space-y-4">
              <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-zinc-600 border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 text-zinc-400 uppercase font-bold text-[10px] tracking-wider border-b border-zinc-200">
                        <th className="py-3 px-4">Name</th>
                        <th className="py-3 px-4">Supply / Trade</th>
                        <th className="py-3 px-4">Phone</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4">Notes</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 text-zinc-900">
                      {filteredVendors.map((vend) => (
                        <tr key={vend.id} className="hover:bg-zinc-50/50 transition-colors" style={{ height: ROSTER_ROW_HEIGHT_PX }}>
                          <td className="py-3 px-4 font-bold text-zinc-950 text-sm align-middle">
                            {vend.name}
                          </td>
                          <td className="py-3 px-4 font-semibold text-zinc-700 align-middle">{vend.trade}</td>
                          <td className="py-3 px-4 font-medium text-zinc-600 align-middle">{vend.phone || '—'}</td>
                          <td className="py-3 px-4 text-center align-middle">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight uppercase ${vend.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-zinc-100 text-zinc-500 border border-zinc-200'}`}>
                              {vend.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-zinc-400 italic max-w-[200px] truncate align-middle" title={vend.notes || ''}>
                            {vend.notes ? `"${vend.notes}"` : '—'}
                          </td>
                          <td className="py-3 px-4 text-right align-middle">
                            <div className="flex gap-1.5 justify-end">
                              <button
                                onClick={() => handleOpenEditVendor(vend)}
                                className="p-1.5 bg-zinc-50 border border-zinc-200 text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
                                title="Edit vendor"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleVendorDelete(vend.id)}
                                className="p-1.5 bg-zinc-50 border border-zinc-200 text-rose-500 hover:text-rose-900 rounded-lg hover:bg-rose-50 transition-colors"
                                title="Remove vendor"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
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
                <Select
                  value={vendorStatus}
                  onChange={(val) => setVendorStatus(val as 'active' | 'inactive')}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl"
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' }
                  ]}
                />
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

      {/* ══════════════════════════════════ OUTSIDE LABOURS TAB ══════════════════════════════════ */}
      {activeTab === 'outside_labours' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-zinc-950">Outside Labours Registry</h1>
              <p className="text-xs sm:text-sm text-zinc-500">Manage external labourers and subcontractors paid via Outside Labour category</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setOutsideLabourImportRows([]); setOutsideLabourImportError(null); setIsOutsideLabourImportOpen(true); }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-zinc-200 text-zinc-800 rounded-xl text-xs sm:text-sm font-semibold hover:bg-zinc-50 transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span>Import CSV</span>
              </button>
              <button
                onClick={handleOpenAddOutsideLabour}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-zinc-950 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-zinc-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add Outside Labour</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border rounded-xl p-4 flex flex-col justify-between shadow-sm">
              <span className="text-[10px] text-zinc-400 font-bold uppercase block tracking-wider">Total Outside Labours</span>
              <span className="text-2xl font-black text-zinc-950 block mt-1">{outsideLabours.length}</span>
            </div>
            <div className="bg-white border rounded-xl p-4 flex flex-col justify-between shadow-sm">
              <span className="text-[10px] text-zinc-400 font-bold uppercase block tracking-wider">Active Outside Labours</span>
              <span className="text-2xl font-black text-emerald-700 block mt-1">{activeOutsideLabourCount}</span>
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
                value={outsideLabourSearchQuery}
                onChange={(e) => setOutsideLabourSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none"
              />
            </div>
            <div>
              <Select
                value={outsideLabourStatusFilter}
                onChange={(val) => setOutsideLabourStatusFilter(val as 'All' | 'active' | 'inactive')}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs font-semibold text-zinc-700 outline-none"
                options={[
                  { value: 'All', label: 'All Statuses' },
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' }
                ]}
              />
            </div>
          </div>

          {outsideLaboursLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-zinc-900/10 border-t-zinc-900 rounded-full animate-spin" />
            </div>
          ) : filteredOutsideLabours.length === 0 ? (
            <div className="p-8 border border-dashed rounded-2xl text-center bg-zinc-50">
              <Briefcase className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
              <p className="text-xs text-zinc-500">
                {outsideLabours.length === 0
                  ? 'No outside labours registered yet. Click "Add Outside Labour" to start.'
                  : 'No outside labours match your search.'}
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
                        <th className="py-3 px-4">Trade / Role</th>
                        <th className="py-3 px-4">Phone</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4">Notes</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 text-zinc-900">
                      {filteredOutsideLabours.map((ol) => (
                        <tr key={ol.id} className="hover:bg-zinc-50/50 transition-colors" style={{ height: ROSTER_ROW_HEIGHT_PX }}>
                          <td className="py-3 px-4 font-bold text-zinc-950 text-sm align-middle">
                            {ol.name}
                          </td>
                          <td className="py-3 px-4 font-semibold text-zinc-700 align-middle">{ol.trade}</td>
                          <td className="py-3 px-4 font-medium text-zinc-600 align-middle">{ol.phone || '—'}</td>
                          <td className="py-3 px-4 text-center align-middle">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight uppercase ${ol.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-zinc-100 text-zinc-500 border border-zinc-200'}`}>
                              {ol.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-zinc-400 italic max-w-[200px] truncate align-middle" title={ol.notes || ''}>
                            {ol.notes ? `"${ol.notes}"` : '—'}
                          </td>
                          <td className="py-3 px-4 text-right align-middle">
                            <div className="flex gap-1.5 justify-end">
                              <button
                                onClick={() => handleOpenEditOutsideLabour(ol)}
                                className="p-1.5 bg-zinc-50 border border-zinc-200 text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
                                title="Edit outside labour"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleOutsideLabourDelete(ol.id)}
                                className="p-1.5 bg-zinc-50 border border-zinc-200 text-rose-500 hover:text-rose-900 rounded-lg hover:bg-rose-50 transition-colors"
                                title="Remove outside labour"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Outside Labour Import Modal */}
      {isOutsideLabourImportOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border rounded-2xl p-5 sm:p-6 shadow-md max-w-2xl w-full space-y-4 max-h-[90vh] overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-between border-b pb-3 border-zinc-100">
              <h2 className="text-base font-extrabold text-zinc-950 flex items-center gap-1.5">
                <Upload className="w-5 h-5 text-zinc-600" />
                <span>Bulk Import Outside Labours (CSV)</span>
              </h2>
              <button
                onClick={() => setIsOutsideLabourImportOpen(false)}
                className="px-2.5 py-1.5 bg-zinc-100 font-bold hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-zinc-500">
              CSV columns: <span className="font-semibold text-zinc-700">Name, Trade, Phone, Status, Notes</span>.
              Header row is optional. Status accepts <code className="text-[10px] bg-zinc-100 px-1 rounded">active</code> or <code className="text-[10px] bg-zinc-100 px-1 rounded">inactive</code>.
            </p>

            {outsideLabourImportError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs">{outsideLabourImportError}</div>
            )}

            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 bg-zinc-950 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition-colors">
                <Upload className="w-4 h-4" />
                <span>Choose CSV File</span>
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleOutsideLabourCsvFileSelect} />
              </label>
              <button
                type="button"
                onClick={handleDownloadOutsideLabourTemplate}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download Template</span>
              </button>
            </div>

            {outsideLabourImportRows.length > 0 && (
              <div className="space-y-3">
                <div className="hidden sm:grid bg-zinc-50 p-2.5 border rounded-t-xl font-bold text-[10px] text-zinc-400 uppercase tracking-wider grid-cols-5 gap-2">
                  <div className="col-span-2">Name</div>
                  <div>Trade</div>
                  <div>Phone</div>
                  <div>Status</div>
                </div>
                <div className="border rounded-xl sm:rounded-t-none sm:border-t-0 max-h-[280px] overflow-y-auto divide-y">
                  {outsideLabourImportRows.map((row: CsvOutsideLabourRow, idx: number) => (
                    <div key={idx} className="p-2.5 sm:grid sm:grid-cols-5 gap-2 text-xs items-center">
                      <div className="sm:col-span-2 font-bold text-zinc-900">{row.name}</div>
                      <div className="text-zinc-600">{row.trade}</div>
                      <div className="text-zinc-500 truncate">{row.phone || '—'}</div>
                      <div className="text-zinc-600 capitalize">{row.status}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-400 font-semibold">{outsideLabourImportRows.length} item(s) ready to import. Duplicates will be skipped.</p>
              </div>
            )}

            <button
              onClick={handleOutsideLabourBulkImport}
              disabled={isOutsideLabourImporting || outsideLabourImportRows.length === 0}
              className="w-full py-2.5 bg-zinc-950 hover:bg-zinc-900 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
            >
              <BookmarkCheck className="w-4 h-4" />
              <span>{isOutsideLabourImporting ? 'Importing...' : `Import ${outsideLabourImportRows.length || ''} Outside Labour${outsideLabourImportRows.length === 1 ? '' : 's'}`}</span>
            </button>
          </div>
        </div>
      )}

      {/* Outside Labour Form Modal */}
      {isOutsideLabourFormOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border rounded-2xl p-5 sm:p-6 shadow-md max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-between border-b pb-3 border-zinc-100">
              <h2 className="text-base font-extrabold text-zinc-950">
                {outsideLabourEditId ? 'Edit Outside Labour' : 'Add Outside Labour'}
              </h2>
              <button
                onClick={() => setIsOutsideLabourFormOpen(false)}
                className="px-2.5 py-1.5 bg-zinc-100 font-bold hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
            </div>

            {outsideLabourSubmitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs">{outsideLabourSubmitError}</div>
            )}

            <form onSubmit={handleOutsideLabourSubmit} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Name</label>
                <input
                  type="text"
                  required
                  placeholder="Name of labourer or subcontractor"
                  value={outsideLabourName}
                  onChange={(e) => setOutsideLabourName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Trade / Role</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mason, Welder, Supervisor"
                    value={outsideLabourTrade}
                    onChange={(e) => setOutsideLabourTrade(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Phone</label>
                  <input
                    type="tel"
                    placeholder="Optional"
                    value={outsideLabourPhone}
                    onChange={(e) => setOutsideLabourPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Status</label>
                <Select
                  value={outsideLabourStatus}
                  onChange={(val) => setOutsideLabourStatus(val as 'active' | 'inactive')}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl"
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' }
                  ]}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">Notes</label>
                <textarea
                  value={outsideLabourNotes}
                  onChange={(e) => setOutsideLabourNotes(e.target.value)}
                  rows={2}
                  placeholder="Notes about rates, terms, etc."
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-zinc-950 hover:bg-zinc-900 text-white font-bold rounded-xl transition-colors"
              >
                {outsideLabourEditId ? 'Save Changes' : 'Register Outside Labour'}
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

          {overviewLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-zinc-900/10 border-t-zinc-900 rounded-full animate-spin" />
            </div>
          ) : crew.length === 0 ? (
            <div className="p-8 border border-dashed rounded-2xl text-center bg-zinc-50">
              <Users className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
              <p className="text-xs text-zinc-500">No crew roster matches found. Register workers in Roster first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Workers sidebar - hidden on mobile, shown on lg */}
              <div className="hidden lg:flex lg:col-span-1 bg-white border border-zinc-200/80 rounded-2xl p-4 space-y-4 shadow-sm flex-col lg:self-start">
                <h3 className="font-bold text-zinc-950 text-xs uppercase tracking-wider">Select Crew Worker</h3>
                <button
                  onClick={() => setSelectedWorkerId('all')}
                  className={`w-full text-left p-3 rounded-xl transition-all border text-xs ${selectedWorkerId === 'all'
                    ? 'bg-zinc-950 text-white border-zinc-950 shadow-md font-bold'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-100 hover:border-emerald-200'
                    }`}
                >
                  <span className="block font-bold truncate">Overview of All Workers</span>
                </button>
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
                    // Compute current week matching selectedWeekOffset (Sunday start)
                    const curr = new Date();
                    const dayOffset = curr.getDay(); // 0 (Sun) to 6 (Sat)
                    const sundayOffset = -dayOffset;
                    startDate = new Date(curr.setDate(curr.getDate() + sundayOffset + (selectedWeekOffset * 7)));
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

                  // Compute unpaid workers list for All Workers view
                  const unpaidWorkers = crew.filter(w => {
                    const workerAtt = attendanceLogs.filter(a => {
                      const matchesWorker = a.workerName === w.name;
                      const matchesDate = a.date >= startStr && a.date <= endStr;
                      const matchesProj = wageProjectFilter === 'All' || a.projectId === wageProjectFilter;
                      const matchesTsk = wageTaskFilter === 'All' || a.taskId === wageTaskFilter;
                      return matchesWorker && matchesDate && matchesProj && matchesTsk;
                    });
                    return workerAtt.some(a => !a.paymentStatus || a.paymentStatus === 'Unpaid');
                  });

                  // Filter attendance logs matching this worker & date range
                  const workerAtt = attendanceLogs.filter(a => {
                    const matchesWorker = selectedWorkerId === 'all' ? true : a.workerName === worker.name;
                    const matchesDate = a.date >= startStr && a.date <= endStr;
                    const matchesProj = wageProjectFilter === 'All' || a.projectId === wageProjectFilter;
                    const matchesTsk = wageTaskFilter === 'All' || a.taskId === wageTaskFilter;
                    return matchesWorker && matchesDate && matchesProj && matchesTsk;
                  });

                  const workerPayments = paymentRequestsLogs.filter(pr => {
                    const isWorkerMatch = selectedWorkerId === 'all'
                      ? pr.category === 'Worker'
                      : pr.payeeName.trim().toLowerCase() === worker.name.trim().toLowerCase();
                    if (!isWorkerMatch) return false;

                    const matchesProj = wageProjectFilter === 'All' || pr.projectId === wageProjectFilter;
                    const matchesTsk = wageTaskFilter === 'All' || pr.taskId === wageTaskFilter;
                    if (!matchesProj || !matchesTsk) return false;

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
                      <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm space-y-3">
                        {/* Row 1: Period toggle + time selectors */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="flex items-center gap-1.5 bg-zinc-100 rounded-lg p-0.5 shrink-0">
                            <button
                              onClick={() => setOverviewFilterType('weekly')}
                              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${overviewFilterType === 'weekly' ? 'bg-zinc-950 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                            >
                              Weekly
                            </button>
                            <button
                              onClick={() => setOverviewFilterType('monthly')}
                              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${overviewFilterType === 'monthly' ? 'bg-zinc-950 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                            >
                              Monthly
                            </button>
                          </div>

                          <div className="h-5 w-px bg-zinc-200 hidden sm:block" />

                          {overviewFilterType === 'monthly' ? (
                            <div className="flex items-center gap-2">
                              <Select
                                value={selectedMonthVal}
                                onChange={val => setSelectedMonthVal(Number(val))}
                                className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 outline-none"
                                options={['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, idx) => ({ value: idx, label: m }))}
                              />
                              <Select
                                value={selectedYearVal}
                                onChange={val => setSelectedYearVal(Number(val))}
                                className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 outline-none"
                                options={[2024, 2025, 2026, 2027, 2028].map(y => ({ value: y, label: String(y) }))}
                              />
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setSelectedWeekOffset(prev => prev - 1)}
                                className="px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition-colors"
                              >
                                ← Prev
                              </button>
                              <button
                                onClick={() => setSelectedWeekOffset(0)}
                                className="px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition-colors"
                              >
                                Current
                              </button>
                              <button
                                onClick={() => setSelectedWeekOffset(prev => prev + 1)}
                                className="px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition-colors"
                              >
                                Next →
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Row 2: Project & Task scope + Export actions */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-zinc-100">
                          <div className="flex flex-wrap items-center gap-2">
                            <Select
                              value={wageProjectFilter}
                              onChange={val => {
                                setWageProjectFilter(val);
                                setWageTaskFilter('All');
                              }}
                              className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 outline-none min-w-[140px]"
                              options={[
                                { value: 'All', label: 'All Projects' },
                                ...projects.map(p => ({ value: p.id, label: p.projectName }))
                              ]}
                            />
                            <Select
                              value={wageTaskFilter}
                              onChange={val => setWageTaskFilter(val)}
                              disabled={wageProjectFilter === 'All'}
                              className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 outline-none min-w-[140px] disabled:opacity-40 disabled:cursor-not-allowed"
                              options={[
                                { value: 'All', label: 'All Tasks' },
                                ...tasks
                                  .filter(t => t.projectId === wageProjectFilter)
                                  .map(t => ({ value: t.id, label: t.taskName }))
                              ]}
                            />
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={handleDownloadCsv}
                              className="inline-flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                              <span>CSV</span>
                            </button>
                            <button
                              onClick={handleDownloadPdf}
                              disabled={selectedWorkerId === 'all'}
                              className="inline-flex items-center gap-1 px-3.5 py-2 bg-zinc-950 hover:bg-zinc-900 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
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
                              <span>Full PDF</span>
                            </button>
                          </div>
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

                      {/* Unpaid Workers List for All Workers view */}
                      {selectedWorkerId === 'all' && (
                        <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm space-y-3">
                          <h3 className="text-xs font-bold text-zinc-900 tracking-wider uppercase">Workers with Unpaid Balances</h3>
                          {unpaidWorkers.length === 0 ? (
                            <p className="text-xs text-zinc-500">No workers with unpaid wages in this period.</p>
                          ) : (
                            <div className="border border-zinc-200/80 rounded-xl overflow-hidden">
                              <table className="w-full text-xs text-left text-zinc-600 border-collapse">
                                <thead>
                                  <tr className="bg-zinc-50 text-zinc-400 uppercase font-bold text-[9px] border-b border-zinc-200 h-[36px]">
                                    <th className="py-2.5 px-3">
                                      <input type="checkbox" onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedWorkersForPayment(unpaidWorkers.map(w => w.id));
                                        } else {
                                          setSelectedWorkersForPayment([]);
                                        }
                                      }} />
                                    </th>
                                    <th className="py-2.5 px-3">Worker</th>
                                    <th className="py-2.5 px-3">Trade</th>
                                    <th className="py-2.5 px-3">P/A/H</th>
                                    <th className="py-2.5 px-3 text-right">Amount</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100 text-zinc-900 bg-white">
                                  {(() => {
                                    const limit = unpaidWorkersRowsPerPage;
                                    const totalUnpaidPages = Math.max(1, Math.ceil(unpaidWorkers.length / limit));
                                    const currUnpaidPage = Math.min(unpaidWorkersPage, totalUnpaidPages);
                                    const paginatedUnpaid = unpaidWorkers.slice((currUnpaidPage - 1) * limit, currUnpaidPage * limit);

                                    return paginatedUnpaid.map(w => {
                                      const workerAtt = attendanceLogs.filter(a => {
                                        const matchesWorker = a.workerName === w.name;
                                        const matchesDate = a.date >= startStr && a.date <= endStr;
                                        const matchesProj = wageProjectFilter === 'All' || a.projectId === wageProjectFilter;
                                        const matchesTsk = wageTaskFilter === 'All' || a.taskId === wageTaskFilter;
                                        return matchesWorker && matchesDate && matchesProj && matchesTsk;
                                      });
                                      const unpaidLogs = workerAtt.filter(a => !a.paymentStatus || a.paymentStatus === 'Unpaid');
                                      const present = unpaidLogs.filter(a => a.status === 'Present').length;
                                      const absent = unpaidLogs.filter(a => a.status === 'Absent').length;
                                      const half = unpaidLogs.filter(a => a.status === 'Half Day').length;
                                      const amount = unpaidLogs.reduce((sum, log) => {
                                        let rate = 0;
                                        if (log.status === 'Present') rate = log.dailyWage || w.dailyWage;
                                        else if (log.status === 'Half Day') rate = (log.dailyWage || w.dailyWage) * 0.5;
                                        return sum + rate + (log.overtimeAmount || 0);
                                      }, 0);
                                      return (
                                        <tr key={w.id}>
                                          <td className="py-2.5 px-3">
                                            <input type="checkbox" checked={selectedWorkersForPayment.includes(w.id)} onChange={() => {
                                              setSelectedWorkersForPayment(prev => prev.includes(w.id) ? prev.filter(id => id !== w.id) : [...prev, w.id]);
                                            }} />
                                          </td>
                                          <td className="py-2.5 px-3 font-semibold">{w.name}</td>
                                          <td className="py-2.5 px-3">{w.trade}</td>
                                          <td className="py-2.5 px-3 font-medium text-zinc-600">
                                            {present}P / {absent}A / {half}H
                                          </td>
                                          <td className="py-2.5 px-3 font-bold text-right text-zinc-950">{formatCur(amount)}</td>
                                        </tr>
                                      );
                                    });
                                  })()}
                                </tbody>

                              </table>
                              <div className="p-3 bg-zinc-50 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                                <button className="px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg shadow-sm disabled:opacity-50"
                                  disabled={selectedWorkersForPayment.length === 0 || isSubmittingPayWages}
                                  onClick={() => setIsPayWagesOpen(true)}>
                                  {isSubmittingPayWages ? 'Processing...' : `Pay ${selectedWorkersForPayment.length} Selected Workers`}
                                </button>

                                {(() => {
                                  const limit = unpaidWorkersRowsPerPage;
                                  const totalUnpaidPages = Math.max(1, Math.ceil(unpaidWorkers.length / limit));
                                  const currUnpaidPage = Math.min(unpaidWorkersPage, totalUnpaidPages);

                                  return (
                                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto sm:justify-end">
                                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-semibold">
                                        <span>Rows:</span>
                                        <Select
                                          value={unpaidWorkersRowsPerPage}
                                          onChange={(val) => {
                                            setUnpaidWorkersRowsPerPage(Number(val));
                                            setUnpaidWorkersPage(1);
                                          }}
                                          className="bg-white border rounded px-1.5 py-0.5 outline-none font-bold text-zinc-700"
                                          options={[5, 10, 25, 50].map(val => ({ value: String(val), label: String(val) }))}
                                        />
                                      </div>

                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          disabled={currUnpaidPage <= 1}
                                          onClick={() => setUnpaidWorkersPage(p => Math.max(1, p - 1))}
                                          className="px-2 py-1 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-lg text-[10px] font-semibold text-zinc-650 disabled:opacity-40"
                                        >
                                          Prev
                                        </button>
                                        <span className="text-[10px] font-semibold text-zinc-600 min-w-[48px] text-center">
                                          {currUnpaidPage} / {totalUnpaidPages}
                                        </span>
                                        <button
                                          type="button"
                                          disabled={currUnpaidPage >= totalUnpaidPages}
                                          onClick={() => setUnpaidWorkersPage(p => Math.min(totalUnpaidPages, p + 1))}
                                          className="px-2 py-1 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-lg text-[10px] font-semibold text-zinc-650 disabled:opacity-40"
                                        >
                                          Next
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Attendance Calendar Visualizer */}
                      {selectedWorkerId !== 'all' && (
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
                      )}

                      {/* Wage Payment Requests Table */}
                      <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm space-y-3">
                        <h3 className="text-xs font-bold text-zinc-900 tracking-wider uppercase">Wage Payment Requests</h3>
                        {(() => {
                          const limit = overviewRowsPerPage;
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
                              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-3 py-2 border-t border-zinc-100 bg-zinc-50/50">
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] text-zinc-400 font-bold">
                                    Page {currPage} of {totalPages} ({workerPayments.length} items)
                                  </span>
                                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-semibold">
                                    <span>Rows:</span>
                                    <Select
                                      value={overviewRowsPerPage}
                                      onChange={(val) => {
                                        setOverviewRowsPerPage(Number(val));
                                        setOverviewPage(1);
                                      }}
                                      className="bg-white border rounded px-1.5 py-0.5 outline-none font-bold text-zinc-700"
                                      options={[5, 10, 25, 50].map(val => ({ value: String(val), label: String(val) }))}
                                    />
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={currPage <= 1}
                                    onClick={() => setOverviewPage(p => Math.max(1, p - 1))}
                                    className="px-2 py-1 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-lg text-[10px] font-semibold text-zinc-650 disabled:opacity-40"
                                  >
                                    Prev
                                  </button>
                                  <button
                                    type="button"
                                    disabled={currPage >= totalPages}
                                    onClick={() => setOverviewPage(p => Math.min(totalPages, p + 1))}
                                    className="px-2 py-1 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-lg text-[10px] font-semibold text-zinc-650 disabled:opacity-40"
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
            const worker = selectedWorkerId === 'all'
              ? { id: 'all', name: 'All Workers', trade: 'Other' as CrewTrade, dailyWage: 0, status: 'active' as CrewMemberStatus, createdAt: '' }
              : (crew.find(c => c.id === selectedWorkerId) || crew[0]);
            if (!worker) return null;

            // Date range math
            let startDate: Date;
            let endDate: Date;

            if (overviewFilterType === 'weekly') {
              const curr = new Date();
              const dayOffset = curr.getDay();
              const sundayOffset = -dayOffset;
              startDate = new Date(curr.setDate(curr.getDate() + sundayOffset + (selectedWeekOffset * 7)));
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

            const workersToProcess = selectedWorkerId === 'all'
              ? crew.filter(w => selectedWorkersForPayment.includes(w.id))
              : [crew.find(c => c.id === selectedWorkerId) || crew[0]].filter(Boolean);

            const getWorkerSiteBreakdown = (w: CrewMember) => {
              const workerAtt = attendanceLogs.filter(a => {
                const matchesWorker = a.workerName === w.name;
                const matchesDate = a.date >= startStr && a.date <= endStr;
                const matchesProj = wageProjectFilter === 'All' || a.projectId === wageProjectFilter;
                const matchesTsk = wageTaskFilter === 'All' || a.taskId === wageTaskFilter;
                return matchesWorker && matchesDate && matchesProj && matchesTsk;
              });

              const unpaidLogs = workerAtt.filter(a => !a.paymentStatus || a.paymentStatus === 'Unpaid');

              const groups: Record<string, any[]> = {};
              unpaidLogs.forEach(log => {
                const pid = log.projectId || 'no_project';
                if (!groups[pid]) groups[pid] = [];
                groups[pid].push(log);
              });

              return Object.entries(groups).map(([pid, pLogs]) => {
                const project = projects.find(p => p.id === pid);
                const projectName = project ? project.projectName : (pid === 'no_project' ? 'Unassigned Site' : 'Unknown Site');
                const amt = pLogs.reduce((sum, log) => {
                  let rate = 0;
                  if (log.status === 'Present') rate = log.dailyWage || w.dailyWage;
                  else if (log.status === 'Half Day') rate = (log.dailyWage || w.dailyWage) * 0.5;
                  return sum + rate + (log.overtimeAmount || 0);
                }, 0);

                const present = pLogs.filter(l => l.status === 'Present').length;
                const halfDay = pLogs.filter(l => l.status === 'Half Day').length;
                const absent = pLogs.filter(l => l.status === 'Absent').length;

                return {
                  projectId: pid,
                  projectName,
                  logs: pLogs,
                  amount: amt,
                  present,
                  halfDay,
                  absent
                };
              });
            };

            const processedWorkersData = workersToProcess.map(w => {
              const breakdown = getWorkerSiteBreakdown(w);
              return {
                worker: w,
                breakdown,
                unpaidLogs: breakdown.flatMap(b => b.logs)
              };
            }).filter(item => item.breakdown.length > 0);

            // Compute overall total based on selected checkbox states
            let totalSelectedAmount = 0;
            const finalPaymentsToSubmit: { worker: CrewMember; logs: any[]; amount: number }[] = [];

            processedWorkersData.forEach(({ worker: w, breakdown }) => {
              const workerSelectedLogs: any[] = [];
              let workerSelectedAmount = 0;

              breakdown.forEach(b => {
                const siteSelectedLogs = b.logs.filter(log => !!selectedDayPayments[log.id]);
                if (siteSelectedLogs.length > 0) {
                  const amt = siteSelectedLogs.reduce((sum, log) => {
                    let rate = 0;
                    if (log.status === 'Present') rate = log.dailyWage || w.dailyWage;
                    else if (log.status === 'Half Day') rate = (log.dailyWage || w.dailyWage) * 0.5;
                    return sum + rate + (log.overtimeAmount || 0);
                  }, 0);

                  workerSelectedLogs.push(...siteSelectedLogs);
                  workerSelectedAmount += amt;
                }
              });

              if (workerSelectedLogs.length > 0) {
                totalSelectedAmount += workerSelectedAmount;
                finalPaymentsToSubmit.push({
                  worker: w,
                  logs: workerSelectedLogs,
                  amount: workerSelectedAmount
                });
              }
            });

            return (
              <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-2xl max-w-lg w-full space-y-5 max-h-[90vh] overflow-y-auto animate-fade-in">
                  <div className="flex items-center justify-between border-b pb-3.5 border-zinc-150">
                    <div>
                      <h2 className="text-base font-black text-zinc-950 flex items-center gap-2">
                        <Wallet className="w-5 h-5 text-emerald-600" />
                        <span>Structured Wages Payout</span>
                      </h2>
                      <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mt-0.5">
                        Select Sites & Verify Balances
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPayWagesOpen(false);
                        setPayWagesAmount('');
                      }}
                      className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-xs transition-colors"
                    >
                      Cancel
                    </button>
                  </div>

                  {processedWorkersData.length === 0 ? (
                    <div className="text-center py-6 text-zinc-500 text-xs">
                      No unpaid wages found in this period.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {processedWorkersData.map(({ worker: w, breakdown }) => (
                        <div key={w.id} className="bg-zinc-50/50 border border-zinc-200/80 rounded-2xl p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-extrabold text-zinc-900 text-xs">{w.name}</span>
                              <span className="text-[10px] text-zinc-400 block font-semibold">{w.trade}</span>
                            </div>
                            <span className="text-[10px] font-bold text-zinc-500 bg-white border px-2 py-0.5 rounded-full">
                              ₹{w.dailyWage}/day
                            </span>
                          </div>

                          <div className="space-y-3">
                            {breakdown.map(b => {
                              const allDaysChecked = b.logs.every(log => !!selectedDayPayments[log.id]);
                              const handleToggleAllDays = () => {
                                const newSelection = { ...selectedDayPayments };
                                b.logs.forEach(log => {
                                  newSelection[log.id] = !allDaysChecked;
                                });
                                setSelectedDayPayments(newSelection);
                              };

                              return (
                                <div key={b.projectId} className="bg-white border border-zinc-150 rounded-xl overflow-hidden shadow-sm">
                                  {/* Site Header */}
                                  <div className="flex items-center justify-between p-3 bg-zinc-50 border-b border-zinc-150">
                                    <label className="flex items-center gap-2.5 cursor-pointer select-none flex-1">
                                      <input
                                        type="checkbox"
                                        checked={allDaysChecked}
                                        onChange={handleToggleAllDays}
                                        className="rounded text-zinc-950 focus:ring-zinc-950"
                                      />
                                      <div>
                                        <span className="text-xs font-black text-zinc-900 block">{b.projectName}</span>
                                        <span className="text-[9px] text-zinc-400 font-semibold block uppercase tracking-wider">
                                          {b.present} P • {b.halfDay} H • {b.absent} A Unpaid
                                        </span>
                                      </div>
                                    </label>
                                    <span className="text-xs font-black text-zinc-950 shrink-0">
                                      {formatCur(b.amount)}
                                    </span>
                                  </div>

                                  {/* Indented Days List */}
                                  <div className="divide-y divide-zinc-100 bg-white px-3">
                                    {b.logs.map(log => {
                                      const isDayChecked = !!selectedDayPayments[log.id];

                                      let dayRate = 0;
                                      if (log.status === 'Present') dayRate = log.dailyWage || w.dailyWage;
                                      else if (log.status === 'Half Day') dayRate = (log.dailyWage || w.dailyWage) * 0.5;
                                      const dayTotal = dayRate + (log.overtimeAmount || 0);

                                      let badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                                      if (log.status === 'Half Day') badgeColor = 'bg-blue-50 text-blue-700 border-blue-100';
                                      else if (log.status === 'Absent') badgeColor = 'bg-rose-50 text-rose-700 border-rose-100';

                                      return (
                                        <div key={log.id} className="flex items-center justify-between py-2 hover:bg-zinc-50/50 transition-colors">
                                          <label className="flex items-center gap-2.5 cursor-pointer select-none flex-1">
                                            <input
                                              type="checkbox"
                                              checked={isDayChecked}
                                              onChange={() => {
                                                setSelectedDayPayments(prev => ({
                                                  ...prev,
                                                  [log.id]: !prev[log.id]
                                                }));
                                              }}
                                              className="rounded text-zinc-950 focus:ring-zinc-950 w-3.5 h-3.5"
                                            />
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs font-semibold text-zinc-700">{log.date}</span>
                                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase border ${badgeColor}`}>
                                                {log.status === 'Present' ? 'Full' : log.status === 'Half Day' ? 'Half' : 'Absent'}
                                              </span>
                                            </div>
                                          </label>
                                          <div className="text-right shrink-0">
                                            <span className="text-xs font-extrabold text-zinc-900 block">{formatCur(dayTotal)}</span>
                                            {(log.overtimeAmount || 0) > 0 && (
                                              <span className="text-[8px] text-zinc-400 font-bold block">
                                                OT: +{formatCur(log.overtimeAmount)}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      {selectedWorkerId !== 'all' && (
                        <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Project Scope</label>
                              <Select
                                value={payWagesProjectId}
                                onChange={(val) => {
                                  setPayWagesProjectId(val);
                                  setPayWagesTaskId('');
                                }}
                                className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-955 text-xs focus:ring-1 focus:ring-zinc-950 outline-none"
                                options={[
                                  { value: '', label: '-- Consolidate to Site --' },
                                  ...projects.map(p => ({ value: p.id, label: p.projectName }))
                                ]}
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Task Scope</label>
                              <Select
                                value={payWagesTaskId}
                                onChange={(val) => setPayWagesTaskId(val)}
                                disabled={!payWagesProjectId}
                                className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-955 text-xs focus:ring-1 focus:ring-zinc-955 outline-none disabled:bg-zinc-50 disabled:text-zinc-400"
                                options={[
                                  { value: '', label: '-- Consolidate to Task --' },
                                  ...tasks
                                    .filter(t => t.projectId === payWagesProjectId)
                                    .map(t => ({ value: t.id, label: t.taskName }))
                                ]}
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                              Payment Request Amount (₹)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={totalSelectedAmount}
                              placeholder={`Default: ₹${totalSelectedAmount}`}
                              value={payWagesAmount}
                              onChange={(e) => setPayWagesAmount(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-zinc-350 rounded-xl text-zinc-950 font-black text-sm"
                            />
                            <span className="text-[9px] text-zinc-400 font-semibold block mt-1">
                              Leave blank to request the selected total of {formatCur(totalSelectedAmount)}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="bg-zinc-50 border p-4 rounded-2xl flex justify-between items-center">
                        <div>
                          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Total Selected Wages</span>
                          <span className="text-base font-black text-emerald-600 block mt-0.5">{formatCur(totalSelectedAmount)}</span>
                        </div>
                        <button
                          type="button"
                          disabled={isSubmittingPayWages || totalSelectedAmount <= 0}
                          onClick={() => {
                            if (selectedWorkerId === 'all') {
                              handleBulkPayWages();
                            } else {
                              const singleData = processedWorkersData[0];
                              if (singleData) {
                                handleRequestWagesPayment(singleData.worker, singleData.unpaidLogs, totalSelectedAmount);
                              }
                            }
                          }}
                          className="px-5 py-2.5 bg-zinc-950 hover:bg-zinc-900 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center gap-1.5"
                        >
                          <BookmarkCheck className="w-4 h-4" />
                          <span>{isSubmittingPayWages ? 'Processing...' : 'Confirm Payout'}</span>
                        </button>
                      </div>
                    </div>
                  )}
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
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${log.status === 'Present' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
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
                                  <span className={`font-extrabold normal-case ${log.paymentStatus === 'Paid' ? 'text-emerald-700' :
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
                <DatePicker
                  value={pdfStartDate}
                  onChange={(val) => setPdfStartDate(val)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 font-bold text-sm outline-none focus:ring-1 focus:ring-zinc-950"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">End Date</label>
                <DatePicker
                  value={pdfEndDate}
                  onChange={(val) => setPdfEndDate(val)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-zinc-950 font-bold text-sm outline-none focus:ring-1 focus:ring-zinc-950"
                />
              </div>
            </div>

            <div className="flex gap-3">
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
