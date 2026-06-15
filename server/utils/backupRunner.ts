import { MongoClient } from 'mongodb';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODUMP_PATH = 'C:\\mongodb_tools\\bin\\mongodump.exe';

export interface DatabaseInfo {
  name: string;
  sizeOnDisk?: number;
  empty?: boolean;
}

export async function listUserDatabases(): Promise<string[]> {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined in environment variables.');
  }

  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const adminDb = client.db().admin();
    const dbInfo = await adminDb.listDatabases();
    
    const systemDbs = ['admin', 'local', 'config'];
    return dbInfo.databases
      .map(db => db.name)
      .filter(name => !systemDbs.includes(name));
  } finally {
    await client.close();
  }
}

export async function runBackup(targetDbName?: string): Promise<string> {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined in environment variables.');
  }

  const databases = await listUserDatabases();
  let dbsToBackup = databases;

  if (targetDbName) {
    if (databases.includes(targetDbName)) {
      dbsToBackup = [targetDbName];
    } else {
      throw new Error(`Database "${targetDbName}" not found.`);
    }
  }

  // Create temporary unique folder for this backup job
  const timestamp = Date.now();
  const tempBackupDir = path.join(process.cwd(), 'backups', `temp-backup-${timestamp}`);
  
  if (!fs.existsSync(tempBackupDir)) {
    fs.mkdirSync(tempBackupDir, { recursive: true });
  }

  for (const db of dbsToBackup) {
    // Replace the database name in the URI path
    const targetUri = MONGODB_URI.replace(/\/([a-zA-Z0-9_\-]+)?(\?)/, `/${db}$2`);
    const cmd = `"${MONGODUMP_PATH}" --uri="${targetUri}" --out="${tempBackupDir}"`;
    
    // Execute mongodump
    execSync(cmd, { stdio: 'ignore' });

    // Restructure collections into subfolders: db/collection/collection.bson
    const dbDir = path.join(tempBackupDir, db);
    if (fs.existsSync(dbDir)) {
      const files = fs.readdirSync(dbDir);
      for (const file of files) {
        if (file.endsWith('.bson')) {
          const collectionName = path.basename(file, '.bson');
          const collDir = path.join(dbDir, collectionName);
          
          if (!fs.existsSync(collDir)) {
            fs.mkdirSync(collDir, { recursive: true });
          }
          
          fs.renameSync(path.join(dbDir, file), path.join(collDir, file));
          
          const metadataFile = `${collectionName}.metadata.json`;
          if (fs.existsSync(path.join(dbDir, metadataFile))) {
            fs.renameSync(path.join(dbDir, metadataFile), path.join(collDir, metadataFile));
          }
        }
      }
    }
  }

  // Zip the backups using PowerShell
  const zipFilePath = path.join(process.cwd(), 'backups', `backup-${targetDbName || 'all'}-${timestamp}.zip`);
  
  // Clean up existing zip if somehow exists
  if (fs.existsSync(zipFilePath)) {
    fs.unlinkSync(zipFilePath);
  }

  // We use Compress-Archive in PowerShell (Windows native) to create the ZIP file
  const psCmd = `powershell -Command "Compress-Archive -Path '${tempBackupDir}\\*' -DestinationPath '${zipFilePath}' -Force"`;
  execSync(psCmd, { stdio: 'ignore' });

  // Clean up the temporary dump directory
  try {
    fs.rmSync(tempBackupDir, { recursive: true, force: true });
  } catch (err) {
    console.error('Failed to clean up temp backup directory:', err);
  }

  return zipFilePath;
}
