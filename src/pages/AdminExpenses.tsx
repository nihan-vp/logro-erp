import React from 'react';
import ExpensesPage from './Expenses';

export default function AdminExpenses() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-zinc-950">Admin Expenses Management</h1>
      <ExpensesPage />
    </div>
  );
}
