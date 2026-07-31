// Simple file-based JSON database — no native dependencies required.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// DATA_DIR can be set to a folder outside the app's own directory (e.g. on
// a persistent volume) so that redeploying the app — replacing this whole
// folder with a newer version — never touches the saved employee data.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

function randomPassword() {
  return Math.random().toString(36).slice(-6) + Math.random().toString(36).slice(-6);
}

function defaultData() {
  const adminEmail = process.env.ADMIN_EMAIL || 'hr@novanest.com';
  const adminName = process.env.ADMIN_NAME || 'Admin';
  let adminPasswordPlain = process.env.ADMIN_PASSWORD;
  if (!adminPasswordPlain) {
    adminPasswordPlain = randomPassword();
    console.log('----------------------------------------------------------------');
    console.log('No ADMIN_EMAIL / ADMIN_PASSWORD environment variables were set.');
    console.log('A one-time admin account was generated:');
    console.log('  Email:    ' + adminEmail);
    console.log('  Password: ' + adminPasswordPlain);
    console.log('Set ADMIN_EMAIL and ADMIN_PASSWORD in your environment to control');
    console.log('these permanently instead of relying on this generated one.');
    console.log('----------------------------------------------------------------');
  }
  const adminPasswordHash = bcrypt.hashSync(adminPasswordPlain, 8);
  return {
    nextId: {
      users: 2, jobs: 3, applications: 1, employees: 1, leave: 1, attendance: 1,
      payslips: 1, formSixteens: 1, performance: 1,
      tasks: 1, documents: 1, assets: 1, cases: 1, surveys: 1, surveyResponses: 1, kbArticles: 1, workflows: 1,
      timesheets: 1,
      employeeCode: 1001,
      employeeDocument: 1
    },
    users: [
      { id: 1, name: adminName, email: adminEmail, password: adminPasswordHash, role: 'admin' }
    ],
    jobs: [
      {
        id: 1,
        title: 'Frontend Engineer',
        department: 'Engineering',
        location: 'Remote',
        type: 'Full-time',
        description: 'Build and maintain user-facing features using modern web technologies. Collaborate closely with design and product teams.',
        status: 'open',
        postedDate: new Date().toISOString()
      },
      {
        id: 2,
        title: 'HR Generalist',
        department: 'Human Resources',
        location: 'New York, NY',
        type: 'Full-time',
        description: 'Support recruitment, onboarding, and employee relations activities across the company.',
        status: 'open',
        postedDate: new Date().toISOString()
      }
    ],
    applications: [],
    employees: [],
    leave: [],
    attendance: [],
    payslips: [],
    formSixteens: [],
    performance: [],
    tasks: [],
    documents: [],
    assets: [],
    cases: [],
    surveys: [],
    surveyResponses: [],
    kbArticles: [],
    workflows: [],
    timesheets: [],
    passwordResets: []
  };
}

function ensureDB() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultData(), null, 2));
  }
}

