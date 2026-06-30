import React, { useEffect, useState, useMemo } from 'react';
import { 
  Building2, Plus, Play, Pause, Calendar, X, Search, Filter, 
  Sparkles, Clock, AlertTriangle, ShieldCheck, ShieldAlert, CheckCircle2,
  ChevronRight, ArrowUpRight, Globe, Database, UserCheck, RefreshCw,
  Users, UserPlus, Trash2, Key, Mail, Phone, ChevronLeft
} from 'lucide-react';
import { api } from '../api/client';
import { notify } from '../utils/toast';
import { useConfirm } from '../context/ConfirmContext';
import BackupSection from '../components/BackupSection';
import DatePicker from '../components/DatePicker';
import Select from '../components/Select';

export default function SuperadminDashboard() {
  const confirm = useConfirm();
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'trial' | 'suspended'>('all');
  const [activeTab, setActiveTab] = useState<'tenants' | 'backups'>('tenants');
  const [storageMap, setStorageMap] = useState<Record<string, { totalBytes: number; dataBytes: number; objects: number }>>({});

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyStatus, setNewCompanyStatus] = useState<'active' | 'trial' | 'suspended'>('active');
  const [newCompanyDurationValue, setNewCompanyDurationValue] = useState<string>('12'); // in months or days
  const [newCompanyCustomDate, setNewCompanyCustomDate] = useState<string>(''); // custom exact date
  const [useCustomDate, setUseCustomDate] = useState(false);
  const [trialUnit, setTrialUnit] = useState<'minutes' | 'hours' | 'days'>('days');
  const [extensionMode, setExtensionMode] = useState<'extend' | 'edit'>('extend');
  const [editExpiryDate, setEditExpiryDate] = useState<string>('');

  // Extend subscription state
  const [extendCompany, setExtendCompany] = useState<any | null>(null);
  const [extendCompanyStatus, setExtendCompanyStatus] = useState<'active' | 'trial' | 'suspended'>('active');
  const [extendTrialUnit, setExtendTrialUnit] = useState<'minutes' | 'hours' | 'days'>('days');
  const [extendTrialDurationValue, setExtendTrialDurationValue] = useState<string>('30');
  const [extendMonthsValue, setExtendMonthsValue] = useState<string>('1');
  const [customExtendMonths, setCustomExtendMonths] = useState(false);

  // Tenant user management state
  const [selectedUserCompany, setSelectedUserCompany] = useState<any | null>(null);
  const [tenantUsers, setTenantUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAddUserForm, setShowAddUserForm] = useState(false);

  // New user form state
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'accountant' | 'manager'>('admin');
  const [newUserPhone, setNewUserPhone] = useState('');

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const res = await api.getSuperadminCompanies();
      setCompanies(res || []);
    } catch (err: any) {
      notify.error(err.message || 'Failed to fetch companies');
    } finally {
      setLoading(false);
    }
  };

  const fetchStorage = async () => {
    try {
      const res = await api.getTenantStorage();
      const map: Record<string, { totalBytes: number; dataBytes: number; objects: number }> = {};
      (res || []).forEach((s: any) => {
        map[s.companyName] = { totalBytes: s.totalBytes, dataBytes: s.dataBytes, objects: s.objects };
      });
      setStorageMap(map);
    } catch {
      // Storage fetch is non-critical, silently ignore
    }
  };

  useEffect(() => {
    fetchCompanies();
    fetchStorage();
  }, []);


  // Compute metrics for stats cards
  const stats = useMemo(() => {
    const total = companies.length;
    const active = companies.filter(c => c.status === 'active').length;
    const trial = companies.filter(c => c.status === 'trial').length;
    const suspended = companies.filter(c => c.status === 'suspended').length;
    
    // Check if any company's subscription is expiring in the next 30 days
    const expiringSoon = companies.filter(c => {
      if (c.status !== 'active' || !c.validUntil) return false;
      const validDate = new Date(c.validUntil);
      const now = new Date();
      const diffTime = validDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 && diffDays <= 30;
    }).length;

    return { total, active, trial, suspended, expiringSoon };
  }, [companies]);

  // Handle creating a new company
  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) {
      notify.error('Company name is required');
      return;
    }

    try {
      let trialUntil: string | null = null;
      let validUntil: string | null = null;

      if (newCompanyStatus === 'trial') {
        if (useCustomDate && newCompanyCustomDate) {
          trialUntil = new Date(newCompanyCustomDate).toISOString();
        } else {
          const trialVal = Number(newCompanyDurationValue) || 30;
          const date = new Date();
          if (trialUnit === 'minutes') {
            date.setMinutes(date.getMinutes() + trialVal);
          } else if (trialUnit === 'hours') {
            date.setHours(date.getHours() + trialVal);
          } else {
            date.setDate(date.getDate() + trialVal);
          }
          trialUntil = date.toISOString();
        }
      } else if (newCompanyStatus === 'active') {
        if (useCustomDate && newCompanyCustomDate) {
          validUntil = new Date(newCompanyCustomDate).toISOString();
        } else if (newCompanyDurationValue !== 'lifetime') {
          const date = new Date();
          date.setMonth(date.getMonth() + (Number(newCompanyDurationValue) || 12));
          validUntil = date.toISOString();
        }
      }

      await api.createCompany({ 
        companyName: newCompanyName.trim(), 
        status: newCompanyStatus,
        trialUntil,
        validUntil
      });

      notify.success(`Company "${newCompanyName}" registered successfully`);
      setShowAddModal(false);
      resetAddForm();
      fetchCompanies();
    } catch (err: any) {
      notify.error(err.message || 'Failed to create company');
    }
  };

  const resetAddForm = () => {
    setNewCompanyName('');
    setNewCompanyStatus('active');
    setNewCompanyDurationValue('12');
    setNewCompanyCustomDate('');
    setUseCustomDate(false);
    setTrialUnit('days');
  };

  // Toggle company status (Suspend / Activate) with safety checks
  const handleToggleStatus = async (company: any) => {
    const isActivating = company.status !== 'active';
    const ok = await confirm({
      title: isActivating ? 'Activate Company?' : 'Suspend Company?',
      message: isActivating 
        ? `Are you sure you want to activate ${company.companyName}? Users from this company will immediately be permitted to log back into the system.`
        : `Are you sure you want to suspend ${company.companyName}? All workspace applications, database operations, and users belonging to this tenant will be locked out immediately.`,
      confirmLabel: isActivating ? 'Activate Tenant' : 'Suspend Tenant',
      variant: isActivating ? 'default' : 'danger',
    });
    
    if (!ok) return;

    try {
      const targetStatus = isActivating ? 'active' : 'suspended';
      await api.updateCompanyStatus(company._id, targetStatus);
      notify.success(`Company status successfully updated to ${targetStatus}`);
      fetchCompanies();
    } catch (err: any) {
      notify.error(err.message || 'Failed to update company status');
    }
  };

  // Extend subscription API call
  const handleApplyExtension = async () => {
    if (!extendCompany) return;
    
    try {
      // 1. Update status if changed
      if (extendCompanyStatus !== extendCompany.status) {
        await api.updateCompanyStatus(extendCompany._id, extendCompanyStatus);
      }

      // 2. Compute validity dates based on selected status
      let validUntil: string | null | undefined = undefined;
      let trialUntil: string | null | undefined = undefined;

      if (extendCompanyStatus === 'suspended') {
        // Suspended doesn't modify validity date by default
      } else if (extendCompanyStatus === 'trial') {
        // If changing status to trial (or extending trial), clear validUntil
        validUntil = null;
        if (extensionMode === 'edit') {
          trialUntil = editExpiryDate ? new Date(editExpiryDate).toISOString() : null;
        } else {
          const trialVal = Number(extendTrialDurationValue) || 30;
          const date = new Date();
          if (extendTrialUnit === 'minutes') {
            date.setMinutes(date.getMinutes() + trialVal);
          } else if (extendTrialUnit === 'hours') {
            date.setHours(date.getHours() + trialVal);
          } else {
            date.setDate(date.getDate() + trialVal);
          }
          trialUntil = date.toISOString();
        }
      } else if (extendCompanyStatus === 'active') {
        // If changing status to active, clear trialUntil
        trialUntil = null;
        if (extensionMode === 'edit') {
          validUntil = editExpiryDate ? new Date(editExpiryDate).toISOString() : null;
        } else {
          const months = Number(extendMonthsValue);
          if (isNaN(months) || months <= 0) {
            notify.error('Please specify a valid number of months');
            return;
          }

          // Compute extension starting from existing date (if valid and in future) or now
          let baseDate = extendCompany.validUntil ? new Date(extendCompany.validUntil) : new Date();
          if (baseDate < new Date()) baseDate = new Date();
          baseDate.setMonth(baseDate.getMonth() + months);
          validUntil = baseDate.toISOString();
        }
      }

      // 3. Save validity details if not suspended (or even if suspended, if desired)
      if (extendCompanyStatus !== 'suspended') {
        await api.updateCompanyValidity(extendCompany._id, { validUntil, trialUntil });
      }

      notify.success(`Company plan & validity successfully updated`);
      setExtendCompany(null);
      setExtendMonthsValue('1');
      setCustomExtendMonths(false);
      setExtensionMode('extend');
      setEditExpiryDate('');
      fetchCompanies();
    } catch (err: any) {
      notify.error(err.message || 'Failed to update validity');
    }
  };

  const handleGenerateKey = async () => {
    if (!extendCompany) return;
    
    try {
      let status = extendCompanyStatus;
      let durationValue = 12;
      let durationUnit = 'months';

      if (status === 'trial') {
        if (extensionMode === 'edit') {
          if (editExpiryDate) {
            const diffMs = new Date(editExpiryDate).getTime() - Date.now();
            durationValue = Math.max(1, Math.ceil(diffMs / (60 * 1000)));
            durationUnit = 'minutes';
          } else {
            durationValue = 14;
            durationUnit = 'days';
          }
        } else {
          durationValue = Number(extendTrialDurationValue) || 30;
          durationUnit = extendTrialUnit;
        }
      } else if (status === 'active') {
        if (extensionMode === 'edit') {
          if (editExpiryDate) {
            const diffMs = new Date(editExpiryDate).getTime() - Date.now();
            durationValue = Math.max(1, Math.ceil(diffMs / (30 * 24 * 60 * 60 * 1000)));
            durationUnit = 'months';
          } else {
            durationValue = 9999;
            durationUnit = 'lifetime';
          }
        } else {
          durationValue = Number(extendMonthsValue) || 12;
          durationUnit = 'months';
        }
      }

      const res = await api.generateProductKey(extendCompany._id, {
        status,
        durationValue,
        durationUnit
      });

      const generatedKey = res.activationKey?.key || 'Failed to generate key';
      notify.success(`Product key generated successfully!`);
      
      // Copy to clipboard automatically
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(generatedKey);
        notify.success('Key copied to clipboard!');
      }

      setExtendCompany(null);
      setExtendMonthsValue('1');
      setCustomExtendMonths(false);
      setExtensionMode('extend');
      setEditExpiryDate('');
      fetchCompanies();
    } catch (err: any) {
      notify.error(err.message || 'Failed to generate product key');
    }
  };

  // Tenant User Management Calls
  const fetchTenantUsers = async (companyName: string) => {
    try {
      setLoadingUsers(true);
      const res = await api.getTenantUsers(companyName);
      setTenantUsers(res || []);
    } catch (err: any) {
      notify.error(err.message || 'Failed to fetch users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleOpenUserManagement = (company: any) => {
    setSelectedUserCompany(company);
    setShowAddUserForm(false);
    resetNewUserForm();
    fetchTenantUsers(company.companyName);
  };

  const resetNewUserForm = () => {
    setNewUserName('');
    setNewUserEmail('');
    setNewUserPassword('');
    setNewUserRole('admin');
    setNewUserPhone('');
  };

  const handleCreateTenantUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserCompany) return;
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      notify.error('All fields marked as required must be filled');
      return;
    }

    try {
      await api.createTenantUser(selectedUserCompany.companyName, {
        name: newUserName.trim(),
        email: newUserEmail.trim(),
        password: newUserPassword.trim(),
        role: newUserRole,
        phone: newUserPhone.trim()
      });
      notify.success(`User "${newUserName}" created successfully in "${selectedUserCompany.companyName}"`);
      setShowAddUserForm(false);
      resetNewUserForm();
      fetchTenantUsers(selectedUserCompany.companyName);
    } catch (err: any) {
      notify.error(err.message || 'Failed to create tenant user');
    }
  };

  const handleToggleTenantUserStatus = async (user: any) => {
    if (!selectedUserCompany) return;
    const isDeactivating = user.status === 'active';
    const ok = await confirm({
      title: isDeactivating ? 'Deactivate User?' : 'Activate User?',
      message: `Are you sure you want to ${isDeactivating ? 'deactivate' : 'activate'} user ${user.name}? This will affect their ability to log in.`,
      confirmLabel: isDeactivating ? 'Deactivate' : 'Activate',
      variant: isDeactivating ? 'danger' : 'default',
    });
    if (!ok) return;

    try {
      const newStatus = isDeactivating ? 'inactive' : 'active';
      await api.toggleTenantUserStatus(selectedUserCompany.companyName, user.id, newStatus);
      notify.success(`User status successfully set to ${newStatus}`);
      fetchTenantUsers(selectedUserCompany.companyName);
    } catch (err: any) {
      notify.error(err.message || 'Failed to toggle status');
    }
  };

  const handleDeleteTenantUser = async (user: any) => {
    if (!selectedUserCompany) return;
    const ok = await confirm({
      title: 'Delete User?',
      message: `Are you sure you want to permanently delete user ${user.name}? This user will be completely purged from the company database.`,
      confirmLabel: 'Delete User',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await api.deleteTenantUser(selectedUserCompany.companyName, user.id);
      notify.success(`User successfully deleted`);
      fetchTenantUsers(selectedUserCompany.companyName);
    } catch (err: any) {
      notify.error(err.message || 'Failed to delete user');
    }
  };

  // Calculated date previews
  const computedAddExpiryPreview = useMemo(() => {
    if (newCompanyStatus === 'suspended') return 'None (Access Blocked)';
    
    if (useCustomDate) {
      if (!newCompanyCustomDate) return 'Please pick a date';
      return new Date(newCompanyCustomDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    }

    if (newCompanyStatus === 'active' && newCompanyDurationValue === 'lifetime') {
      return 'Lifetime Access (No Expiry)';
    }

    const date = new Date();
    const val = Number(newCompanyDurationValue) || 0;
    if (newCompanyStatus === 'trial') {
      if (trialUnit === 'minutes') {
        date.setMinutes(date.getMinutes() + val);
        return `Trial expires on: ${date.toLocaleString()} (${val} minutes)`;
      } else if (trialUnit === 'hours') {
        date.setHours(date.getHours() + val);
        return `Trial expires on: ${date.toLocaleString()} (${val} hours)`;
      } else {
        date.setDate(date.getDate() + val);
        return `Trial expires on: ${date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} (${val} days)`;
      }
    } else {
      date.setMonth(date.getMonth() + val);
      return `Subscription valid until: ${date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} (${val} months)`;
    }
  }, [newCompanyStatus, newCompanyDurationValue, newCompanyCustomDate, useCustomDate, trialUnit]);

  const computedExtendExpiryPreview = useMemo(() => {
    if (!extendCompany) return null;
    const baseDate = extendCompany.validUntil ? new Date(extendCompany.validUntil) : new Date();
    const startFrom = baseDate < new Date() ? new Date() : baseDate;
    
    const months = Number(extendMonthsValue) || 0;
    startFrom.setMonth(startFrom.getMonth() + months);
    return startFrom.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }, [extendCompany, extendMonthsValue]);

  const computedExtendTrialExpiryPreview = useMemo(() => {
    if (!extendCompany) return null;
    const date = new Date();
    const val = Number(extendTrialDurationValue) || 0;
    if (extendTrialUnit === 'minutes') {
      date.setMinutes(date.getMinutes() + val);
      return `${date.toLocaleString()} (${val} minutes)`;
    } else if (extendTrialUnit === 'hours') {
      date.setHours(date.getHours() + val);
      return `${date.toLocaleString()} (${val} hours)`;
    } else {
      date.setDate(date.getDate() + val);
      return `${date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} (${val} days)`;
    }
  }, [extendCompany, extendTrialDurationValue, extendTrialUnit]);

  // Filter and search logic
  const filteredCompanies = useMemo(() => {
    return companies.filter(c => {
      const matchesSearch = c.companyName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (c.dbName && c.dbName.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesStatus = statusFilter === 'all' ? true : c.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [companies, searchQuery, statusFilter]);

  // Helper to determine expiry warning state
  const getExpiryDetails = (company: any) => {
    if (company.status === 'suspended') {
      return { label: 'Suspended', style: 'text-rose-600 bg-rose-50 border-rose-100', isWarning: true };
    }
    
    if (company.status === 'trial') {
      if (!company.trialUntil) {
        return { label: 'Trial active (No expiry set)', style: 'text-amber-600 bg-amber-50 border-amber-100', isWarning: false };
      }
      const trialDate = new Date(company.trialUntil);
      const now = new Date();
      if (trialDate < now) {
        return { label: 'Trial Expired', style: 'text-rose-600 bg-rose-50 border-rose-200 font-bold', isWarning: true };
      }
      const diffTime = trialDate.getTime() - now.getTime();
      if (diffTime < 60 * 1000) {
        return { label: 'Trial: <1 min remaining', style: 'text-amber-700 bg-amber-50 border-amber-200 animate-pulse font-semibold', isWarning: true };
      }
      if (diffTime < 60 * 60 * 1000) {
        const mins = Math.ceil(diffTime / (60 * 1000));
        return { label: `Trial: ${mins} min${mins > 1 ? 's' : ''} remaining`, style: 'text-amber-700 bg-amber-50 border-amber-200 animate-pulse font-semibold', isWarning: true };
      }
      if (diffTime < 24 * 60 * 60 * 1000) {
        const hrs = Math.ceil(diffTime / (60 * 60 * 1000));
        return { label: `Trial: ${hrs} hr${hrs > 1 ? 's' : ''} remaining`, style: 'text-amber-700 bg-amber-50 border-amber-200 animate-pulse font-semibold', isWarning: true };
      }
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return { 
        label: `Trial: ${diffDays} day${diffDays > 1 ? 's' : ''} remaining`, 
        style: diffDays <= 7 ? 'text-amber-700 bg-amber-50 border-amber-200 animate-pulse font-semibold' : 'text-amber-600 bg-amber-50 border-amber-100', 
        isWarning: diffDays <= 7 
      };
    }

    if (!company.validUntil) {
      return { label: 'Lifetime Access', style: 'text-emerald-700 bg-emerald-50 border-emerald-100 font-semibold', isWarning: false };
    }

    const validDate = new Date(company.validUntil);
    const now = new Date();
    if (validDate < now) {
      return { label: 'Expired', style: 'text-rose-600 bg-rose-50 border-rose-200 font-bold', isWarning: true };
    }
    
    const diffTime = validDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 30) {
      return { 
        label: `Expiring in ${diffDays} day${diffDays > 1 ? 's' : ''}`, 
        style: 'text-amber-700 bg-amber-50 border-amber-200 animate-pulse font-semibold', 
        isWarning: true 
      };
    }

    return { 
      label: `Valid until ${validDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`, 
      style: 'text-zinc-650 bg-zinc-50 border-zinc-150', 
      isWarning: false 
    };
  };

  return (
    <div className="space-y-6 font-sans select-none pb-12">
      {/* Top Banner Info */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-950 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border border-zinc-700">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-zinc-750 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-widest text-zinc-300 border border-zinc-700/60 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              SYSTEM ADMINISTRATOR PORTAL
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Construct ERP Registry</h1>
          <p className="text-xs text-zinc-300 max-w-md mt-1">
            Oversee corporate databases, track valid licensing agreements, extend contracts, and register new company tenants.
          </p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={fetchCompanies}
            className="p-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-755 rounded-xl transition-all text-zinc-300 active:scale-95 focus:outline-none"
            title="Refresh Registry Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          
          <button 
            onClick={() => { resetAddForm(); setShowAddModal(true); }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-zinc-100 text-zinc-950 rounded-xl text-xs font-black shadow-lg shadow-black/10 active:scale-95 transition-all cursor-pointer border border-transparent"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            Register Tenant
          </button>
        </div>
      </div>

      {/* KPI Stats widgets */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Tenants */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-4.5 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Total Tenants</span>
            <span className="p-1.5 rounded-xl bg-zinc-50 border border-zinc-100 text-zinc-600">
              <Building2 className="w-4 h-4" />
            </span>
          </div>
          <div>
            <span className="text-3xl font-black text-zinc-950 block leading-none">{stats.total}</span>
            <span className="text-[10px] text-zinc-400 font-semibold block mt-1">Databases deployed</span>
          </div>
        </div>

        {/* Active Subscriptions */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-4.5 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider font-bold">Active Licenses</span>
            <span className="p-1.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div>
            <span className="text-3xl font-black text-emerald-600 block leading-none">{stats.active}</span>
            <span className="text-[10px] text-zinc-400 font-semibold block mt-1">Full access enabled</span>
          </div>
        </div>

        {/* Trials */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-4.5 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider font-bold">Trial Accounts</span>
            <span className="p-1.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div>
            <span className="text-3xl font-black text-amber-600 block leading-none">{stats.trial}</span>
            <span className="text-[10px] text-zinc-400 font-semibold block mt-1">Evaluation periods</span>
          </div>
        </div>

        {/* Suspended */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-4.5 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider font-bold">Suspended</span>
            <span className="p-1.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
              <ShieldAlert className="w-4 h-4" />
            </span>
          </div>
          <div>
            <span className="text-3xl font-black text-rose-600 block leading-none">{stats.suspended}</span>
            <span className="text-[10px] text-zinc-400 font-semibold block mt-1">Tenant systems locked</span>
          </div>
        </div>

        {/* Expiring Soon Alerts */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-4.5 shadow-sm flex flex-col justify-between col-span-2 lg:col-span-1">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider font-bold">Expiring Soon</span>
            <span className={`p-1.5 rounded-xl border ${stats.expiringSoon > 0 ? 'bg-amber-100 text-amber-700 border-amber-200 animate-pulse' : 'bg-zinc-50 text-zinc-400 border-zinc-100'}`}>
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <div>
            <span className={`text-3xl font-black block leading-none ${stats.expiringSoon > 0 ? 'text-amber-600' : 'text-zinc-950'}`}>{stats.expiringSoon}</span>
            <span className="text-[10px] text-zinc-400 font-semibold block mt-1">Contracts expiring &lt;30d</span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-zinc-200 gap-6 mb-4">
        <button
          onClick={() => setActiveTab('tenants')}
          className={`pb-3 text-xs font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === 'tenants' ? 'border-zinc-950 text-zinc-950' : 'border-transparent text-zinc-400 hover:text-zinc-650'
          }`}
        >
          Tenant Databases
        </button>
        <button
          onClick={() => setActiveTab('backups')}
          className={`pb-3 text-xs font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === 'backups' ? 'border-zinc-950 text-zinc-950' : 'border-transparent text-zinc-400 hover:text-zinc-650'
          }`}
        >
          Database Backups
        </button>
      </div>

      {activeTab === 'tenants' ? (
        <>
          {/* Toolbar / Filters */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-3">
            <div className="relative w-full md:max-w-xs">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-zinc-400" />
          </span>
          <input
            type="text"
            placeholder="Search company or db..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 bg-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-zinc-950 transition-all shadow-sm"
          />
        </div>

        <div className="flex bg-zinc-100 p-0.75 rounded-xl border border-zinc-200/40 w-full md:w-auto">
          {(['all', 'active', 'trial', 'suspended'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-[10px] font-extrabold capitalize transition-all cursor-pointer ${
                statusFilter === status
                  ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200/50'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Company Database Registry Table */}
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
        {loading && companies.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="w-8 h-8 border-3 border-zinc-900/10 border-t-zinc-900 rounded-full animate-spin"></div>
            <p className="text-zinc-500 text-xs mt-3 font-semibold">Updating tenant directories...</p>
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-zinc-50 border border-zinc-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Building2 className="w-6 h-6 text-zinc-400" />
            </div>
            <p className="text-zinc-900 text-sm font-bold">No registered tenants found</p>
            <p className="text-zinc-400 text-xs mt-1">Try resetting filters or registering a new tenant.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-medium">
              <thead className="bg-zinc-50 border-b border-zinc-250/50 text-zinc-400 font-black uppercase text-[9px] tracking-wider select-none">
                <tr>
                  <th className="p-4 pl-6">Company & Infrastructure</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4">Subscription Lifeline</th>
                  <th className="p-4 text-center">Storage Used</th>
                  <th className="p-4 text-right pr-6">Management Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredCompanies.map((c: any) => {
                  const expiry = getExpiryDetails(c);
                  return (
                    <tr key={c._id} className="hover:bg-zinc-50/70 transition-colors">
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8.5 h-8.5 bg-zinc-50 border border-zinc-200/60 text-zinc-700 rounded-xl flex items-center justify-center shadow-inner shrink-0">
                            <Globe className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-extrabold text-zinc-900 block text-xs">{c.companyName}</span>
                            <span className="text-[10px] text-zinc-400 font-mono mt-0.5 block flex items-center gap-1">
                              <Database className="w-3 h-3 stroke-[2.5]" />
                              {c.dbName || 'db_provisioning_failed'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex justify-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.75 rounded-full text-[9px] font-black uppercase border tracking-wider ${
                            c.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                            c.status === 'suspended' ? 'bg-rose-50 text-rose-700 border-rose-100' : 
                            'bg-amber-50 text-amber-700 border-amber-100'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              c.status === 'active' ? 'bg-emerald-500 animate-pulse' :
                              c.status === 'suspended' ? 'bg-rose-500' : 'bg-amber-500'
                            }`} />
                            {c.status}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border ${expiry.style}`}>
                              {expiry.label}
                            </span>
                          </div>
                          {c.activationKey && (
                            <div className="flex items-center gap-1.5 bg-zinc-55 border border-zinc-200 rounded-lg p-1 px-1.5 text-[9px] font-mono text-zinc-600 max-w-fit mt-1">
                              <Key className="w-3 h-3 text-zinc-400 shrink-0" />
                              <span className="font-bold tracking-tight select-text">{c.activationKey.key}</span>
                              <button
                                onClick={() => {
                                  if (navigator.clipboard && navigator.clipboard.writeText) {
                                    navigator.clipboard.writeText(c.activationKey.key);
                                    notify.success('Key copied to clipboard!');
                                  }
                                }}
                                className="text-[8px] text-zinc-400 hover:text-zinc-950 underline font-extrabold ml-1.5 cursor-pointer active:scale-95 transition-all"
                                title="Copy Key"
                              >
                                Copy
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col items-center gap-0.5">
                          {(() => {
                            const s = storageMap[c.companyName];
                            const total = s?.totalBytes ?? 0;
                            const data = s?.dataBytes ?? 0;
                            const objs = s?.objects ?? 0;
                            return (
                              <>
                                <span className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border ${
                                  total === 0 ? 'bg-zinc-50 text-zinc-400 border-zinc-200' :
                                  total > 50 * 1024 * 1024 ? 'bg-rose-50 text-rose-700 border-rose-100' :
                                  total > 10 * 1024 * 1024 ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                  'bg-emerald-50 text-emerald-700 border-emerald-100'
                                }`}>
                                  {formatBytes(total)}
                                </span>
                                {total > 0 && (
                                  <span className="text-[9px] text-zinc-400 font-semibold">
                                    {formatBytes(data)} data · {objs} docs
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="p-4 text-right pr-6">
                        <div className="flex justify-end gap-1.5">
                          {/* Manage Users Button */}
                          <button 
                            onClick={() => handleOpenUserManagement(c)}
                            disabled={c.status === 'suspended'}
                            className={`flex items-center gap-1 px-3 py-2 rounded-xl border text-[10px] font-black transition-all active:scale-95 cursor-pointer ${
                              c.status === 'suspended'
                                ? 'bg-zinc-50 text-zinc-300 border-zinc-200 cursor-not-allowed shadow-none'
                                : 'bg-white hover:bg-zinc-50 text-zinc-700 border-zinc-200/80 hover:text-zinc-900 shadow-sm'
                            }`}
                            title="Manage Tenant Users"
                          >
                            <Users className="w-3.5 h-3.5 text-zinc-500" />
                            Users
                          </button>

                          {/* Toggle Status Button */}
                          <button 
                            onClick={() => handleToggleStatus(c)} 
                            className={`p-2 rounded-xl border transition-all active:scale-95 cursor-pointer ${
                              c.status === 'active'
                                ? 'bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100/70 hover:text-amber-800' 
                                : 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100/70 hover:text-emerald-800'
                            }`}
                            title={c.status === 'active' ? 'Suspend Tenant Access' : 'Activate Tenant Access'}
                          >
                            {c.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          </button>
                          
                          {/* Extend Subscription Trigger */}
                          <button 
                            onClick={() => {
                              setExtendCompany(c);
                              setExtendCompanyStatus(c.status);
                              setExtendMonthsValue('1');
                              setCustomExtendMonths(false);
                              setExtensionMode('extend');
                              const tzOffset = new Date().getTimezoneOffset() * 60000;
                              setEditExpiryDate(
                                c.status === 'trial'
                                  ? (c.trialUntil ? new Date(new Date(c.trialUntil).getTime() - tzOffset).toISOString().slice(0, 16) : '')
                                  : (c.validUntil ? new Date(new Date(c.validUntil).getTime() - tzOffset).toISOString().slice(0, 16) : '')
                              );
                              setExtendTrialUnit('days');
                              setExtendTrialDurationValue('30');
                            }} 
                            disabled={c.status === 'suspended'}
                            className={`flex items-center gap-1 px-3 py-2 rounded-xl border text-[10px] font-black transition-all active:scale-95 cursor-pointer ${
                              c.status === 'suspended'
                                ? 'bg-zinc-50 text-zinc-300 border-zinc-200 cursor-not-allowed shadow-none'
                                : 'bg-white hover:bg-zinc-50 text-zinc-700 border-zinc-200/80 hover:text-zinc-900 shadow-sm'
                            }`}
                            title="Extend License Duration"
                          >
                            <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                            Extend
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      ) : (
        <BackupSection />
      )}

      {/* Register Tenant Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <form 
            onSubmit={handleCreateCompany} 
            className="bg-white border border-zinc-200/80 rounded-2xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden animate-scale-in"
          >
            {/* Header decor */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-zinc-950 via-zinc-800 to-zinc-900"></div>

            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-sm font-black text-zinc-900 flex items-center gap-1.5">
                  <Building2 className="w-4.5 h-4.5 text-zinc-500" />
                  Register New Tenant
                </h2>
                <p className="text-[10px] text-zinc-400 mt-0.5">Initialize a brand new company profile and DB space.</p>
              </div>
              <button 
                type="button" 
                onClick={() => setShowAddModal(false)}
                className="p-1 hover:bg-zinc-100 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-4.5 h-4.5 text-zinc-400" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Company Name */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block">Company Name</label>
                <input 
                  type="text"
                  value={newCompanyName}
                  onChange={e => setNewCompanyName(e.target.value)}
                  placeholder="e.g. Acme Builders, Buildco Ltd"
                  className="w-full p-2.5 border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-zinc-950 transition-all"
                  required
                />
              </div>

              {/* Account Status / Plan Type */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block">Plan Type</label>
                <div className="grid grid-cols-3 bg-zinc-50 p-1 border rounded-xl gap-1">
                  {(['active', 'trial', 'suspended'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        setNewCompanyStatus(st);
                        // Setup sensible defaults
                        if (st === 'trial') {
                          setNewCompanyDurationValue('30');
                        } else {
                          setNewCompanyDurationValue('12');
                        }
                      }}
                      className={`py-2 text-[10px] font-extrabold capitalize rounded-lg transition-all cursor-pointer ${
                        newCompanyStatus === st
                          ? 'bg-white text-zinc-950 shadow-sm font-black border border-zinc-200/50'
                          : 'text-zinc-500 hover:text-zinc-900'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Plan Expiry / Duration Config */}
              {newCompanyStatus !== 'suspended' && (
                <div className="space-y-2.5 bg-zinc-50 p-3 rounded-xl border border-zinc-150">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block">
                      {newCompanyStatus === 'trial' ? 'Trial Length' : 'Subscription Plan'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setUseCustomDate(!useCustomDate)}
                      className="text-[9px] text-zinc-650 hover:text-zinc-950 font-black underline"
                    >
                      {useCustomDate ? 'Use Presets' : 'Set Specific Date'}
                    </button>
                  </div>

                  {useCustomDate ? (
                    <DatePicker
                      value={newCompanyCustomDate}
                      onChange={val => setNewCompanyCustomDate(val)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full p-2 bg-white border border-zinc-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-950"
                      required
                    />
                  ) : (
                    <div className="space-y-2.5">
                      {newCompanyStatus === 'trial' && (
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Trial Unit</span>
                          <div className="flex bg-zinc-150 p-0.5 rounded-lg border gap-0.5">
                            {(['minutes', 'hours', 'days'] as const).map(unit => (
                              <button
                                key={unit}
                                type="button"
                                onClick={() => {
                                  setTrialUnit(unit);
                                  if (unit === 'minutes') setNewCompanyDurationValue('30');
                                  else if (unit === 'hours') setNewCompanyDurationValue('1');
                                  else setNewCompanyDurationValue('30');
                                }}
                                className={`px-2 py-1 text-[9px] font-extrabold capitalize rounded-md transition-all cursor-pointer ${
                                  trialUnit === unit
                                    ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200/50'
                                    : 'text-zinc-500 hover:text-zinc-900'
                                }`}
                              >
                                {unit}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-4 gap-1.5">
                        {newCompanyStatus === 'trial' ? (
                          trialUnit === 'minutes' ? (
                            (['5', '15', '30', '60'] as const).map((mins) => (
                              <button
                                key={mins}
                                type="button"
                                onClick={() => setNewCompanyDurationValue(mins)}
                                className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                                  newCompanyDurationValue === mins
                                    ? 'bg-zinc-900 border-zinc-900 text-white font-black'
                                    : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-350'
                                }`}
                              >
                                {mins} Mins
                              </button>
                            ))
                          ) : trialUnit === 'hours' ? (
                            (['1', '3', '6', '12'] as const).map((hrs) => (
                              <button
                                key={hrs}
                                type="button"
                                onClick={() => setNewCompanyDurationValue(hrs)}
                                className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                                  newCompanyDurationValue === hrs
                                    ? 'bg-zinc-900 border-zinc-900 text-white font-black'
                                    : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-350'
                                }`}
                              >
                                {hrs} Hrs
                              </button>
                            ))
                          ) : (
                            // Trial presets (Days)
                            (['7', '14', '30', '90'] as const).map((days) => (
                              <button
                                key={days}
                                type="button"
                                onClick={() => setNewCompanyDurationValue(days)}
                                className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                                  newCompanyDurationValue === days
                                    ? 'bg-zinc-900 border-zinc-900 text-white font-black'
                                    : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-350'
                                }`}
                              >
                                {days} Days
                              </button>
                            ))
                          )
                        ) : (
                          // Active subscription presets (Months)
                          (['1', '3', '12', 'lifetime'] as const).map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setNewCompanyDurationValue(opt)}
                              className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                                newCompanyDurationValue === opt
                                  ? 'bg-zinc-900 border-zinc-900 text-white font-black'
                                  : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-350'
                              }`}
                            >
                              {opt === 'lifetime' ? 'Lifetime' : `${opt} Mon`}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Calculations Preview */}
                  <div className="text-[10px] text-zinc-500 font-bold border-t border-zinc-200/60 pt-2 flex items-center gap-1.5 mt-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>{computedAddExpiryPreview}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex gap-2 border-t border-zinc-100 pt-4">
              <button 
                type="button" 
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2.5 bg-zinc-50 border border-zinc-250 text-zinc-700 hover:bg-zinc-100 rounded-xl text-xs font-black transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="flex-1 py-2.5 bg-zinc-950 hover:bg-zinc-900 text-white rounded-xl text-xs font-black transition-colors shadow-md shadow-black/10 cursor-pointer"
              >
                Register
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Extend License Modal */}
      {extendCompany && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-zinc-200/80 rounded-2xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden animate-scale-in">
            {/* Header decoration */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-zinc-950 via-zinc-800 to-zinc-900"></div>

            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-sm font-black text-zinc-900 flex items-center gap-1.5">
                  <Calendar className="w-4.5 h-4.5 text-zinc-500" />
                  Extend License Plan
                </h2>
                <p className="text-[10px] text-zinc-450 mt-0.5">Extend the active contract lifecycle for this tenant.</p>
              </div>
              <button 
                onClick={() => setExtendCompany(null)}
                className="p-1 hover:bg-zinc-100 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-4.5 h-4.5 text-zinc-400" />
              </button>
            </div>

             <div className="space-y-4">
               {/* Target info card */}
               <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-150 flex items-center justify-between">
                 <div>
                   <span className="text-[10px] font-black text-zinc-400 block uppercase">Tenant Domain</span>
                   <span className="text-xs font-extrabold text-zinc-900 block mt-0.5">{extendCompany.companyName}</span>
                 </div>
                 <div className="text-right">
                   <span className="text-[10px] font-black text-zinc-400 block uppercase">Current Expiry</span>
                   <span className="text-xs font-bold text-zinc-800 block mt-0.5">
                     {extendCompany.status === 'trial' ? (
                       extendCompany.trialUntil 
                         ? new Date(extendCompany.trialUntil).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                         : 'No Expiry Set'
                     ) : (
                       extendCompany.validUntil 
                         ? new Date(extendCompany.validUntil).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                         : 'Lifetime / None'
                     )}
                   </span>
                 </div>
               </div>
 
               {/* Plan Status Segment */}
               <div className="space-y-1">
                 <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block">Plan Status</label>
                 <div className="grid grid-cols-3 bg-zinc-50 p-1 border rounded-xl gap-1">
                   {(['active', 'trial', 'suspended'] as const).map((st) => (
                     <button
                       key={st}
                       type="button"
                       onClick={() => {
                         setExtendCompanyStatus(st);
                         if (st === 'trial') {
                           setExtensionMode('extend');
                         }
                       }}
                       className={`py-1.5 text-[10px] font-extrabold capitalize rounded-lg transition-all cursor-pointer ${
                         extendCompanyStatus === st
                           ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200/50 font-black'
                           : 'text-zinc-500 hover:text-zinc-900'
                       }`}
                     >
                       {st}
                     </button>
                   ))}
                 </div>
               </div>

               {extendCompanyStatus !== 'suspended' && (
                 <>
                   {/* Mode Tabs */}
                   <div className="grid grid-cols-2 bg-zinc-50 p-1 border rounded-xl gap-1">
                     {(['extend', 'edit'] as const).map((mode) => {
                       const label = mode === 'extend' 
                         ? (extendCompanyStatus === 'trial' ? 'Trial Presets' : 'Add Months')
                         : (extendCompanyStatus === 'trial' ? 'Specific Date & Time' : 'Edit Validity Date');
                       return (
                         <button
                           key={mode}
                           type="button"
                           onClick={() => setExtensionMode(mode)}
                           className={`py-1.5 text-[10px] font-extrabold capitalize rounded-lg transition-all cursor-pointer ${
                             extensionMode === mode
                               ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200/50'
                               : 'text-zinc-500 hover:text-zinc-900'
                           }`}
                         >
                           {label}
                         </button>
                       );
                     })}
                   </div>

                   {extensionMode === 'extend' ? (
                     extendCompanyStatus === 'trial' ? (
                       <div className="space-y-2.5">
                         <div className="flex justify-between items-center">
                           <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Trial Unit</span>
                           <div className="flex bg-zinc-150 p-0.5 rounded-lg border gap-0.5">
                             {(['minutes', 'hours', 'days'] as const).map(unit => (
                               <button
                                 key={unit}
                                 type="button"
                                 onClick={() => {
                                   setExtendTrialUnit(unit);
                                   if (unit === 'minutes') setExtendTrialDurationValue('30');
                                   else if (unit === 'hours') setExtendTrialDurationValue('1');
                                   else setExtendTrialDurationValue('30');
                                 }}
                                 className={`px-2 py-1 text-[9px] font-extrabold capitalize rounded-md transition-all cursor-pointer ${
                                   extendTrialUnit === unit
                                     ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200/50'
                                     : 'text-zinc-500 hover:text-zinc-900'
                                 }`}
                               >
                                 {unit}
                               </button>
                             ))}
                           </div>
                         </div>

                         <div className="grid grid-cols-4 gap-1.5">
                           {extendTrialUnit === 'minutes' ? (
                             (['5', '15', '30', '60'] as const).map((mins) => (
                               <button
                                 key={mins}
                                 type="button"
                                 onClick={() => setExtendTrialDurationValue(mins)}
                                 className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                                   extendTrialDurationValue === mins
                                     ? 'bg-zinc-900 border-zinc-900 text-white font-black'
                                     : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-350'
                                 }`}
                               >
                                 {mins} Mins
                               </button>
                             ))
                           ) : extendTrialUnit === 'hours' ? (
                             (['1', '3', '6', '12'] as const).map((hrs) => (
                               <button
                                 key={hrs}
                                 type="button"
                                 onClick={() => setExtendTrialDurationValue(hrs)}
                                 className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                                   extendTrialDurationValue === hrs
                                     ? 'bg-zinc-900 border-zinc-900 text-white font-black'
                                     : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-350'
                                 }`}
                               >
                                 {hrs} Hrs
                               </button>
                             ))
                           ) : (
                             (['7', '14', '30', '90'] as const).map((days) => (
                               <button
                                 key={days}
                                 type="button"
                                 onClick={() => setExtendTrialDurationValue(days)}
                                 className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                                   extendTrialDurationValue === days
                                     ? 'bg-zinc-900 border-zinc-900 text-white font-black'
                                     : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-350'
                                 }`}
                               >
                                 {days} Days
                               </button>
                             ))
                           )}
                         </div>

                         {/* Dynamic Preview Timeline */}
                         <div className="bg-amber-50 border border-amber-150 p-3 rounded-xl space-y-1.5 select-none">
                           <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider block">Real-time Trial Calculator</span>
                           <div className="flex items-center gap-2 text-xs font-extrabold text-amber-950">
                             <span>Now</span>
                             <ChevronRight className="w-4.5 h-4.5 stroke-[3] text-amber-500" />
                             <span className="bg-amber-600 text-white px-2 py-0.5 rounded-lg text-[10px] font-black flex items-center gap-0.5 shadow-sm shadow-amber-700/20">
                               <ArrowUpRight className="w-3 h-3 stroke-[3]" />
                               +{extendTrialDurationValue} {extendTrialUnit}
                             </span>
                             <ChevronRight className="w-4.5 h-4.5 stroke-[3] text-amber-500" />
                             <span className="text-amber-700 underline underline-offset-2 decoration-amber-400">
                               {computedExtendTrialExpiryPreview}
                             </span>
                           </div>
                         </div>
                       </div>
                     ) : (
                       <>
                         <div className="space-y-2">
                           <div className="flex justify-between items-center">
                             <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Extension Period</label>
                             <button
                               onClick={() => setCustomExtendMonths(!customExtendMonths)}
                               className="text-[9px] text-zinc-650 hover:text-zinc-950 font-black underline"
                             >
                               {customExtendMonths ? 'Use Presets' : 'Custom Duration'}
                             </button>
                           </div>

                           {customExtendMonths ? (
                             <div className="flex items-center gap-2">
                               <input 
                                 type="number"
                                 value={extendMonthsValue}
                                 onChange={e => setExtendMonthsValue(Math.max(1, parseInt(e.target.value) || 1).toString())}
                                 min="1"
                                 className="w-full p-2 border border-zinc-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-zinc-950 focus:border-zinc-950 outline-none"
                               />
                               <span className="text-xs font-black text-zinc-500">Months</span>
                             </div>
                           ) : (
                             <div className="grid grid-cols-4 gap-2">
                               {(['1', '3', '6', '12'] as const).map((opt) => (
                                 <button
                                   key={opt}
                                   type="button"
                                   onClick={() => setExtendMonthsValue(opt)}
                                   className={`py-2 text-xs font-black rounded-xl border transition-all cursor-pointer ${
                                     extendMonthsValue === opt
                                       ? 'bg-zinc-900 border-zinc-900 text-white'
                                       : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-350'
                                   }`}
                                 >
                                   +{opt}m
                                 </button>
                               ))}
                             </div>
                           )}
                         </div>

                         {/* Dynamic Preview Timeline */}
                         <div className="bg-emerald-50 border border-emerald-150 p-3 rounded-xl space-y-1.5 select-none">
                           <span className="text-[10px] font-black uppercase text-emerald-800 tracking-wider block">Real-time Validity Calculator</span>
                           <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-950">
                             <span>
                               {extendCompany.validUntil 
                                 ? new Date(extendCompany.validUntil).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                                 : 'Today'}
                             </span>
                             <ChevronRight className="w-4.5 h-4.5 stroke-[3] text-emerald-500" />
                             <span className="bg-emerald-600 text-white px-2 py-0.5 rounded-lg text-[10px] font-black flex items-center gap-0.5 shadow-sm shadow-emerald-700/20">
                               <ArrowUpRight className="w-3 h-3 stroke-[3]" />
                               +{extendMonthsValue} Months
                             </span>
                             <ChevronRight className="w-4.5 h-4.5 stroke-[3] text-emerald-500" />
                             <span className="text-emerald-700 underline underline-offset-2 decoration-emerald-400">
                               {computedExtendExpiryPreview}
                             </span>
                           </div>
                         </div>
                       </>
                     )
                   ) : (
                     <div className="space-y-2.5">
                       <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block">
                         {extendCompanyStatus === 'trial' ? 'Set Custom Trial Expiry' : 'Set Custom Subscription Expiry'}
                       </label>
                       <div className="flex gap-2">
                         <input 
                           type="datetime-local"
                           value={editExpiryDate}
                           onChange={e => setEditExpiryDate(e.target.value)}
                           className="w-full p-2 border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-950 transition-all bg-white"
                         />
                         <button
                           type="button"
                           onClick={() => setEditExpiryDate('')}
                           className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 border text-zinc-700 rounded-xl text-[10px] font-black whitespace-nowrap transition-colors"
                           title="Clear Expiry / Set Lifetime"
                         >
                           Clear / Lifetime
                         </button>
                       </div>
                       <p className="text-[9px] text-zinc-400 font-bold">
                         This will directly set the expiry timestamp. Clear it to grant lifetime/unlimited access.
                       </p>
                     </div>
                   )}
                 </>
               )}

               {extendCompanyStatus === 'suspended' && (
                 <div className="p-4 bg-rose-50 border border-rose-150 rounded-xl flex items-start gap-2.5">
                   <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                   <div>
                     <span className="text-xs font-extrabold text-rose-950 block">Confirm Suspension</span>
                     <span className="text-[10px] text-rose-700 block mt-0.5">
                       Switching this company to Suspended status will immediately block all users from logging in or conducting database transactions.
                     </span>
                   </div>
                 </div>
               )}
             </div>
 
             <div className="mt-5 flex gap-2 border-t border-zinc-150 pt-4">
               <button 
                 type="button"
                 onClick={() => setExtendCompany(null)}
                 className="px-4 py-2.5 bg-zinc-50 border border-zinc-250 text-zinc-700 hover:bg-zinc-100 rounded-xl text-xs font-black transition-colors cursor-pointer"
               >
                 Cancel
               </button>
               {extendCompanyStatus !== 'suspended' && (
                 <button 
                   type="button"
                   onClick={handleGenerateKey}
                   className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-colors shadow-sm shadow-emerald-700/20 cursor-pointer flex items-center justify-center gap-1.5"
                   title="Generate unique activation product key"
                 >
                   <Key className="w-3.5 h-3.5" />
                   Generate Key
                 </button>
               )}
               <button 
                 type="button"
                 onClick={handleApplyExtension}
                 className="flex-1 py-2.5 bg-zinc-950 hover:bg-zinc-900 text-white rounded-xl text-xs font-black transition-colors shadow-md shadow-black/10 cursor-pointer"
               >
                 {extensionMode === 'edit' ? 'Update Expiry' : 'Apply Extension'}
               </button>
             </div>
          </div>
        </div>
      )}

      {/* Tenant User Management Modal */}
      {selectedUserCompany && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-zinc-200 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh] relative overflow-hidden animate-scale-in">
            {/* Top Border Accent */}
            <div className="h-1.5 bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-950 shrink-0"></div>

            {/* Modal Header */}
            <div className="p-5 border-b border-zinc-100 flex justify-between items-start shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-zinc-100 text-zinc-800 border px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                    <Database className="w-2.5 h-2.5" />
                    {selectedUserCompany.dbName}
                  </span>
                </div>
                <h2 className="text-base font-black text-zinc-950 mt-1 flex items-center gap-1.5">
                  <Users className="w-5 h-5 text-zinc-500" />
                  Tenant User Directory
                </h2>
                <p className="text-[10px] text-zinc-450 mt-0.5">
                  Manage login credentials and system roles for <b className="text-zinc-800 font-bold">{selectedUserCompany.companyName}</b>.
                </p>
              </div>
              <button 
                onClick={() => setSelectedUserCompany(null)}
                className="p-1.5 hover:bg-zinc-100 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {showAddUserForm ? (
                /* Add User Form Screen */
                <form onSubmit={handleCreateTenantUser} className="space-y-4 max-w-md mx-auto bg-zinc-50 border border-zinc-150 p-5 rounded-2xl">
                  <div className="flex items-center gap-2 border-b border-zinc-200/60 pb-2.5 mb-1">
                    <button 
                      type="button" 
                      onClick={() => setShowAddUserForm(false)} 
                      className="p-1 hover:bg-white border hover:border-zinc-200 rounded-lg transition-all text-zinc-500 cursor-pointer"
                      title="Back to Directory"
                    >
                      <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
                    </button>
                    <h3 className="text-xs font-black text-zinc-900 flex items-center gap-1">
                      <UserPlus className="w-4 h-4 text-zinc-500" />
                      Add Account to Tenant
                    </h3>
                  </div>

                  {/* Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block">Full Name *</label>
                    <input 
                      type="text"
                      value={newUserName}
                      onChange={e => setNewUserName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full p-2 bg-white border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-zinc-950 transition-all"
                      required
                    />
                  </div>

                  {/* Email & Phone grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block">Email Address *</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                          <Mail className="w-3.5 h-3.5" />
                        </span>
                        <input 
                          type="email"
                          value={newUserEmail}
                          onChange={e => setNewUserEmail(e.target.value)}
                          placeholder="johndoe@email.com"
                          className="w-full pl-8.5 pr-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-950 transition-all"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block">Phone Number</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                          <Phone className="w-3.5 h-3.5" />
                        </span>
                        <input 
                          type="tel"
                          value={newUserPhone}
                          onChange={e => setNewUserPhone(e.target.value)}
                          placeholder="e.g. +91 9876543210"
                          className="w-full pl-8.5 pr-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-950 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Password & Role Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block">Password *</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                          <Key className="w-3.5 h-3.5" />
                        </span>
                        <input 
                          type="text" // Plain text as required by dynamic credential schema in server
                          value={newUserPassword}
                          onChange={e => setNewUserPassword(e.target.value)}
                          placeholder="Secure password"
                          className="w-full pl-8.5 pr-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-950 transition-all"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block">System Role *</label>
                      <Select
                        value={newUserRole}
                        onChange={(val) => setNewUserRole(val as any)}
                        className="w-full p-2 bg-white border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-950 transition-all cursor-pointer"
                        options={[
                          { value: 'admin', label: 'Administrator (Admin)' },
                          { value: 'accountant', label: 'Financial Accountant' },
                          { value: 'manager', label: 'Site Manager' }
                        ]}
                      />
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="flex gap-2 pt-3 border-t border-zinc-200/50 mt-4">
                    <button 
                      type="button" 
                      onClick={() => setShowAddUserForm(false)}
                      className="flex-1 py-2 bg-white border border-zinc-250 hover:bg-zinc-100 rounded-xl text-[11px] font-black transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-black transition-colors shadow-sm shadow-emerald-750/10 cursor-pointer"
                    >
                      Save Account
                    </button>
                  </div>
                </form>
              ) : (
                /* Directory Listing View */
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                      Tenant Members ({tenantUsers.length})
                    </span>
                    <button 
                      onClick={() => { resetNewUserForm(); setShowAddUserForm(true); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 hover:bg-zinc-900 text-white rounded-xl text-[10px] font-black active:scale-95 transition-all cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5 stroke-[2.5]" />
                      Add Account
                    </button>
                  </div>

                  {loadingUsers ? (
                    <div className="py-12 text-center flex flex-col items-center">
                      <div className="w-6 h-6 border-2 border-zinc-900/10 border-t-zinc-900 rounded-full animate-spin"></div>
                      <p className="text-zinc-400 text-[10px] mt-2 font-bold">Querying directory database...</p>
                    </div>
                  ) : tenantUsers.length === 0 ? (
                    <div className="border border-dashed border-zinc-200 rounded-2xl p-8 text-center bg-zinc-50/50">
                      <Users className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                      <p className="text-zinc-800 text-xs font-bold">No active users in database</p>
                      <p className="text-zinc-400 text-[10px] mt-0.5">Please bootstrap this tenant by adding their first administrator account.</p>
                    </div>
                  ) : (
                    <div className="border border-zinc-200/80 rounded-2xl overflow-hidden shadow-sm">
                      <table className="w-full text-left text-xs font-medium bg-white">
                        <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-450 font-black uppercase text-[8px] tracking-widest select-none">
                          <tr>
                            <th className="p-3 pl-4">Account Details</th>
                            <th className="p-3 text-center">System Role</th>
                            <th className="p-3 text-center">Status</th>
                            <th className="p-3 text-right pr-4">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-150">
                          {tenantUsers.map((u: any) => (
                            <tr key={u.id} className="hover:bg-zinc-50/50 transition-colors">
                              <td className="p-3 pl-4">
                                <div>
                                  <span className="font-extrabold text-zinc-900 text-xs block">{u.name}</span>
                                  <span className="text-[10px] text-zinc-400 block mt-0.5">{u.email}</span>
                                  {u.phone && <span className="text-[9px] text-zinc-400 block">{u.phone}</span>}
                                </div>
                              </td>
                              <td className="p-3 text-center">
                                <span className={`inline-flex px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border tracking-wider ${
                                  u.role === 'admin' ? 'bg-zinc-900 text-white border-zinc-950' :
                                  u.role === 'accountant' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                  'bg-purple-50 text-purple-700 border-purple-100'
                                }`}>
                                  {u.role === 'manager' ? 'site manager' : u.role}
                                </span>
                              </td>
                              <td className="p-3">
                                <div className="flex justify-center">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border capitalize ${
                                    u.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'
                                  }`}>
                                    <span className={`w-1 h-1 rounded-full ${u.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                    {u.status}
                                  </span>
                                </div>
                              </td>
                              <td className="p-3 text-right pr-4">
                                <div className="flex justify-end gap-1.5">
                                  {/* Toggle Status */}
                                  <button
                                    onClick={() => handleToggleTenantUserStatus(u)}
                                    className={`p-1.5 border rounded-lg transition-all active:scale-95 cursor-pointer ${
                                      u.status === 'active'
                                        ? 'bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100'
                                        : 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                                    }`}
                                    title={u.status === 'active' ? 'Deactivate Account' : 'Activate Account'}
                                  >
                                    {u.status === 'active' ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                                  </button>

                                  {/* Delete */}
                                  <button
                                    onClick={() => handleDeleteTenantUser(u)}
                                    className="p-1.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-lg hover:bg-rose-100 transition-all active:scale-95 cursor-pointer"
                                    title="Delete Account"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-zinc-50 border-t border-zinc-100 text-right shrink-0">
              <button 
                onClick={() => setSelectedUserCompany(null)}
                className="px-4 py-2 bg-zinc-950 text-white rounded-xl text-xs font-black hover:bg-zinc-900 active:scale-95 transition-all cursor-pointer"
              >
                Close Directory
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
