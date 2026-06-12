import React, { useEffect, useState } from 'react';
import { Building2, Plus, Play, Pause, Calendar, X } from 'lucide-react';
import { api } from '../api/client';
import { notify } from '../utils/toast';

export default function SuperadminDashboard() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const res = await api.getSuperadminCompanies();
      setCompanies(res);
    } catch (err: any) {
      notify.error(err.message || 'Failed to fetch companies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
        await api.createCompany({ companyName: newCompanyName });
        notify.success('Company created successfully');
        setShowModal(false);
        setNewCompanyName('');
        fetchCompanies();
    } catch (err: any) {
        notify.error(err.message);
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await api.updateCompanyStatus(id, status);
      notify.success(`Company status updated to ${status}`);
      fetchCompanies();
    } catch (err: any) {
      notify.error(err.message);
    }
  };

  const handleExtend = async (id: string, months: number) => {
    try {
      await api.extendSubscription(id, months);
      notify.success(`Subscription extended by ${months} month(s)`);
      fetchCompanies();
    } catch (err: any) {
      notify.error(err.message);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="space-y-6 font-sans p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-950">System Administration</h1>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm font-semibold"
        >
          <Plus className="w-4 h-4" />
          Add Company
        </button>
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-semibold uppercase text-[10px] tracking-wider">
            <tr>
              <th className="p-4">Company Name</th>
              <th className="p-4">Status</th>
              <th className="p-4">Validity</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {companies.map((c: any) => (
              <tr key={c._id}>
                <td className="p-4 font-medium">{c.companyName}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-semibold ${
                      c.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                      c.status === 'suspended' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    {c.status}
                  </span>
                </td>
                <td className="p-4 text-zinc-600">{c.validUntil ? new Date(c.validUntil).toLocaleDateString() : 'N/A'}</td>
                <td className="p-4 flex gap-2">
                  <button onClick={() => handleUpdateStatus(c._id, c.status === 'active' ? 'suspended' : 'active')} className="p-2 hover:bg-zinc-100 rounded-lg">
                    {c.status === 'active' ? <Pause className="w-4 h-4 text-amber-600" /> : <Play className="w-4 h-4 text-emerald-600" />}
                  </button>
                  <button onClick={() => handleExtend(c._id, 1)} className="p-2 hover:bg-zinc-100 rounded-lg" title="+1 Month">
                    <Calendar className="w-4 h-4" /> 1m
                  </button>
                  <button onClick={() => handleExtend(c._id, 12)} className="p-2 hover:bg-zinc-100 rounded-lg" title="+12 Months">
                    <Calendar className="w-4 h-4" /> 12m
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCreateCompany} className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold">Add Company</h2>
                <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-zinc-400"/></button>
            </div>
            <input 
              value={newCompanyName}
              onChange={e => setNewCompanyName(e.target.value)}
              placeholder="Company Name"
              className="w-full p-2 border rounded-lg text-sm"
              required
            />
            <button className="w-full py-2 bg-zinc-900 text-white rounded-lg text-sm font-semibold">Create</button>
          </form>
        </div>
      )}
    </div>
  );
}
