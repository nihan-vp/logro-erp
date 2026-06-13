import React, { useState, useEffect } from 'react';
import {
  Plus, Search, Trash2, Edit2, Users, X, Phone, Briefcase, Upload, Download, BookmarkCheck, Store
} from 'lucide-react';
import { api } from '../api/client';
import { CrewMember, CrewTrade, CrewMemberStatus } from '../types';
import { notify } from '../utils/toast';
import { useConfirm } from '../context/ConfirmContext';

const TRADE_OPTIONS: CrewTrade[] = ['Mason', 'Electrician', 'Plumber', 'Carpenter', 'Helper', 'Supervisor', 'Other'];

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
  const [activeTab, setActiveTab] = useState<'crew' | 'vendors'>('crew');

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

  useEffect(() => {
    fetchCrew();
    fetchVendors();
  }, []);

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

  const noModalsOpen = !isFormOpen && !isImportOpen && !isVendorFormOpen && !isVendorImportOpen;

  return (
    <div className="space-y-6 font-sans">
      {/* ── Tab Bar ── */}
      {noModalsOpen && (
        <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('crew')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'crew'
                ? 'bg-white text-zinc-950 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Crew Roster</span>
            <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-black ${
              activeTab === 'crew' ? 'bg-zinc-100 text-zinc-700' : 'bg-zinc-200/60 text-zinc-500'
            }`}>{crew.length}</span>
          </button>
          <button
            onClick={() => setActiveTab('vendors')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'vendors'
                ? 'bg-white text-zinc-950 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Vendors</span>
            <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-black ${
              activeTab === 'vendors' ? 'bg-zinc-100 text-zinc-700' : 'bg-zinc-200/60 text-zinc-500'
            }`}>{vendors.length}</span>
          </button>
        </div>
      )}

      {/* ══════════════════════════════════ CREW TAB ══════════════════════════════════ */}
      {activeTab === 'crew' && noModalsOpen && (
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
            <div className="space-y-2.5">
              {filteredCrew.map((member) => (
                <div
                  key={member.id}
                  className="bg-white border rounded-xl p-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold tracking-tight uppercase ${
                        member.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'
                      }`}>
                        {member.status}
                      </span>
                      <h4 className="text-sm font-extrabold text-zinc-950">{member.name}</h4>
                    </div>
                    <p className="text-[10px] text-zinc-400 font-semibold mt-1 flex items-center gap-2">
                      <Briefcase className="w-3 h-3" />
                      <span>{member.trade}</span>
                      <span>•</span>
                      <span>{formatCur(member.dailyWage)}/day</span>
                      {member.phone && (
                        <>
                          <span>•</span>
                          <Phone className="w-3 h-3" />
                          <span>{member.phone}</span>
                        </>
                      )}
                    </p>
                    {member.notes && (
                      <p className="text-[11px] text-zinc-400 mt-1 italic">&quot;{member.notes}&quot;</p>
                    )}
                  </div>

                  <div className="flex gap-1.5 justify-end">
                    <button
                      onClick={() => handleOpenEdit(member)}
                      className="p-1.5 bg-zinc-50 border text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
                      title="Edit crew member"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(member.id)}
                      className="p-1.5 bg-zinc-50 border text-rose-500 hover:text-rose-900 rounded-lg hover:bg-rose-50 transition-colors"
                      title="Remove crew member"
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

      {/* Crew Import Modal */}
      {isImportOpen && (
        <div className="bg-white border rounded-2xl p-5 sm:p-6 shadow-md max-w-2xl mx-auto space-y-4">
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
      )}

      {/* Crew Form Modal */}
      {isFormOpen && (
        <div className="bg-white border rounded-2xl p-5 sm:p-6 shadow-md max-w-md mx-auto space-y-4">
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
      )}

      {/* ══════════════════════════════════ VENDORS TAB ══════════════════════════════════ */}
      {activeTab === 'vendors' && noModalsOpen && (
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
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold tracking-tight uppercase ${
                        vend.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'
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
        <div className="bg-white border rounded-2xl p-5 sm:p-6 shadow-md max-w-2xl mx-auto space-y-4">
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
      )}

      {/* Vendor Form Modal */}
      {isVendorFormOpen && (
        <div className="bg-white border rounded-2xl p-5 sm:p-6 shadow-md max-w-md mx-auto space-y-4">
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
      )}
    </div>
  );
}
