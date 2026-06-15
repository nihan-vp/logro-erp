export type UserRole = 'admin' | 'manager' | 'worker' | 'accountant';

export interface OfficeFund {
    id: string;
    balance: number;
    updatedAt: string;
}
export interface OfficeTransaction {
    id: string;
    type: 'Cash In' | 'Cash Out';
    amount: number;
    description: string;
    date: string;
    createdBy: string;
    source?: string;
    paymentMethod?: string;
    reference?: string;
    inflowType?: string;
}
export interface PurchaseLineItem {
    materialName: string;
    qty: string;
    pricePerCount: number;
    total: number;
}

export interface PaymentRequest {
    id: string;
    projectId: string;
    taskId: string;
    payeeName: string;
    category: 'Worker' | 'Vendor' | 'Transportation' | 'Vendor Payment' | 'Purchase' | 'Other';
    amount: number;
    description: string;
    fromLocation?: string;
    toLocation?: string;
    dueDate: string;
    priority: 'Low' | 'Medium' | 'High';
    status: 'Pending' | 'Paid' | 'Partially Paid' | 'Cancelled' | 'Deleted';
    paymentMethod?: string;
    billImage?: string;
    createdBy?: string;
    createdAt: string;
    materialName?: string;
    materialQty?: string;
    tools?: string[];
    vendorTotalToPay?: number;
    vendorPaid?: number;
    vendorRemaining?: number;
    purchasePricePerCount?: number;
    purchaseTotalFull?: number;
    purchaseTotal?: number;
    purchaseItems?: PurchaseLineItem[];
    adjustmentType?: 'Edit' | 'Delete';
    targetExpenseId?: string;
    adjustmentData?: string;
    paymentHistory?: Array<{
        id: string;
        amount: number;
        paymentMethod: string;
        paidAt: string;
        paidBy: string;
        notes?: string;
    }>;
}
export interface AuditLog {
    id: string;
    action: string;
    entity: string;
    entityId: string;
    performedBy: string;
    timestamp: string;
    details: string;
}


export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  phone?: string;
  role: UserRole;
  status: 'active' | 'inactive';
}

export type ProjectStatus = 'Pending' | 'In Progress' | 'Completed' | 'On Hold';

export interface Project {
  id: string;
  projectName: string;
  clientName: string;
  location: string;
  startDate: string;
  expectedEndDate: string;
  status: ProjectStatus;
  notes?: string;
  contractBudget?: number;
  createdBy: string;
  createdAt: string;
}

export type TaskStatus = 'Pending' | 'In Progress' | 'Completed' | 'On Hold';

export interface Task {
  id: string;
  projectId: string;
  taskName: string;
  description?: string;
  assignedBudget: number;
  assignedStaff?: string;
  startDate: string;
  endDate: string;
  progress: number; // percentage 0 - 100
  status: TaskStatus;
  notes?: string;
}

export type ExpenseCategory = 'Material' | 'Labour' | 'Transport' | 'Tools' | 'Company Payment' | 'Vendor Payment' | 'Purchase' | 'Other';

export interface Expense {
  id: string;
  projectId: string;
  taskId: string;
  category: ExpenseCategory;
  amount: number;
  paidTo: string;
  paymentMethod: string;
  date: string;
  fromLocation?: string;
  toLocation?: string;
  notes?: string;
  billImage?: string; // base64 or URL
  createdBy: string;
  materialName?: string;
  materialQty?: string;
  tools?: string[];
  vendorTotalToPay?: number;
  vendorPaid?: number;
  vendorRemaining?: number;
  purchasePricePerCount?: number;
  purchaseTotalFull?: number;
  purchaseTotal?: number;
  purchaseItems?: PurchaseLineItem[];
}

export interface Vendor {
  id: string;
  name: string;
  trade: string; // e.g. Cement Supplier, Steel Supplier
  phone?: string;
  status: 'active' | 'inactive';
  notes?: string;
  createdAt: string;
}

export type CrewTrade = 'Mason' | 'Electrician' | 'Plumber' | 'Carpenter' | 'Helper' | 'Supervisor' | 'Other';
export type CrewMemberStatus = 'active' | 'inactive';

export interface CrewMember {
  id: string;
  name: string;
  trade: CrewTrade;
  dailyWage: number;
  phone?: string;
  status: CrewMemberStatus;
  notes?: string;
  createdAt: string;
}

export type AttendanceStatus = 'Present' | 'Absent' | 'Half Day';

export interface Attendance {
  id: string;
  projectId: string;
  taskId: string;
  workerName: string;
  date: string;
  status: AttendanceStatus;
  dailyWage: number;
  overtimeAmount: number;
  paymentStatus: 'Paid' | 'Pending' | 'Unpaid';
  notes?: string;
}

export type PayeeType = 'Worker' | 'Company' | 'Subcontractor' | 'Supplier' | 'Other';
export type PaymentStatus = 'Paid' | 'Pending' | 'Partial';

export interface Payment {
  id: string;
  projectId: string;
  taskId: string;
  payeeType: PayeeType;
  payeeName: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  notes?: string;
}

export interface DashboardStats {
  totalProjects: number;
  totalTasks: number;
  pendingTasks?: number;
  activeTasks: number;
  completedTasks: number;
  totalAssignedBudget: number;
  totalExpenses: number;
  totalPaidAmount: number;
  pendingPayments: number;
  overallProfitLoss: number;
}
