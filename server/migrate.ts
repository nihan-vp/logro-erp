import fs from 'fs';
import path from 'path';
import { getRegistryDb, getTenantDb } from './tenantDb';
import { registerCompany } from './registry';

async function migrate() {
    const dbPath = path.join(process.cwd(), 'db.json');
    if (!fs.existsSync(dbPath)) {
        console.log("No db.json found. Nothing to migrate.");
        return;
    }

    const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    
    // 1. Register Company
    console.log("Registering first company...");
    const companyName = "DefaultCompany";
    const company = await registerCompany(companyName);
    
    // 2. Insert Data
    console.log(`Migrating data to ${company.dbName}...`);
    const tenantDb = await getTenantDb(companyName);
    
    const collections = Object.keys(data);
    for (const colName of collections) {
        if (Array.isArray(data[colName])) {
            const col = tenantDb.collection(colName);
            if (data[colName].length > 0) {
                await col.insertMany(data[colName]);
            }
        }
    }
    
    console.log("Migration complete.");
    // Optional: Rename db.json to db.json.bak
    fs.renameSync(dbPath, dbPath + '.bak');
    console.log("db.json backed up to db.json.bak");
    process.exit(0);
}

migrate().catch(console.error);
