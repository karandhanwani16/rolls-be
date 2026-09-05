#!/usr/bin/env node
/**
 * Apply Prisma SQL migrations to a remote MySQL database.
 *
 * 1. Edit DB_CONFIG below (host, port, user, database, mysql client path).
 * 2. Run from the be/ folder:
 *      node scripts/apply-migrations.js
 *    Or apply one migration folder only:
 *      node scripts/apply-migrations.js 20260830040000_add_opening_balance
 *
 * Password is prompted at runtime (hidden input).
 *
 * Uses the mysql CLI (XAMPP) with --ssl-mode=REQUIRED for Aiven.
 */

const fs = require("fs");
const path = require("path");
const dns = require("dns").promises;
const { spawn } = require("child_process");

// --- Edit these for your production database ---
// Copy Host, Port, User, and Database name from:
// Aiven console → your MySQL service → Connect → Connection information
const DB_CONFIG = {
  host: "mysql-259948d0-rolls.j.aivencloud.com", // must match Aiven exactly
  port: 19182,
  user: "avnadmin",
  database: "defaultdb",
  ssl: true, // Aiven requires SSL
  // XAMPP uses MariaDB client: use "mariadb". Homebrew MySQL 8+: use "mysql8".
  sslMode: "mariadb",
  // Optional: path to Aiven CA certificate (download from Aiven console).
  caCertPath: "",
  // Path to mysql client. Change if you use Homebrew mysql instead of XAMPP.
  mysqlClient: "/Applications/XAMPP/xamppfiles/bin/mysql",
};

const MIGRATIONS_DIR = path.join(__dirname, "..", "prisma", "migrations");

const SKIPPABLE_ERROR_PATTERNS = [
  /duplicate column/i,
  /already exists/i,
  /duplicate key name/i,
  /can't drop/i,
  /check that column\/key exists/i,
  /duplicate foreign key constraint name/i,
  /key column .* doesn't exist/i,
  /unknown column/i,
  /cannot add foreign key constraint/i,
  /failed to open the referenced table/i,
  /errno: 150/i,
];

function promptPassword(prompt) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY) {
      reject(new Error("Password prompt requires an interactive terminal."));
      return;
    }

    stdout.write(prompt);

    stdin.resume();
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");

    let password = "";

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
    };

    const onData = (char) => {
      if (char === "\u0003") {
        cleanup();
        stdout.write("\n");
        process.exit(130);
      }

      if (char === "\r" || char === "\n" || char === "\u0004") {
        cleanup();
        stdout.write("\n");
        resolve(password);
        return;
      }

      if (char === "\u007f" || char === "\b") {
        password = password.slice(0, -1);
        return;
      }

      password += char;
    };

    stdin.on("data", onData);
  });
}

