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
const payslipRoutes = require('./routes/payslips');
const formSixteenRoutes = require('./routes/formSixteen');
const performanceRoutes = require('./routes/performance');
const taskRoutes = require('./routes/tasks');
const documentRoutes = require('./routes/documents');
const assetRoutes = require('./routes/assets');
const caseRoutes = require('./routes/cases');
const surveyRoutes = require('./routes/surveys');
const kbRoutes = require('./routes/knowledgebase');
const workflowRoutes = require('./routes/workflows');

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
app.use('/api/payslips', payslipRoutes);
app.use('/api/form16', formSixteenRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api/surveys', surveyRoutes);
app.use('/api/knowledgebase', kbRoutes);
app.use('/api/workflows', workflowRoutes);

// Static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Novanest HR running at http://localhost:${PORT}`);
  console.log(`  Careers page:  http://localhost:${PORT}/index.html`);
  console.log(`  Login page:    http://localhost:${PORT}/login.html`);
});
