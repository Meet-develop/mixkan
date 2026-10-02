#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { createClient } = require("@supabase/supabase-js");

const databaseUrl = (process.env.DATABASE_URL || "").trim();
const supabaseUrl = (process.env.SUPABASE_URL || "").trim();
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const bucketName = (process.env.SUPABASE_BACKUP_BUCKET || "db-backups").trim();
const bucketPrefix = (process.env.SUPABASE_BACKUP_PREFIX || "production").trim();
const explicitStoragePath = (process.env.BACKUP_STORAGE_PATH || "").trim();
const pgRestoreBinary = (process.env.PG_RESTORE_BIN || "/usr/lib/postgresql/17/bin/pg_restore").trim();

const fail = (message) => {
  console.error(`[supabase-restore] ${message}`);
  process.exit(1);
};

if (!databaseUrl) {
  fail("DATABASE_URL is required.");
}

if (!supabaseUrl) {
  fail("SUPABASE_URL is required.");
}

if (!supabaseServiceRoleKey) {
  fail("SUPABASE_SERVICE_ROLE_KEY is required.");
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mixkan-restore-"));
const localDumpPath = path.join(tempDir, "restore.dump");

const cleanup = () => {
  fs.rmSync(tempDir, { recursive: true, force: true });
};

const listAllObjects = async (supabase, prefix) => {
  const collected = [];
  const stack = [prefix];

  while (stack.length > 0) {
    const currentPrefix = stack.pop();
    const { data, error } = await supabase.storage.from(bucketName).list(currentPrefix, {
      limit: 1000,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new Error(`Failed to list backups under ${currentPrefix}: ${error.message}`);
    }

    for (const entry of data || []) {
      const fullPath = currentPrefix ? `${currentPrefix}/${entry.name}` : entry.name;
      if (entry.metadata == null) {
        stack.push(fullPath);
        continue;
      }

      collected.push(fullPath);
    }
  }

  return collected;
};

const pickLatestBackup = async (supabase) => {
  const allBackups = await listAllObjects(supabase, bucketPrefix);
  const candidates = allBackups.filter((filePath) => filePath.endsWith(".dump"));

  if (candidates.length === 0) {
    throw new Error(`No backup files found under ${bucketPrefix}`);
  }

  candidates.sort((a, b) => b.localeCompare(a));
  return candidates[0];
};

const downloadBackup = async (supabase, storagePath) => {
  console.log(`[supabase-restore] Downloading ${bucketName}/${storagePath}`);
  const { data, error } = await supabase.storage.from(bucketName).download(storagePath);

  if (error) {
    throw new Error(`Failed to download backup: ${error.message}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  fs.writeFileSync(localDumpPath, Buffer.from(arrayBuffer));
  console.log(`[supabase-restore] Downloaded dump to ${localDumpPath}`);
};

const runPgRestore = () => {
  console.log(`[supabase-restore] Restoring into ${databaseUrl}`);
  execFileSync(
    pgRestoreBinary,
    [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
      "--dbname",
      databaseUrl,
      localDumpPath,
    ],
    {
      stdio: "inherit",
      env: process.env,
    }
  );
};

(async () => {
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const storagePath = explicitStoragePath || (await pickLatestBackup(supabase));
    console.log(`[supabase-restore] Using backup ${bucketName}/${storagePath}`);
    await downloadBackup(supabase, storagePath);
    runPgRestore();
    console.log(`[supabase-restore] Restore completed.`);
  } catch (error) {
    console.error(`[supabase-restore] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    cleanup();
  }
})();
