import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { MongoClient, Db } from 'mongodb';
import { User, Project, Task, Expense, Attendance, Payment, OfficeFund, OfficeTransaction, PaymentRequest, AuditLog, CrewMember, Vendor } from '../src/types';

// Initialize environment variables from .env
dotenv.config();

const DB_FILE = path.join(process.cwd(), 'db.json');

interface DatabaseSchema {
  users: User[];
  projects: Project[];
  tasks: Task[];
  expenses: Expense[];
  attendance: Attendance[];
  payments: Payment[];
  crew: CrewMember[];
  vendors: Vendor[];
  officeFunds: OfficeFund[];
  officeTransactions: OfficeTransaction[];
  paymentRequests: PaymentRequest[];
  auditLogs: AuditLog[];
}

function ensureAdminLoginSeed(data: DatabaseSchema): { data: DatabaseSchema; changed: boolean } {
  const seededUsers: User[] = [
    {
      id: 'usr_admin',
      name: 'Admin',
      email: 'admin@logro.com',
      password: 'admin.Logro@9098',
      phone: '',
      role: 'admin',
      status: 'active'
    },
    {
      id: 'usr_accountant',
      name: 'Accountant',
      email: 'accountant@logro.com',
      password: 'acc.Logro@9090',
      phone: '',
      role: 'accountant',
      status: 'active'
    },
    {
      id: 'usr_sitemanager',
      name: 'Site Manager',
      email: 'sitemanager@logro.com',
      password: 'sm.Logro@9090',
      phone: '',
      role: 'manager',
      status: 'active'
    }
  ];

  const nextData: DatabaseSchema = {
    ...data,
    users: Array.isArray(data.users) ? [...data.users] : [],
    projects: Array.isArray(data.projects) ? [...data.projects] : [],
    tasks: Array.isArray(data.tasks) ? [...data.tasks] : [],
    expenses: Array.isArray(data.expenses) ? [...data.expenses] : [],
    attendance: Array.isArray(data.attendance) ? [...data.attendance] : [],
    payments: Array.isArray(data.payments) ? [...data.payments] : [],
    crew: Array.isArray(data.crew) ? [...data.crew] : [],
    vendors: Array.isArray(data.vendors) ? [...data.vendors] : [],
    officeFunds: Array.isArray(data.officeFunds) ? [...data.officeFunds] : [],
    officeTransactions: Array.isArray(data.officeTransactions) ? [...data.officeTransactions] : [],
    paymentRequests: Array.isArray(data.paymentRequests) ? [...data.paymentRequests] : [],
    auditLogs: Array.isArray(data.auditLogs) ? [...data.auditLogs] : []
  };

  let changed = false;

  for (const seededUser of seededUsers) {
    const userIndex = nextData.users.findIndex(user => user.id === seededUser.id);

    if (userIndex === -1) {
      nextData.users.unshift(seededUser);
      changed = true;
    } else {
      const current = nextData.users[userIndex];
      // Update role/status if necessary, but keep existing password if set
      const merged = {
        ...current,
        name: current.name || seededUser.name,
        email: current.email || seededUser.email,
        role: seededUser.role, // Force role
        status: current.status || 'active'
      };

      if (JSON.stringify(current) !== JSON.stringify(merged)) {
        nextData.users[userIndex] = merged;
        changed = true;
      }
    }
  }

  if (nextData.crew.length === 0) {
    const seen = new Set<string>();
    for (const att of nextData.attendance) {
      const key = att.workerName.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        nextData.crew.push({
          id: 'crew_' + att.workerName.replace(/\s+/g, '_').toLowerCase(),
          name: att.workerName,
          trade: 'Helper',
          dailyWage: att.dailyWage || 200,
          phone: '',
          status: 'active',
          notes: '',
          createdAt: new Date().toISOString()
        });
      }
    }
    if (nextData.crew.length > 0) {
      changed = true;
    }
  }

  return { data: nextData, changed };
}

const collectionsList: (keyof DatabaseSchema)[] = [
  'users',
  'projects',
  'tasks',
  'expenses',
  'attendance',
  'payments',
  'crew',
  'vendors',
  'officeFunds',
  'officeTransactions',
  'paymentRequests',
  'auditLogs'
];

let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let isMongoConnecting = false;
let dbCache: DatabaseSchema | null = null;
let useMongo = false;

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL;

async function initMongo() {
  if (!MONGODB_URI) {
    console.log("[DB] MONGODB_URI/MONGO_URL not provided. Running standard filesystem persistence (db.json).");
    return;
  }

  isMongoConnecting = true;
  try {
    console.log("[DB] Connecting to MongoDB database...");
    mongoClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    await mongoClient.connect();
    const dbName = mongoClient.options.dbName || 'construct_erp';
    mongoDb = mongoClient.db(dbName);
    useMongo = true;
    console.log(`[DB] Successfully connected to MongoDB: database "${dbName}"`);

    // Load active dataset from MongoDB
    await loadDataFromMongo();
  } catch (err: any) {
    console.error("[DB] Failed connecting to MongoDB, falling back to local files:", err.message);
    useMongo = false;
  } finally {
    isMongoConnecting = false;
  }
}

