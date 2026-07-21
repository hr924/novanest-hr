// Simple file-based JSON database — no native dependencies required.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function defaultData() {
  const adminPasswordHash = bcrypt.hashSync('admin123', 8);
  const empPasswordHash = bcrypt.hashSync('employee123', 8);
  return {
    nextId: { users: 3, jobs: 3, applications: 1, employees: 2, leave: 1, attendance: 1 },
    users: [
      { id: 1, name: 'Alex Morgan', email: 'admin@company.com', password: adminPasswordHash, role: 'admin' },
      { id: 2, name: 'Jordan Lee', email: 'jordan@company.com', password: empPasswordHash, role: 'employee', employeeId: 1 }
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
        name: 'Jordan Lee',
        email: 'jordan@company.com',
        department: 'Engineering',
        position: 'Frontend Engineer',
        joinDate: '2024-03-01',
        status: 'active',
        phone: '555-0100'
      }
    ],
    leave: [],
    attendance: []
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

function readDB() {
  ensureDB();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
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
