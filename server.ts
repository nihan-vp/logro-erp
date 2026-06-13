import express from 'express';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { getTenantDb } from './server/tenantDb';
import { registerCompany, getRegistryDb } from './server/registry';
import { ObjectId } from 'mongodb';
import { Project, Task, Expense, Attendance, Payment, PaymentRequest, UserRole, ProjectStatus, TaskStatus, ExpenseCategory, PayeeType, PaymentStatus, AttendanceStatus, CrewMember, CrewTrade, CrewMemberStatus, OfficeTransaction } from './src/types';

export function hashPassword(password: string): string {
  const salt = 'construction_salt_2026';
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha256');
  return hash.toString('hex');
}

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

function signToken(payload: { userId: string; role: UserRole; name: string; companyName: string; email: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token: string): { userId: string; role: UserRole; name: string; companyName: string; email: string } | null {
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
app.post('/api/auth/login', async (req, res) => {
  const { email, password, companyName } = req.body;
  
  // Superadmin bypass
  if (email === process.env.SUPERADMIN_EMAIL && password === process.env.SUPERADMIN_PASSWORD) {
      const token = signToken({
        userId: 'superadmin',
        role: 'admin',
        name: 'Super Admin',
        companyName: 'SUPERADMIN',
        email: process.env.SUPERADMIN_EMAIL || 'superadmin@logro.com'
      });
      return res.json({
        token,
        user: {
          id: 'superadmin',
          name: 'Super Admin',
          email: process.env.SUPERADMIN_EMAIL,
          role: 'admin',
          status: 'active'
        }
      });
  }

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

  let targetCompanyName = companyName || 'DefaultCompany';
  let user: any = null;

  try {
    const registryDb = await getRegistryDb();
    const companies = await registryDb.collection('companies').find({}).toArray();

    // If companyName is 'DefaultCompany' or not specified, search across all registered companies
    if (targetCompanyName === 'DefaultCompany') {
      for (const comp of companies) {
        const tenantDb = await getTenantDb(comp.companyName);
        const foundUser = await tenantDb.collection('users').findOne({ email: { $regex: new RegExp(`^${emailKey}$`, 'i') } });
        if (foundUser) {
          user = foundUser;
          targetCompanyName = comp.companyName;
          break;
        }
      }
    }

    // Fallback: search in targetCompanyName database
    if (!user) {
      const tenantDb = await getTenantDb(targetCompanyName);
      user = await tenantDb.collection('users').findOne({ email: { $regex: new RegExp(`^${emailKey}$`, 'i') } });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Block logins for suspended or expired companies
    const company = companies.find(c => c.companyName.toLowerCase() === targetCompanyName.toLowerCase());
    if (company) {
      if (company.status === 'suspended') {
        return res.status(403).json({ error: 'This company account has been suspended. Please contact the system administrator.' });
      }
      if (company.status === 'trial' && company.trialUntil && new Date(company.trialUntil) < new Date()) {
        return res.status(403).json({ error: 'Your trial period has expired. Please contact the system administrator to activate your account.' });
      }
      if (company.validUntil && new Date(company.validUntil) < new Date()) {
        return res.status(403).json({ error: 'Your subscription has expired. Please contact the system administrator.' });
      }
    }
  } catch (err: any) {
    console.error('Error during login tenant resolution:', err);
    return res.status(500).json({ error: 'Internal server error during authentication' });
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
    name: user.name,
    companyName: targetCompanyName,
    email: user.email
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


// Superadmin: Company Management
app.get('/api/superadmin/companies', requireAuth, async (req: any, res) => {
    if (req.user.email !== process.env.SUPERADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' });
    const db = await getRegistryDb();
    const companies = await db.collection('companies').find({}).toArray();
    res.json(companies);
});

app.post('/api/superadmin/companies', requireAuth, async (req: any, res) => {
    if (req.user.email !== process.env.SUPERADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' });
    
    const { companyName, status, trialUntil, validUntil } = req.body;
    if (!companyName) return res.status(400).json({ error: 'Company name required' });
    
    try {
        const company = await registerCompany(companyName, status, trialUntil, validUntil);
        res.status(201).json(company);
    } catch (e) {
        res.status(500).json({ error: 'Failed to register company' });
    }
});

app.patch('/api/superadmin/companies/:id/status', requireAuth, async (req: any, res) => {
    if (req.user.email !== process.env.SUPERADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' });
    const { status } = req.body;
    const db = await getRegistryDb();
    const result = await db.collection('companies').findOneAndUpdate(
        { _id: new ObjectId(req.params.id) },
        { $set: { status } },
        { returnDocument: 'after' }
    );
    res.json(result);
});

app.patch('/api/superadmin/companies/:id/subscription', requireAuth, async (req: any, res) => {
    if (req.user.email !== process.env.SUPERADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' });
    const { months } = req.body;
    const db = await getRegistryDb();
    const company = await db.collection('companies').findOne({ _id: new ObjectId(req.params.id) });
    
    if (!company) return res.status(404).json({ error: 'Company not found' });
    
    let currentValidUntil = company.validUntil ? new Date(company.validUntil) : new Date();
    if (currentValidUntil < new Date()) currentValidUntil = new Date();
    
    currentValidUntil.setMonth(currentValidUntil.getMonth() + months);
    
    const result = await db.collection('companies').findOneAndUpdate(
        { _id: new ObjectId(req.params.id) },
        { $set: { validUntil: currentValidUntil.toISOString() } },
        { returnDocument: 'after' }
    );
    res.json(result);
});

// Superadmin: Tenant User Management
app.get('/api/superadmin/companies/:companyName/users', requireAuth, async (req: any, res) => {
    if (req.user.email !== process.env.SUPERADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' });
    const { companyName } = req.params;
    try {
        const tenantDb = await getTenantDb(companyName);
        const users = await tenantDb.collection('users').find({}).toArray();
        res.json(users);
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to fetch tenant users' });
    }
});

app.post('/api/superadmin/companies/:companyName/users', requireAuth, async (req: any, res) => {
    if (req.user.email !== process.env.SUPERADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' });
    const { companyName } = req.params;
    const { name, email, role, phone, password } = req.body;
    if (!name || !email || !role || !password) {
        return res.status(400).json({ error: 'Name, email, role, and password are required' });
    }
    try {
        const tenantDb = await getTenantDb(companyName);
        const existing = await tenantDb.collection('users').findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
        if (existing) {
            return res.status(400).json({ error: 'A user with this email already exists in this company' });
        }
        const newUser = {
            id: 'usr_' + Date.now(),
            name,
            email,
            password,
            role,
            phone: phone || '',
            status: 'active'
        };
        await tenantDb.collection('users').insertOne(newUser);
        res.status(201).json(newUser);
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to create tenant user' });
    }
});

app.patch('/api/superadmin/companies/:companyName/users/:userId/status', requireAuth, async (req: any, res) => {
    if (req.user.email !== process.env.SUPERADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' });
    const { companyName, userId } = req.params;
    const { status } = req.body;
    if (status !== 'active' && status !== 'inactive') {
        return res.status(400).json({ error: 'Invalid status value' });
    }
    try {
        const tenantDb = await getTenantDb(companyName);
        const result = await tenantDb.collection('users').findOneAndUpdate(
            { id: userId },
            { $set: { status } },
            { returnDocument: 'after' }
        );
        if (!result) return res.status(404).json({ error: 'User not found' });
        res.json(result);
    } catch (err: any) {
        res.status(550).json({ error: 'Failed to update user status' });
    }
});

app.delete('/api/superadmin/companies/:companyName/users/:userId', requireAuth, async (req: any, res) => {
    if (req.user.email !== process.env.SUPERADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' });
    const { companyName, userId } = req.params;
    try {
        const tenantDb = await getTenantDb(companyName);
        const result = await tenantDb.collection('users').deleteOne({ id: userId });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// User/Roles screen - List and Manage Users for Admin
app.get('/api/users', requireAuth, async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);
  const users = await tenantDb.collection('users').find({}).toArray();
  res.json({ users });
});

app.post('/api/users', requireAuth, requireAdmin, async (req: any, res) => {
  const { name, email, role, phone } = req.body;
  if (!name || !email || !role) {
    return res.status(400).json({ error: 'Name, email, and role are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);
  const existing = await tenantDb.collection('users').findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
  if (existing) {
    return res.status(400).json({ error: 'A user with this email already exists' });
  }

  const newUser = {
    id: 'usr_' + Date.now(),
    name,
    email,
    role: role as UserRole,
    phone,
    status: 'active'
  };

  await tenantDb.collection('users').insertOne(newUser);
  res.status(201).json(newUser);
});

// Toggle User status (Active/Inactive)
app.patch('/api/users/:id/status', requireAuth, requireAdmin, async (req: any, res) => {
  const { status } = req.body;
  if (status !== 'active' && status !== 'inactive') {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);
  const result = await tenantDb.collection('users').findOneAndUpdate(
      { id: req.params.id },
      { $set: { status } },
      { returnDocument: 'after' }
  );
  
  if (!result) return res.status(404).json({ error: 'User not found' });
  res.json(result);
});

// Update Profile API for Settings
app.put('/api/users/profile', requireAuth, async (req: any, res) => {
  const { name, phone } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);
  const result = await tenantDb.collection('users').findOneAndUpdate(
      { id: req.user.userId },
      { $set: { name, phone: phone !== undefined ? phone : undefined } },
      { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'User not found' });
  res.json(result);
});

const REQUEST_TO_EXPENSE_CATEGORY: Record<string, ExpenseCategory> = {
  Worker: 'Labour',
  Vendor: 'Material',
  Transportation: 'Transport',
  'Vendor Payment': 'Vendor Payment',
  Other: 'Other',
};

function expenseCategoryToRequestCategory(category: ExpenseCategory | string): PaymentRequest['category'] {
  if (category === 'Material' || category === 'Tools') return 'Vendor';
  if (category === 'Labour') return 'Worker';
  if (category === 'Transport') return 'Transportation';
  if (category === 'Vendor Payment') return 'Vendor Payment';
  return 'Other';
}


// Helper for paymentRequestToExpenseItem - REFACTORED

function paymentRequestToExpenseItem(pr: any, projects: any[], tasks: any[]) {
  const prj = projects.find(p => p.id === pr.projectId);
  const tsk = tasks.find(t => t.id === pr.taskId);
  return {
    id: pr.id,
    projectId: pr.projectId,
    taskId: pr.taskId,
    category: REQUEST_TO_EXPENSE_CATEGORY[pr.category] || 'Other',
    amount: pr.amount,
    paidTo: pr.payeeName,
    paymentMethod: pr.paymentMethod || 'Office Fund (Pending)',
    date: pr.dueDate,
    fromLocation: pr.fromLocation,
    toLocation: pr.toLocation,
    notes: pr.description,
    billImage: pr.billImage,
    createdBy: pr.createdBy || '',
    projectName: prj ? prj.projectName : 'Unknown Project',
    taskName: tsk ? tsk.taskName : 'Unknown Task',
    isPendingRequest: true,
    requestStatus: pr.status,
    materialName: pr.materialName,
    materialQty: pr.materialQty,
    tools: pr.tools,
    vendorTotalToPay: pr.vendorTotalToPay,
    vendorPaid: pr.vendorPaid,
    vendorRemaining: pr.vendorRemaining,
  };
}


// Helper for Calculations - REFACTORED FOR MULTI-TENANT
async function calculateMetrics(companyName: string) {
  const tenantDb = await getTenantDb(companyName);

  // Fetch necessary data
  const attendance = await tenantDb.collection('attendance').find({}).toArray();
  const expenses = await tenantDb.collection('expenses').find({}).toArray();
  const paymentRequests = await tenantDb.collection('paymentRequests').find({}).toArray();
  const payments = await tenantDb.collection('payments').find({}).toArray();

  // 1. Task wages from labor attendance
  const taskToLabourCost: Record<string, number> = {};
  attendance.forEach((att: any) => {
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
  expenses.forEach((exp: any) => {
    taskToExpensesCost[exp.taskId] = (taskToExpensesCost[exp.taskId] || 0) + exp.amount;
  });

  // 2b. Pending payment requests
  const taskToPendingExpenseCost: Record<string, number> = {};
  paymentRequests.filter((pr: any) => pr.status === 'Pending').forEach((pr: any) => {
    taskToPendingExpenseCost[pr.taskId] = (taskToPendingExpenseCost[pr.taskId] || 0) + pr.amount;
  });

  // 3. Task payments made
  const taskToPaymentsMade: Record<string, number> = {};
  payments.forEach((pay: any) => {
    if (pay.paymentStatus === 'Paid') {
      taskToPaymentsMade[pay.taskId] = (taskToPaymentsMade[pay.taskId] || 0) + pay.amount;
    }
  });

  return {
    taskToLabourCost,
    taskToExpensesCost,
    taskToPendingExpenseCost,
    taskToPaymentsMade
  };
}

// 2. Project routes
app.get('/api/projects', requireAuth, async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);
  
  const projects = await tenantDb.collection('projects').find({}).toArray();
  const tasks = await tenantDb.collection('tasks').find({}).toArray();
  const expenses = await tenantDb.collection('expenses').find({}).toArray();
  const attendance = await tenantDb.collection('attendance').find({}).toArray();
  const paymentRequests = await tenantDb.collection('paymentRequests').find({}).toArray();
  const payments = await tenantDb.collection('payments').find({}).toArray();

  // Calculate project statistics on-the-fly
  const projectsWithStats = projects.map((prj: any) => {
    const projectTasks = tasks.filter((t: any) => t.projectId === prj.id);
    const totalBudget = projectTasks.reduce((acc: number, t: any) => acc + t.assignedBudget, 0);

    // Total expenses of this project layout
    const projectExpenses = expenses.filter((e: any) => e.projectId === prj.id);
    const regularExpenseAmt = projectExpenses.reduce((acc: number, e: any) => acc + e.amount, 0);

    // Project labour cost
    const projectAttendance = attendance.filter((a: any) => a.projectId === prj.id);
    const labourCostAmt = projectAttendance.reduce((acc: number, att: any) => {
      let portion = att.status === 'Present' ? 1 : att.status === 'Half Day' ? 0.5 : 0;
      return acc + (att.dailyWage * portion) + (att.overtimeAmount || 0);
    }, 0);

    const pendingRequestAmt = paymentRequests
      .filter((pr: any) => pr.projectId === prj.id && pr.status === 'Pending')
      .reduce((acc: number, pr: any) => acc + pr.amount, 0);

    const totalActualExpense = regularExpenseAmt + labourCostAmt;
    const totalCommittedExpense = totalActualExpense + pendingRequestAmt;

    // Total payments of this project
    const projectPayments = payments.filter((p: any) => p.projectId === prj.id);
    const totalPaidAmount = projectPayments.filter((p: any) => p.paymentStatus === 'Paid').reduce((acc: number, p: any) => acc + p.amount, 0);
    const pendingPaymentsAmt = projectPayments.filter((p: any) => p.paymentStatus === 'Pending').reduce((acc: number, p: any) => acc + p.amount, 0);

    const profitLoss = totalBudget - totalCommittedExpense;
    const profitPercentage = totalBudget > 0 ? (profitLoss / totalBudget) * 100 : 0;

    return {
      ...prj,
      totalBudget,
      totalExpenses: totalActualExpense,
      pendingExpenses: pendingRequestAmt,
      totalCommittedExpense,
      totalPaidAmount,
      pendingPayments: pendingPaymentsAmt,
      profitLoss,
      profitPercentage,
      taskCount: projectTasks.length
    };
  });

  res.json({ projects: projectsWithStats });
});

app.post('/api/projects', requireAuth, async (req: any, res) => {
  const { projectName, clientName, location, startDate, expectedEndDate, status, notes } = req.body;
  if (!projectName || !clientName || !location || !startDate || !expectedEndDate) {
    return res.status(400).json({ error: 'All core project fields are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);
  const newProject = {
    id: 'prj_' + Date.now(),
    projectName,
    clientName,
    location,
    startDate,
    expectedEndDate,
    status: (status || 'Pending'),
    notes,
    createdBy: req.user.userId,
    createdAt: new Date().toISOString()
  };

  await tenantDb.collection('projects').insertOne(newProject);
  res.status(201).json(newProject);
});

app.put('/api/projects/:id', requireAuth, async (req: any, res) => {
  const { projectName, clientName, location, startDate, expectedEndDate, status, notes } = req.body;
  if (!projectName || !clientName || !location || !startDate || !expectedEndDate) {
    return res.status(400).json({ error: 'All core project fields are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);
  const result = await tenantDb.collection('projects').findOneAndUpdate(
      { id: req.params.id },
      { $set: { projectName, clientName, location, startDate, expectedEndDate, status, notes } },
      { returnDocument: 'after' }
  );
  
  if (!result) {
    return res.status(404).json({ error: 'Project not found' });
  }

  res.json(result);
});

app.delete('/api/projects/:id', requireAuth, async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);
  
  const result = await tenantDb.collection('projects').deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // Do cascade delete of tasks, expenses, payments, attendance
  await tenantDb.collection('tasks').deleteMany({ projectId: req.params.id });
  await tenantDb.collection('expenses').deleteMany({ projectId: req.params.id });
  await tenantDb.collection('payments').deleteMany({ projectId: req.params.id });
  await tenantDb.collection('attendance').deleteMany({ projectId: req.params.id });

  res.json({ success: true, message: 'Project and all related data deleted successfully' });
});

// 3. Task routes
app.get('/api/tasks', requireAuth, async (req: any, res) => {
  try {
    const tenantDb = await getTenantDb(req.user.companyName);
    const { projectId } = req.query;

    const query: any = {};
    if (projectId) {
      query.projectId = projectId;
    }

    const tasks = await tenantDb.collection('tasks').find(query).toArray();
    const projects = await tenantDb.collection('projects').find({}).toArray();

    // Calculate task statistics
    const { taskToLabourCost, taskToExpensesCost, taskToPendingExpenseCost, taskToPaymentsMade } = await calculateMetrics(req.user.companyName);

    const tasksWithStats = tasks.map((tsk: any) => {
      const labourCost = taskToLabourCost[tsk.id] || 0;
      const directExpenses = taskToExpensesCost[tsk.id] || 0;
      const pendingExpenses = taskToPendingExpenseCost[tsk.id] || 0;
      const totalExpenses = directExpenses + labourCost;
      const totalCommitted = totalExpenses + pendingExpenses;
      const paymentsPaid = taskToPaymentsMade[tsk.id] || 0;
      const remainingBudget = tsk.assignedBudget - totalCommitted;
      const profitLoss = tsk.assignedBudget - totalCommitted;
      const isOverBudget = totalCommitted > tsk.assignedBudget;

      // Find matching project details
      const prj = projects.find((p: any) => p.id === tsk.projectId);

      return {
        ...tsk,
        projectName: prj ? prj.projectName : 'Unknown Project',
        labourCost,
        directExpenses,
        pendingExpenses,
        totalExpenses,
        totalCommitted,
        paymentsPaid,
        remainingBudget,
        profitLoss,
        isOverBudget
      };
    });

    res.json({ tasks: tasksWithStats });
  } catch (err: any) {
    console.error('DEBUG ERROR in GET /api/tasks:', err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

app.post('/api/tasks', requireAuth, async (req: any, res) => {
  const { projectId, taskName, description, assignedBudget, assignedStaff, startDate, endDate, progress, status, notes } = req.body;
  if (!projectId || !taskName || assignedBudget === undefined || !startDate || !endDate) {
    return res.status(400).json({ error: 'Project, Task Name, Budget, Start Date, and End Date are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);
  const newTask = {
    id: 'tsk_' + Date.now(),
    projectId,
    taskName,
    description,
    assignedBudget: Number(assignedBudget),
    assignedStaff,
    startDate,
    endDate,
    progress: progress !== undefined ? Number(progress) : 0,
    status: (status || 'Pending'),
    notes
  };

  await tenantDb.collection('tasks').insertOne(newTask);
  res.status(201).json(newTask);
});

app.put('/api/tasks/:id', requireAuth, async (req: any, res) => {
  const { taskName, description, assignedBudget, assignedStaff, startDate, endDate, progress, status, notes } = req.body;
  if (!taskName || assignedBudget === undefined || !startDate || !endDate) {
    return res.status(400).json({ error: 'Task Name, Budget, Start and End dates are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);
  const result = await tenantDb.collection('tasks').findOneAndUpdate(
      { id: req.params.id },
      { $set: { 
          taskName,
          description,
          assignedBudget: Number(assignedBudget),
          assignedStaff,
          startDate,
          endDate,
          progress: progress !== undefined ? Number(progress) : undefined, // Handled slightly differently
          status,
          notes
      } },
      { returnDocument: 'after' }
  );
  
  if (!result) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  // If progress wasn't updated, handle it
  if (progress === undefined) {
      // Need to find existing to keep progress
      const existing = await tenantDb.collection('tasks').findOne({ id: req.params.id });
      await tenantDb.collection('tasks').updateOne({ id: req.params.id }, { $set: { progress: existing?.progress } });
  }

  res.json(result);
});

app.delete('/api/tasks/:id', requireAuth, async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);
  
  const result = await tenantDb.collection('tasks').deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) {
    return res.status(404).json({ error: 'Task not found' });
  }

  await tenantDb.collection('expenses').deleteMany({ taskId: req.params.id });
  await tenantDb.collection('payments').deleteMany({ taskId: req.params.id });
  await tenantDb.collection('attendance').deleteMany({ taskId: req.params.id });

  res.json({ success: true, message: 'Task and related entries deleted' });
});

// 4. Expense routes (Linked to task & project)
app.get('/api/expenses', requireAuth, async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);
  const { projectId, taskId } = req.query;

  const query: any = {};
  if (projectId) query.projectId = projectId;
  if (taskId) query.taskId = taskId;

  const expenses = await tenantDb.collection('expenses').find(query).toArray();
  const projects = await tenantDb.collection('projects').find({}).toArray();
  const tasks = await tenantDb.collection('tasks').find({}).toArray();

  const hydrated = expenses.map((e: any) => {
    const prj = projects.find((p: any) => p.id === e.projectId);
    const tsk = tasks.find((t: any) => t.id === e.taskId);
    return {
      ...e,
      projectName: prj ? prj.projectName : 'Unknown Project',
      taskName: tsk ? tsk.taskName : 'Unknown Task',
      isPendingRequest: false,
    };
  });

  const pendingRequestsQuery: any = { status: 'Pending' };
  if (projectId) pendingRequestsQuery.projectId = projectId;
  if (taskId) pendingRequestsQuery.taskId = taskId;

  const pendingRequests = await tenantDb.collection('paymentRequests').find(pendingRequestsQuery).toArray();

  const pendingAsExpenses = pendingRequests.map((pr: any) => paymentRequestToExpenseItem(pr, projects, tasks));
  const combined = [...pendingAsExpenses, ...hydrated].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  res.json({ expenses: combined });
});

app.put('/api/expenses/:id', requireAuth, async (req: any, res) => {
  const { projectId, taskId, category, amount, paidTo, paymentMethod, date, notes, billImage, fromLocation, toLocation, materialName, materialQty, tools, vendorTotalToPay, vendorPaid, vendorRemaining } = req.body;
  if (!category || amount === undefined || !paidTo || !paymentMethod || !date) {
    return res.status(400).json({ error: 'All core fields are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);

  if (req.params.id.startsWith('pr_')) {
    const result = await tenantDb.collection('paymentRequests').findOneAndUpdate(
        { id: req.params.id },
        { $set: {
            projectId: projectId || null,
            taskId: taskId || null,
            payeeName: String(paidTo).trim(),
            category: expenseCategoryToRequestCategory(category),
            amount: Number(amount),
            description: notes || '',
            fromLocation: fromLocation ?? null,
            toLocation: toLocation ?? null,
            dueDate: date,
            paymentMethod,
            billImage: billImage !== undefined ? billImage : null,
            materialName: materialName ?? null,
            materialQty: materialQty ?? null,
            tools: tools ?? null,
            vendorTotalToPay: vendorTotalToPay !== undefined ? Number(vendorTotalToPay) : null,
            vendorPaid: vendorPaid !== undefined ? Number(vendorPaid) : null,
            vendorRemaining: vendorRemaining !== undefined ? Number(vendorRemaining) : null,
        }},
        { returnDocument: 'after' }
    );
    if (!result) return res.status(404).json({ error: 'Payment request not found' });
    
    // Need projects/tasks for the expense view
    const project = await tenantDb.collection('projects').findOne({ id: result.projectId });
    const task = await tenantDb.collection('tasks').findOne({ id: result.taskId });
    
    return res.json(paymentRequestToExpenseItem(result, [project].filter(Boolean), [task].filter(Boolean)));
  }

  const result = await tenantDb.collection('expenses').findOneAndUpdate(
      { id: req.params.id },
      { $set: {
          category: category,
          amount: Number(amount),
          paidTo,
          paymentMethod,
          date,
          notes,
          billImage: billImage !== undefined ? billImage : null,
          fromLocation: fromLocation ?? null,
          toLocation: toLocation ?? null,
          materialName: materialName ?? null,
          materialQty: materialQty ?? null,
          tools: tools ?? null,
          vendorTotalToPay: vendorTotalToPay !== undefined ? Number(vendorTotalToPay) : null,
          vendorPaid: vendorPaid !== undefined ? Number(vendorPaid) : null,
          vendorRemaining: vendorRemaining !== undefined ? Number(vendorRemaining) : null,
      }},
      { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'Expense not found' });
  res.json(result);
});

app.delete('/api/expenses/:id', requireAuth, async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);

  if (req.params.id.startsWith('pr_')) {
    const existing = await tenantDb.collection('paymentRequests').findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Payment request not found' });
    if (existing.status !== 'Pending') return res.status(400).json({ error: 'Only pending payment requests can be deleted' });
    
    await tenantDb.collection('paymentRequests').deleteOne({ id: req.params.id });
    return res.json({ success: true, message: 'Payment request cancelled' });
  }

  const result = await tenantDb.collection('expenses').deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'Expense not found' });
  
  res.json({ success: true, message: 'Expense deleted successfully' });
});

// 5. Crew roster routes
app.get('/api/crew', requireAuth, async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);
  const { status } = req.query;
  
  const query: any = {};
  if (status === 'active' || status === 'inactive') {
    query.status = status;
  }
  
  const crew = await tenantDb.collection('crew').find(query).sort({ name: 1 }).toArray();
  res.json({ crew });
});

app.post('/api/crew', requireAuth, async (req: any, res) => {
  const { name, trade, dailyWage, phone, status, notes } = req.body;
  if (!name || !trade || dailyWage === undefined) {
    return res.status(400).json({ error: 'Name, trade, and daily wage are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);
  
  const duplicate = await tenantDb.collection('crew').findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
  if (duplicate) {
    return res.status(400).json({ error: 'A crew member with this name already exists' });
  }

  const newMember = {
    id: 'crew_' + Date.now(),
    name: String(name).trim(),
    trade,
    dailyWage: Number(dailyWage),
    phone: phone || '',
    status: (status || 'active'),
    notes: notes || '',
    createdAt: new Date().toISOString()
  };

  await tenantDb.collection('crew').insertOne(newMember);
  res.status(201).json(newMember);
});

app.put('/api/crew/:id', requireAuth, async (req: any, res) => {
  const { name, trade, dailyWage, phone, status, notes } = req.body;
  if (!name || !trade || dailyWage === undefined) {
    return res.status(400).json({ error: 'Name, trade, and daily wage are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);
  
  const duplicate = await tenantDb.collection('crew').findOne({ 
      id: { $ne: req.params.id }, 
      name: { $regex: new RegExp(`^${name}$`, 'i') } 
  });
  if (duplicate) {
    return res.status(400).json({ error: 'A crew member with this name already exists' });
  }

  const result = await tenantDb.collection('crew').findOneAndUpdate(
      { id: req.params.id },
      { $set: { 
          name: String(name).trim(),
          trade,
          dailyWage: Number(dailyWage),
          phone: phone || '',
          status,
          notes: notes || ''
      } },
      { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'Crew member not found' });
  res.json(result);
});

app.delete('/api/crew/:id', requireAuth, async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);
  
  const result = await tenantDb.collection('crew').deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'Crew member not found' });
  
  res.json({ success: true, message: 'Crew member removed' });
});

app.post('/api/crew/bulk', requireAuth, async (req: any, res) => {
  const { members } = req.body;
  if (!Array.isArray(members) || members.length === 0) {
    return res.status(400).json({ error: 'A non-empty members array is required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);
  const crewCol = tenantDb.collection('crew');

  const added: any[] = [];
  const errors: string[] = [];

  for (const [idx, m] of members.entries()) {
    const name = String(m.name || '').trim();
    if (!name) {
      errors.push(`Row ${idx + 1}: name is required`);
      continue;
    }

    const duplicate = await crewCol.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (duplicate) continue; // Skip

    const newMember = {
        id: 'crew_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        name,
        trade: m.trade || 'Other',
        dailyWage: Number(m.dailyWage) || 0,
        phone: m.phone ? String(m.phone).trim() : '',
        status: m.status === 'inactive' ? 'inactive' : 'active',
        notes: m.notes ? String(m.notes).trim() : '',
        createdAt: new Date().toISOString()
    };

    await crewCol.insertOne(newMember);
    added.push(newMember);
  }

  res.status(201).json({ success: true, added: added.length, errors });
});

// 6. Attendance routes
app.get('/api/attendance', requireAuth, async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);
  const { projectId, taskId, date } = req.query;

  const query: any = {};
  if (projectId) query.projectId = projectId;
  if (taskId) query.taskId = taskId;
  if (date) query.date = date;

  const attendance = await tenantDb.collection('attendance').find(query).toArray();
  const projects = await tenantDb.collection('projects').find({}).toArray();
  const tasks = await tenantDb.collection('tasks').find({}).toArray();

  const hydrated = attendance.map((a: any) => {
    const prj = projects.find((p: any) => p.id === a.projectId);
    const tsk = tasks.find((t: any) => t.id === a.taskId);
    return {
      ...a,
      projectName: prj ? prj.projectName : 'Unknown Project',
      taskName: tsk ? tsk.taskName : 'Unknown Task'
    };
  });

  res.json({ attendance: hydrated });
});

app.post('/api/attendance', requireAuth, async (req: any, res) => {
  const { projectId, taskId, workerName, date, status, dailyWage, overtimeAmount, paymentStatus, notes } = req.body;
  if (!projectId || !taskId || !workerName || !date || !status || dailyWage === undefined) {
    return res.status(400).json({ error: 'Project, Task, Worker Name, Date, Status and Daily Wage are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);
  const newAttendance = {
    id: 'att_' + Date.now(),
    projectId,
    taskId,
    workerName,
    date,
    status,
    dailyWage: Number(dailyWage),
    overtimeAmount: overtimeAmount !== undefined ? Number(overtimeAmount) : 0,
    paymentStatus: (paymentStatus || 'Pending'),
    notes
  };

  await tenantDb.collection('attendance').insertOne(newAttendance);
  res.status(201).json(newAttendance);
});

// bulk marking for fast on-site labor checks
app.post('/api/attendance/bulk', requireAuth, async (req: any, res) => {
  const { projectId, taskId, date, workers } = req.body; 
  if (!projectId || !taskId || !date || !Array.isArray(workers)) {
    return res.status(400).json({ error: 'Valid Project, Task, Date and workers array are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);
  const attCol = tenantDb.collection('attendance');
  const addedRecords: any[] = [];

  for (const w of workers) {
    if (!w.workerName || !w.status || w.dailyWage === undefined) continue;

    // Remove if there's an existing record for same worker, same task, same date
    await attCol.deleteMany({ workerName: w.workerName, taskId: taskId, date: date });

    const newAtt = {
      id: 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      projectId,
      taskId,
      workerName: w.workerName,
      date,
      status: w.status,
      dailyWage: Number(w.dailyWage),
      overtimeAmount: w.overtimeAmount !== undefined ? Number(w.overtimeAmount) : 0,
      paymentStatus: (w.paymentStatus || 'Pending'),
      notes: w.notes
    };

    await attCol.insertOne(newAtt);
    addedRecords.push(newAtt);
  }

  res.status(201).json({ success: true, count: addedRecords.length, records: addedRecords });
});

app.put('/api/attendance/:id', requireAuth, async (req: any, res) => {
  const { status, dailyWage, overtimeAmount, paymentStatus, notes, workerName } = req.body;
  if (!status || dailyWage === undefined) {
    return res.status(400).json({ error: 'Status and daily wage are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);
  
  const result = await tenantDb.collection('attendance').findOneAndUpdate(
      { id: req.params.id },
      { $set: { 
          workerName,
          status,
          dailyWage: Number(dailyWage),
          overtimeAmount: overtimeAmount !== undefined ? Number(overtimeAmount) : 0,
          paymentStatus,
          notes
      } },
      { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'Attendance record not found' });
  res.json(result);
});

app.delete('/api/attendance/:id', requireAuth, async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);
  
  const result = await tenantDb.collection('attendance').deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'Attendance record not found' });
  
  res.json({ success: true });
});

// 6. Payment tracking
app.get('/api/payments', requireAuth, async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);
  const { projectId, taskId } = req.query;

  const query: any = {};
  if (projectId) query.projectId = projectId;
  if (taskId) query.taskId = taskId;

  const payments = await tenantDb.collection('payments').find(query).sort({ _id: -1 }).toArray();
  const projects = await tenantDb.collection('projects').find({}).toArray();
  const tasks = await tenantDb.collection('tasks').find({}).toArray();

  const hydrated = payments.map((p: any) => {
    const prj = projects.find((pr: any) => pr.id === p.projectId);
    const tsk = tasks.find((ts: any) => ts.id === p.taskId);
    return {
      ...p,
      projectName: prj ? prj.projectName : 'Unknown Project',
      taskName: tsk ? tsk.taskName : 'Unknown Task'
    };
  });

  res.json({ payments: hydrated });
});

app.post('/api/payments', requireAuth, requireAdminOrAccountant, async (req: any, res) => {
  const { projectId, taskId, payeeType, payeeName, amount, paymentDate, paymentMethod, paymentStatus, notes, requestId } = req.body;
  if (!projectId || !taskId || !payeeType || !payeeName || amount === undefined || !paymentDate || !paymentMethod || !paymentStatus) {
    return res.status(400).json({ error: 'All core payment fields are required' });
  }

  // SECURITY: Prevent manual payments by non-admins. 
  if (!requestId && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Manual payments can only be created by administrators. Please submit a request first.' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);
  
  // 1. Balance Validation
  const fund = await tenantDb.collection('officeFunds').findOne({ id: 'fund_main' });
  const currentFund = fund || { id: 'fund_main', balance: 0, updatedAt: '' };
  
  if (paymentStatus === 'Paid' && currentFund.balance < Number(amount)) {
    return res.status(400).json({ error: 'Insufficient office balance for this payment.' });
  }

  // 2. Perform Payment and Update Balance
  const newPayment = {
    id: 'pay_' + Date.now(),
    projectId,
    taskId,
    payeeType,
    payeeName,
    amount: Number(amount),
    paymentDate,
    paymentMethod,
    paymentStatus,
    notes
  };

  await tenantDb.collection('payments').insertOne(newPayment);

  // If Paid, deduct from Office Balance
  if (paymentStatus === 'Paid') {
    currentFund.balance -= Number(amount);
    currentFund.updatedAt = new Date().toISOString();
    await tenantDb.collection('officeFunds').replaceOne({ id: 'fund_main' }, currentFund, { upsert: true });

    // Add Transaction Record
    await tenantDb.collection('officeTransactions').insertOne({
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
      const pr = await tenantDb.collection('paymentRequests').findOne({ id: requestId });
      if (pr) {
          await tenantDb.collection('paymentRequests').updateOne(
              { id: requestId },
              { $set: { status: paymentStatus === 'Paid' ? 'Paid' : 'Partially Paid' } }
          );
          
          // Auto-create Expense
          const categoryMap: Record<string, string> = {
            'Worker': 'Labour',
            'Vendor': 'Material',
            'Transportation': 'Transport',
            'Vendor Payment': 'Vendor Payment',
            'Other': 'Other'
          };
          
           await tenantDb.collection('expenses').insertOne({
             id: 'exp_' + Date.now(),
             projectId: pr.projectId,
             taskId: pr.taskId,
             category: categoryMap[pr.category] || 'Other',
             amount: pr.amount,
             paidTo: pr.payeeName,
             paymentMethod: paymentMethod || pr.paymentMethod || 'Office Fund',
             date: paymentDate,
             fromLocation: pr.fromLocation,
             toLocation: pr.toLocation,
             notes: pr.description,
             billImage: pr.billImage,
             createdBy: pr.createdBy || req.user.userId,
             materialName: pr.materialName,
             materialQty: pr.materialQty,
             tools: pr.tools,
             vendorTotalToPay: pr.vendorTotalToPay,
             vendorPaid: pr.vendorPaid,
             vendorRemaining: pr.vendorRemaining,
           });
      }
  }

  // 4. Audit Trail
  await tenantDb.collection('auditLogs').insertOne({
      id: 'audit_' + Date.now(),
      action: 'Create',
      entity: 'Payment',
      entityId: newPayment.id,
      performedBy: req.user.userId,
      timestamp: new Date().toISOString(),
      details: `Processed payment of ${amount} to ${payeeName}`
  });

  res.status(201).json(newPayment);
});

app.put('/api/payments/:id', requireAuth, requireAdminOrAccountant, async (req: any, res) => {
  const { payeeType, payeeName, amount, paymentDate, paymentMethod, paymentStatus, notes } = req.body;
  if (!payeeType || !payeeName || amount === undefined || !paymentDate || !paymentMethod || !paymentStatus) {
    return res.status(400).json({ error: 'All core fields are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);
  const result = await tenantDb.collection('payments').findOneAndUpdate(
      { id: req.params.id },
      { $set: { payeeType, payeeName, amount: Number(amount), paymentDate, paymentMethod, paymentStatus, notes } },
      { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'Payment not found' });
  res.json(result);
});

app.delete('/api/payments/:id', requireAuth, async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);
  
  const result = await tenantDb.collection('payments').deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'Payment not found' });
  
  res.json({ success: true, message: 'Payment deleted' });
});

// 8. Accountant Module Routes
app.get('/api/office/funds', requireAuth, async (req: any, res) => {
    const tenantDb = await getTenantDb(req.user.companyName);
    const officeFunds = await tenantDb.collection('officeFunds').find({}).toArray();
    const officeTransactions = await tenantDb.collection('officeTransactions').find({}).sort({ _id: -1 }).toArray();
    res.json({ officeFunds, officeTransactions });
});

app.post('/api/office/funds', requireAuth, requireAdminOrAccountant, async (req: any, res) => {
    const { type, amount, description, date, projectId, source, paymentMethod, reference } = req.body;
    const tenantDb = await getTenantDb(req.user.companyName);
    
    const newTransaction = {
        id: 'tx_' + Date.now(),
        type,
        amount: Number(amount),
        description,
        date: date || new Date().toISOString(),
        createdBy: req.user.userId,
        source,
        paymentMethod,
        reference
    };
    await tenantDb.collection('officeTransactions').insertOne(newTransaction);
    
    // Update balance
    let currentFund: any = await tenantDb.collection('officeFunds').findOne({ id: 'fund_main' });
    if (!currentFund) currentFund = { id: 'fund_main', balance: 0, updatedAt: '' };
    
    if (type === 'Cash In') currentFund.balance += Number(amount);
    else currentFund.balance -= Number(amount);
    currentFund.updatedAt = new Date().toISOString();
    
    await tenantDb.collection('officeFunds').replaceOne({ id: 'fund_main' }, currentFund, { upsert: true });
    
    // Log Audit
    await tenantDb.collection('auditLogs').insertOne({
        id: 'audit_' + Date.now(),
        action: 'Transaction',
        entity: 'OfficeFund',
        entityId: newTransaction.id,
        performedBy: req.user.userId,
        timestamp: new Date().toISOString(),
        details: `${type} of ${amount} from ${source || 'unknown'} for project ${projectId || 'General'}`
    });
    
    res.status(201).json(newTransaction);
});

app.get('/api/payment-requests', requireAuth, async (req: any, res) => {
    const tenantDb = await getTenantDb(req.user.companyName);
    const paymentRequests = await tenantDb.collection('paymentRequests').find({}).sort({ createdAt: -1 }).toArray();
    res.json({ paymentRequests });
});

app.post('/api/payment-requests', requireAuth, async (req: any, res) => {
    const { projectId, taskId, payeeName, category, amount, description, dueDate, priority, fromLocation, toLocation, paymentMethod, billImage, materialName, materialQty, tools, vendorTotalToPay, vendorPaid, vendorRemaining } = req.body;
    if (!projectId || !taskId || !payeeName || !category || amount === undefined || !dueDate) {
        return res.status(400).json({ error: 'Project, task, payee, category, amount, and due date are required' });
    }

    const tenantDb = await getTenantDb(req.user.companyName);
    const newRequest = {
        id: 'pr_' + Date.now(),
        projectId,
        taskId,
        payeeName: String(payeeName).trim(),
        category,
        amount: Number(amount),
        description: description || '',
        fromLocation: fromLocation || '',
        toLocation: toLocation || '',
        dueDate,
        priority: priority || 'Medium',
        status: 'Pending',
        paymentMethod: paymentMethod || 'Bank Transfer',
        billImage,
        createdBy: req.user.userId,
        createdAt: new Date().toISOString(),
        materialName,
        materialQty,
        tools,
        vendorTotalToPay: vendorTotalToPay !== undefined ? Number(vendorTotalToPay) : undefined,
        vendorPaid: vendorPaid !== undefined ? Number(vendorPaid) : undefined,
        vendorRemaining: vendorRemaining !== undefined ? Number(vendorRemaining) : undefined,
    };
    await tenantDb.collection('paymentRequests').insertOne(newRequest);
    res.status(201).json(newRequest);
});

app.put('/api/payment-requests/:id', requireAuth, async (req: any, res) => {
    const { projectId, taskId, payeeName, category, amount, description, fromLocation, toLocation, dueDate, priority, paymentMethod, billImage, materialName, materialQty, tools, vendorTotalToPay, vendorPaid, vendorRemaining } = req.body;
    if (!projectId || !taskId || !payeeName || !category || amount === undefined || !dueDate) {
        return res.status(400).json({ error: 'Project, task, payee, category, amount, and due date are required' });
    }

    const tenantDb = await getTenantDb(req.user.companyName);
    
    const existing = await tenantDb.collection('paymentRequests').findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Payment request not found' });
    if (existing.status !== 'Pending') return res.status(400).json({ error: 'Only pending payment requests can be edited' });

    const result = await tenantDb.collection('paymentRequests').findOneAndUpdate(
        { id: req.params.id },
        { $set: { 
            projectId,
            taskId,
            payeeName: String(payeeName).trim(),
            category,
            amount: Number(amount),
            description: description || '',
            fromLocation: fromLocation || '',
            toLocation: toLocation || '',
            dueDate,
            priority: priority || existing.priority || 'Medium',
            paymentMethod: paymentMethod ?? existing.paymentMethod,
            billImage: billImage !== undefined ? billImage : existing.billImage,
            materialName: materialName !== undefined ? materialName : existing.materialName,
            materialQty: materialQty !== undefined ? materialQty : existing.materialQty,
            tools: tools !== undefined ? tools : existing.tools,
            vendorTotalToPay: vendorTotalToPay !== undefined ? Number(vendorTotalToPay) : existing.vendorTotalToPay,
            vendorPaid: vendorPaid !== undefined ? Number(vendorPaid) : existing.vendorPaid,
            vendorRemaining: vendorRemaining !== undefined ? Number(vendorRemaining) : existing.vendorRemaining,
        } },
        { returnDocument: 'after' }
    );
    res.json(result);
});

app.delete('/api/payment-requests/:id', requireAuth, async (req: any, res) => {
    const tenantDb = await getTenantDb(req.user.companyName);
    
    const existing = await tenantDb.collection('paymentRequests').findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Payment request not found' });
    if (existing.status !== 'Pending') return res.status(400).json({ error: 'Only pending payment requests can be deleted' });

    await tenantDb.collection('paymentRequests').deleteOne({ id: req.params.id });
    res.json({ success: true, message: 'Payment request deleted' });
});

// 7. General ERP reports and stats endpoint
app.get('/api/reports/summary', requireAuth, async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);

  // Calculate aggregate metrics across everything
  const { taskToLabourCost, taskToExpensesCost } = await calculateMetrics(req.user.companyName);
  
  const projects = await tenantDb.collection('projects').find({}).toArray();
  const tasks = await tenantDb.collection('tasks').find({}).toArray();
  const expenses = await tenantDb.collection('expenses').find({}).toArray();
  const attendance = await tenantDb.collection('attendance').find({}).toArray();
  const payments = await tenantDb.collection('payments').find({}).toArray();
  const officeFunds = await tenantDb.collection('officeFunds').find({}).toArray();

  const totalProjects = projects.length;
  const totalTasks = tasks.length;
  const activeTasks = tasks.filter((t: any) => t.status === 'In Progress').length;
  const completedTasks = tasks.filter((t: any) => t.status === 'Completed').length;

  const totalAssignedBudget = tasks.reduce((sum: number, t: any) => sum + t.assignedBudget, 0);

  // Direct materials/equipment/etc
  const directExpensesSum = expenses.reduce((sum: number, e: any) => sum + e.amount, 0);
  // Wages attendance sum
  const labourWagesSum = attendance.reduce((sum: number, att: any) => {
    let portion = att.status === 'Present' ? 1 : att.status === 'Half Day' ? 0.5 : 0;
    return sum + (att.dailyWage * portion) + (att.overtimeAmount || 0);
  }, 0);

  const totalExpenses = directExpensesSum + labourWagesSum;

  const totalPaidAmount = payments.filter((p: any) => p.paymentStatus === 'Paid').reduce((sum: number, p: any) => sum + p.amount, 0);
  const pendingPayments = payments.filter((p: any) => p.paymentStatus === 'Pending' || p.paymentStatus === 'Partial').reduce((sum: number, p: any) => sum + p.amount, 0);

  const overallProfitLoss = totalAssignedBudget - totalExpenses;

  // Task level details
  const taskSummary = tasks.map((t: any) => {
    const dExp = expenses.filter((e: any) => e.taskId === t.id).reduce((sum: number, e: any) => sum + e.amount, 0);
    const lExp = attendance.filter((a: any) => a.taskId === t.id).reduce((sum: number, att: any) => {
      let portion = att.status === 'Present' ? 1 : att.status === 'Half Day' ? 0.5 : 0;
      return sum + (att.dailyWage * portion) + (att.overtimeAmount || 0);
    }, 0);
    const totalExp = dExp + lExp;
    return {
      taskId: t.id,
      taskName: t.taskName,
      projectId: t.projectId,
      projectName: projects.find((p: any) => p.id === t.projectId)?.projectName || 'Unknown',
      budget: t.assignedBudget,
      expenses: totalExp,
      remaining: t.assignedBudget - totalExp,
      progress: t.progress,
      status: t.status
    };
  });

  // Recent expenses hydrated
  const recentExpenses = expenses.slice(-5).reverse().map((e: any) => ({
    ...e,
    projectName: projects.find((p: any) => p.id === e.projectId)?.projectName || 'Unknown',
    taskName: tasks.find((t: any) => t.id === e.taskId)?.taskName || 'Unknown'
  }));

  // Recent payments
  const recentPayments = payments.slice(-5).reverse().map((p: any) => ({
    ...p,
    projectName: projects.find((pr: any) => pr.id === p.projectId)?.projectName || 'Unknown',
    taskName: tasks.find((t: any) => t.id === p.taskId)?.taskName || 'Unknown'
  }));

  // Today's attendance summary
  const todayStr = new Date().toISOString().split('T')[0];
  const todaysAttendanceCount = attendance.filter((a: any) => a.date === todayStr).length;
  const todaysLabourCost = attendance.filter((a: any) => a.date === todayStr).reduce((sum: number, att: any) => {
    let portion = att.status === 'Present' ? 1 : att.status === 'Half Day' ? 0.5 : 0;
    return sum + (att.dailyWage * portion) + (att.overtimeAmount || 0);
  }, 0);

  const officeBalance = officeFunds[0]?.balance || 0;

  res.json({
    stats: {
      totalProjects,
      totalTasks,
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
