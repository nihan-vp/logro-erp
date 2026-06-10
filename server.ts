import express from 'express';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { readDb, writeDb, hashPassword } from './server/db';
import { Project, Task, Expense, Attendance, Payment, UserRole, ProjectStatus, TaskStatus, ExpenseCategory, PayeeType, PaymentStatus, AttendanceStatus } from './src/types';

// Initialize environment variables from .env
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// Set up server-side JSON and Form data limit (generous for base-64 bill images)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Disable caching for all API responses to ensure stats are always up-to-date and live
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Dynamic JWT verification middleware
// Instead of requiring external jsonwebtoken package, we use a lightweight, robust, standard
// cryptography-based token verification method. A token is: Base64(payload) + '.' + Signature(Base64(payload))
const JWT_SECRET = 'construction_jwt_secret_key_2026';

function signToken(payload: { userId: string; role: UserRole; name: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token: string): { userId: string; role: UserRole; name: string } | null {
  try {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;

    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');

    if (signature !== expectedSignature) return null;

    return JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
  } catch (err) {
    return null;
  }
}

// REST Middleware: Auth checker
function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header is missing' });
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Bearer token format invalid' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Token is invalid or expired' });
  }

  req.user = payload;
  next();
}

// REST Middleware: Role checker for Admin or Accountant
function requireAdminOrAccountant(req: any, res: any, next: any) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'accountant')) {
    return res.status(403).json({ error: 'Forbidden: Access restricted' });
  }
  next();
}

// REST Middleware: Role checker for Admin only
function requireAdmin(req: any, res: any, next: any) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Access restricted to administrators' });
  }
  next();
}

// REST APIs

// Rate limiting failed login attempts
interface LoginAttempt {
  attempts: number;
  lockoutUntil: number;
}
const loginAttempts: Record<string, LoginAttempt> = {};
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

// 1. Auth API
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Please provide email and password' });
  }

  const emailKey = email.toLowerCase().trim();

  // Check if locked out
  const attempt = loginAttempts[emailKey];
  if (attempt && attempt.lockoutUntil > Date.now()) {
    const minutesLeft = Math.ceil((attempt.lockoutUntil - Date.now()) / (60 * 1000));
    return res.status(429).json({
      error: `Too many login attempts. Please try again after ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}.`
    });
  }

  const db = readDb();
  const user = db.users.find(u => u.email.toLowerCase() === emailKey);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const expectedPassword = user.password || 'password123';
  if (password !== expectedPassword) {
    // Record failed attempt
    const currentAttempt = loginAttempts[emailKey] || { attempts: 0, lockoutUntil: 0 };
    
    // If lockout expired, reset
    if (currentAttempt.lockoutUntil > 0 && currentAttempt.lockoutUntil <= Date.now()) {
      currentAttempt.attempts = 0;
      currentAttempt.lockoutUntil = 0;
    }

    currentAttempt.attempts += 1;
    if (currentAttempt.attempts >= MAX_ATTEMPTS) {
      currentAttempt.lockoutUntil = Date.now() + LOCKOUT_TIME;
      loginAttempts[emailKey] = currentAttempt;
      return res.status(429).json({
        error: `Too many login attempts. Account is temporarily locked. Please try again after 15 minutes.`
      });
    }

    loginAttempts[emailKey] = currentAttempt;
    const remaining = MAX_ATTEMPTS - currentAttempt.attempts;
    return res.status(401).json({
      error: `Invalid email or password. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`
    });
  }

  // Successful login: reset attempts
  delete loginAttempts[emailKey];

  const token = signToken({
    userId: user.id,
    role: user.role,
    name: user.name
  });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      status: user.status
    }
  });
});

// User/Roles screen - List and Manage Users for Admin
app.get('/api/users', requireAuth, (req, res) => {
  const db = readDb();
  res.json({ users: db.users });
});

app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
  const { name, email, role, phone } = req.body;
  if (!name || !email || !role) {
    return res.status(400).json({ error: 'Name, email, and role are required' });
  }

  const db = readDb();
  if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: 'A user with this email already exists' });
  }

  const newUser = {
    id: 'usr_' + Date.now(),
    name,
    email,
    role: role as UserRole,
    phone,
    status: 'active' as const
  };

  db.users.push(newUser);
  writeDb(db);
  res.status(201).json(newUser);
});

