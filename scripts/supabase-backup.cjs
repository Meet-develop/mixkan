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
const backupReason = (process.env.BACKUP_REASON || "").trim();
const retentionCount = Number.parseInt(process.env.SUPABASE_BACKUP_RETENTION_COUNT || "14", 10);
const pgDumpBinary = (process.env.PG_DUMP_BIN || "/usr/lib/postgresql/17/bin/pg_dump").trim();

const fail = (message) => {
  console.error(`[supabase-backup] ${message}`);
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

const backupTime = new Date();
const timestamp = backupTime.toISOString().replace(/[:.]/g, "-");
const sha = (process.env.GITHUB_SHA || "manual").slice(0, 7);
const fileName = `mixkan-${timestamp}-${sha}.dump`;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mixkan-backup-"));
const dumpPath = path.join(tempDir, fileName);
const storagePath = `${bucketPrefix}/${backupTime.toISOString().slice(0, 10)}/${fileName}`;

const cleanup = () => {
  fs.rmSync(tempDir, { recursive: true, force: true });
};

const runPgDump = () => {
  if (backupReason) {
    console.log(`[supabase-backup] Reason: ${backupReason}`);
  }

  console.log(`[supabase-backup] Creating dump at ${dumpPath}`);
  execFileSync(
    pgDumpBinary,
    [
      databaseUrl,
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      "--file",
      dumpPath,
    ],
    {
      stdio: "inherit",
      env: process.env,
    }
  );

  const stat = fs.statSync(dumpPath);
  console.log(`[supabase-backup] Dump size: ${stat.size} bytes`);
};

const ensureBucket = async (supabase) => {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`Failed to list buckets: ${listError.message}`);
  }

  const existing = (buckets || []).some((bucket) => bucket.name === bucketName);
  if (existing) return;

  console.log(`[supabase-backup] Creating bucket ${bucketName}`);
  const { error: createError } = await supabase.storage.createBucket(bucketName, {
    public: false,
  });

  if (createError) {
    throw new Error(`Failed to create bucket: ${createError.message}`);
  }
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

const pruneOldBackups = async (supabase) => {
  if (!Number.isFinite(retentionCount) || retentionCount < 1) {
    console.log("[supabase-backup] Retention pruning disabled.");
    return;
  }

  const allBackups = (await listAllObjects(supabase, bucketPrefix)).filter((filePath) =>
    filePath.endsWith(".dump")
  );
  const sorted = allBackups.sort((a, b) => b.localeCompare(a));
  const stale = sorted.slice(retentionCount);

  if (stale.length === 0) {
    console.log(`[supabase-backup] Retention check passed. Keeping ${sorted.length} backups.`);
    return;
  }

  console.log(`[supabase-backup] Pruning ${stale.length} old backup(s).`);
  const { error } = await supabase.storage.from(bucketName).remove(stale);
  if (error) {
    throw new Error(`Failed to prune old backups: ${error.message}`);
  }
};

const uploadBackup = async (supabase) => {
  const buffer = fs.readFileSync(dumpPath);
  console.log(`[supabase-backup] Uploading to ${bucketName}/${storagePath}`);
  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(storagePath, buffer, {
      contentType: "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload backup: ${uploadError.message}`);
  }
};

(async () => {
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    runPgDump();
    await ensureBucket(supabase);
    await uploadBackup(supabase);
    await pruneOldBackups(supabase);
    console.log(`[supabase-backup] Backup completed: ${bucketName}/${storagePath}`);
  } catch (error) {
    console.error(`[supabase-backup] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    cleanup();
  }
})();