function listMigrationFolders() {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function readMigrationSql(migrationFolder) {
  const sqlPath = path.join(MIGRATIONS_DIR, migrationFolder, "migration.sql");

  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Missing migration file: ${sqlPath}`);
  }

  return fs.readFileSync(sqlPath, "utf8");
}

function stripSqlComments(sql) {
  return sql
    .split("\n")
    .map((line) => {
      const commentIndex = line.indexOf("--");
      if (commentIndex === -1) {
        return line;
      }
      return line.slice(0, commentIndex);
    })
    .join("\n");
}

function splitSqlStatements(sql) {
  const cleaned = stripSqlComments(sql);
  return cleaned
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function isSkippableError(message) {
  return SKIPPABLE_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

async function verifyHostResolvable() {
  if (!DB_CONFIG.host) {
    throw new Error(
      "DB_CONFIG.host is empty. Paste the Host value from Aiven → Connection information."
    );
  }

  try {
    const addresses = await dns.lookup(DB_CONFIG.host, { all: true });
    const resolved = addresses.map((entry) => entry.address).join(", ");
    console.log(`DNS OK: ${DB_CONFIG.host} → ${resolved}`);
  } catch (error) {
    throw new Error(
      [
        `Cannot resolve database host "${DB_CONFIG.host}".`,
        "This is a DNS/network issue, not a password or SSL issue.",
        "",
        "Fix:",
        "1. Open Aiven → your MySQL service → Connect → Connection information.",
        "2. Copy the Host field exactly into DB_CONFIG.host in this script.",
        "3. Make sure the service status is Running (not powered off).",
        "4. If the service was recreated, the hostname will have changed.",
        "",
        `DNS error: ${error.message}`,
      ].join("\n")
    );
  }
}

function getMysqlSslArgs() {
  if (!DB_CONFIG.ssl) {
    return [];
  }

  if (DB_CONFIG.sslMode === "mysql8") {
    return ["--ssl-mode=REQUIRED"];
  }

  const args = ["--ssl"];

  if (DB_CONFIG.caCertPath && fs.existsSync(DB_CONFIG.caCertPath)) {
    args.push(`--ssl-ca=${DB_CONFIG.caCertPath}`);
  } else {
    // MariaDB / older clients: connect with SSL but skip CA verification.
    args.push("--ssl-verify-server-cert=0");
  }

  return args;
}

function runMysql(password, sql) {
  return new Promise((resolve, reject) => {
    const args = [
      `-h${DB_CONFIG.host}`,
      `-P${String(DB_CONFIG.port)}`,
      `-u${DB_CONFIG.user}`,
      ...getMysqlSslArgs(),
      DB_CONFIG.database,
    ];

    const proc = spawn(DB_CONFIG.mysqlClient, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        MYSQL_PWD: password,
      },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", (error) => {
      reject(error);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const message = (stderr || stdout || `mysql exited with code ${code}`).trim();
      const error = new Error(message);
      error.code = code;
      reject(error);
    });

    proc.stdin.write(`${sql}\n`);
    proc.stdin.end();
  });
}

async function testConnection(password) {
  await runMysql(password, "SELECT 1;");
}

async function applyStatement(password, statement) {
  await runMysql(password, `${statement};`);
}

async function applyMigration(password, migrationFolder) {
  const sql = readMigrationSql(migrationFolder);
  const statements = splitSqlStatements(sql);
  let applied = 0;
  let skipped = 0;

  console.log(`\n▶ ${migrationFolder} (${statements.length} statements)`);

  for (const statement of statements) {
    const preview = statement.replace(/\s+/g, " ").slice(0, 80);
    try {
      await applyStatement(password, statement);
      applied += 1;
      console.log(`  ✓ ${preview}${preview.length >= 80 ? "..." : ""}`);
    } catch (error) {
      const message = error.message || String(error);
      if (isSkippableError(message)) {
        skipped += 1;
        console.log(`  ↷ skipped (already applied): ${preview}...`);
        continue;
      }
      throw error;
    }
  }

  return { applied, skipped };
}

async function main() {
  if (!fs.existsSync(DB_CONFIG.mysqlClient)) {
    console.error(`mysql client not found at: ${DB_CONFIG.mysqlClient}`);
    console.error("Update DB_CONFIG.mysqlClient in scripts/apply-migrations.js");
    console.error("Examples:");
    console.error("  /Applications/XAMPP/xamppfiles/bin/mysql");
    console.error("  /opt/homebrew/bin/mysql");
    process.exit(1);
  }

  const targetMigration = process.argv[2];
  const migrationFolders = listMigrationFolders();

  if (targetMigration && !migrationFolders.includes(targetMigration)) {
    console.error(`Unknown migration: ${targetMigration}`);
    console.error("Available migrations:");
    migrationFolders.forEach((folder) => console.error(`  - ${folder}`));
    process.exit(1);
  }

  const foldersToRun = targetMigration ? [targetMigration] : migrationFolders;

  console.log("Remote MySQL migration runner");
  console.log(`Client:   ${DB_CONFIG.mysqlClient}`);
  console.log(`Host:     ${DB_CONFIG.host}:${DB_CONFIG.port}`);
  console.log(`Database: ${DB_CONFIG.database}`);
  console.log(`User:     ${DB_CONFIG.user}`);
  console.log(`SSL:      ${DB_CONFIG.ssl ? DB_CONFIG.sslMode : "disabled"}`);
  console.log(
    targetMigration
      ? `Mode:     single migration (${targetMigration})`
      : `Mode:     all migrations (${foldersToRun.length} folders)`
  );

  try {
    await verifyHostResolvable();
  } catch (error) {
    console.error(`\n${error.message}`);
    process.exit(1);
  }

  const password = await promptPassword("Password: ");

  if (!password) {
    console.error("Password is required.");
    process.exit(1);
  }

  try {
    await testConnection(password);
    console.log("\nConnected successfully.");

    let totalApplied = 0;
    let totalSkipped = 0;

    for (const folder of foldersToRun) {
      const result = await applyMigration(password, folder);
      totalApplied += result.applied;
      totalSkipped += result.skipped;
    }

    console.log("\nDone.");
    console.log(`Statements applied: ${totalApplied}`);
    console.log(`Statements skipped:  ${totalSkipped}`);
  } catch (error) {
    console.error("\nMigration failed:");
    console.error(error.message || error);

    if (/Unknown MySQL server host|can't resolve|ENOTFOUND|NXDOMAIN/i.test(error.message || "")) {
      console.error("\nTips:");
      console.error("- The hostname in DB_CONFIG.host is wrong or the Aiven service is gone.");
      console.error("- Copy a fresh Host from Aiven → Connection information.");
    }

    if (/Can't connect|connect ETIMEDOUT|Operation timed out/i.test(error.message || "")) {
      console.error("\nTips:");
      console.error("- Check that the Aiven service is Running in the Aiven console.");
      console.error("- Confirm host, port, user, and database in DB_CONFIG.");
      console.error("- If you are on a restricted network, try another connection.");
    }

    if (/Access denied/i.test(error.message || "")) {
      console.error("\nTips:");
      console.error("- Double-check the password from Aiven → Connection information.");
      console.error("- Reset the password in Aiven if needed and try again.");
    }

    process.exit(1);
  }
}

main();
