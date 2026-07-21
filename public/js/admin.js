let CURRENT_USER = null;
let VIEW = 'overview';
let CACHE = { jobs: [], applications: [], employees: [], leave: [], attendance: [] };

async function init() {
  CURRENT_USER = await requireSession(['admin']);
  if (!CURRENT_USER) return;
  document.getElementById('whoName').textContent = CURRENT_USER.name;
  document.getElementById('whoRole').textContent = 'HR Administrator';

  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => switchView(link.dataset.view));
  });
  document.getElementById('logoutLink').addEventListener('click', async (e) => {
    e.preventDefault();
    await api('/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  document.getElementById('jobForm').addEventListener('submit', submitJob);
  document.getElementById('empForm').addEventListener('submit', submitEmployee);
  document.getElementById('setPasswordForm').addEventListener('submit', submitLoginPassword);
  document.getElementById('empCreateLogin').addEventListener('change', (e) => {
    document.getElementById('loginPasswordWrap').style.display = e.target.checked ? 'block' : 'none';
  });

  await switchView('overview');
}

async function switchView(view) {
  VIEW = view;
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.toggle('active', l.dataset.view === view));
  const renderers = { overview: renderOverview, jobs: renderJobs, applications: renderApplications, employees: renderEmployees, leave: renderLeave, attendance: renderAttendance };
  await renderers[view]();
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

/* ---------------- Overview ---------------- */
async function renderOverview() {
  const [{ jobs }, { applications }, { employees }, { leave }] = await Promise.all([
    api('/jobs?all=1'), api('/applications'), api('/employees'), api('/leave')
  ]);
  CACHE = { ...CACHE, jobs, applications, employees, leave };
  const openJobs = jobs.filter(j => j.status === 'open').length;
  const pendingApps = applications.filter(a => ['applied', 'screening', 'interview'].includes(a.status)).length;
  const pendingLeave = leave.filter(l => l.status === 'pending').length;

  document.getElementById('main').innerHTML = `
    <h1>Overview</h1>
    <div class="subtitle">Snapshot of recruitment and workforce activity.</div>
    <div class="stat-row">
      <div class="stat-card"><div class="num">${openJobs}</div><div class="label">Open positions</div></div>
      <div class="stat-card"><div class="num">${pendingApps}</div><div class="label">Active applications</div></div>
      <div class="stat-card"><div class="num">${employees.length}</div><div class="label">Employees</div></div>
      <div class="stat-card"><div class="num">${pendingLeave}</div><div class="label">Leave requests pending</div></div>
    </div>
    <div class="filetab">Recent applications</div>
    <div class="panel" style="border-top-left-radius:0;">
      <div class="panel-body">
        ${applications.length === 0 ? emptyState('No applications yet') : renderTable(
          ['Candidate', 'Role', 'Applied', 'Status'],
          applications.slice(0, 6).map(a => [escapeHtml(a.candidateName), escapeHtml(a.jobTitle), fmtDate(a.appliedDate), pill(a.status)])
        )}
      </div>
    </div>
  `;
}

function emptyState(msg) {
  return `<div class="empty-state"><div class="glyph">— · —</div>${msg}</div>`;
}

function renderTable(headers, rows) {
  return `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/* ---------------- Jobs ---------------- */
async function renderJobs() {
  const { jobs } = await api('/jobs?all=1');
  CACHE.jobs = jobs;
  document.getElementById('main').innerHTML = `
    <h1>Job postings</h1>
    <div class="subtitle">Create and manage roles shown on the public careers page.</div>
    <div class="panel">
      <div class="panel-header"><h2>All postings</h2><button class="btn btn-primary btn-sm" onclick="openJobModal()">+ New posting</button></div>
      <div class="panel-body">
        ${jobs.length === 0 ? emptyState('No postings yet') : renderTable(
          ['Title', 'Department', 'Location', 'Status', ''],
          jobs.map(j => [
            escapeHtml(j.title), escapeHtml(j.department), escapeHtml(j.location || '—'), pill(j.status),
            `<span class="section-actions">
              <button class="btn btn-ghost btn-sm" onclick="openJobModal(${j.id})">Edit</button>
              <button class="btn btn-ghost btn-sm" onclick="toggleJobStatus(${j.id}, '${j.status}')">${j.status === 'open' ? 'Close' : 'Reopen'}</button>
              <button class="btn btn-danger btn-sm" onclick="deleteJob(${j.id})">Delete</button>
            </span>`
          ])
        )}
      </div>
    </div>
  `;
}

function openJobModal(id) {
  const form = document.getElementById('jobForm');
  form.reset();
  document.getElementById('jobId').value = '';
  document.getElementById('jobModalTitle').textContent = 'New job posting';
  if (id) {
    const job = CACHE.jobs.find(j => j.id === id);
    document.getElementById('jobId').value = job.id;
    document.getElementById('jobTitle').value = job.title;
    document.getElementById('jobDept').value = job.department;
    document.getElementById('jobLocation').value = job.location || '';
    document.getElementById('jobType').value = job.type || 'Full-time';
    document.getElementById('jobDesc').value = job.description || '';
    document.getElementById('jobModalTitle').textContent = 'Edit job posting';
  }
  document.getElementById('jobModal').classList.add('show');
}

async function submitJob(e) {
  e.preventDefault();
  const id = document.getElementById('jobId').value;
  const payload = {
    title: document.getElementById('jobTitle').value,
    department: document.getElementById('jobDept').value,
    location: document.getElementById('jobLocation').value,
    type: document.getElementById('jobType').value,
    description: document.getElementById('jobDesc').value
  };
  try {
    if (id) await api(`/jobs/${id}`, { method: 'PUT', body: payload });
    else await api('/jobs', { method: 'POST', body: payload });
    toast('Job posting saved');
    closeModal('jobModal');
    renderJobs();
  } catch (err) { toast(err.message, true); }
}

async function toggleJobStatus(id, currentStatus) {
  try {
    await api(`/jobs/${id}`, { method: 'PUT', body: { status: currentStatus === 'open' ? 'closed' : 'open' } });
    renderJobs();
  } catch (err) { toast(err.message, true); }
}

async function deleteJob(id) {
  if (!confirm('Delete this job posting? This cannot be undone.')) return;
  try {
    await api(`/jobs/${id}`, { method: 'DELETE' });
    toast('Job posting deleted');
    renderJobs();
  } catch (err) { toast(err.message, true); }
}

/* ---------------- Applications ---------------- */
async function renderApplications() {
  const { applications } = await api('/applications');
  CACHE.applications = applications;
  const statuses = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
  document.getElementById('main').innerHTML = `
    <h1>Applications</h1>
    <div class="subtitle">Review candidates and move them through the pipeline.</div>
    <div class="panel">
      <div class="panel-header"><h2>All applications</h2></div>
      <div class="panel-body">
        ${applications.length === 0 ? emptyState('No applications yet') : renderTable(
          ['Candidate', 'Role', 'Contact', 'Applied', 'Status', ''],
          applications.map(a => [
            escapeHtml(a.candidateName),
            escapeHtml(a.jobTitle),
            `${escapeHtml(a.email)}${a.phone ? '<br><span class="muted">' + escapeHtml(a.phone) + '</span>' : ''}`,
            fmtDate(a.appliedDate),
            pill(a.status),
            `<span class="section-actions">
              <select class="statusSelect" style="margin:0; width:auto; padding:5px 8px; font-size:12px;" onchange="updateAppStatus(${a.id}, this.value)">
                ${statuses.map(s => `<option value="${s}" ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
              ${a.status === 'hired' ? '' : `<button class="btn btn-ghost btn-sm" onclick="hireApplicant(${a.id})">Hire</button>`}
            </span>`
          ])
        )}
      </div>
    </div>
  `;
}

async function updateAppStatus(id, status) {
  try {
    await api(`/applications/${id}/status`, { method: 'PUT', body: { status } });
    toast('Status updated');
  } catch (err) { toast(err.message, true); }
}

async function hireApplicant(id) {
  if (!confirm('Convert this applicant into an employee record?')) return;
  try {
    await api(`/applications/${id}/hire`, { method: 'POST' });
    toast('Applicant hired — employee record created');
    renderApplications();
  } catch (err) { toast(err.message, true); }
}

/* ---------------- Employees ---------------- */
async function renderEmployees() {
  const { employees } = await api('/employees');
  CACHE.employees = employees;
  document.getElementById('main').innerHTML = `
    <h1>Employees</h1>
    <div class="subtitle">Manage the current workforce roster.</div>
    <div class="panel">
      <div class="panel-header"><h2>Roster</h2><button class="btn btn-primary btn-sm" onclick="openEmpModal()">+ Add employee</button></div>
      <div class="panel-body">
        ${employees.length === 0 ? emptyState('No employees yet') : renderTable(
          ['Name', 'Department', 'Position', 'Joined', 'Status', 'Login', ''],
          employees.map(e => [
            `${escapeHtml(e.name)}<br><span class="muted">${escapeHtml(e.email)}</span>`,
            escapeHtml(e.department), escapeHtml(e.position), fmtDate(e.joinDate), pill(e.status),
            e.hasLogin ? pill('active') : `<button class="btn btn-ghost btn-sm" onclick="createLoginFor(${e.id})">Create login</button>`,
            `<span class="section-actions">
              <button class="btn btn-ghost btn-sm" onclick="openEmpModal(${e.id})">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteEmployee(${e.id})">Remove</button>
            </span>`
          ])
        )}
      </div>
    </div>
  `;
}

function openEmpModal(id) {
  const form = document.getElementById('empForm');
  form.reset();
  document.getElementById('empId').value = '';
  document.getElementById('empModalTitle').textContent = 'Add employee';
  document.getElementById('loginPasswordWrap').style.display = 'none';
  document.getElementById('loginFieldsWrap').style.display = 'block';
  if (id) {
    const emp = CACHE.employees.find(e => e.id === id);
    document.getElementById('empId').value = emp.id;
    document.getElementById('empName').value = emp.name;
    document.getElementById('empEmail').value = emp.email;
    document.getElementById('empDept').value = emp.department;
    document.getElementById('empPosition').value = emp.position;
    document.getElementById('empPhone').value = emp.phone || '';
    document.getElementById('empStatus').value = emp.status;
    document.getElementById('empModalTitle').textContent = 'Edit employee';
    // Login accounts for existing employees are managed from the roster table, not this form.
    document.getElementById('loginFieldsWrap').style.display = 'none';
  }
  document.getElementById('empModal').classList.add('show');
}

async function submitEmployee(e) {
  e.preventDefault();
  const id = document.getElementById('empId').value;
  const payload = {
    name: document.getElementById('empName').value,
    email: document.getElementById('empEmail').value,
    department: document.getElementById('empDept').value,
    position: document.getElementById('empPosition').value,
    phone: document.getElementById('empPhone').value,
    status: document.getElementById('empStatus').value
  };
  if (!id) {
    payload.createLogin = document.getElementById('empCreateLogin').checked;
    payload.password = document.getElementById('empLoginPassword').value;
  }
  try {
    if (id) {
      await api(`/employees/${id}`, { method: 'PUT', body: payload });
      toast('Employee saved');
      closeModal('empModal');
    } else {
      const { credentials } = await api('/employees', { method: 'POST', body: payload });
      toast('Employee saved');
      closeModal('empModal');
      if (credentials) showCredentials(credentials);
    }
    renderEmployees();
  } catch (err) { toast(err.message, true); }
}

async function createLoginFor(id) {
  const emp = CACHE.employees.find(e => e.id === id);
  document.getElementById('setPasswordEmpId').value = id;
  document.getElementById('setPasswordEmpName').textContent = emp ? `— ${emp.name}` : '';
  document.getElementById('setPasswordValue').value = '';
  document.getElementById('setPasswordModal').classList.add('show');
}

async function submitLoginPassword(e) {
  e.preventDefault();
  const id = document.getElementById('setPasswordEmpId').value;
  const password = document.getElementById('setPasswordValue').value;
  try {
    const { credentials } = await api(`/employees/${id}/create-login`, { method: 'POST', body: { password } });
    closeModal('setPasswordModal');
    showCredentials(credentials);
    renderEmployees();
  } catch (err) { toast(err.message, true); }
}

function showCredentials(credentials) {
  document.getElementById('credsEmail').textContent = credentials.email;
  document.getElementById('credsPassword').textContent = credentials.password;
  document.getElementById('credsModal').classList.add('show');
}

async function deleteEmployee(id) {
  if (!confirm('Remove this employee record?')) return;
  try {
    await api(`/employees/${id}`, { method: 'DELETE' });
    toast('Employee removed');
    renderEmployees();
  } catch (err) { toast(err.message, true); }
}

/* ---------------- Leave ---------------- */
async function renderLeave() {
  const { leave } = await api('/leave');
  document.getElementById('main').innerHTML = `
    <h1>Leave requests</h1>
    <div class="subtitle">Approve or decline time-off requests from employees.</div>
    <div class="panel">
      <div class="panel-header"><h2>All requests</h2></div>
      <div class="panel-body">
        ${leave.length === 0 ? emptyState('No leave requests yet') : renderTable(
          ['Employee', 'Type', 'Dates', 'Reason', 'Status', ''],
          leave.map(l => [
            escapeHtml(l.employeeName), escapeHtml(l.type),
            `${fmtDate(l.startDate)} – ${fmtDate(l.endDate)}`,
            `<span class="muted">${escapeHtml(l.reason || '—')}</span>`,
            pill(l.status),
            l.status === 'pending' ? `<span class="section-actions">
              <button class="btn btn-primary btn-sm" onclick="setLeaveStatus(${l.id}, 'approved')">Approve</button>
              <button class="btn btn-danger btn-sm" onclick="setLeaveStatus(${l.id}, 'rejected')">Decline</button>
            </span>` : '<span class="muted">Resolved</span>'
          ])
        )}
      </div>
    </div>
  `;
}

async function setLeaveStatus(id, status) {
  try {
    await api(`/leave/${id}/status`, { method: 'PUT', body: { status } });
    toast('Leave request ' + status);
    renderLeave();
  } catch (err) { toast(err.message, true); }
}

/* ---------------- Attendance ---------------- */
async function renderAttendance() {
  const { attendance } = await api('/attendance');
  document.getElementById('main').innerHTML = `
    <h1>Attendance</h1>
    <div class="subtitle">Company-wide check-in and check-out log.</div>
    <div class="panel">
      <div class="panel-header"><h2>Recent records</h2></div>
      <div class="panel-body">
        ${attendance.length === 0 ? emptyState('No attendance records yet') : renderTable(
          ['Employee', 'Date', 'Check in', 'Check out', 'Status'],
          attendance.map(a => [
            escapeHtml(a.employeeName), fmtDate(a.date),
            `<span class="timestamp">${fmtTime(a.checkIn)}</span>`,
            `<span class="timestamp">${a.checkOut ? fmtTime(a.checkOut) : '—'}</span>`,
            pill(a.status)
          ])
        )}
      </div>
    </div>
  `;
}

init();
