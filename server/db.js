// Simple file-based JSON database — no native dependencies required.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function randomPassword() {
  return Math.random().toString(36).slice(-6) + Math.random().toString(36).slice(-6);
}

function defaultData() {
  const adminEmail = process.env.ADMIN_EMAIL || 'hr@novanest.com';
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
  const empPasswordHash = bcrypt.hashSync('Novanest#Emp2026', 8);
  return {
    nextId: {
      users: 3, jobs: 3, applications: 1, employees: 2, leave: 1, attendance: 1,
      payslips: 1, formSixteens: 1, performance: 1,
      tasks: 1, documents: 1, assets: 1, cases: 1, surveys: 1, surveyResponses: 1, kbArticles: 1, workflows: 1,
      employeeCode: 1002
    },
    users: [
      { id: 1, name: 'Alex Morgan', email: adminEmail, password: adminPasswordHash, role: 'admin' },
      { id: 2, name: 'Jordan Lee', email: 'jordan.lee@novanest.com', password: empPasswordHash, role: 'employee', employeeId: 1 }
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
    employees: [
      {
        id: 1,
        employeeCode: 'NN001001',
        name: 'Jordan Lee',
        email: 'jordan.lee@novanest.com',
        department: 'Engineering',
        position: 'Frontend Engineer',
        joinDate: '2024-03-01',
        status: 'active',
        phone: '555-0100',
        managerId: null,
        basicSalary: 0,
        allowances: 0,
        deductions: 0,
        dob: '',
        gender: '',
        bloodGroup: '',
        address: '',
        emergencyContactName: '',
        emergencyContactRelation: '',
        emergencyContactPhone: '',
        aadhaarNumber: '',
        panNumber: '',
        passportNumber: '',
        bankAccountNumber: '',
        bankIFSC: '',
        bankName: ''
      }
    ],
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
    workflows: []
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
  if (!data.nextId) data.nextId = {};
  ['payslips', 'formSixteens', 'performance', 'tasks', 'documents', 'assets', 'cases', 'surveys', 'surveyResponses', 'kbArticles', 'workflows'].forEach((key) => {
    if (typeof data.nextId[key] !== 'number') { data.nextId[key] = 1; changed = true; }
  });
  if (typeof data.nextId.employeeCode !== 'number') { data.nextId.employeeCode = 1001; changed = true; }

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
      ['basicSalary', 'allowances', 'deductions'].forEach((field) => {
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
        'bankAccountNumber', 'bankIFSC', 'bankName'
      ].forEach((field) => {
        if (typeof emp[field] !== 'string') { emp[field] = ''; changed = true; }
      });
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

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function nextId(db, collection) {
  const id = db.nextId[collection];
  db.nextId[collection] += 1;
  return id;
}

module.exports = { readDB, writeDB, nextId, DB_PATH };
