import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI is not defined in the .env file.');
  process.exit(1);
}

// Path to mongodump.exe
const MONGODUMP_PATH = 'C:\\mongodb_tools\\bin\\mongodump.exe';

async function runBackup() {
  let client;
  try {
    console.log('Connecting to MongoDB to retrieve database list...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();

    const adminDb = client.db().admin();
    const dbInfo = await adminDb.listDatabases();
    
    // Filter out system databases (admin, local, config)
    const systemDbs = ['admin', 'local', 'config'];
    let databases = dbInfo.databases
      .map(db => db.name)
      .filter(name => !systemDbs.includes(name));

    const targetDbArg = process.argv[2];
    if (targetDbArg) {
      if (databases.includes(targetDbArg)) {
        databases = [targetDbArg];
      } else {
        console.error(`Error: Database "${targetDbArg}" was not found on the server.`);
        console.log(`Available user databases: ${databases.join(', ')}`);
        process.exit(1);
      }
    }

    if (databases.length === 0) {
      console.log('No databases found to back up.');
      process.exit(0);
    }

    const backupDir = path.join(process.cwd(), 'backups', 'logro-backup');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    console.log(`Found ${databases.length} database(s) to back up: ${databases.join(', ')}`);

    for (const db of databases) {
      console.log(`\n--- Backing up database: ${db} ---`);
      
      // Use the connection URI but specifically target this database
      const targetUri = MONGODB_URI.replace(/\/([a-zA-Z0-9_\-]+)?(\?)/, `/${db}$2`);

      const cmd = `"${MONGODUMP_PATH}" --uri="${targetUri}" --out="${backupDir}"`;
      
      try {
        execSync(cmd, { stdio: 'inherit' });
        console.log(`Successfully backed up: ${db}`);

        // Restructure collections into subfolders: db/collection/collection.bson
        const dbDir = path.join(backupDir, db);
        if (fs.existsSync(dbDir)) {
          const files = fs.readdirSync(dbDir);
          for (const file of files) {
            if (file.endsWith('.bson')) {
              const collectionName = path.basename(file, '.bson');
              const collDir = path.join(dbDir, collectionName);
              
              if (!fs.existsSync(collDir)) {
                fs.mkdirSync(collDir, { recursive: true });
              }
              
              // Move bson file
              fs.renameSync(path.join(dbDir, file), path.join(collDir, file));
              
              // Move metadata file if exists
              const metadataFile = `${collectionName}.metadata.json`;
              if (fs.existsSync(path.join(dbDir, metadataFile))) {
                fs.renameSync(path.join(dbDir, metadataFile), path.join(collDir, metadataFile));
              }
            }
          }
          console.log(`Organized ${db} collections into subfolders.`);
        }
      } catch (err) {
        console.error(`Failed to back up database ${db}:`, err.message);
      }
    }

    console.log('\nBackup process completed!');
  } catch (err) {
    console.error('Backup failed:', err);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

runBackup();
