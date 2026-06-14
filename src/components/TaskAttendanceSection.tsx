import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, CheckSquare, Users, BookmarkCheck, Banknote } from 'lucide-react';
import { api } from '../api/client';
import { AttendanceStatus, CrewMember } from '../types';
import { notify } from '../utils/toast';
import { useConfirm } from '../context/ConfirmContext';

interface WorkerAttendanceRow {
  workerName: string;
  status?: AttendanceStatus;
  dailyWage: number;
  overtimeAmount: number;
  paymentStatus: 'Paid' | 'Pending' | 'Unpaid';
  recordId?: string;
}

interface TaskAttendanceSectionProps {
  projectId: string;
  taskId: string;
  assignedStaff?: string;
  onSaved?: () => void;
}

function calcDue(w: WorkerAttendanceRow): number {
  const base =
    w.status === 'Present' ? w.dailyWage : w.status === 'Half Day' ? w.dailyWage * 0.5 : 0;
  return base + (w.overtimeAmount || 0);
}

export default function TaskAttendanceSection({
  projectId,
  taskId,
  assignedStaff,
  onSaved
}: TaskAttendanceSectionProps) {
  const confirm = useConfirm();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [workers, setWorkers] = useState<WorkerAttendanceRow[]>([]);
  const [crewRoster, setCrewRoster] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionWorker, setActionWorker] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'attendance' | 'pay' | null>(null);

  const assignedWorkers = (assignedStaff || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const loadAttendance = useCallback(async () => {
    if (!projectId || !taskId || assignedWorkers.length === 0) {
      setWorkers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [crewRes, attRes] = await Promise.all([
        api.getCrew('active').catch(() => ({ crew: [] })),
        api.getAttendance(projectId, taskId, date)
      ]);

      const roster: CrewMember[] = crewRes.crew || [];
      setCrewRoster(roster);

      const existing = attRes.attendance || [];
      const rows: WorkerAttendanceRow[] = assignedWorkers.map(name => {
        const record = existing.find((a: any) => a.workerName === name);
        const crewMember = roster.find(c => c.name.toLowerCase() === name.toLowerCase());
        return {
          workerName: name,
          status: record?.status,
          dailyWage: record?.dailyWage ?? crewMember?.dailyWage ?? 200,
          overtimeAmount: record?.overtimeAmount || 0,
          paymentStatus: record?.paymentStatus || 'Unpaid',
          recordId: record?.id
        };
      });

      setWorkers(rows);
    } catch (err: any) {
      notify.error(err?.message || 'Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, [projectId, taskId, date, assignedStaff]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const updateWorker = (idx: number, field: keyof WorkerAttendanceRow, value: any) => {
    setWorkers(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const formatCur = (num: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);

  const handleMarkAttendance = async (idx: number, newStatus?: AttendanceStatus | null, newDailyWage?: number, newOvertimeAmount?: number) => {
    const w = workers[idx];
    const shouldDelete = newStatus === null;
    const status = newStatus !== undefined ? newStatus : w.status;
    const dailyWage = newDailyWage !== undefined ? newDailyWage : w.dailyWage;
    const overtimeAmount = newOvertimeAmount !== undefined ? newOvertimeAmount : w.overtimeAmount;

    try {
      setActionWorker(w.workerName);
      setActionType('attendance');

      if (shouldDelete) {
        if (w.recordId) {
          await api.deleteAttendance(w.recordId);
        }
      } else {
        if (!status) return;

        if (w.recordId) {
          await api.updateAttendance(w.recordId, {
            workerName: w.workerName,
            status,
            dailyWage,
            overtimeAmount,
            paymentStatus: w.paymentStatus,
          });
        } else {
          await api.bulkAttendance({
            projectId,
            taskId,
            date,
            workers: [{
              workerName: w.workerName,
              status,
              dailyWage,
              overtimeAmount,
              paymentStatus: w.paymentStatus,
            }]
          });
        }
      }

      loadAttendance();
      onSaved?.();
    } catch (err: any) {
      notify.error(err?.message || 'Failed to update attendance');
    } finally {
      setActionWorker(null);
      setActionType(null);
    }
  };

  const handlePay = async (idx: number) => {
    const w = workers[idx];

    if (!w.recordId) {
      notify.warning('Mark attendance first before processing payment.');
      return;
    }

    if (w.paymentStatus === 'Paid') {
      notify.info(`${w.workerName} is already marked as paid.`);
      return;
    }

    const due = calcDue(w);
    if (due <= 0) {
      notify.warning('No wages due for this worker on this date.');
      return;
    }

    const ok = await confirm({
      title: 'Mark as paid?',
      message: `Record ${formatCur(due)} payout for ${w.workerName} on ${date}?`,
      confirmLabel: 'Mark Paid',
      variant: 'default',
    });
    if (!ok) return;

    try {
      setActionWorker(w.workerName);
      setActionType('pay');

      await api.updateAttendance(w.recordId, {
        workerName: w.workerName,
        status: w.status,
        dailyWage: w.dailyWage,
        overtimeAmount: w.overtimeAmount,
        paymentStatus: 'Pending',
      });

      await api.createPaymentRequest({
        projectId,
        taskId,
        payeeName: w.workerName,
        category: 'Worker',
        amount: due,
        description: `Payment for ${w.workerName} on ${date} (Task: ${taskId})`,
        dueDate: date,
        priority: 'Medium',
        paymentMethod: 'Bank Transfer',
        status: 'Pending',
        createdAt: new Date().toISOString()
      });

      updateWorker(idx, 'paymentStatus', 'Pending');
      notify.success(`Payment request submitted for ${w.workerName}.`);
      onSaved?.();
    } catch (err: any) {
      notify.error(err?.message || 'Failed to mark payment');
    } finally {
      setActionWorker(null);
      setActionType(null);
    }
  };

  if (assignedWorkers.length === 0) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[11px] font-black text-zinc-900 uppercase tracking-wide flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-zinc-500" />
            <span>Worker Attendance</span>
          </span>
        </div>
        <p className="text-[10px] text-zinc-400 italic text-center py-4 select-none">
          No workers assigned to this task. Assign crew in task settings first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[11px] font-black text-zinc-900 uppercase tracking-wide flex items-center gap-1">
          <CheckSquare className="w-3.5 h-3.5 text-zinc-500" />
          <span>Worker Attendance ({assignedWorkers.length})</span>
        </span>
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3 h-3 text-zinc-400" />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-[10px] font-semibold bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 border-2 border-zinc-900/10 border-t-zinc-900 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-[10px] text-left border-collapse min-w-[560px]">
            <thead>
              <tr className="bg-zinc-50 text-zinc-400 uppercase font-bold text-[9px] border-b border-zinc-200">
                <th className="py-2 px-2">Worker</th>
                <th className="py-2 px-2">Status</th>
                <th className="py-2 px-2">Wage</th>
                <th className="py-2 px-2">OT</th>
                <th className="py-2 px-2 text-right">Due</th>
                <th className="py-2 px-2 text-center">Payout</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {workers.map((w, idx) => {
                const crewMember = crewRoster.find(c => c.name.toLowerCase() === w.workerName.toLowerCase());
                const due = calcDue(w);
                const isBusy = actionWorker === w.workerName;

                return (
                  <tr key={w.workerName} className="hover:bg-zinc-50/60">
                    <td className="py-2 px-2 align-middle">
                      <span className="font-bold text-zinc-900 block leading-tight">{w.workerName}</span>
                      {crewMember && (
                        <span className="text-[9px] text-zinc-400 font-semibold">{crewMember.trade}</span>
                      )}
                    </td>
                    <td className="py-2 px-2 align-middle">
                      <div className="flex items-center gap-1 min-w-[210px]">
                        {[
                          { key: 'Present', label: 'Present', activeBg: 'bg-emerald-600 text-white border-emerald-600', inactiveBg: 'bg-white hover:bg-emerald-50 text-emerald-600 border-emerald-200' },
                          { key: 'Absent', label: 'Absent', activeBg: 'bg-rose-600 text-white border-rose-600', inactiveBg: 'bg-white hover:bg-rose-50 text-rose-600 border-rose-200' },
                          { key: 'Half Day', label: 'Half Day', activeBg: 'bg-blue-600 text-white border-blue-600', inactiveBg: 'bg-white hover:bg-blue-50 text-blue-600 border-blue-200' }
                        ].map(opt => {
                          const isActive = w.status === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                if (isActive) {
                                  updateWorker(idx, 'status', undefined);
                                  handleMarkAttendance(idx, null);
                                } else {
                                  updateWorker(idx, 'status', opt.key as AttendanceStatus);
                                  handleMarkAttendance(idx, opt.key as AttendanceStatus);
                                }
                              }}
                              className={`px-2 py-1 rounded-lg border text-[9px] font-bold transition-all ${
                                isActive ? opt.activeBg : opt.inactiveBg
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-2 px-2 align-middle">
                      <input
                        type="number"
                        min={0}
                        value={w.dailyWage}
                        disabled={isBusy}
                        onChange={(e) => updateWorker(idx, 'dailyWage', Number(e.target.value))}
                        onBlur={(e) => handleMarkAttendance(idx, undefined, Number(e.target.value))}
                        className="w-16 text-[10px] font-semibold border border-zinc-200 rounded-lg px-1.5 py-1 bg-white focus:border-zinc-950 outline-none"
                        title="Daily wage"
                      />
                    </td>
                    <td className="py-2 px-2 align-middle">
                      <input
                        type="number"
                        min={0}
                        value={w.overtimeAmount}
                        disabled={isBusy}
                        onChange={(e) => updateWorker(idx, 'overtimeAmount', Number(e.target.value))}
                        onBlur={(e) => handleMarkAttendance(idx, undefined, undefined, Number(e.target.value))}
                        className="w-14 text-[10px] font-semibold border border-zinc-200 rounded-lg px-1.5 py-1 bg-white focus:border-zinc-950 outline-none"
                        title="Overtime"
                      />
                    </td>
                    <td className="py-2 px-2 align-middle text-right font-bold text-zinc-800 whitespace-nowrap">
                      {formatCur(due)}
                    </td>
                    <td className="py-2 px-2 align-middle text-center">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                        w.paymentStatus === 'Paid'
                          ? 'bg-emerald-50 text-emerald-700'
                          : w.paymentStatus === 'Pending'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-zinc-100 text-zinc-500'
                      }`}>
                        {w.paymentStatus === 'Paid' ? 'Paid' : w.paymentStatus === 'Pending' ? 'Pending' : 'Unpaid'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
