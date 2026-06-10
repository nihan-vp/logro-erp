import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Wallet, Send, ClipboardList, PlusCircle, X, CheckCircle2, Clock, LayoutDashboard } from 'lucide-react';

export default function AccountantDashboard({ onNavigate }: { onNavigate: (tab: string, params?: any) => void }) {
  const [funds, setFunds] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInflowForm, setShowInflowForm] = useState(false);
  const [inflowAmount, setInflowAmount] = useState('');
  const [inflowDesc, setInflowDesc] = useState('');
  const [inflowDate, setInflowDate] = useState(new Date().toISOString().slice(0, 16));
  const [inflowProject, setInflowProject] = useState('');
  const [inflowSource, setInflowSource] = useState('');
  const [inflowMethod, setInflowMethod] = useState('');
  const [inflowRef, setInflowRef] = useState('');

  useEffect(() => {
    fetchAccountantData();
  }, []);

  const fetchAccountantData = async () => {
    setLoading(true);
    try {
        const [fundRes, reqRes, projRes, taskRes] = await Promise.all([
            api.getOfficeFunds(),
            api.getPaymentRequests(),
            api.getProjects(),
            api.getTasks()
        ]);
        setFunds(fundRes.officeFunds[0] || { balance: 0 });
        setTransactions(fundRes.officeTransactions || []);
        setRequests(reqRes.paymentRequests || []);
        setProjects(projRes.projects || []);
        setTasks(taskRes.tasks || []);
    } catch (err) {
        console.error("Failed to fetch accountant data", err);
    } finally {
        setLoading(false);
    }
  };

  const getTaskName = (desc: string) => {
      const match = desc.match(/tsk_\d+/);
      if (match) {
          const task = tasks.find(t => t.id === match[0]);
          return task ? task.taskName : match[0];
      }
      return desc;
  };

  const handleApprove = async (request: any) => {
      try {
          await api.createPayment({
              projectId: request.projectId,
              taskId: request.taskId,
              payeeType: request.category === 'Worker' ? 'Worker' : 'Supplier',
              payeeName: request.payeeName,
              amount: request.amount,
              paymentDate: new Date().toISOString().split('T')[0],
              paymentMethod: 'Bank Transfer',
              paymentStatus: 'Paid',
              notes: request.description,
              requestId: request.id
          });
          fetchAccountantData();
          alert('Payment processed successfully!');
      } catch (err: any) {
          alert(err.message || 'Error processing payment.');
      }
  };

  const handleInflowSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
          await api.postOfficeFund({
              type: 'Cash In',
              amount: Number(inflowAmount),
              description: inflowDesc,
              date: inflowDate,
              projectId: inflowProject,
              source: inflowSource,
              paymentMethod: inflowMethod,
              reference: inflowRef
          });
          setInflowAmount('');
          setInflowDesc('');
          setInflowDate(new Date().toISOString().slice(0, 16));
          setInflowProject('');
          setInflowSource('');
          setInflowMethod('');
          setInflowRef('');
          setShowInflowForm(false);
          fetchAccountantData();
          alert('Inflow recorded successfully!');
      } catch (err: any) {
          alert(err.message || 'Error recording inflow.');
      }
  };

  if (loading) return <div className="p-4 text-center font-bold">Loading Accountant Dashboard...</div>;

  const pendingRequests = requests.filter(r => r.status === 'Pending');

  return (
    <div className="space-y-6 font-sans p-4 md:p-6">
        <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
                <button 
                    onClick={() => onNavigate('dashboard')}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-zinc-600 hover:text-zinc-900 transition-all text-sm font-semibold"
                >
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Dashboard</span>
                </button>
                <h1 className="text-2xl font-bold">Accountant Dashboard</h1>
            </div>
            <button 
              onClick={() => setShowInflowForm(true)}
              className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700 flex items-center gap-2"
            >
                <PlusCircle className="w-4 h-4" /> Record Cash Inflow
            </button>
        </div>
        
        {/* KPI Section */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white border p-6 rounded-2xl shadow-sm">
                <h2 className="text-sm font-semibold text-zinc-500 flex items-center gap-2"><Wallet /> Current Office Balance</h2>
                <p className="text-3xl font-bold mt-2">₹{funds?.balance || 0}</p>
            </div>
            <div className="bg-white border p-6 rounded-2xl shadow-sm">
                <h2 className="text-sm font-semibold text-zinc-500 flex items-center gap-2"><Clock /> Pending Requests</h2>
                <p className="text-3xl font-bold mt-2">{pendingRequests.length}</p>
            </div>
            <div className="bg-white border p-6 rounded-2xl shadow-sm">
                <h2 className="text-sm font-semibold text-zinc-500 flex items-center gap-2"><CheckCircle2 /> Processed Today</h2>
                <p className="text-3xl font-bold mt-2">{transactions.filter(t => t.date.startsWith(new Date().toISOString().split('T')[0])).length}</p>
            </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border p-6 rounded-2xl shadow-sm">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Send /> Pending Payment Requests</h3>
                <div className="space-y-3">
                    {pendingRequests.map(r => (
                        <div key={r.id} className="text-sm border p-3 rounded-lg flex justify-between items-center bg-zinc-50">
                            <div>
                                <p className="font-semibold">{r.description} ({r.category})</p>
                                <p className="text-xs text-zinc-500">Due: {r.dueDate} | Payee: {r.payeeName}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="font-bold text-zinc-950">₹{r.amount}</span>
                                <button 
                                  onClick={() => handleApprove(r)}
                                  className="bg-emerald-600 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-emerald-700"
                                >
                                  Approve
                                </button>
                            </div>
                        </div>
                    ))}
                    {pendingRequests.length === 0 && <p className="text-xs text-zinc-500">No pending requests.</p>}
                </div>
            </div>
            
            <div className="bg-white border p-6 rounded-2xl shadow-sm">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><ClipboardList /> Transaction History</h3>
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {transactions.slice(-10).reverse().map(t => (
                        <div key={t.id} className="text-sm border-b py-2 flex justify-between">
                            <div>
                                <p className="text-xs font-medium">{getTaskName(t.description)}</p>
                                 <p className="text-[10px] text-zinc-400">
                                     {new Date(t.date).toLocaleString()}
                                     {t.type === 'Cash Out' && t.description && t.description.includes('Payment to ') && (
                                         <span className="block text-zinc-600 font-semibold">
                                             To: {t.description.split('Payment to ')[1].split(' for')[0]}
                                         </span>
                                     )}
                                     {t.type === 'Cash In' && t.source && (
                                         <span className="block text-emerald-700 font-semibold">
                                             From: {t.source}
                                         </span>
                                     )}
                                 </p>
                            </div>
                            <span className={`font-semibold ${t.type === 'Cash In' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {t.type === 'Cash In' ? '+' : '-'} ₹{t.amount}
                            </span>
                        </div>
                    ))}
                    {transactions.length === 0 && <p className="text-xs text-zinc-500">No recent transactions.</p>}
                </div>
            </div>
        </div>

        {/* Inflow Form Modal */}
        {showInflowForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                <form onSubmit={handleInflowSubmit} className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-4 shadow-2xl">
                    <div className="flex justify-between items-center">
                        <h2 className="text-lg font-bold">Record Cash Inflow</h2>
                        <button type="button" onClick={() => setShowInflowForm(false)}><X className="w-5 h-5"/></button>
                    </div>
                    <input type="number" placeholder="Amount (₹)" className="w-full border p-2 rounded-lg" value={inflowAmount} onChange={e => setInflowAmount(e.target.value)} required />
                    <input type="text" placeholder="Description" className="w-full border p-2 rounded-lg" value={inflowDesc} onChange={e => setInflowDesc(e.target.value)} required />
                    <input type="text" placeholder="Source (e.g. Client Name, Owner)" className="w-full border p-2 rounded-lg" value={inflowSource} onChange={e => setInflowSource(e.target.value)} required />
                    <div className="grid grid-cols-2 gap-2">
                        <select className="border p-2 rounded-lg text-sm" value={inflowMethod} onChange={e => setInflowMethod(e.target.value)} required>
                            <option value="">Method</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Cash">Cash</option>
                            <option value="Cheque">Cheque</option>
                        </select>
                        <input type="text" placeholder="Ref/Cheque #" className="border p-2 rounded-lg text-sm" value={inflowRef} onChange={e => setInflowRef(e.target.value)} />
                    </div>
                    <input type="datetime-local" className="w-full border p-2 rounded-lg" value={inflowDate} onChange={e => setInflowDate(e.target.value)} required />
                    <select className="w-full border p-2 rounded-lg" value={inflowProject} onChange={e => setInflowProject(e.target.value)} required>
                        <option value="">Select Project</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.projectName}</option>)}
                    </select>
                    <button type="submit" className="w-full bg-emerald-600 text-white p-2 rounded-lg font-semibold">Record Inflow</button>
                </form>
            </div>
        )}
    </div>
  );
}
