import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, CheckSquare, Users, BookmarkCheck } from 'lucide-react';
import { api } from '../api/client';
import { AttendanceStatus, CrewMember } from '../types';
import { notify } from '../utils/toast';
import { useConfirm } from '../context/ConfirmContext';

interface WorkerAttendanceRow {
  workerName: string;
  status: AttendanceStatus;
  dailyWage: number;
  overtimeAmount: number;
  paymentStatus: 'Paid' | 'Pending';
  recordId?: string;
}

interface TaskAttendanceSectionProps {
  projectId: string;
  taskId: string;
  assignedStaff?: string;
  onSaved?: () => void;
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
  const [saving, setSaving] = useState(false);

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
          status: record?.status || 'Present',
          dailyWage: record?.dailyWage ?? crewMember?.dailyWage ?? 200,
          overtimeAmount: record?.overtimeAmount || 0,
          paymentStatus: record?.paymentStatus || 'Pending',
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

  const handleSave = async () => {
    if (workers.length === 0) return;

    const presentCount = workers.filter(w => w.status !== 'Absent').length;
    const ok = await confirm({
      title: 'Save attendance?',
      message: `Record attendance for ${workers.length} assigned worker(s) on ${date}? ${presentCount} marked present or half day.`,
      confirmLabel: 'Save Attendance',
      variant: 'default',
    });
    if (!ok) return;

    try {
      setSaving(true);
      await api.bulkAttendance({
        projectId,
        taskId,
        date,
        workers: workers.map(w => ({
          workerName: w.workerName,
          status: w.status,
          dailyWage: w.dailyWage,
          overtimeAmount: w.overtimeAmount,
          paymentStatus: w.paymentStatus
        }))
      });
      notify.success('Attendance saved for assigned workers.');
      loadAttendance();
      onSaved?.();
    } catch (err: any) {
      notify.error(err?.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const formatCur = (num: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);

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
        <>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {workers.map((w, idx) => {
              const crewMember = crewRoster.find(c => c.name.toLowerCase() === w.workerName.toLowerCase());
              const due =
                (w.status === 'Present' ? w.dailyWage : w.status === 'Half Day' ? w.dailyWage * 0.5 : 0) +
                (w.overtimeAmount || 0);

              return (
                <div key={w.workerName} className="p-2.5 bg-zinc-50 border rounded-lg space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-bold text-zinc-900 block">{w.workerName}</span>
                      {crewMember && (
                        <span className="text-[9px] text-zinc-400 font-semibold">{crewMember.trade}</span>
                      )}
                    </div>
                    <span className="text-[10px] font-bold text-zinc-700">{formatCur(due)}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    <select
                      value={w.status}
                      onChange={(e) => updateWorker(idx, 'status', e.target.value as AttendanceStatus)}
                      className="text-[10px] font-semibold border border-zinc-200 rounded-lg px-1.5 py-1 bg-white"
                    >
                      <option value="Present">Present</option>
                      <option value="Absent">Absent</option>
                      <option value="Half Day">Half Day</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={w.dailyWage}
                      onChange={(e) => updateWorker(idx, 'dailyWage', Number(e.target.value))}
                      placeholder="Wage"
                      className="text-[10px] font-semibold border border-zinc-200 rounded-lg px-1.5 py-1 bg-white"
                      title="Daily wage"
                    />
                    <input
                      type="number"
                      min={0}
                      value={w.overtimeAmount}
                      onChange={(e) => updateWorker(idx, 'overtimeAmount', Number(e.target.value))}
                      placeholder="OT"
                      className="text-[10px] font-semibold border border-zinc-200 rounded-lg px-1.5 py-1 bg-white"
                      title="Overtime"
                    />
                    <select
                      value={w.paymentStatus}
                      onChange={(e) => updateWorker(idx, 'paymentStatus', e.target.value)}
                      className="text-[10px] font-semibold border border-zinc-200 rounded-lg px-1.5 py-1 bg-white"
                    >
                      <option value="Pending">Pending</option>
                      <option value="Paid">Paid</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2 bg-zinc-950 hover:bg-zinc-800 disabled:opacity-60 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <BookmarkCheck className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Save Attendance'}</span>
          </button>
        </>
      )}
    </div>
  );
}
