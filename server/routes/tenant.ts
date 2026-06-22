import { Router } from 'express';
import { getTenantDb } from '../tenantDb';
import { requireAuth, requireAdmin, requireAdminOrAccountant } from '../middleware/auth';
import { notifyTenantRequestsUpdate } from '../socket';
import { UserRole, ExpenseCategory, PaymentRequest } from '../../src/types';
import { Storage } from 'megajs';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary if credentials are provided in env
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}


const router = Router();

// Apply auth middleware to all tenant routes
router.use(requireAuth);

const REQUEST_TO_EXPENSE_CATEGORY: Record<string, ExpenseCategory> = {
  Worker: 'Labour',
  Vendor: 'Material',
  Transportation: 'Transport',
  'Vendor Payment': 'Vendor Payment',
  Purchase: 'Material',
  'Outside Labour': 'Outside Labour',
  Other: 'Other',
};

function expenseCategoryToRequestCategory(category: ExpenseCategory | string): PaymentRequest['category'] {
  if (category === 'Material') return 'Purchase';
  if (category === 'Tools') return 'Vendor';
  if (category === 'Labour') return 'Worker';
  if (category === 'Transport') return 'Transportation';
  if (category === 'Vendor Payment') return 'Vendor Payment';
  if (category === 'Outside Labour') return 'Outside Labour';
  return 'Other';
}

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
    purchasePricePerCount: pr.purchasePricePerCount,
    purchaseTotalFull: pr.purchaseTotalFull,
    purchaseTotal: pr.purchaseTotal,
    purchaseItems: pr.purchaseItems,
  };
}

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
  const taskToOutsideLabourCost: Record<string, number> = {};
  const taskToMaterialCost: Record<string, number> = {};
  expenses.forEach((exp: any) => {
    if (exp.category === 'Outside Labour') {
      taskToOutsideLabourCost[exp.taskId] = (taskToOutsideLabourCost[exp.taskId] || 0) + exp.amount;
    } else {
      taskToExpensesCost[exp.taskId] = (taskToExpensesCost[exp.taskId] || 0) + exp.amount;
      if (exp.category === 'Material') {
        taskToMaterialCost[exp.taskId] = (taskToMaterialCost[exp.taskId] || 0) + exp.amount;
      }
    }
  });

  // 2b. Pending & Draft payment requests
  const taskToPendingExpenseCost: Record<string, number> = {};
  const taskToPendingOutsideLabourCost: Record<string, number> = {};
  const taskToPendingMaterialCost: Record<string, number> = {};
  paymentRequests.filter((pr: any) => pr.status === 'Pending' || pr.status === 'Draft').forEach((pr: any) => {
    const resolvedCat = REQUEST_TO_EXPENSE_CATEGORY[pr.category] || 'Other';
    if (resolvedCat === 'Outside Labour') {
      taskToPendingOutsideLabourCost[pr.taskId] = (taskToPendingOutsideLabourCost[pr.taskId] || 0) + pr.amount;
    } else {
      taskToPendingExpenseCost[pr.taskId] = (taskToPendingExpenseCost[pr.taskId] || 0) + pr.amount;
      if (resolvedCat === 'Material') {
        taskToPendingMaterialCost[pr.taskId] = (taskToPendingMaterialCost[pr.taskId] || 0) + pr.amount;
      }
    }
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
    taskToOutsideLabourCost,
    taskToMaterialCost,
    taskToPendingExpenseCost,
    taskToPendingOutsideLabourCost,
    taskToPendingMaterialCost,
    taskToPaymentsMade
  };
}

// User/Roles screen - List and Manage Users for Admin
router.get('/users', async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);
  const users = await tenantDb.collection('users').find({}).toArray();
  res.json({ users });
});

