const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const applicationRoutes = require('./routes/applications');
const employeeRoutes = require('./routes/employees');
const leaveRoutes = require('./routes/leave');
const attendanceRoutes = require('./routes/attendance');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'hr-portal-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hours
}));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/attendance', attendanceRoutes);

// Static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Novanest HR running at http://localhost:${PORT}`);
  console.log(`  Careers page:  http://localhost:${PORT}/index.html`);
  console.log(`  Login page:    http://localhost:${PORT}/login.html`);
  console.log(`  Admin/HR:      admin@company.com / admin123`);
  console.log(`  Employee demo: jordan@company.com / employee123`);
});
