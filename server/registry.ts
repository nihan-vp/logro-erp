import { getRegistryDb as _getRegistryDb } from './tenantDb';

export const getRegistryDb = _getRegistryDb;

export interface Company {
    companyName: string;
    dbName: string;
    createdAt: string;
    status: 'active' | 'suspended' | 'trial';
    trialUntil: string | null;
    validUntil: string | null;
}

export async function registerCompany(
    companyName: string, 
    status: 'active' | 'suspended' | 'trial' = 'active',
    trialUntil: string | null = null,
    validUntil: string | null = null
): Promise<Company> {
    const db = await getRegistryDb();
    const collection = db.collection<Company>('companies');
    
    const dbName = `logro_tenant_${companyName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const newCompany: Company = {
        companyName,
        dbName,
        createdAt: new Date().toISOString(),
        status,
        trialUntil,
        validUntil
    };
    
    await collection.insertOne(newCompany);
    return newCompany;
}

export async function getCompanyByName(companyName: string): Promise<Company | null> {
    const db = await getRegistryDb();
    const collection = db.collection<Company>('companies');
    return await collection.findOne({ companyName });
}
