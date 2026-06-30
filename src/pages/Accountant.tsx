import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Wallet, Send, ClipboardList, PlusCircle, X } from 'lucide-react';
import { notify } from '../utils/toast';
import { useConfirm } from '../context/ConfirmContext';
import Select from '../components/Select';

export default function AccountantPage() {
  const confirm = useConfirm();
  const [funds, setFunds] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInflowForm, setShowInflowForm] = useState(false);
  const [inflowAmount, setInflowAmount] = useState('');
  const [inflowDesc, setInflowDesc] = useState('');
  const [inflowType, setInflowType] = useState('client payment');

  useEffect(() => {
    fetchAccountantData();
  }, []);

  const fetchAccountantData = async () => {
    setLoading(true);
    try {
        const [fundRes, reqRes] = await Promise.all([
            api.getOfficeFunds(),
            api.getPaymentRequests()
        ]);
        setFunds(fundRes.officeFunds[0] || { balance: 0 });
        setTransactions(fundRes.officeTransactions || []);
        setRequests(reqRes.paymentRequests || []);
    } catch (err: any) {
        notify.error(err?.message || 'Failed to fetch accountant data');
    } finally {
        setLoading(false);
    }
  };

  const handleApprove = async (request: any) => {
      const ok = await confirm({
        title: 'Approve and pay?',
        message: `Process payment of ₹${request.amount} to ${request.payeeName}? This will record the payout and update office funds.`,
        confirmLabel: 'Approve & Pay',
        variant: 'warning',
      });
      if (!ok) return;

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
          notify.success('Payment processed successfully!');
      } catch (err: any) {
          notify.error(err.message || 'Error processing payment.');
      }
  };

  const handleInflowSubmit = async (e: React.FormEvent) => {
      e.preventDefault();

      const ok = await confirm({
        title: 'Record cash inflow?',
        message: `Record ₹${inflowAmount} cash inflow${inflowDesc ? ` for "${inflowDesc}"` : ''}? Office balance will be updated.`,
        confirmLabel: 'Record Inflow',
        variant: 'default',
      });
      if (!ok) return;

      try {
          await api.postOfficeFund({
              type: 'Cash In',
              amount: Number(inflowAmount),
              description: inflowDesc,
              inflowType
          });
          setInflowAmount('');
          setInflowDesc('');
          setInflowType('client payment');
          setShowInflowForm(false);
          fetchAccountantData();
          notify.success('Inflow recorded successfully!');
      } catch (err: any) {
          notify.error(err.message || 'Error recording inflow.');
      }
  };

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="space-y-6 font-sans p-4">
        <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">Accountant Module</h1>
            <div className="flex gap-4">
                <button 
                  onClick={() => setShowInflowForm(true)}
                  className="bg-zinc-900 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-zinc-800 flex items-center gap-2"
                >
                    <PlusCircle className="w-4 h-4" /> Record Inflow
                </button>
                <div className="bg-white border p-4 rounded-xl shadow-sm flex items-center gap-4">
                    <Wallet className="text-emerald-600" />
                    <div>
                        <h2 className="text-sm font-semibold text-zinc-500">Office Balance</h2>
                        <p className="text-2xl font-bold">₹{funds?.balance || 0}</p>
                    </div>
                </div>
            </div>
        </div>

        {showInflowForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
                <form onSubmit={handleInflowSubmit} className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-4">
                    <div className="flex justify-between items-center">
                        <h2 className="text-lg font-bold">Record Cash Inflow</h2>
                        <button type="button" onClick={() => setShowInflowForm(false)}><X className="w-5 h-5"/></button>
                    </div>
                    <input type="number" placeholder="Amount (₹)" className="w-full border p-2 rounded-lg" value={inflowAmount} onChange={e => setInflowAmount(e.target.value)} required />
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-zinc-650 block">Inflow Type</label>
                        <Select 
                            value={inflowType} 
                            onChange={(val) => setInflowType(val)} 
                            className="w-full border p-2 rounded-lg bg-white text-xs font-semibold text-zinc-700 outline-none"
                            required
                            options={[
                                { value: 'client payment', label: 'Client Payment' },
                                { value: 'credit', label: 'Credit' },
                                { value: 'custom', label: 'Custom' }
                            ]}
                        />
                    </div>
                    <input type="text" placeholder="Description" className="w-full border p-2 rounded-lg" value={inflowDesc} onChange={e => setInflowDesc(e.target.value)} required />
                    <button type="submit" className="w-full bg-emerald-600 text-white p-2 rounded-lg font-semibold">Submit</button>
                </form>
            </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border p-6 rounded-2xl shadow-sm">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Send /> Payment Requests</h3>
                <div className="space-y-3">
                    {requests.filter(r => r.status === 'Pending').map(r => (
                        <div key={r.id} className="text-sm border p-3 rounded-lg flex justify-between items-center">
                            <div>
                                <p className="font-semibold">{r.description} ({r.category})</p>
                                <p className="text-xs text-zinc-500">Due: {r.dueDate} | Priority: {r.priority}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="font-bold text-zinc-950">₹{r.amount}</span>
                                <button 
                                  onClick={() => handleApprove(r)}
                                  className="bg-emerald-600 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-emerald-700"
                                >
                                  Approve & Pay
                                </button>
                            </div>
                        </div>
                    ))}
                    {requests.filter(r => r.status === 'Pending').length === 0 && <p className="text-xs text-zinc-500">No pending requests.</p>}
                </div>
            </div>
            
            <div className="bg-white border p-6 rounded-2xl shadow-sm">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><ClipboardList /> Recent Transactions</h3>
                <div className="space-y-3">
                    {transactions.slice(-10).reverse().map(t => (
                        <div key={t.id} className="text-sm border-b py-2 flex justify-between items-start">
                            <div>
                                <span className="block font-medium">{t.description}</span>
                                {t.type === 'Cash In' && t.inflowType && (
                                    <span className="inline-flex text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100 px-1 py-0.5 rounded mt-1">
                                        {t.inflowType}
                                    </span>
                                )}
                            </div>
                            <span className={`font-semibold shrink-0 ${t.type === 'Cash In' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {t.type === 'Cash In' ? '+' : '-'} ₹{t.amount}
                            </span>
                        </div>
                    ))}
                    {transactions.length === 0 && <p className="text-xs text-zinc-500">No recent transactions.</p>}
                </div>
            </div>
        </div>
    </div>
  );
}
