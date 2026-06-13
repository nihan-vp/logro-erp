import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getTenantDb } from '../tenantDb';
import { registerCompany, getRegistryDb } from '../registry';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Middleware to ensure the requester is the superadmin
router.use(requireAuth);
router.use((req: any, res: any, next: any) => {
  if (req.user.email !== process.env.SUPERADMIN_EMAIL) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});

router.get('/companies', async (req: any, res) => {
    const db = await getRegistryDb();
    const companies = await db.collection('companies').find({}).toArray();
    res.json(companies);
});

router.post('/companies', async (req: any, res) => {
    const { companyName, status, trialUntil, validUntil } = req.body;
    if (!companyName) return res.status(400).json({ error: 'Company name required' });
    
    try {
        const company = await registerCompany(companyName, status, trialUntil, validUntil);
        res.status(201).json(company);
    } catch (e) {
        res.status(500).json({ error: 'Failed to register company' });
    }
});

router.patch('/companies/:id/status', async (req: any, res) => {
    const { status } = req.body;
    const db = await getRegistryDb();
    const result = await db.collection('companies').findOneAndUpdate(
        { _id: new ObjectId(req.params.id) },
        { $set: { status } },
        { returnDocument: 'after' }
    );
    res.json(result);
});

router.patch('/companies/:id/subscription', async (req: any, res) => {
    const { months, validUntil, trialUntil } = req.body;
    const db = await getRegistryDb();
    const company = await db.collection('companies').findOne({ _id: new ObjectId(req.params.id) });
    
    if (!company) return res.status(404).json({ error: 'Company not found' });
    
    const updateDoc: any = {};
    if (validUntil !== undefined) {
        updateDoc.validUntil = validUntil;
    }
    if (trialUntil !== undefined) {
        updateDoc.trialUntil = trialUntil;
    }
    
    if (months !== undefined) {
        let currentValidUntil = company.validUntil ? new Date(company.validUntil) : new Date();
        if (currentValidUntil < new Date()) currentValidUntil = new Date();
        currentValidUntil.setMonth(currentValidUntil.getMonth() + months);
        updateDoc.validUntil = currentValidUntil.toISOString();
    }
    
    const result = await db.collection('companies').findOneAndUpdate(
        { _id: new ObjectId(req.params.id) },
        { $set: updateDoc },
        { returnDocument: 'after' }
    );
    res.json(result);
});

router.post('/companies/:id/generate-key', async (req: any, res) => {
    const { status, durationValue, durationUnit } = req.body;
    
    if (!status || !durationValue || !durationUnit) {
        return res.status(400).json({ error: 'Status, durationValue and durationUnit are required' });
    }

    try {
        const db = await getRegistryDb();
        const company = await db.collection('companies').findOne({ _id: new ObjectId(req.params.id) });
        if (!company) return res.status(404).json({ error: 'Company not found' });

        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const segment = () => Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        const newProductKey = `LOGRO-${segment()}-${segment()}-${segment()}-${segment()}`;

        const activationKey = {
            key: newProductKey,
            status,
            durationValue: Number(durationValue),
            durationUnit,
            createdAt: new Date().toISOString()
        };

        const result = await db.collection('companies').findOneAndUpdate(
            { _id: new ObjectId(req.params.id) },
            { $set: { activationKey } },
            { returnDocument: 'after' }
        );

        res.json(result);
    } catch (err: any) {
        console.error('Error generating product key:', err);
        res.status(500).json({ error: 'Failed to generate product key' });
    }
});

router.get('/companies/:companyName/users', async (req: any, res) => {
    const { companyName } = req.params;
    try {
        const tenantDb = await getTenantDb(companyName);
        const users = await tenantDb.collection('users').find({}).toArray();
        res.json(users);
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to fetch tenant users' });
    }
});

router.post('/companies/:companyName/users', async (req: any, res) => {
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

router.patch('/companies/:companyName/users/:userId/status', async (req: any, res) => {
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

router.delete('/companies/:companyName/users/:userId', async (req: any, res) => {
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

export default router;
