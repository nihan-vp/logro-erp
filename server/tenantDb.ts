import { MongoClient, Db } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "";
let client: MongoClient | null = null;

async function getClient(): Promise<MongoClient> {
    if (!client) {
        client = new MongoClient(MONGODB_URI);
        await client.connect();
    }
    return client;
}

// Registry DB: contains 'companies' collection
export async function getRegistryDb(): Promise<Db> {
    const c = await getClient();
    return c.db('logro_registry');
}

// Tenant DB: dynamic per companyName
export async function getTenantDb(companyName: string): Promise<Db> {
    const c = await getClient();
    // Normalize company name for database name
    const dbName = `logro_tenant_${companyName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    return c.db(dbName);
}