async function loadDataFromMongo() {
  if (!mongoDb) return;
  const tempDb: Partial<DatabaseSchema> = {};

  try {
    for (const key of collectionsList) {
      const col = mongoDb.collection(key);
      const docs = await col.find({}).toArray();
      tempDb[key] = docs.map((doc: any) => {
        const { _id, ...rest } = doc;
        return rest;
      }) as any;
    }

    if (!tempDb.users || tempDb.users.length === 0) {
      console.log("[DB] MongoDB is empty. Seeding default data...");
      const seeded = generateSeedData();
      for (const key of collectionsList) {
        const col = mongoDb.collection(key);
        if (seeded[key].length > 0) {
          await col.insertMany(seeded[key]);
        }
        tempDb[key] = seeded[key] as any;
      }
      console.log("[DB] MongoDB collections seeded successfully.");
    }

    // Clear old seed projects and linked elements if they are still residing in MongoDB
    if (tempDb.projects && tempDb.projects.some((p: any) => p.id === 'prj_1' || p.id === 'prj_2')) {
      console.log("[DB] Detected previous mock seed records in MongoDB. Purging seed data for a fresh state...");
      tempDb.projects = [];
      tempDb.tasks = [];
      tempDb.expenses = [];
      tempDb.attendance = [];
      tempDb.payments = [];
      tempDb.crew = [];
      tempDb.officeFunds = [];
      tempDb.officeTransactions = [];
      tempDb.paymentRequests = [];
      tempDb.auditLogs = [];
      await syncToMongo(tempDb as DatabaseSchema);
    }

    const normalized = ensureAdminLoginSeed(tempDb as DatabaseSchema);
    dbCache = normalized.data;
    if (normalized.changed) {
      await syncToMongo(normalized.data);
    }
    console.log("[DB] Memory cache filled with live MongoDB documents.");
  } catch (err) {
    console.error("[DB] Error loading/seeding collections in MongoDB:", err);
  }
}

async function syncToMongo(data: DatabaseSchema) {
  if (!mongoDb || !useMongo) return;
  try {
    for (const key of collectionsList) {
      const col = mongoDb.collection(key);
      await col.deleteMany({});
      if (data[key] && data[key].length > 0) {
        await col.insertMany(JSON.parse(JSON.stringify(data[key])));
      }
    }
    console.log("[DB] Asynchronous sync to MongoDB completed successfully.");
  } catch (err) {
    console.error("[DB] Asynchronous sync to MongoDB failed:", err);
  }
}

export function readDb(): DatabaseSchema {
  if (useMongo && dbCache) {
    const normalized = ensureAdminLoginSeed(dbCache);
    if (normalized.changed) {
      dbCache = normalized.data;
    }
    return normalized.data;
  }

  try {
    if (!fs.existsSync(DB_FILE)) {
      const defaultDb = generateSeedData();
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), 'utf-8');
      return defaultDb;
    }
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    const normalized = ensureAdminLoginSeed(parsed);
    if (normalized.changed) {
      fs.writeFileSync(DB_FILE, JSON.stringify(normalized.data, null, 2), 'utf-8');
    }
    return normalized.data;
  } catch (err) {
    console.error("Error reading database file, returning fresh template", err);
    const fallback = ensureAdminLoginSeed({
      users: [],
      projects: [],
      tasks: [],
      expenses: [],
      attendance: [],
      payments: [],
      crew: [],
      vendors: [],
      officeFunds: [],
      officeTransactions: [],
      paymentRequests: [],
      auditLogs: []
    });
    return fallback.data;
  }
}

export function writeDb(data: DatabaseSchema): void {
  dbCache = data;

  if (useMongo && mongoDb) {
    syncToMongo(data).catch(err => {
      console.error("[DB] Async background sync error:", err);
    });
  } else {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error("Error writing to database file", err);
    }
  }
}

// Simple and highly secure password hashing using Pbkdf2
export function hashPassword(password: string): string {
  const salt = 'construction_salt_2026';
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha256');
  return hash.toString('hex');
}

// Run asynchronous initialization immediately on import
initMongo().catch(err => {
  console.error("[DB] Immediate initMongo call failed:", err);
});

// Proactively construct the local db.json schema upon startup to make the server immediately live
if (!fs.existsSync(DB_FILE)) {
  try {
    const defaultData = generateSeedData();
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
    console.log("[DB] Proactively generated initial db.json schema with rich Construction Project ERP seed datasets.");
  } catch (err) {
    console.error("[DB] Failed proactively writing db.json on startup:", err);
  }
}

function generateSeedData(): DatabaseSchema {
  const users: User[] = [
    {
      id: 'usr_admin',
      name: 'Admin',
      email: 'admin@logro.com',
      password: 'admin.Logro@9098',
      phone: '',
      role: 'admin',
      status: 'active'
    },
    {
      id: 'usr_accountant',
      name: 'Accountant',
      email: 'accountant@logro.com',
      password: 'acc.Logro@9090',
      phone: '',
      role: 'accountant',
      status: 'active'
    },
    {
      id: 'usr_sitemanager',
      name: 'Site Manager',
      email: 'sitemanager@logro.com',
      password: 'sm.Logro@9090',
      phone: '',
      role: 'manager',
      status: 'active'
    }
  ];

  return {
    users,
    projects: [],
    tasks: [],
    expenses: [],
    attendance: [],
    payments: [],
    crew: [],
    vendors: [],
    officeFunds: [],
    officeTransactions: [],
    paymentRequests: [],
    auditLogs: []
  };
}