router.post('/users', requireAdmin, async (req: any, res) => {
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
router.patch('/users/:id/status', requireAdmin, async (req: any, res) => {
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
router.put('/users/profile', async (req: any, res) => {
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

// 2. Project routes
router.get('/projects', async (req: any, res) => {
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
    const regularExpenseAmt = projectExpenses.filter((e: any) => e.category !== 'Outside Labour').reduce((acc: number, e: any) => acc + e.amount, 0);
    const outsideLabourExpenseAmt = projectExpenses.filter((e: any) => e.category === 'Outside Labour').reduce((acc: number, e: any) => acc + e.amount, 0);

    // Project labour cost
    const projectAttendance = attendance.filter((a: any) => a.projectId === prj.id);
    const labourCostAmt = projectAttendance.reduce((acc: number, att: any) => {
      let portion = att.status === 'Present' ? 1 : att.status === 'Half Day' ? 0.5 : 0;
      return acc + (att.dailyWage * portion) + (att.overtimeAmount || 0);
    }, 0);

    const pendingRequestAmt = paymentRequests
      .filter((pr: any) => pr.projectId === prj.id && (pr.status === 'Pending' || pr.status === 'Draft'))
      .reduce((acc: number, pr: any) => acc + pr.amount, 0);

    const totalActualExpense = regularExpenseAmt + labourCostAmt + outsideLabourExpenseAmt;
    const totalCommittedExpense = totalActualExpense + pendingRequestAmt;

    // Total payments of this project
    const projectPayments = payments.filter((p: any) => p.projectId === prj.id);
    const totalPaidAmount = projectPayments.filter((p: any) => p.paymentStatus === 'Paid').reduce((acc: number, p: any) => acc + p.amount, 0);
    const pendingPaymentsAmt = projectPayments.filter((p: any) => p.paymentStatus === 'Pending').reduce((acc: number, p: any) => acc + p.amount, 0);

    const profitLoss = (prj.contractBudget || totalBudget) - totalCommittedExpense;
    const effectiveBudget = prj.contractBudget || totalBudget;
    const profitPercentage = effectiveBudget > 0 ? (profitLoss / effectiveBudget) * 100 : 0;

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

router.post('/projects', async (req: any, res) => {
  const { projectName, clientName, location, startDate, expectedEndDate, status, notes, contractBudget } = req.body;
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
    contractBudget: contractBudget ? Number(contractBudget) : 0,
    createdBy: req.user.userId,
    createdAt: new Date().toISOString()
  };

  await tenantDb.collection('projects').insertOne(newProject);
  res.status(201).json(newProject);
});

router.put('/projects/:id', async (req: any, res) => {
  const { projectName, clientName, location, startDate, expectedEndDate, status, notes, contractBudget } = req.body;
  if (!projectName || !clientName || !location || !startDate || !expectedEndDate) {
    return res.status(400).json({ error: 'All core project fields are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);
  const result = await tenantDb.collection('projects').findOneAndUpdate(
    { id: req.params.id },
    { $set: { projectName, clientName, location, startDate, expectedEndDate, status, notes, contractBudget: contractBudget ? Number(contractBudget) : 0 } },
    { returnDocument: 'after' }
  );

  if (!result) {
    return res.status(404).json({ error: 'Project not found' });
  }

  res.json(result);
});

router.delete('/projects/:id', async (req: any, res) => {
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
router.get('/tasks', async (req: any, res) => {
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
    const { taskToLabourCost, taskToExpensesCost, taskToOutsideLabourCost, taskToMaterialCost, taskToPendingExpenseCost, taskToPendingOutsideLabourCost, taskToPendingMaterialCost, taskToPaymentsMade } = await calculateMetrics(req.user.companyName);

    const tasksWithStats = tasks.map((tsk: any) => {
      const labourCost = taskToLabourCost[tsk.id] || 0;
      const directExpenses = taskToExpensesCost[tsk.id] || 0;
      const outsideLabourCost = taskToOutsideLabourCost[tsk.id] || 0;
      const materialCost = taskToMaterialCost[tsk.id] || 0;
      const pendingExpenses = taskToPendingExpenseCost[tsk.id] || 0;
      const pendingOutsideLabourCost = taskToPendingOutsideLabourCost[tsk.id] || 0;
      const pendingMaterialCost = taskToPendingMaterialCost[tsk.id] || 0;
      const totalExpenses = directExpenses + labourCost + outsideLabourCost;
      const totalCommitted = totalExpenses + pendingExpenses + pendingOutsideLabourCost;
      const paymentsPaid = taskToPaymentsMade[tsk.id] || 0;
      const remainingBudget = tsk.assignedBudget - totalCommitted;
      const profitLoss = tsk.assignedBudget - totalCommitted;
      const isOverBudget = totalCommitted > tsk.assignedBudget;

      const prj = projects.find((p: any) => p.id === tsk.projectId);

      return {
        ...tsk,
        projectName: prj ? prj.projectName : 'Unknown Project',
        labourCost,
        directExpenses,
        outsideLabourCost,
        materialCost,
        pendingExpenses,
        pendingOutsideLabourCost,
        pendingMaterialCost,
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

router.post('/tasks', async (req: any, res) => {
  const { projectId, taskName, description, assignedBudget, labourBudget, materialsBudget, assignedStaff, startDate, endDate, progress, status, notes } = req.body;
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
    labourBudget: labourBudget !== undefined && labourBudget !== null && labourBudget !== '' ? Number(labourBudget) : undefined,
    materialsBudget: materialsBudget !== undefined && materialsBudget !== null && materialsBudget !== '' ? Number(materialsBudget) : undefined,
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

router.put('/tasks/:id', async (req: any, res) => {
  const { taskName, description, assignedBudget, labourBudget, materialsBudget, assignedStaff, startDate, endDate, progress, status, notes } = req.body;
  if (!taskName || assignedBudget === undefined || !startDate || !endDate) {
    return res.status(400).json({ error: 'Task Name, Budget, Start and End dates are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);
  const result = await tenantDb.collection('tasks').findOneAndUpdate(
    { id: req.params.id },
    {
      $set: {
        taskName,
        description,
        assignedBudget: Number(assignedBudget),
        labourBudget: labourBudget !== undefined && labourBudget !== null && labourBudget !== '' ? Number(labourBudget) : undefined,
        materialsBudget: materialsBudget !== undefined && materialsBudget !== null && materialsBudget !== '' ? Number(materialsBudget) : undefined,
        assignedStaff,
        startDate,
        endDate,
        progress: progress !== undefined ? Number(progress) : undefined,
        status,
        notes
      }
    },
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

router.delete('/tasks/:id', async (req: any, res) => {
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
router.get('/expenses', async (req: any, res) => {
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

  const pendingRequestsQuery: any = { status: { $in: ['Pending', 'Draft'] } };
  if (projectId) pendingRequestsQuery.projectId = projectId;
  if (taskId) pendingRequestsQuery.taskId = taskId;

  const pendingRequests = await tenantDb.collection('paymentRequests').find(pendingRequestsQuery).toArray();

  const pendingAsExpenses = pendingRequests.map((pr: any) => paymentRequestToExpenseItem(pr, projects, tasks));
  const combined = [...pendingAsExpenses, ...hydrated].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  res.json({ expenses: combined });
});

router.put('/expenses/:id', async (req: any, res) => {
  const { projectId, taskId, category, amount, paidTo, paymentMethod, date, notes, billImage, fromLocation, toLocation, materialName, materialQty, tools, vendorTotalToPay, vendorPaid, vendorRemaining, purchasePricePerCount, purchaseTotalFull, purchaseTotal, purchaseItems } = req.body;
  if (!category || amount === undefined || !paidTo) {
    return res.status(400).json({ error: 'Category, amount, and payee are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);

  if (req.params.id.startsWith('pr_')) {
    const result = await tenantDb.collection('paymentRequests').findOneAndUpdate(
      { id: req.params.id },
      {
        $set: {
          projectId: projectId || null,
          taskId: taskId || null,
          payeeName: String(paidTo).trim(),
          category: expenseCategoryToRequestCategory(category),
          amount: Number(amount),
          description: notes || '',
          fromLocation: fromLocation ?? null,
          toLocation: toLocation ?? null,
          dueDate: date || new Date().toISOString().split('T')[0],
          paymentMethod: paymentMethod || 'Bank Transfer',
          billImage: billImage !== undefined ? billImage : null,
          materialName: materialName ?? null,
          materialQty: materialQty ?? null,
          tools: tools ?? null,
          vendorTotalToPay: vendorTotalToPay !== undefined ? Number(vendorTotalToPay) : null,
          vendorPaid: vendorPaid !== undefined ? Number(vendorPaid) : null,
          vendorRemaining: vendorRemaining !== undefined ? Number(vendorRemaining) : null,
          purchasePricePerCount: purchasePricePerCount !== undefined ? Number(purchasePricePerCount) : null,
          purchaseTotalFull: purchaseTotalFull !== undefined ? Number(purchaseTotalFull) : null,
          purchaseTotal: purchaseTotal !== undefined ? Number(purchaseTotal) : null,
          purchaseItems: purchaseItems ?? null,
        }
      },
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
    {
      $set: {
        category: category,
        amount: Number(amount),
        paidTo,
        paymentMethod: paymentMethod || 'Bank Transfer',
        date: date || new Date().toISOString().split('T')[0],
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
        purchasePricePerCount: purchasePricePerCount !== undefined ? Number(purchasePricePerCount) : null,
        purchaseTotalFull: purchaseTotalFull !== undefined ? Number(purchaseTotalFull) : null,
        purchaseTotal: purchaseTotal !== undefined ? Number(purchaseTotal) : null,
        purchaseItems: purchaseItems ?? null,
      }
    },
    { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'Expense not found' });
  res.json(result);
});

router.delete('/expenses/:id', async (req: any, res) => {
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
router.get('/crew', async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);
  const { status } = req.query;

  const query: any = {};
  if (status === 'active' || status === 'inactive') {
    query.status = status;
  }

  const crew = await tenantDb.collection('crew').find(query).sort({ name: 1 }).toArray();
  res.json({ crew });
});

router.post('/crew', async (req: any, res) => {
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

router.put('/crew/:id', async (req: any, res) => {
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
    {
      $set: {
        name: String(name).trim(),
        trade,
        dailyWage: Number(dailyWage),
        phone: phone || '',
        status,
        notes: notes || ''
      }
    },
    { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'Crew member not found' });
  res.json(result);
});

router.delete('/crew/:id', async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);

  const result = await tenantDb.collection('crew').deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'Crew member not found' });

  res.json({ success: true, message: 'Crew member removed' });
});

router.post('/crew/bulk', async (req: any, res) => {
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
    if (duplicate) continue;

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

// 5.b Vendor registry routes
router.get('/vendors', async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);
  const { status } = req.query;

  const query: any = {};
  if (status === 'active' || status === 'inactive') {
    query.status = status;
  }

  const vendors = await tenantDb.collection('vendors').find(query).sort({ name: 1 }).toArray();
  res.json({ vendors });
});

router.post('/vendors', async (req: any, res) => {
  const { name, trade, phone, status, notes } = req.body;
  if (!name || !trade) {
    return res.status(400).json({ error: 'Name and trade/role are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);

  const duplicate = await tenantDb.collection('vendors').findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
  if (duplicate) {
    return res.status(400).json({ error: 'A vendor with this name already exists' });
  }

  const newVendor = {
    id: 'vend_' + Date.now(),
    name: String(name).trim(),
    trade: String(trade).trim(),
    phone: phone || '',
    status: (status || 'active'),
    notes: notes || '',
    createdAt: new Date().toISOString()
  };

  await tenantDb.collection('vendors').insertOne(newVendor);
  res.status(201).json(newVendor);
});

router.put('/vendors/:id', async (req: any, res) => {
  const { name, trade, phone, status, notes } = req.body;
  if (!name || !trade) {
    return res.status(400).json({ error: 'Name and trade/role are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);

  const duplicate = await tenantDb.collection('vendors').findOne({
    id: { $ne: req.params.id },
    name: { $regex: new RegExp(`^${name}$`, 'i') }
  });
  if (duplicate) {
    return res.status(400).json({ error: 'A vendor with this name already exists' });
  }

  const result = await tenantDb.collection('vendors').findOneAndUpdate(
    { id: req.params.id },
    {
      $set: {
        name: String(name).trim(),
        trade: String(trade).trim(),
        phone: phone || '',
        status,
        notes: notes || ''
      }
    },
    { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'Vendor not found' });
  res.json(result);
});

router.delete('/vendors/:id', async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);

  const result = await tenantDb.collection('vendors').deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'Vendor not found' });

  res.json({ success: true, message: 'Vendor removed' });
});

router.post('/vendors/bulk', async (req: any, res) => {
  const { vendors } = req.body;
  if (!Array.isArray(vendors) || vendors.length === 0) {
    return res.status(400).json({ error: 'A non-empty vendors array is required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);
  const vendorCol = tenantDb.collection('vendors');

  const added: any[] = [];
  const errors: string[] = [];

  for (const [idx, v] of vendors.entries()) {
    const name = String(v.name || '').trim();
    if (!name) {
      errors.push(`Row ${idx + 1}: name is required`);
      continue;
    }

    const duplicate = await vendorCol.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (duplicate) continue;

    const newVendor = {
      id: 'vend_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name,
      trade: v.trade || 'Other Supply',
      phone: v.phone ? String(v.phone).trim() : '',
      status: v.status === 'inactive' ? 'inactive' : 'active',
      notes: v.notes ? String(v.notes).trim() : '',
      createdAt: new Date().toISOString()
    };

    await vendorCol.insertOne(newVendor);
    added.push(newVendor);
  }

  res.status(201).json({ success: true, added: added.length, errors });
});

// 5.c Outside Labours registry routes
router.get('/outside-labours', async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);
  const { status } = req.query;

  const query: any = {};
  if (status === 'active' || status === 'inactive') {
    query.status = status;
  }

  const outsideLabours = await tenantDb.collection('outsideLabours').find(query).sort({ name: 1 }).toArray();
  res.json({ outsideLabours });
});

router.post('/outside-labours', async (req: any, res) => {
  const { name, trade, phone, status, notes } = req.body;
  if (!name || !trade) {
    return res.status(400).json({ error: 'Name and trade/role are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);

  const duplicate = await tenantDb.collection('outsideLabours').findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
  if (duplicate) {
    return res.status(400).json({ error: 'An outside labour with this name already exists' });
  }

  const newLabour = {
    id: 'ol_' + Date.now(),
    name: String(name).trim(),
    trade: String(trade).trim(),
    phone: phone || '',
    status: (status || 'active'),
    notes: notes || '',
    createdAt: new Date().toISOString()
  };

  await tenantDb.collection('outsideLabours').insertOne(newLabour);
  res.status(201).json(newLabour);
});

router.put('/outside-labours/:id', async (req: any, res) => {
  const { name, trade, phone, status, notes } = req.body;
  if (!name || !trade) {
    return res.status(400).json({ error: 'Name and trade/role are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);

  const duplicate = await tenantDb.collection('outsideLabours').findOne({
    id: { $ne: req.params.id },
    name: { $regex: new RegExp(`^${name}$`, 'i') }
  });
  if (duplicate) {
    return res.status(400).json({ error: 'An outside labour with this name already exists' });
  }

  const result = await tenantDb.collection('outsideLabours').findOneAndUpdate(
    { id: req.params.id },
    {
      $set: {
        name: String(name).trim(),
        trade: String(trade).trim(),
        phone: phone || '',
        status,
        notes: notes || ''
      }
    },
    { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'Outside labour not found' });
  res.json(result);
});

router.delete('/outside-labours/:id', async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);

  const result = await tenantDb.collection('outsideLabours').deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'Outside labour not found' });

  res.json({ success: true, message: 'Outside labour removed' });
});

router.post('/outside-labours/bulk', async (req: any, res) => {
  const { outsideLabours } = req.body;
  if (!Array.isArray(outsideLabours) || outsideLabours.length === 0) {
    return res.status(400).json({ error: 'A non-empty outsideLabours array is required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);
  const olCol = tenantDb.collection('outsideLabours');

  const added: any[] = [];
  const errors: string[] = [];

  for (const [idx, ol] of outsideLabours.entries()) {
    const name = String(ol.name || '').trim();
    if (!name) {
      errors.push(`Row ${idx + 1}: name is required`);
      continue;
    }

    const duplicate = await olCol.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (duplicate) continue;

    const newLabour = {
      id: 'ol_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name,
      trade: ol.trade || 'Other labour',
      phone: ol.phone ? String(ol.phone).trim() : '',
      status: ol.status === 'inactive' ? 'inactive' : 'active',
      notes: ol.notes ? String(ol.notes).trim() : '',
      createdAt: new Date().toISOString()
    };

    await olCol.insertOne(newLabour);
    added.push(newLabour);
  }

  res.status(201).json({ success: true, added: added.length, errors });
});

// 6. Attendance routes
router.get('/attendance', async (req: any, res) => {
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

router.post('/attendance', async (req: any, res) => {
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
    paymentStatus: (paymentStatus || 'Unpaid'),
    notes
  };

  await tenantDb.collection('attendance').insertOne(newAttendance);
  res.status(201).json(newAttendance);
});

router.post('/attendance/bulk', async (req: any, res) => {
  const { projectId, taskId, date, workers } = req.body;
  if (!projectId || !taskId || !date || !Array.isArray(workers)) {
    return res.status(400).json({ error: 'Valid Project, Task, Date and workers array are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);
  const attCol = tenantDb.collection('attendance');
  const addedRecords: any[] = [];

  for (const w of workers) {
    if (!w.workerName || !w.status || w.dailyWage === undefined) continue;

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
      paymentStatus: (w.paymentStatus || 'Unpaid'),
      notes: w.notes
    };

    await attCol.insertOne(newAtt);
    addedRecords.push(newAtt);
  }

  res.status(201).json({ success: true, count: addedRecords.length, records: addedRecords });
});

router.put('/attendance/:id', async (req: any, res) => {
  const { status, dailyWage, overtimeAmount, paymentStatus, notes, workerName } = req.body;
  if (!status || dailyWage === undefined) {
    return res.status(400).json({ error: 'Status and daily wage are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);

  const result = await tenantDb.collection('attendance').findOneAndUpdate(
    { id: req.params.id },
    {
      $set: {
        workerName,
        status,
        dailyWage: Number(dailyWage),
        overtimeAmount: overtimeAmount !== undefined ? Number(overtimeAmount) : 0,
        paymentStatus,
        notes
      }
    },
    { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'Attendance record not found' });
  res.json(result);
});

router.delete('/attendance/:id', async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);

  const result = await tenantDb.collection('attendance').deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'Attendance record not found' });

  res.json({ success: true });
});

// 6. Payment tracking
router.get('/payments', async (req: any, res) => {
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

router.post('/payments', requireAdminOrAccountant, async (req: any, res) => {
  const { projectId, taskId, payeeType, payeeName, amount, paymentDate, paymentMethod, paymentStatus, notes, requestId } = req.body;
  if (!projectId || !taskId || !payeeType || !payeeName || amount === undefined || !paymentDate || !paymentMethod || !paymentStatus) {
    return res.status(400).json({ error: 'All core payment fields are required' });
  }

  if (!requestId && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Manual payments can only be created by administrators. Please submit a request first.' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);

  let pr: any = null;
  if (requestId) {
    pr = await tenantDb.collection('paymentRequests').findOne({ id: requestId });
  }

  if (pr && pr.adjustmentType) {
    if (paymentStatus !== 'Paid') {
      await tenantDb.collection('paymentRequests').updateOne(
        { id: requestId },
        { $set: { status: paymentStatus } }
      );
      notifyTenantRequestsUpdate(req.user.companyName);
      return res.json({ success: true, message: 'Adjustment request status updated' });
    }

    const fund = await tenantDb.collection('officeFunds').findOne({ id: 'fund_main' });
    const currentFund = fund || { id: 'fund_main', balance: 0, updatedAt: '' };

    if (pr.adjustmentType === 'Delete') {
      let targetExpense = await tenantDb.collection('expenses').findOne({
        $or: [
          { id: pr.targetExpenseId },
          { requestId: pr.targetExpenseId }
        ]
      });

      if (!targetExpense && pr.targetExpenseId) {
        const origReq = await tenantDb.collection('paymentRequests').findOne({ id: pr.targetExpenseId });
        if (origReq) {
          targetExpense = await tenantDb.collection('expenses').findOne({
            projectId: origReq.projectId,
            taskId: origReq.taskId,
            paidTo: origReq.payeeName,
            amount: origReq.amount
          });
        }
      }

      if (targetExpense) {
        await tenantDb.collection('expenses').deleteOne({ id: targetExpense.id });
      }

      let targetPayment = await tenantDb.collection('payments').findOne({
        $or: [
          { id: pr.targetExpenseId },
          { requestId: pr.targetExpenseId }
        ]
      });

      if (!targetPayment && pr.targetExpenseId) {
        const origReq = await tenantDb.collection('paymentRequests').findOne({ id: pr.targetExpenseId });
        if (origReq) {
          targetPayment = await tenantDb.collection('payments').findOne({
            projectId: origReq.projectId,
            taskId: origReq.taskId,
            payeeName: origReq.payeeName,
            amount: origReq.amount
          });
        } else if (targetExpense) {
          targetPayment = await tenantDb.collection('payments').findOne({
            projectId: targetExpense.projectId,
            taskId: targetExpense.taskId,
            payeeName: targetExpense.paidTo,
            amount: targetExpense.amount
          });
        }
      }

      if (targetPayment) {
        await tenantDb.collection('payments').deleteOne({ id: targetPayment.id });
      }

      const origReq = await tenantDb.collection('paymentRequests').findOne({ id: pr.targetExpenseId });
      const refundAmount = targetExpense ? targetExpense.amount : (origReq ? origReq.amount : pr.amount);
      currentFund.balance += Number(refundAmount);
      currentFund.updatedAt = new Date().toISOString();
      await tenantDb.collection('officeFunds').replaceOne({ id: 'fund_main' }, currentFund, { upsert: true });

      await tenantDb.collection('officeTransactions').insertOne({
        id: 'tx_' + Date.now(),
        type: 'Cash In',
        amount: Number(refundAmount),
        description: `Refund: Deleted expense of ${refundAmount} to ${pr.payeeName}`,
        date: new Date().toISOString(),
        createdBy: req.user.userId
      });

      if (pr.category === 'Worker' || (targetExpense && targetExpense.category === 'Labour')) {
        if (pr.attendanceIds && Array.isArray(pr.attendanceIds)) {
          await tenantDb.collection('attendance').updateMany(
            { id: { $in: pr.attendanceIds } },
            { $set: { paymentStatus: 'Unpaid' } }
          );
        } else {
          await tenantDb.collection('attendance').updateOne(
            {
              projectId: pr.projectId,
              taskId: pr.taskId,
              workerName: pr.payeeName,
              date: pr.dueDate
            },
            { $set: { paymentStatus: 'Unpaid' } }
          );
        }
      }

      if (pr.targetExpenseId) {
        await tenantDb.collection('paymentRequests').updateOne(
          { id: pr.targetExpenseId },
          { $set: { status: 'Deleted' } }
        );
      }

      await tenantDb.collection('paymentRequests').updateOne(
        { id: requestId },
        { $set: { status: 'Paid' } }
      );

      notifyTenantRequestsUpdate(req.user.companyName);
      return res.json({ success: true, message: 'Delete adjustment request approved and processed' });
    }

    if (pr.adjustmentType === 'Edit') {
      let editData: any = {};
      try {
        editData = JSON.parse(pr.adjustmentData || '{}');
      } catch (e) {
        return res.status(400).json({ error: 'Invalid adjustment data format' });
      }

      let targetExpense = await tenantDb.collection('expenses').findOne({
        $or: [
          { id: pr.targetExpenseId },
          { requestId: pr.targetExpenseId }
        ]
      });

      if (!targetExpense && pr.targetExpenseId) {
        const origReq = await tenantDb.collection('paymentRequests').findOne({ id: pr.targetExpenseId });
        if (origReq) {
          targetExpense = await tenantDb.collection('expenses').findOne({
            projectId: origReq.projectId,
            taskId: origReq.taskId,
            paidTo: origReq.payeeName,
            amount: origReq.amount
          });
        }
      }

      let targetPayment = await tenantDb.collection('payments').findOne({
        $or: [
          { id: pr.targetExpenseId },
          { requestId: pr.targetExpenseId }
        ]
      });

      if (!targetPayment && pr.targetExpenseId) {
        const origReq = await tenantDb.collection('paymentRequests').findOne({ id: pr.targetExpenseId });
        if (origReq) {
          targetPayment = await tenantDb.collection('payments').findOne({
            projectId: origReq.projectId,
            taskId: origReq.taskId,
            payeeName: origReq.payeeName,
            amount: origReq.amount
          });
        } else if (targetExpense) {
          targetPayment = await tenantDb.collection('payments').findOne({
            projectId: targetExpense.projectId,
            taskId: targetExpense.taskId,
            payeeName: targetExpense.paidTo,
            amount: targetExpense.amount
          });
        }
      }

      const origReq = await tenantDb.collection('paymentRequests').findOne({ id: pr.targetExpenseId });
      const oldAmount = targetExpense ? targetExpense.amount : (origReq ? origReq.amount : pr.amount);
      const newAmount = Number(pr.amount);
      const diff = newAmount - oldAmount;

      if (diff > 0 && currentFund.balance < diff) {
        return res.status(400).json({ error: `Insufficient office balance for the additional cost of ₹${diff.toFixed(2)}` });
      }

      if (diff > 0) {
        currentFund.balance -= diff;
        await tenantDb.collection('officeTransactions').insertOne({
          id: 'tx_' + Date.now(),
          type: 'Cash Out',
          amount: Number(diff),
          description: `Adjustment: Additional cost for edited expense to ${pr.payeeName}`,
          date: new Date().toISOString(),
          createdBy: req.user.userId
        });
      } else if (diff < 0) {
        currentFund.balance += Math.abs(diff);
        await tenantDb.collection('officeTransactions').insertOne({
          id: 'tx_' + Date.now(),
          type: 'Cash In',
          amount: Number(Math.abs(diff)),
          description: `Adjustment Refund: Reduced cost for edited expense to ${pr.payeeName}`,
          date: new Date().toISOString(),
          createdBy: req.user.userId
        });
      }

      currentFund.updatedAt = new Date().toISOString();
      await tenantDb.collection('officeFunds').replaceOne({ id: 'fund_main' }, currentFund, { upsert: true });

      if (targetExpense) {
        await tenantDb.collection('expenses').updateOne(
          { id: targetExpense.id },
          {
            $set: {
              amount: newAmount,
              paidTo: editData.paidTo || pr.payeeName,
              category: editData.category || targetExpense.category,
              notes: editData.notes || targetExpense.notes,
              paymentMethod: editData.paymentMethod || targetExpense.paymentMethod,
              date: editData.date || targetExpense.date,
              materialName: editData.materialName,
              materialQty: editData.materialQty,
              tools: editData.tools,
              vendorTotalToPay: editData.vendorTotalToPay,
              vendorPaid: editData.vendorPaid,
              vendorRemaining: editData.vendorRemaining,
              purchasePricePerCount: editData.purchasePricePerCount,
              purchaseTotalFull: editData.purchaseTotalFull,
              purchaseItems: editData.purchaseItems
            }
          }
        );
      }

      if (targetPayment) {
        await tenantDb.collection('payments').updateOne(
          { id: targetPayment.id },
          {
            $set: {
              amount: newAmount,
              payeeName: editData.paidTo || pr.payeeName,
              paymentDate: editData.date || targetPayment.paymentDate,
              paymentMethod: editData.paymentMethod || targetPayment.paymentMethod,
              notes: editData.notes || targetPayment.notes
            }
          }
        );
      }

      if (pr.targetExpenseId) {
        await tenantDb.collection('paymentRequests').updateOne(
          { id: pr.targetExpenseId },
          {
            $set: {
              amount: newAmount,
              payeeName: editData.paidTo || pr.payeeName,
              description: editData.notes || pr.description,
              paymentMethod: editData.paymentMethod || pr.paymentMethod,
              dueDate: editData.date || pr.dueDate
            }
          }
        );
      }

      await tenantDb.collection('paymentRequests').updateOne(
        { id: requestId },
        { $set: { status: 'Paid' } }
      );

      notifyTenantRequestsUpdate(req.user.companyName);
      return res.json({ success: true, message: 'Edit adjustment request approved and processed' });
    }
  }

  const fund = await tenantDb.collection('officeFunds').findOne({ id: 'fund_main' });
  const currentFund = fund || { id: 'fund_main', balance: 0, updatedAt: '' };

  const paymentAmount = Number(amount);

  if (paymentStatus === 'Paid' && currentFund.balance < paymentAmount) {
    return res.status(400).json({ error: 'Insufficient office balance for this payment.' });
  }

  const newPayment = {
    id: 'pay_' + Date.now(),
    projectId,
    taskId,
    payeeType,
    payeeName,
    amount: paymentAmount,
    paymentDate,
    paymentMethod,
    paymentStatus,
    notes,
    requestId: requestId || undefined
  };

  await tenantDb.collection('payments').insertOne(newPayment);

  if (paymentStatus === 'Paid') {
    currentFund.balance -= paymentAmount;
    currentFund.updatedAt = new Date().toISOString();
    await tenantDb.collection('officeFunds').replaceOne({ id: 'fund_main' }, currentFund, { upsert: true });

    await tenantDb.collection('officeTransactions').insertOne({
      id: 'tx_' + Date.now(),
      type: 'Cash Out',
      amount: paymentAmount,
      description: `Payment to ${payeeName} for ${taskId}`,
      date: new Date().toISOString(),
      createdBy: req.user.userId
    });
  }

  if (requestId) {
    const pr = await tenantDb.collection('paymentRequests').findOne({ id: requestId });
    if (pr) {
      const currentHistory = pr.paymentHistory || [];
      const newHistoryItem = {
        id: 'pay_hist_' + Date.now(),
        amount: paymentAmount,
        paymentMethod: paymentMethod,
        paidAt: new Date().toISOString(),
        paidBy: req.user.userId,
        notes: notes || ''
      };
      const updatedHistory = [...currentHistory, newHistoryItem];
      const totalPaid = updatedHistory.reduce((sum: number, item: any) => sum + item.amount, 0);
      const remaining = Math.max(0, pr.amount - totalPaid);
      const finalStatus = remaining <= 0 ? 'Paid' : 'Partially Paid';

      await tenantDb.collection('paymentRequests').updateOne(
        { id: requestId },
        {
          $set: {
            status: finalStatus,
            paymentHistory: updatedHistory
          }
        }
      );

      if (pr.category === 'Worker' && finalStatus === 'Paid') {
        if (pr.attendanceIds && Array.isArray(pr.attendanceIds)) {
          await tenantDb.collection('attendance').updateMany(
            { id: { $in: pr.attendanceIds } },
            { $set: { paymentStatus: 'Paid' } }
          );
        } else {
          await tenantDb.collection('attendance').updateOne(
            {
              projectId: pr.projectId,
              taskId: pr.taskId,
              workerName: pr.payeeName,
              date: pr.dueDate
            },
            { $set: { paymentStatus: 'Paid' } }
          );
        }
      }

      const categoryMap: Record<string, string> = {
        'Worker': 'Labour',
        'Vendor': 'Material',
        'Transportation': 'Transport',
        'Vendor Payment': 'Vendor Payment',
        'Purchase': 'Material',
        'Other': 'Other'
      };

      await tenantDb.collection('expenses').insertOne({
        id: 'exp_' + Date.now(),
        projectId: pr.projectId,
        taskId: pr.taskId,
        category: categoryMap[pr.category] || 'Other',
        amount: paymentAmount,
        paidTo: pr.payeeName,
        paymentMethod: paymentMethod || pr.paymentMethod || 'Office Fund',
        date: paymentDate,
        fromLocation: pr.fromLocation,
        toLocation: pr.toLocation,
        notes: notes || pr.description,
        billImage: pr.billImage,
        createdBy: pr.createdBy || req.user.userId,
        materialName: pr.materialName,
        materialQty: pr.materialQty,
        tools: pr.tools,
        vendorTotalToPay: pr.vendorTotalToPay,
        vendorPaid: totalPaid,
        vendorRemaining: remaining,
        purchasePricePerCount: pr.purchasePricePerCount,
        purchaseTotalFull: pr.purchaseTotalFull,
        purchaseTotal: pr.purchaseTotal,
        purchaseItems: pr.purchaseItems,
        requestId: pr.id
      });
    }
  }

  await tenantDb.collection('auditLogs').insertOne({
    id: 'audit_' + Date.now(),
    action: 'Create',
    entity: 'Payment',
    entityId: newPayment.id,
    performedBy: req.user.userId,
    timestamp: new Date().toISOString(),
    details: `Processed payment of ${amount} to ${payeeName}`
  });

  notifyTenantRequestsUpdate(req.user.companyName);
  res.status(201).json(newPayment);
});

router.put('/payments/:id', requireAdminOrAccountant, async (req: any, res) => {
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

router.delete('/payments/:id', async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);

  const payment = await tenantDb.collection('payments').findOne({ id: req.params.id });
  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  const result = await tenantDb.collection('payments').deleteOne({ id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'Payment not found' });

  if (payment.paymentStatus === 'Paid') {
    const fund = await tenantDb.collection('officeFunds').findOne({ id: 'fund_main' });
    const currentFund = fund || { id: 'fund_main', balance: 0, updatedAt: '' };

    currentFund.balance += Number(payment.amount);
    currentFund.updatedAt = new Date().toISOString();
    await tenantDb.collection('officeFunds').replaceOne({ id: 'fund_main' }, currentFund, { upsert: true });

    await tenantDb.collection('officeTransactions').insertOne({
      id: 'tx_' + Date.now(),
      type: 'Cash In',
      amount: Number(payment.amount),
      description: `Refund: Deleted payment of ${payment.amount} to ${payment.payeeName}`,
      date: new Date().toISOString(),
      createdBy: req.user.userId
    });
  }

  res.json({ success: true, message: 'Payment deleted and refunded successfully' });
});

// 8. Accountant Module Routes
router.get('/office/funds', async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);
  const officeFunds = await tenantDb.collection('officeFunds').find({}).toArray();
  const officeTransactions = await tenantDb.collection('officeTransactions').find({}).sort({ _id: -1 }).toArray();
  res.json({ officeFunds, officeTransactions });
});

router.post('/office/funds', requireAdminOrAccountant, async (req: any, res) => {
  const { type, amount, description, date, projectId, source, paymentMethod, reference, inflowType } = req.body;
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
    reference,
    inflowType
  };
  await tenantDb.collection('officeTransactions').insertOne(newTransaction);

  let currentFund: any = await tenantDb.collection('officeFunds').findOne({ id: 'fund_main' });
  if (!currentFund) currentFund = { id: 'fund_main', balance: 0, updatedAt: '' };

  if (type === 'Cash In') currentFund.balance += Number(amount);
  else currentFund.balance -= Number(amount);
  currentFund.updatedAt = new Date().toISOString();

  await tenantDb.collection('officeFunds').replaceOne({ id: 'fund_main' }, currentFund, { upsert: true });

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

router.get('/payment-requests', async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);
  const paymentRequests = await tenantDb.collection('paymentRequests').find({}).sort({ createdAt: -1 }).toArray();
  res.json({ paymentRequests });
});

router.post('/payment-requests', async (req: any, res) => {
  const { projectId, taskId, payeeName, category, amount, description, dueDate, priority, fromLocation, toLocation, paymentMethod, billImage, billNo, materialName, materialQty, tools, vendorTotalToPay, vendorPaid, vendorRemaining, purchasePricePerCount, purchaseTotalFull, purchaseTotal, purchaseItems, adjustmentType, targetExpenseId, adjustmentData, attendanceIds, status } = req.body;
  if (!projectId || !taskId || !payeeName || !category || amount === undefined) {
    return res.status(400).json({ error: 'Project, task, payee, category, and amount are required' });
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
    dueDate: dueDate || new Date().toISOString().split('T')[0],
    priority: priority || 'Medium',
    status: status || 'Draft',
    paymentMethod: paymentMethod || 'Bank Transfer',
    billImage,
    billNo: typeof billNo === 'string' ? billNo.trim() || undefined : undefined,
    createdBy: req.user.userId,
    createdAt: new Date().toISOString(),
    materialName,
    materialQty,
    tools,
    vendorTotalToPay: vendorTotalToPay !== undefined ? Number(vendorTotalToPay) : undefined,
    vendorPaid: vendorPaid !== undefined ? Number(vendorPaid) : undefined,
    vendorRemaining: vendorRemaining !== undefined ? Number(vendorRemaining) : undefined,
    purchasePricePerCount: purchasePricePerCount !== undefined ? Number(purchasePricePerCount) : undefined,
    purchaseTotalFull: purchaseTotalFull !== undefined ? Number(purchaseTotalFull) : undefined,
    purchaseTotal: purchaseTotal !== undefined ? Number(purchaseTotal) : undefined,
    purchaseItems: purchaseItems ?? undefined,
    adjustmentType: adjustmentType || undefined,
    targetExpenseId: targetExpenseId || undefined,
    adjustmentData: adjustmentData || undefined,
    attendanceIds: attendanceIds ?? undefined,
  };
  await tenantDb.collection('paymentRequests').insertOne(newRequest);
  notifyTenantRequestsUpdate(req.user.companyName);
  res.status(201).json(newRequest);
});

router.put('/payment-requests/:id', async (req: any, res) => {
  const { projectId, taskId, payeeName, category, amount, description, fromLocation, toLocation, dueDate, priority, paymentMethod, billImage, billNo, materialName, materialQty, tools, vendorTotalToPay, vendorPaid, vendorRemaining, purchasePricePerCount, purchaseTotalFull, purchaseTotal, purchaseItems, status } = req.body;
  if (!projectId || !taskId || !payeeName || !category || amount === undefined) {
    return res.status(400).json({ error: 'Project, task, payee, category, and amount are required' });
  }

  const tenantDb = await getTenantDb(req.user.companyName);

  const existing = await tenantDb.collection('paymentRequests').findOne({ id: req.params.id });
  if (!existing) return res.status(404).json({ error: 'Payment request not found' });
  if (existing.status !== 'Pending' && existing.status !== 'Draft') return res.status(400).json({ error: 'Only draft or pending payment requests can be edited' });

  const result = await tenantDb.collection('paymentRequests').findOneAndUpdate(
    { id: req.params.id },
    {
      $set: {
        projectId,
        taskId,
        payeeName: String(payeeName).trim(),
        category,
        amount: Number(amount),
        description: description || '',
        fromLocation: fromLocation || '',
        toLocation: toLocation || '',
        dueDate: dueDate || existing.dueDate || new Date().toISOString().split('T')[0],
        priority: priority || existing.priority || 'Medium',
        status: status || existing.status,
        paymentMethod: paymentMethod ?? existing.paymentMethod ?? 'Bank Transfer',
        billImage: billImage !== undefined ? billImage : existing.billImage,
        billNo: billNo !== undefined ? (typeof billNo === 'string' ? billNo.trim() || undefined : undefined) : existing.billNo,
        materialName: materialName !== undefined ? materialName : existing.materialName,
        materialQty: materialQty !== undefined ? materialQty : existing.materialQty,
        tools: tools !== undefined ? tools : existing.tools,
        vendorTotalToPay: vendorTotalToPay !== undefined ? Number(vendorTotalToPay) : existing.vendorTotalToPay,
        vendorPaid: vendorPaid !== undefined ? Number(vendorPaid) : existing.vendorPaid,
        vendorRemaining: vendorRemaining !== undefined ? Number(vendorRemaining) : existing.vendorRemaining,
        purchasePricePerCount: purchasePricePerCount !== undefined ? Number(purchasePricePerCount) : existing.purchasePricePerCount,
        purchaseTotalFull: purchaseTotalFull !== undefined ? Number(purchaseTotalFull) : existing.purchaseTotalFull,
        purchaseTotal: purchaseTotal !== undefined ? Number(purchaseTotal) : existing.purchaseTotal,
        purchaseItems: purchaseItems !== undefined ? purchaseItems : existing.purchaseItems,
      }
    },
    { returnDocument: 'after' }
  );
  notifyTenantRequestsUpdate(req.user.companyName);
  res.json(result);
});

router.delete('/payment-requests/:id', async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);

  const existing = await tenantDb.collection('paymentRequests').findOne({ id: req.params.id });
  if (!existing) return res.status(404).json({ error: 'Payment request not found' });
  if (existing.status !== 'Pending' && existing.status !== 'Draft') return res.status(400).json({ error: 'Only draft or pending payment requests can be deleted' });

  if (existing.category === 'Worker') {
    if (existing.attendanceIds && Array.isArray(existing.attendanceIds)) {
      await tenantDb.collection('attendance').updateMany(
        { id: { $in: existing.attendanceIds } },
        { $set: { paymentStatus: 'Unpaid' } }
      );
    } else {
      await tenantDb.collection('attendance').updateOne(
        {
          projectId: existing.projectId,
          taskId: existing.taskId,
          workerName: existing.payeeName,
          date: existing.dueDate
        },
        { $set: { paymentStatus: 'Unpaid' } }
      );
    }
  }

  await tenantDb.collection('paymentRequests').deleteOne({ id: req.params.id });
  notifyTenantRequestsUpdate(req.user.companyName);
  res.json({ success: true, message: 'Payment request deleted' });
});

// 7. General ERP reports and stats endpoint
router.get('/reports/summary', async (req: any, res) => {
  const tenantDb = await getTenantDb(req.user.companyName);

  const { taskToLabourCost, taskToExpensesCost, taskToPendingExpenseCost } = await calculateMetrics(req.user.companyName);

  const projects = await tenantDb.collection('projects').find({}).toArray();
  const tasks = await tenantDb.collection('tasks').find({}).toArray();
  const expenses = await tenantDb.collection('expenses').find({}).toArray();
  const attendance = await tenantDb.collection('attendance').find({}).toArray();
  const payments = await tenantDb.collection('payments').find({}).toArray();
  const officeFunds = await tenantDb.collection('officeFunds').find({}).toArray();
  const paymentRequests = await tenantDb.collection('paymentRequests').find({}).toArray();

  const totalProjects = projects.length;
  const totalTasks = tasks.length;
  const activeTasks = tasks.filter((t: any) => t.status === 'In Progress').length;
  const completedTasks = tasks.filter((t: any) => t.status === 'Completed').length;

  const totalAssignedBudget = tasks.reduce((sum: number, t: any) => sum + t.assignedBudget, 0);

  const directExpensesSum = expenses.reduce((sum: number, e: any) => sum + e.amount, 0);
  const labourWagesSum = attendance.reduce((sum: number, att: any) => {
    let portion = att.status === 'Present' ? 1 : att.status === 'Half Day' ? 0.5 : 0;
    return sum + (att.dailyWage * portion) + (att.overtimeAmount || 0);
  }, 0);

  const pendingRequestSum = paymentRequests
    .filter((pr: any) => pr.status === 'Pending' || pr.status === 'Draft')
    .reduce((sum: number, pr: any) => sum + pr.amount, 0);

  const totalExpenses = directExpensesSum + labourWagesSum + pendingRequestSum;

  const totalPaidAmount = payments.filter((p: any) => p.paymentStatus === 'Paid').reduce((sum: number, p: any) => sum + p.amount, 0);
  const pendingPayments = payments.filter((p: any) => p.paymentStatus === 'Pending' || p.paymentStatus === 'Partial').reduce((sum: number, p: any) => sum + p.amount, 0);

  // Per-project effective budget (uses contractBudget when set, else sum of task budgets)
  const totalEffectiveBudget = projects.reduce((sum: number, prj: any) => {
    if (prj.contractBudget && prj.contractBudget > 0) return sum + prj.contractBudget;
    const prjTaskBudget = tasks.filter((t: any) => t.projectId === prj.id).reduce((s: number, t: any) => s + t.assignedBudget, 0);
    return sum + prjTaskBudget;
  }, 0);

  const overallProfitLoss = totalEffectiveBudget - totalExpenses;

  const taskSummary = tasks.map((t: any) => {
    const dExp = expenses.filter((e: any) => e.taskId === t.id).reduce((sum: number, e: any) => sum + e.amount, 0);
    const pExp = taskToPendingExpenseCost[t.id] || 0;
    const lExp = attendance.filter((a: any) => a.taskId === t.id).reduce((sum: number, att: any) => {
      let portion = att.status === 'Present' ? 1 : att.status === 'Half Day' ? 0.5 : 0;
      return sum + (att.dailyWage * portion) + (att.overtimeAmount || 0);
    }, 0);
    const totalExp = dExp + lExp + pExp;
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

  // Recent expenses include both approved expenses and pending/draft requests
  const pendingAsExpenses = paymentRequests
    .filter((pr: any) => pr.status === 'Pending' || pr.status === 'Draft')
    .map((pr: any) => ({
      id: pr.id,
      projectId: pr.projectId,
      taskId: pr.taskId,
      paidTo: pr.payeeName,
      category: pr.category,
      amount: pr.amount,
      date: pr.dueDate,
      notes: pr.description,
      status: pr.status,
      paymentMethod: pr.paymentMethod,
      projectName: projects.find((p: any) => p.id === pr.projectId)?.projectName || 'Unknown',
      taskName: tasks.find((t: any) => t.id === pr.taskId)?.taskName || 'Unknown',
      isPendingRequest: true
    }));

  const allRecentItems = [...pendingAsExpenses, ...expenses.map((e: any) => ({
    ...e,
    projectName: projects.find((p: any) => p.id === e.projectId)?.projectName || 'Unknown',
    taskName: tasks.find((t: any) => t.id === e.taskId)?.taskName || 'Unknown'
  }))].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const recentExpenses = allRecentItems.slice(0, 5);

  const recentPayments = payments.slice(-5).reverse().map((p: any) => ({
    ...p,
    projectName: projects.find((pr: any) => pr.id === p.projectId)?.projectName || 'Unknown',
    taskName: tasks.find((t: any) => t.id === p.taskId)?.taskName || 'Unknown'
  }));

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

// 9. Document management routes
router.get('/projects/:projectId/documents', async (req: any, res) => {
  try {
    const tenantDb = await getTenantDb(req.user.companyName);
    const documents = await tenantDb.collection('documents').find({ projectId: req.params.projectId }).toArray();
    res.json({ documents });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

router.post('/projects/:projectId/documents', async (req: any, res) => {
  const { name, type, size, base64Data, title, taskId } = req.body;
  if (!name || !type || size === undefined || !base64Data) {
    return res.status(400).json({ error: 'Name, type, size, and base64Data are required' });
  }

  try {
    const tenantDb = await getTenantDb(req.user.companyName);
    const docId = 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    let url = '';
    let isUploadedToCloudinary = false;
    let cloudinaryPublicId = '';
    let cloudinaryResourceType = '';
    let isUploadedToMega = false;

    const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
    const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;

    if (cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret) {
      try {
        console.log(`[CLOUDINARY] Uploading file: ${name}`);
        const base64Clean = base64Data.replace(/^data:.*;base64,/, '');
        const uploadStr = `data:${type};base64,${base64Clean}`;

        const result = await cloudinary.uploader.upload(uploadStr, {
          folder: `logro/documents/${req.params.projectId}`,
          resource_type: 'auto'
        });

        url = result.secure_url;
        cloudinaryPublicId = result.public_id;
        cloudinaryResourceType = result.resource_type;
        isUploadedToCloudinary = true;
        console.log(`[CLOUDINARY] Successfully uploaded ${name}. Link: ${url}`);
      } catch (cloudErr: any) {
        console.error('[CLOUDINARY] Upload failed:', cloudErr);
      }
    }

    if (!isUploadedToCloudinary) {
      const megaEmail = process.env.MEGA_EMAIL;
      const megaPassword = process.env.MEGA_PASSWORD;

      if (megaEmail && megaPassword) {
        try {
          console.log(`[MEGA] Logging in for file upload: ${name}`);
          const storage = await new Storage({
            email: megaEmail,
            password: megaPassword
          }).ready;

          const base64Clean = base64Data.replace(/^data:.*;base64,/, '');
          const buffer = Buffer.from(base64Clean, 'base64');

          const file = await storage.upload({
            name,
            size: buffer.length
          }, buffer).complete;

          url = await file.link({});
          isUploadedToMega = true;
          console.log(`[MEGA] Successfully uploaded ${name}. Link: ${url}`);
        } catch (megaErr: any) {
          console.error('[MEGA] Upload failed, falling back to local database storage:', megaErr);
        }
      }
    }

    const newDoc = {
      id: docId,
      projectId: req.params.projectId,
      taskId: taskId || undefined,
      title: title || undefined,
      name,
      type,
      size,
      uploadedBy: req.user.userId,
      uploadedByName: req.user.name || 'Unknown User',
      uploadedAt: new Date().toISOString(),
      cloudinaryUrl: isUploadedToCloudinary ? url : undefined,
      cloudinaryPublicId: isUploadedToCloudinary ? cloudinaryPublicId : undefined,
      cloudinaryResourceType: isUploadedToCloudinary ? cloudinaryResourceType : undefined,
      megaUrl: isUploadedToMega ? url : undefined,
      base64Data: (isUploadedToCloudinary || isUploadedToMega) ? undefined : base64Data
    };

    await tenantDb.collection('documents').insertOne(newDoc);

    let storageType = 'Local DB';
    if (isUploadedToCloudinary) storageType = 'Cloudinary';
    else if (isUploadedToMega) storageType = 'MEGA';

    await tenantDb.collection('auditLogs').insertOne({
      id: 'audit_' + Date.now(),
      action: 'Upload',
      entity: 'Document',
      entityId: docId,
      performedBy: req.user.userId,
      timestamp: new Date().toISOString(),
      details: `Uploaded document "${name}" (${storageType})`
    });

    const responseDoc = {
      ...newDoc,
      base64Data: (isUploadedToCloudinary || isUploadedToMega) ? undefined : base64Data
    };
    res.status(201).json({ document: responseDoc });
  } catch (err: any) {
    console.error('Document upload error:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

router.delete('/projects/:projectId/documents/:documentId', async (req: any, res) => {
  try {
    const tenantDb = await getTenantDb(req.user.companyName);

    const doc = await tenantDb.collection('documents').findOne({ id: req.params.documentId });
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    if (doc.cloudinaryPublicId) {
      const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
      const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;

      if (cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret) {
        try {
          console.log(`[CLOUDINARY] Deleting file: ${doc.name} (Public ID: ${doc.cloudinaryPublicId})`);
          await cloudinary.uploader.destroy(doc.cloudinaryPublicId, {
            resource_type: doc.cloudinaryResourceType || 'auto'
          });
        } catch (cloudErr) {
          console.error('[CLOUDINARY] Failed to delete file from Cloudinary:', cloudErr);
        }
      }
    }

    const megaUrlVal = doc.megaUrl || doc.url;
    if (megaUrlVal && megaUrlVal.includes('mega.nz')) {
      const megaEmail = process.env.MEGA_EMAIL;
      const megaPassword = process.env.MEGA_PASSWORD;
      if (megaEmail && megaPassword) {
        try {
          const storage = await new Storage({
            email: megaEmail,
            password: megaPassword
          }).ready;

          const file = Object.values(storage.files).find((f: any) => f.name === doc.name);
          if (file) {
            await new Promise<void>((resolve, reject) => {
              file.delete(true, (err: any) => {
                if (err) reject(err);
                else resolve();
              });
            });
          }
        } catch (megaErr) {
          console.error('[MEGA] Failed to delete file on MEGA:', megaErr);
        }
      }
    }

    await tenantDb.collection('documents').deleteOne({ id: req.params.documentId });

    await tenantDb.collection('auditLogs').insertOne({
      id: 'audit_' + Date.now(),
      action: 'Delete',
      entity: 'Document',
      entityId: req.params.documentId,
      performedBy: req.user.userId,
      timestamp: new Date().toISOString(),
      details: `Deleted document "${doc.name}"`
    });

    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