// Toggle User status (Active/Inactive)
app.patch('/api/users/:id/status', requireAuth, requireAdmin, (req, res) => {
  const { status } = req.body;
  if (status !== 'active' && status !== 'inactive') {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  const db = readDb();
  const userIndex = db.users.findIndex(u => u.id === req.params.id);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  db.users[userIndex].status = status;
  writeDb(db);
  res.json(db.users[userIndex]);
});

// Update Profile API for Settings
app.put('/api/users/profile', requireAuth, (req: any, res) => {
  const { name, phone } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const db = readDb();
  const userIndex = db.users.findIndex(u => u.id === req.user.userId);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  db.users[userIndex].name = name;
  if (phone !== undefined) db.users[userIndex].phone = phone;

  writeDb(db);
  res.json(db.users[userIndex]);
});

// Helper for Calculations
function calculateMetrics() {
  const db = readDb();

  // Calculate Task-level and Project-level expenses, budgets, workers, wages
  // 1. Task wages from labor attendance: status 'Present' or 'Half Day'
  // Present = 1.0 * wage, Half Day = 0.5 * wage. Add overtime.
  const taskToLabourCost: Record<string, number> = {};
  db.attendance.forEach(att => {
    let wagePortion = 0;
    if (att.status === 'Present') {
      wagePortion = att.dailyWage;
    } else if (att.status === 'Half Day') {
      wagePortion = att.dailyWage * 0.5;
    }
    const cost = wagePortion + (att.overtimeAmount || 0);
    taskToLabourCost[att.taskId] = (taskToLabourCost[att.taskId] || 0) + cost;
  });

  // 2. Task regular expenses
  const taskToExpensesCost: Record<string, number> = {};
  db.expenses.forEach(exp => {
    taskToExpensesCost[exp.taskId] = (taskToExpensesCost[exp.taskId] || 0) + exp.amount;
  });

  // 3. Task payments made
  const taskToPaymentsMade: Record<string, number> = {};
  db.payments.forEach(pay => {
    if (pay.paymentStatus === 'Paid') {
      taskToPaymentsMade[pay.taskId] = (taskToPaymentsMade[pay.taskId] || 0) + pay.amount;
    }
  });

  return {
    taskToLabourCost,
    taskToExpensesCost,
    taskToPaymentsMade
  };
}

// 2. Project routes
app.get('/api/projects', requireAuth, (req, res) => {
  const db = readDb();
  const { taskToLabourCost, taskToExpensesCost, taskToPaymentsMade } = calculateMetrics();

  // Calculate project statistics on-the-fly
  const projectsWithStats = db.projects.map(prj => {
    const projectTasks = db.tasks.filter(t => t.projectId === prj.id);
    const totalBudget = projectTasks.reduce((acc, t) => acc + t.assignedBudget, 0);

    // Total expenses of this project layout
    const projectExpenses = db.expenses.filter(e => e.projectId === prj.id);
    const regularExpenseAmt = projectExpenses.reduce((acc, e) => acc + e.amount, 0);

    // Project labour cost
    const projectAttendance = db.attendance.filter(a => a.projectId === prj.id);
    const labourCostAmt = projectAttendance.reduce((acc, att) => {
      let portion = att.status === 'Present' ? 1 : att.status === 'Half Day' ? 0.5 : 0;
      return acc + (att.dailyWage * portion) + (att.overtimeAmount || 0);
    }, 0);

    const totalActualExpense = regularExpenseAmt + labourCostAmt;

    // Total payments of this project
    const projectPayments = db.payments.filter(p => p.projectId === prj.id);
    const totalPaidAmount = projectPayments.filter(p => p.paymentStatus === 'Paid').reduce((acc, p) => acc + p.amount, 0);
    const pendingPaymentsAmt = projectPayments.filter(p => p.paymentStatus === 'Pending').reduce((acc, p) => acc + p.amount, 0);

    const profitLoss = totalBudget - totalActualExpense;
    const profitPercentage = totalBudget > 0 ? (profitLoss / totalBudget) * 100 : 0;

    return {
      ...prj,
      totalBudget,
      totalExpenses: totalActualExpense,
      totalPaidAmount,
      pendingPayments: pendingPaymentsAmt,
      profitLoss,
      profitPercentage,
      taskCount: projectTasks.length
    };
  });

  res.json({ projects: projectsWithStats });
});

app.post('/api/projects', requireAuth, (req: any, res) => {
  const { projectName, clientName, location, startDate, expectedEndDate, status, notes } = req.body;
  if (!projectName || !clientName || !location || !startDate || !expectedEndDate) {
    return res.status(400).json({ error: 'All core project fields are required' });
  }

  const db = readDb();
  const newProject: Project = {
    id: 'prj_' + Date.now(),
    projectName,
    clientName,
    location,
    startDate,
    expectedEndDate,
    status: (status || 'Pending') as ProjectStatus,
    notes,
    createdBy: req.user.userId,
    createdAt: new Date().toISOString()
  };

  db.projects.push(newProject);
  writeDb(db);
  res.status(201).json(newProject);
});

app.put('/api/projects/:id', requireAuth, (req, res) => {
  const { projectName, clientName, location, startDate, expectedEndDate, status, notes } = req.body;
  if (!projectName || !clientName || !location || !startDate || !expectedEndDate) {
    return res.status(400).json({ error: 'All core project fields are required' });
  }

  const db = readDb();
  const prjIdx = db.projects.findIndex(p => p.id === req.params.id);
  if (prjIdx === -1) {
    return res.status(404).json({ error: 'Project not found' });
  }

  db.projects[prjIdx] = {
    ...db.projects[prjIdx],
    projectName,
    clientName,
    location,
    startDate,
    expectedEndDate,
    status: status as ProjectStatus,
    notes
  };

  writeDb(db);
  res.json(db.projects[prjIdx]);
});

app.delete('/api/projects/:id', requireAuth, (req, res) => {
  const db = readDb();
  const prjIdx = db.projects.findIndex(p => p.id === req.params.id);
  if (prjIdx === -1) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // Do cascade delete of tasks, expenses, payments, attendance
  db.projects.splice(prjIdx, 1);
  db.tasks = db.tasks.filter(t => t.projectId !== req.params.id);
  db.expenses = db.expenses.filter(e => e.projectId !== req.params.id);
  db.payments = db.payments.filter(p => p.projectId !== req.params.id);
  db.attendance = db.attendance.filter(a => a.projectId !== req.params.id);

  writeDb(db);
  res.json({ success: true, message: 'Project and all related data deleted successfully' });
});

// 3. Task routes
app.get('/api/tasks', requireAuth, (req, res) => {
  const db = readDb();
  const { projectId } = req.query;

  let tasks = db.tasks;
  if (projectId) {
    tasks = tasks.filter(t => t.projectId === projectId);
  }

  // Calculate task statistics
  const { taskToLabourCost, taskToExpensesCost, taskToPaymentsMade } = calculateMetrics();

  const tasksWithStats = tasks.map(tsk => {
    const labourCost = taskToLabourCost[tsk.id] || 0;
    const directExpenses = taskToExpensesCost[tsk.id] || 0;
    const totalExpenses = directExpenses + labourCost;
    const paymentsPaid = taskToPaymentsMade[tsk.id] || 0;
    const remainingBudget = tsk.assignedBudget - totalExpenses;
    const profitLoss = tsk.assignedBudget - totalExpenses;
    const isOverBudget = totalExpenses > tsk.assignedBudget;

    // Find matching project details
    const prj = db.projects.find(p => p.id === tsk.projectId);

    return {
      ...tsk,
      projectName: prj ? prj.projectName : 'Unknown Project',
      labourCost,
      directExpenses,
      totalExpenses,
      paymentsPaid,
      remainingBudget,
      profitLoss,
      isOverBudget
    };
  });

  res.json({ tasks: tasksWithStats });
});

app.post('/api/tasks', requireAuth, (req, res) => {
  const { projectId, taskName, description, assignedBudget, assignedStaff, startDate, endDate, progress, status, notes } = req.body;
  if (!projectId || !taskName || assignedBudget === undefined || !startDate || !endDate) {
    return res.status(400).json({ error: 'Project, Task Name, Budget, Start Date, and End Date are required' });
  }

  const db = readDb();
  const newTask: Task = {
    id: 'tsk_' + Date.now(),
    projectId,
    taskName,
    description,
    assignedBudget: Number(assignedBudget),
    assignedStaff,
    startDate,
    endDate,
    progress: progress !== undefined ? Number(progress) : 0,
    status: (status || 'Pending') as TaskStatus,
    notes
  };

  db.tasks.push(newTask);
  writeDb(db);
  res.status(201).json(newTask);
});

app.put('/api/tasks/:id', requireAuth, (req, res) => {
  const { taskName, description, assignedBudget, assignedStaff, startDate, endDate, progress, status, notes } = req.body;
  if (!taskName || assignedBudget === undefined || !startDate || !endDate) {
    return res.status(400).json({ error: 'Task Name, Budget, Start and End dates are required' });
  }

  const db = readDb();
  const tskIdx = db.tasks.findIndex(t => t.id === req.params.id);
  if (tskIdx === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  db.tasks[tskIdx] = {
    ...db.tasks[tskIdx],
    taskName,
    description,
    assignedBudget: Number(assignedBudget),
    assignedStaff,
    startDate,
    endDate,
    progress: progress !== undefined ? Number(progress) : db.tasks[tskIdx].progress,
    status: status as TaskStatus,
    notes
  };

  writeDb(db);
  res.json(db.tasks[tskIdx]);
});

app.delete('/api/tasks/:id', requireAuth, (req, res) => {
  const db = readDb();
  const tskIdx = db.tasks.findIndex(t => t.id === req.params.id);
  if (tskIdx === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  db.tasks.splice(tskIdx, 1);
  db.expenses = db.expenses.filter(e => e.taskId !== req.params.id);
  db.payments = db.payments.filter(p => p.taskId !== req.params.id);
  db.attendance = db.attendance.filter(a => a.taskId !== req.params.id);

  writeDb(db);
  res.json({ success: true, message: 'Task and related entries deleted' });
});

// 4. Expense routes (Linked to task & project)
app.get('/api/expenses', requireAuth, (req, res) => {
  const db = readDb();
  const { projectId, taskId } = req.query;

  let expenses = db.expenses;
  if (projectId) {
    expenses = expenses.filter(e => e.projectId === projectId);
  }
  if (taskId) {
    expenses = expenses.filter(e => e.taskId === taskId);
  }

  // Hydrate expense values
  const hydrated = expenses.map(e => {
    const prj = db.projects.find(p => p.id === e.projectId);
    const tsk = db.tasks.find(t => t.id === e.taskId);
    return {
      ...e,
      projectName: prj ? prj.projectName : 'Unknown Project',
      taskName: tsk ? tsk.taskName : 'Unknown Task'
    };
  });

  res.json({ expenses: hydrated.reverse() }); // Latest first
});

app.post('/api/expenses', requireAuth, (req: any, res) => {
  console.log("POST /api/expenses received. Body:", JSON.stringify(req.body));
  try {
    const { projectId, taskId, category, amount, paidTo, paymentMethod, date, notes, billImage } = req.body;
    if (!projectId || !taskId || !category || amount === undefined || !paidTo || !paymentMethod || !date) {
      console.log("Validation failed");
      return res.status(400).json({ error: 'All core expense fields are required' });
    }

    const db = readDb();
    const newExpense: Expense = {
      id: 'exp_' + Date.now(),
      projectId,
      taskId,
      category: category as ExpenseCategory,
      amount: Number(amount),
      paidTo,
      paymentMethod,
      date,
      notes,
      billImage, // Store direct base 64 string
      createdBy: req.user.userId
    };

    db.expenses.push(newExpense);
    writeDb(db);
    res.status(201).json(newExpense);
  } catch (err) {
    console.error("Error in POST /api/expenses:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.put('/api/expenses/:id', requireAuth, (req, res) => {
  const { category, amount, paidTo, paymentMethod, date, notes, billImage } = req.body;
  if (!category || amount === undefined || !paidTo || !paymentMethod || !date) {
    return res.status(400).json({ error: 'All core fields are required' });
  }

  const db = readDb();
  const expIdx = db.expenses.findIndex(e => e.id === req.params.id);
  if (expIdx === -1) {
    return res.status(404).json({ error: 'Expense not found' });
  }

  db.expenses[expIdx] = {
    ...db.expenses[expIdx],
    category: category as ExpenseCategory,
    amount: Number(amount),
    paidTo,
    paymentMethod,
    date,
    notes,
    billImage: billImage !== undefined ? billImage : db.expenses[expIdx].billImage
  };

  writeDb(db);
  res.json(db.expenses[expIdx]);
});

app.delete('/api/expenses/:id', requireAuth, (req, res) => {
  const db = readDb();
  const expIdx = db.expenses.findIndex(e => e.id === req.params.id);
  if (expIdx === -1) {
    return res.status(404).json({ error: 'Expense not found' });
  }
  db.expenses.splice(expIdx, 1);
  writeDb(db);
  res.json({ success: true, message: 'Expense deleted successfully' });
});

// 5. Attendance routes
app.get('/api/attendance', requireAuth, (req, res) => {
  const db = readDb();
  const { projectId, taskId, date } = req.query;

  let attendance = db.attendance;
  if (projectId) {
    attendance = attendance.filter(a => a.projectId === projectId);
  }
  if (taskId) {
    attendance = attendance.filter(a => a.taskId === taskId);
  }
  if (date) {
    attendance = attendance.filter(a => a.date === date);
  }

  const hydrated = attendance.map(a => {
    const prj = db.projects.find(p => p.id === a.projectId);
    const tsk = db.tasks.find(t => t.id === a.taskId);
    return {
      ...a,
      projectName: prj ? prj.projectName : 'Unknown Project',
      taskName: tsk ? tsk.taskName : 'Unknown Task'
    };
  });

  res.json({ attendance: hydrated });
});

app.post('/api/attendance', requireAuth, (req, res) => {
  const { projectId, taskId, workerName, date, status, dailyWage, overtimeAmount, paymentStatus, notes } = req.body;
  if (!projectId || !taskId || !workerName || !date || !status || dailyWage === undefined) {
    return res.status(400).json({ error: 'Project, Task, Worker Name, Date, Status and Daily Wage are required' });
  }

  const db = readDb();
  const newAttendance: Attendance = {
    id: 'att_' + Date.now(),
    projectId,
    taskId,
    workerName,
    date,
    status: status as AttendanceStatus,
    dailyWage: Number(dailyWage),
    overtimeAmount: overtimeAmount !== undefined ? Number(overtimeAmount) : 0,
    paymentStatus: (paymentStatus || 'Pending') as 'Paid' | 'Pending',
    notes
  };

  db.attendance.push(newAttendance);
  writeDb(db);
  res.status(201).json(newAttendance);
});

// bulk marking for fast on-site labor checks
app.post('/api/attendance/bulk', requireAuth, (req, res) => {
  const { projectId, taskId, date, workers } = req.body; // workers: Array of { workerName, status, dailyWage, overtimeAmount }
  if (!projectId || !taskId || !date || !Array.isArray(workers)) {
    return res.status(400).json({ error: 'Valid Project, Task, Date and workers array are required' });
  }

  const db = readDb();
  const addedRecords: Attendance[] = [];

  workers.forEach((w: any) => {
    if (!w.workerName || !w.status || w.dailyWage === undefined) return;

    // Remove if there's an existing record for same worker, same task, same date to prevent duplicates
    db.attendance = db.attendance.filter(a =>
      !(a.workerName === w.workerName && a.taskId === taskId && a.date === date)
    );

    const newAtt: Attendance = {
      id: 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      projectId,
      taskId,
      workerName: w.workerName,
      date,
      status: w.status as AttendanceStatus,
      dailyWage: Number(w.dailyWage),
      overtimeAmount: w.overtimeAmount !== undefined ? Number(w.overtimeAmount) : 0,
      paymentStatus: (w.paymentStatus || 'Pending') as 'Paid' | 'Pending',
      notes: w.notes
    };

    db.attendance.push(newAtt);
    addedRecords.push(newAtt);
  });

  writeDb(db);
  res.status(201).json({ success: true, count: addedRecords.length, records: addedRecords });
});

app.put('/api/attendance/:id', requireAuth, (req, res) => {
  const { status, dailyWage, overtimeAmount, paymentStatus, notes, workerName } = req.body;
  if (!status || dailyWage === undefined) {
    return res.status(400).json({ error: 'Status and daily wage are required' });
  }

  const db = readDb();
  const attIdx = db.attendance.findIndex(a => a.id === req.params.id);
  if (attIdx === -1) {
    return res.status(404).json({ error: 'Attendance record not found' });
  }

  db.attendance[attIdx] = {
    ...db.attendance[attIdx],
    workerName: workerName || db.attendance[attIdx].workerName,
    status: status as AttendanceStatus,
    dailyWage: Number(dailyWage),
    overtimeAmount: overtimeAmount !== undefined ? Number(overtimeAmount) : db.attendance[attIdx].overtimeAmount,
    paymentStatus: (paymentStatus || db.attendance[attIdx].paymentStatus) as 'Paid' | 'Pending',
    notes
  };

  writeDb(db);
  res.json(db.attendance[attIdx]);
});

app.delete('/api/attendance/:id', requireAuth, (req, res) => {
  const db = readDb();
  const attIdx = db.attendance.findIndex(a => a.id === req.params.id);
  if (attIdx === -1) {
    return res.status(404).json({ error: 'Attendance record not found' });
  }
  db.attendance.splice(attIdx, 1);
  writeDb(db);
  res.json({ success: true });
});

// 6. Payment tracking
app.get('/api/payments', requireAuth, (req, res) => {
  const db = readDb();
  const { projectId, taskId } = req.query;

  let payments = db.payments;
  if (projectId) {
    payments = payments.filter(p => p.projectId === projectId);
  }
  if (taskId) {
    payments = payments.filter(p => p.taskId === taskId);
  }

  const hydrated = payments.map(p => {
    const prj = db.projects.find(pr => pr.id === p.projectId);
    const tsk = db.tasks.find(ts => ts.id === p.taskId);
    return {
      ...p,
      projectName: prj ? prj.projectName : 'Unknown Project',
      taskName: tsk ? tsk.taskName : 'Unknown Task'
    };
  });

  res.json({ payments: hydrated.reverse() });
});

app.post('/api/payments', requireAuth, requireAdminOrAccountant, async (req: any, res) => {
  const { projectId, taskId, payeeType, payeeName, amount, paymentDate, paymentMethod, paymentStatus, notes, requestId } = req.body;
  if (!projectId || !taskId || !payeeType || !payeeName || amount === undefined || !paymentDate || !paymentMethod || !paymentStatus) {
    return res.status(400).json({ error: 'All core payment fields are required' });
  }

  const db = readDb();
  
  // 1. Balance Validation
  const currentFund = db.officeFunds[0] || { id: 'fund_main', balance: 0, updatedAt: '' };
  if (paymentStatus === 'Paid' && currentFund.balance < Number(amount)) {
    return res.status(400).json({ error: 'Insufficient office balance for this payment.' });
  }

  // 2. Perform Payment and Update Balance
  const newPayment: Payment = {
    id: 'pay_' + Date.now(),
    projectId,
    taskId,
    payeeType: payeeType as PayeeType,
    payeeName,
    amount: Number(amount),
    paymentDate,
    paymentMethod,
    paymentStatus: paymentStatus as PaymentStatus,
    notes
  };

  db.payments.push(newPayment);

  // If Paid, deduct from Office Balance
  if (paymentStatus === 'Paid') {
    currentFund.balance -= Number(amount);
    currentFund.updatedAt = new Date().toISOString();
    db.officeFunds[0] = currentFund;

    // Add Transaction Record
    db.officeTransactions.push({
        id: 'tx_' + Date.now(),
        type: 'Cash Out',
        amount: Number(amount),
        description: `Payment to ${payeeName} for ${taskId}`,
        date: new Date().toISOString(),
        createdBy: req.user.userId
    });
  }

  // 3. Update Request Status if linked
  if (requestId) {
      const reqIdx = db.paymentRequests.findIndex(r => r.id === requestId);
      if (reqIdx !== -1) {
          const pr = db.paymentRequests[reqIdx];
          pr.status = paymentStatus === 'Paid' ? 'Paid' : 'Partially Paid';
          
          // Auto-create Expense
          const categoryMap: Record<string, ExpenseCategory> = {
            'Worker': 'Labour',
            'Vendor': 'Material',
            'Transportation': 'Transport',
            'Other': 'Other'
          };
          
           db.expenses.push({
             id: 'exp_' + Date.now(),
             projectId: pr.projectId,
             taskId: pr.taskId,
             category: categoryMap[pr.category] || 'Other',
             amount: pr.amount,
             paidTo: pr.payeeName,
             paymentMethod: paymentMethod,
             date: paymentDate,
             fromLocation: pr.fromLocation,
             toLocation: pr.toLocation,
             notes: pr.description,
             createdBy: req.user.userId
           });
      }
  }

  // 4. Audit Trail
  db.auditLogs.push({
      id: 'audit_' + Date.now(),
      action: 'Create',
      entity: 'Payment',
      entityId: newPayment.id,
      performedBy: req.user.userId,
      timestamp: new Date().toISOString(),
      details: `Processed payment of ${amount} to ${payeeName}`
  });

  writeDb(db);
  res.status(201).json(newPayment);
});

app.put('/api/payments/:id', requireAuth, requireAdminOrAccountant, (req, res) => {
  const { payeeType, payeeName, amount, paymentDate, paymentMethod, paymentStatus, notes } = req.body;
  if (!payeeType || !payeeName || amount === undefined || !paymentDate || !paymentMethod || !paymentStatus) {
    return res.status(400).json({ error: 'All core fields are required' });
  }

  const db = readDb();
  const payIdx = db.payments.findIndex(p => p.id === req.params.id);
  if (payIdx === -1) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  db.payments[payIdx] = {
    ...db.payments[payIdx],
    payeeType: payeeType as PayeeType,
    payeeName,
    amount: Number(amount),
    paymentDate,
    paymentMethod,
    paymentStatus: paymentStatus as PaymentStatus,
    notes
  };

  writeDb(db);
  res.json(db.payments[payIdx]);
});

app.delete('/api/payments/:id', requireAuth, (req, res) => {
  const db = readDb();
  const payIdx = db.payments.findIndex(p => p.id === req.params.id);
  if (payIdx === -1) {
    return res.status(404).json({ error: 'Payment not found' });
  }
  db.payments.splice(payIdx, 1);
  writeDb(db);
  res.json({ success: true, message: 'Payment deleted' });
});

// 8. Accountant Module Routes
app.get('/api/office/funds', requireAuth, (req, res) => {
    const db = readDb();
    res.json({ officeFunds: db.officeFunds, officeTransactions: db.officeTransactions });
});

app.post('/api/office/funds', requireAuth, requireAdminOrAccountant, (req: any, res) => {
    const { type, amount, description, date, projectId, source, paymentMethod, reference } = req.body;
    const db = readDb();
    const newTransaction: OfficeTransaction = {
        id: 'tx_' + Date.now(),
        type,
        amount,
        description,
        date: date || new Date().toISOString(),
        createdBy: req.user.userId,
        source,
        paymentMethod,
        reference
    };
    db.officeTransactions.push(newTransaction);
    
    // Update balance
    const currentFund = db.officeFunds[0] || { id: 'fund_main', balance: 0, updatedAt: '' };
    if (type === 'Cash In') currentFund.balance += Number(amount);
    else currentFund.balance -= Number(amount);
    currentFund.updatedAt = new Date().toISOString();
    db.officeFunds[0] = currentFund;
    
    // Log Audit
    db.auditLogs.push({
        id: 'audit_' + Date.now(),
        action: 'Transaction',
        entity: 'OfficeFund',
        entityId: newTransaction.id,
        performedBy: req.user.userId,
        timestamp: new Date().toISOString(),
        details: `${type} of ${amount} from ${source || 'unknown'} for project ${projectId || 'General'}`
    });
    
    writeDb(db);
    res.status(201).json(newTransaction);
});

app.get('/api/payment-requests', requireAuth, (req, res) => {
    const db = readDb();
    res.json({ paymentRequests: db.paymentRequests });
});

app.post('/api/payment-requests', requireAuth, (req: any, res) => {
    console.log("POST /api/payment-requests received:", req.body);
    const { projectId, taskId, payeeName, category, amount, description, dueDate, priority } = req.body;
    const db = readDb();
    const newRequest: PaymentRequest = {
        id: 'pr_' + Date.now(),
        projectId,
        taskId,
        payeeName,
        category,
        amount,
        description,
        dueDate,
        priority,
        status: 'Pending',
        createdAt: new Date().toISOString()
    };
    db.paymentRequests.push(newRequest);
    writeDb(db);
    res.status(201).json(newRequest);
});

// 7. General ERP reports and stats endpoint
app.get('/api/reports/summary', requireAuth, (req, res) => {
  const db = readDb();

  // Calculate aggregate metrics across everything
  const { taskToLabourCost, taskToExpensesCost } = calculateMetrics();

  const totalProjects = db.projects.length;
  const activeTasks = db.tasks.filter(t => t.status === 'In Progress').length;
  const completedTasks = db.tasks.filter(t => t.status === 'Completed').length;

  const totalAssignedBudget = db.tasks.reduce((sum, t) => sum + t.assignedBudget, 0);

  // Direct materials/equipment/etc
  const directExpensesSum = db.expenses.reduce((sum, e) => sum + e.amount, 0);
  // Wages attendance sum
  const labourWagesSum = db.attendance.reduce((sum, att) => {
    let portion = att.status === 'Present' ? 1 : att.status === 'Half Day' ? 0.5 : 0;
    return sum + (att.dailyWage * portion) + (att.overtimeAmount || 0);
  }, 0);

  const totalExpenses = directExpensesSum + labourWagesSum;

  const totalPaidAmount = db.payments.filter(p => p.paymentStatus === 'Paid').reduce((sum, p) => sum + p.amount, 0);
  const pendingPayments = db.payments.filter(p => p.paymentStatus === 'Pending' || p.paymentStatus === 'Partial').reduce((sum, p) => sum + p.amount, 0);

  const overallProfitLoss = totalAssignedBudget - totalExpenses;

  // Task level details
  const taskSummary = db.tasks.map(t => {
    const dExp = db.expenses.filter(e => e.taskId === t.id).reduce((sum, e) => sum + e.amount, 0);
    const lExp = db.attendance.filter(a => a.taskId === t.id).reduce((sum, att) => {
      let portion = att.status === 'Present' ? 1 : att.status === 'Half Day' ? 0.5 : 0;
      return sum + (att.dailyWage * portion) + (att.overtimeAmount || 0);
    }, 0);
    const totalExp = dExp + lExp;
    return {
      taskId: t.id,
      taskName: t.taskName,
      projectId: t.projectId,
      projectName: db.projects.find(p => p.id === t.projectId)?.projectName || 'Unknown',
      budget: t.assignedBudget,
      expenses: totalExp,
      remaining: t.assignedBudget - totalExp,
      progress: t.progress,
      status: t.status
    };
  });

  // Recent expenses hydrated
  const recentExpenses = db.expenses.slice(-5).reverse().map(e => ({
    ...e,
    projectName: db.projects.find(p => p.id === e.projectId)?.projectName || 'Unknown',
    taskName: db.tasks.find(t => t.id === e.taskId)?.taskName || 'Unknown'
  }));

  // Recent payments
  const recentPayments = db.payments.slice(-5).reverse().map(p => ({
    ...p,
    projectName: db.projects.find(pr => pr.id === p.projectId)?.projectName || 'Unknown',
    taskName: db.tasks.find(t => t.id === p.taskId)?.taskName || 'Unknown'
  }));

  // Today's attendance summary
  const todayStr = new Date().toISOString().split('T')[0];
  const todaysAttendanceCount = db.attendance.filter(a => a.date === todayStr).length;
  const todaysLabourCost = db.attendance.filter(a => a.date === todayStr).reduce((sum, att) => {
    let portion = att.status === 'Present' ? 1 : att.status === 'Half Day' ? 0.5 : 0;
    return sum + (att.dailyWage * portion) + (att.overtimeAmount || 0);
  }, 0);

  const officeBalance = db.officeFunds[0]?.balance || 0;

  res.json({
    stats: {
      totalProjects,
      activeTasks,
      completedTasks,
      totalAssignedBudget,
      totalExpenses,
      totalPaidAmount,
      pendingPayments,
      overallProfitLoss,
      todaysAttendanceCount,
      todaysLabourCost,
      officeBalance
    },
    taskSummary,
    recentExpenses,
    recentPayments
  });
});

// Vite server mount for handling development asset pipeline & production static routing
async function initServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ERP custom fullstack server running on http://0.0.0.0:${PORT}`);
  });
}

initServer().catch((err) => {
  console.error("Failed to start fullstack server", err);
});