function migrate(data) {
  let changed = false;
  const ensureArray = (key) => {
    if (!Array.isArray(data[key])) { data[key] = []; changed = true; }
  };
  ensureArray('payslips');
  ensureArray('formSixteens');
  ensureArray('performance');
  ensureArray('tasks');
  ensureArray('documents');
  ensureArray('assets');
  ensureArray('cases');
  ensureArray('surveys');
  ensureArray('surveyResponses');
  ensureArray('kbArticles');
  ensureArray('workflows');
  ensureArray('timesheets');
  ensureArray('passwordResets');
  if (!data.nextId) data.nextId = {};
  ['payslips', 'formSixteens', 'performance', 'tasks', 'documents', 'assets', 'cases', 'surveys', 'surveyResponses', 'kbArticles', 'workflows', 'timesheets'].forEach((key) => {
    if (typeof data.nextId[key] !== 'number') { data.nextId[key] = 1; changed = true; }
  });
  if (typeof data.nextId.employeeCode !== 'number') { data.nextId.employeeCode = 1001; changed = true; }
  if (typeof data.nextId.employeeDocument !== 'number') { data.nextId.employeeDocument = 1; changed = true; }

  // Backfill employee codes and salary fields for employees created before this feature existed.
  if (Array.isArray(data.employees)) {
    const usedCodes = new Set(data.employees.map(e => e.employeeCode).filter(Boolean));

    function nextUniqueCode() {
      let code;
      do {
        code = 'NN' + String(data.nextId.employeeCode).padStart(6, '0');
        data.nextId.employeeCode += 1;
      } while (usedCodes.has(code));
      usedCodes.add(code);
      return code;
    }

    // First pass: give a code to anyone missing one entirely.
    data.employees.forEach((emp) => {
      if (!emp.employeeCode) {
        emp.employeeCode = nextUniqueCode();
        changed = true;
      }
    });

    // Second pass: if two employees ended up sharing the same code (e.g. an
    // earlier collision), reassign the duplicate(s) so every code is unique.
    const seen = new Set();
    data.employees.forEach((emp) => {
      if (seen.has(emp.employeeCode)) {
        emp.employeeCode = nextUniqueCode();
        changed = true;
      }
      seen.add(emp.employeeCode);
    });

    data.employees.forEach((emp) => {
      // Coerce (not reset) any salary figures that were saved as strings, so real values aren't lost.
      ['basicSalary', 'allowances', 'deductions', 'annualCTC', 'monthlyCTC', 'hra', 'employerPF', 'employeePF', 'professionalTax'].forEach((field) => {
        if (typeof emp[field] !== 'number') {
          emp[field] = Number(emp[field]) || 0;
          changed = true;
        }
      });
      if (emp.managerId === undefined) { emp.managerId = null; changed = true; }
      [
        'dob', 'gender', 'bloodGroup', 'address',
        'emergencyContactName', 'emergencyContactRelation', 'emergencyContactPhone',
        'aadhaarNumber', 'panNumber', 'passportNumber',
        'bankAccountNumber', 'bankIFSC', 'bankName', 'profilePhoto', 'uan',
        'location', 'pfNumber', 'inactiveReason'
      ].forEach((field) => {
        if (typeof emp[field] !== 'string') { emp[field] = ''; changed = true; }
      });
      if (!Array.isArray(emp.documents)) { emp.documents = []; changed = true; }
    });
  }

  // Backfill two-stage approval fields on existing leave requests.
  if (Array.isArray(data.leave)) {
    data.leave.forEach((req) => {
      if (!req.managerStatus) {
        req.managerStatus = req.status === 'approved' ? 'approved' : 'pending';
        changed = true;
      }
      if (!req.hrStatus) {
        req.hrStatus = (req.status === 'approved' || req.status === 'rejected') ? req.status : 'pending';
        changed = true;
      }
    });
  }
  return changed;
}

function readDB() {
  ensureDB();
  const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  if (migrate(data)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  }
  return data;
}

// ---------------- Automatic backups ----------------
// Every time data is saved, the state as it was *right before* that save is
// snapshotted first. So no matter what caused a bad save (a bug, a bad
// edit, anything), there's always a recovery point from just before it.
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BACKUP_MIN_INTERVAL_MS = 30 * 1000; // avoid spamming a backup file per keystroke-level save
const MAX_BACKUPS = 200;
let lastBackupAt = 0;

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function pruneBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('db-') && f.endsWith('.json')).sort();
    const excess = files.length - MAX_BACKUPS;
    if (excess > 0) {
      files.slice(0, excess).forEach((f) => {
        try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch (e) { /* best-effort */ }
      });
    }
  } catch (e) { /* best-effort */ }
}

function backupNow(data, force) {
  const now = Date.now();
  if (!force && now - lastBackupAt < BACKUP_MIN_INTERVAL_MS) return;
  try {
    ensureBackupDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(BACKUP_DIR, `db-${stamp}.json`), JSON.stringify(data, null, 2));
    lastBackupAt = now;
    pruneBackups();
  } catch (e) { /* backups are best-effort and must never block a real save */ }
}

function listBackups() {
  ensureBackupDir();
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('db-') && f.endsWith('.json'))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { filename: f, size: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function restoreBackup(filename) {
  const safeName = path.basename(String(filename)); // prevent path traversal
  const file = path.join(BACKUP_DIR, safeName);
  if (!fs.existsSync(file)) throw new Error('Backup not found');
  const restored = JSON.parse(fs.readFileSync(file, 'utf-8'));
  // Snapshot whatever is currently live before overwriting it, so a restore
  // can itself always be undone too.
  try {
    if (fs.existsSync(DB_PATH)) {
      backupNow(JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')), true);
    }
  } catch (e) { /* best-effort */ }
  fs.writeFileSync(DB_PATH, JSON.stringify(restored, null, 2));
  return restored;
}

function writeDB(data) {
  // Snapshot the state as it exists on disk right now — i.e. *before* this
  // write lands — so there's always something to roll back to.
  try {
    if (fs.existsSync(DB_PATH)) {
      backupNow(JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')), false);
    }
  } catch (e) { /* best-effort */ }
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function nextId(db, collection) {
  const id = db.nextId[collection];
  db.nextId[collection] += 1;
  return id;
}

module.exports = {
  readDB, writeDB, nextId, DB_PATH,
  listBackups, restoreBackup, backupNow, BACKUP_DIR
};
