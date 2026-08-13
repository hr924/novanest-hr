let CURRENT_USER = null;
let VIEW = 'overview';
let CACHE = { jobs: [], applications: [], employees: [], leave: [], attendance: [] };
let OVERVIEW_CHARTS = {};

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
  document.getElementById('editAccountLink').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('myAccountForm').reset();
    document.getElementById('myAccountName').value = CURRENT_USER.name;
    document.getElementById('myAccountModal').classList.add('show');
  });
  document.getElementById('myAccountForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { user } = await api('/auth/me', {
        method: 'PUT',
        body: {
          name: document.getElementById('myAccountName').value,
          newPassword: document.getElementById('myAccountPassword').value
        }
      });
      CURRENT_USER = user;
      document.getElementById('whoName').textContent = user.name;
      toast('Account updated');
      closeModal('myAccountModal');
    } catch (err) { toast(err.message, true); }
  });

  document.getElementById('jobForm').addEventListener('submit', submitJob);
  document.getElementById('empForm').addEventListener('submit', submitEmployee);
  document.getElementById('setPasswordForm').addEventListener('submit', submitLoginPassword);
  document.getElementById('payslipForm').addEventListener('submit', submitPayslip);
  document.getElementById('bulkPayslipForm').addEventListener('submit', submitBulkPayslip);
  document.getElementById('form16Form').addEventListener('submit', submitForm16);
  document.getElementById('performanceForm').addEventListener('submit', submitPerformance);
  document.getElementById('taskForm').addEventListener('submit', submitTask);
  document.getElementById('documentForm').addEventListener('submit', submitDocument);
  document.getElementById('assetForm').addEventListener('submit', submitAsset);
  document.getElementById('surveyForm').addEventListener('submit', submitSurvey);
  document.getElementById('kbForm').addEventListener('submit', submitKb);
  document.getElementById('workflowForm').addEventListener('submit', submitWorkflow);
  document.getElementById('caseForm').addEventListener('submit', submitCaseResponse);
  document.getElementById('empCreateLogin').addEventListener('change', (e) => {
    document.getElementById('loginPasswordWrap').style.display = e.target.checked ? 'block' : 'none';
  });
  document.getElementById('empDept').addEventListener('change', (e) => {
    document.getElementById('empDeptOther').style.display = e.target.value === '__other__' ? 'block' : 'none';
  });
  document.getElementById('empPosition').addEventListener('change', (e) => {
    document.getElementById('empPositionOther').style.display = e.target.value === '__other__' ? 'block' : 'none';
  });
  document.getElementById('empAnnualCTC').addEventListener('input', (e) => {
    const annual = Number(e.target.value) || 0;
    document.getElementById('empMonthlyCTC').value = annual ? (annual / 12).toFixed(2) : 0;
    recalcSalaryFields();
  });
  document.getElementById('empMonthlyCTC').addEventListener('input', recalcSalaryFields);
  document.getElementById('empEmployerPF').addEventListener('input', recalcSalaryFields);
  document.getElementById('empEmployeePF').addEventListener('input', recalcSalaryFields);
  document.getElementById('empProfessionalTax').addEventListener('input', recalcSalaryFields);
  document.getElementById('empStatus').addEventListener('change', (e) => {
    document.getElementById('empInactiveReasonWrap').style.display = e.target.value === 'inactive' ? 'block' : 'none';
  });
  document.getElementById('empInactiveReason').addEventListener('change', (e) => {
    document.getElementById('empInactiveReasonOther').style.display = e.target.value === '__other__' ? 'block' : 'none';
  });
  document.getElementById('empPhotoFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    readFileAsDataUrl(file).then((dataUrl) => {
      document.getElementById('empPhotoPreview').src = dataUrl;
      document.getElementById('empPhotoPreviewWrap').style.display = 'block';
    });
  });
  ['empPan', 'empBankIfsc'].forEach((id) => {
    document.getElementById(id).addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });
  });
  document.getElementById('empAadhaar').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 12);
  });
  document.getElementById('empBankAccount').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 20);
  });

  initBackButtonObserver();
  await switchView('overview');
}

async function switchView(view) {
  VIEW = view;
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.toggle('active', l.dataset.view === view));
  const renderers = {
    overview: renderOverview, jobs: renderJobs, applications: renderApplications, employees: renderEmployees,
    leave: renderLeave, timesheets: renderTimesheetsAdmin, attendance: renderAttendance, payslips: renderPayslips, form16: renderForm16, performance: renderPerformance,
    tasks: renderTasks, documents: renderDocuments, assets: renderAssets, cases: renderCases,
    surveys: renderSurveys, knowledgebase: renderKnowledgeBase, workflows: renderWorkflows, reports: renderReports,
    backups: renderBackups
  };
  await renderers[view]();
  ensureBackButton();
}

/* ---------------- Back button (shown on every screen except Overview) ----------------
   A MutationObserver keeps this in sync automatically: any time a render function
   rewrites #main (whether via switchView or a direct re-render after save/delete),
   the observer re-adds the button if it's missing, so it's always present on
   every screen without needing to touch each individual render function. */
const HOME_VIEW = 'overview';
function ensureBackButton() {
  const main = document.getElementById('main');
  if (!main || VIEW === HOME_VIEW) return;
  if (main.firstElementChild && main.firstElementChild.classList.contains('back-btn-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'back-btn-bar';
  bar.innerHTML = `<button type="button" class="btn btn-ghost btn-sm back-btn" onclick="switchView('${HOME_VIEW}')">&larr; Back</button>`;
  main.insertBefore(bar, main.firstChild);
}
function initBackButtonObserver() {
  const main = document.getElementById('main');
  if (!main) return;
  new MutationObserver(ensureBackButton).observe(main, { childList: true });
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
  const [
    { jobs }, { applications }, { employees }, { leave },
    attendanceRes, timesheetsRes, payslipsRes, performanceRes, documentsRes, assetsRes, casesRes,
    tasksRes, surveysRes, kbRes, workflowsRes, backupsRes
  ] = await Promise.all([
    api('/jobs?all=1'), api('/applications'), api('/employees'), api('/leave'),
    api('/attendance').catch(() => ({ attendance: [] })),
    api('/timesheets').catch(() => ({ timesheets: [] })),
    api('/payslips').catch(() => ({ payslips: [] })),
    api('/performance').catch(() => ({ performance: [] })),
    api('/documents').catch(() => ({ documents: [] })),
    api('/assets').catch(() => ({ assets: [] })),
    api('/cases').catch(() => ({ cases: [] })),
    api('/tasks').catch(() => ({ tasks: [] })),
    api('/surveys').catch(() => ({ surveys: [] })),
    api('/knowledgebase').catch(() => ({ articles: [] })),
    api('/workflows').catch(() => ({ workflows: [] })),
    api('/backups').catch(() => ({ backups: [] }))
  ]);
  const attendance = attendanceRes.attendance || [];
  const timesheets = timesheetsRes.timesheets || [];
  const payslips = payslipsRes.payslips || [];
  const performance = performanceRes.performance || [];
  const documents = documentsRes.documents || [];
  const assets = assetsRes.assets || [];
  const cases = casesRes.cases || [];
  const tasks = tasksRes.tasks || [];
  const surveys = surveysRes.surveys || [];
  const kbArticles = kbRes.articles || [];
  const workflows = workflowsRes.workflows || [];
  const backups = backupsRes.backups || [];
  CACHE = { ...CACHE, jobs, applications, employees, leave, attendance };

  const todayStr = new Date().toISOString().slice(0, 10);
  const activeEmployees = employees.filter(e => e.status === 'active');
  const presentToday = new Set(attendance.filter(a => a.date === todayStr).map(a => a.employeeId)).size;
  const onLeaveToday = leave.filter(l => l.overallStatus === 'approved' && l.startDate <= todayStr && l.endDate >= todayStr).length;
  const pendingLeave = leave.filter(l => l.overallStatus === 'pending-manager' || l.overallStatus === 'pending-hr' || l.status === 'pending').length;
  const pendingTimesheets = timesheets.filter(t => t.status === 'submitted').length;
  const openJobs = jobs.filter(j => j.status === 'open').length;

  // ---- Module status grid: quick health snapshot per module ----
  const currentMonth = todayStr.slice(0, 7); // 'YYYY-MM'
  const payslipsThisMonth = payslips.filter(p => p.month === currentMonth).length;
  const hiredCount = applications.filter(a => a.status === 'hired').length;
  const openCases = cases.filter(c => c.status !== 'resolved').length;
  const assignedAssets = assets.filter(a => a.status === 'assigned').length;
  const pendingTasks = tasks.filter(t => t.status !== 'done').length;
  const activeSurveys = surveys.filter(s => s.status === 'active' || !s.status).length;
  const recentBackup = backups.length > 0;

  const MODULES = [
    { icon: 'jobs', title: 'Recruitment', view: 'jobs',
      status: `${openJobs} open roles`, tone: openJobs ? 'good' : 'idle' },
    { icon: 'applications', title: 'Onboarding', view: 'applications',
      status: `${hiredCount} hired`, tone: hiredCount ? 'good' : 'idle' },
    { icon: 'employees', title: 'Workforce', view: 'employees',
      status: `${activeEmployees.length} active`, tone: 'good' },
    { icon: 'leave', title: 'Leave', view: 'leave',
      status: pendingLeave ? `${pendingLeave} pending` : 'Up to date', tone: pendingLeave ? 'warn' : 'good' },
    { icon: 'timesheets', title: 'Timesheets', view: 'timesheets',
      status: pendingTimesheets ? `${pendingTimesheets} pending` : 'Up to date',
      tone: pendingTimesheets ? 'warn' : 'good' },
    { icon: 'attendance', title: 'Attendance', view: 'attendance',
      status: `${presentToday} present today`, tone: 'good' },
    { icon: 'payslips', title: 'Payroll', view: 'payslips',
      status: payslipsThisMonth ? `${payslipsThisMonth} processed` : 'Not run yet',
      tone: payslipsThisMonth ? 'good' : 'warn' },
    { icon: 'form16', title: 'Form 16', view: 'form16',
      status: 'Annual document', tone: 'idle' },
    { icon: 'performance', title: 'Performance', view: 'performance',
      status: performance.length ? `${performance.length} reviews` : 'No reviews yet',
      tone: performance.length ? 'good' : 'idle' },
    { icon: 'tasks', title: 'Tasks', view: 'tasks',
      status: pendingTasks ? `${pendingTasks} pending` : 'All done', tone: pendingTasks ? 'warn' : 'good' },
    { icon: 'documents', title: 'Documents', view: 'documents',
      status: `${documents.length} files`, tone: 'good' },
    { icon: 'assets', title: 'Assets', view: 'assets',
      status: `${assignedAssets} assigned`, tone: 'good' },
    { icon: 'cases', title: 'Helpdesk', view: 'cases',
      status: openCases ? `${openCases} open` : 'All resolved',
      tone: openCases ? 'warn' : 'good' },
    { icon: 'surveys', title: 'Surveys', view: 'surveys',
      status: activeSurveys ? `${activeSurveys} active` : 'No active surveys', tone: activeSurveys ? 'good' : 'idle' },
    { icon: 'knowledgebase', title: 'Knowledge base', view: 'knowledgebase',
      status: `${kbArticles.length} articles`, tone: 'good' },
    { icon: 'workflows', title: 'Workflows', view: 'workflows',
      status: `${workflows.length} active`, tone: workflows.length ? 'good' : 'idle' },
    { icon: 'reports', title: 'Reports', view: 'reports',
      status: 'View reports', tone: 'idle' },
    { icon: 'backups', title: 'Backups', view: 'backups',
      status: recentBackup ? 'Up to date' : 'No backups yet', tone: recentBackup ? 'good' : 'warn' },
  ];
  const checkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>';
  const warnSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16.5v.01"/></svg>';
  const moduleGridHtml = MODULES.map((m) => `
    <div class="module-card" data-view="${m.view}" onclick="switchView('${m.view}'); document.querySelectorAll('.sidebar-link').forEach(l=>l.classList.toggle('active', l.dataset.view==='${m.view}'));" style="cursor:pointer;">
      <div class="module-icon ${SIDEBAR_ICON_TINTS[m.icon] || 'm-slate'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SIDEBAR_ICONS[m.icon] || SIDEBAR_ICON_DEFAULT}</svg></div>
      <div>
        <div class="module-title">${escapeHtml(m.title)}</div>
        <div class="module-status ${m.tone}">${escapeHtml(m.status)}</div>
      </div>
      <div class="module-badge ${m.tone === 'warn' ? 'warn' : 'good'}">${m.tone === 'warn' ? warnSvg : checkSvg}</div>
    </div>`).join('');

  // ---- Attendance overview: check-ins per day for the current week (Mon-Sun) ----
  const now = new Date();
  const dow = now.getDay(); // 0 = Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now); monday.setDate(now.getDate() + mondayOffset); monday.setHours(0, 0, 0, 0);
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    weekDays.push(d.toISOString().slice(0, 10));
  }
  const weekLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekCounts = weekDays.map(ds => new Set(attendance.filter(a => a.date === ds).map(a => a.employeeId)).size);

  // ---- Leave summary: breakdown by type across all requests ----
  const leaveTypeColors = { Casual: '#03A9E7', Sick: '#2ED47A', Personal: '#184B76', Bereavement: '#FF9F6B', Other: '#F0506E' };
  const typeCounts = {};
  leave.forEach(l => { typeCounts[l.type] = (typeCounts[l.type] || 0) + 1; });
  const leaveTypes = Object.keys(typeCounts);
  const leaveTotal = leave.length;

  // ---- Recent activity feed, newest first across a few sources ----
  const activity = [];
  applications.slice(0, 3).forEach(a => activity.push({ text: `${a.candidateName} applied for ${a.jobTitle}`, date: a.appliedDate, icon: 'jobs' }));
  leave.slice(0, 3).forEach(l => activity.push({ text: `${l.employeeName} requested ${l.type} leave`, date: l.requestedDate || l.startDate, icon: 'leave' }));
  [...employees].sort((a, b) => new Date(b.joinDate) - new Date(a.joinDate)).slice(0, 2).forEach(e => activity.push({ text: `${e.name} joined as ${e.position}`, date: e.joinDate, icon: 'employees' }));
  activity.sort((a, b) => new Date(b.date) - new Date(a.date));
  const activityHtml = activity.slice(0, 6).map(a => `
    <div class="activity-item">
      <div class="a-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SIDEBAR_ICONS[a.icon] || SIDEBAR_ICON_DEFAULT}</svg></div>
      <div><div class="a-text">${escapeHtml(a.text)}</div><div class="a-time">${fmtDate(a.date)}</div></div>
    </div>`).join('') || emptyState('No recent activity yet');

  document.getElementById('main').innerHTML = `
    <div class="main-head">
      <div><h1>Dashboard</h1><div class="subtitle">Snapshot of recruitment and workforce activity.</div></div>
      <div class="head-action"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z"/></svg></div>
    </div>

    <div class="module-grid">
      ${moduleGridHtml}
    </div>

    <div class="dash-grid-2">
      <div class="chart-card">
        <div class="chart-card-head"><h3>Attendance Overview</h3><span class="chip">This Week</span></div>
        <div class="chart-wrap"><canvas id="attendanceChart"></canvas></div>
      </div>
      <div class="chart-card donut-wrap">
        <div class="chart-card-head" style="width:100%;"><h3>Leave Summary</h3></div>
        <div class="donut-canvas-holder">
          <canvas id="leaveDonut"></canvas>
          <div class="donut-center"><div class="n">${leaveTotal}</div><div class="t">Total</div></div>
        </div>
        <div class="donut-legend">
          ${leaveTypes.length === 0 ? `<div class="muted" style="font-size:12.5px; text-align:center;">No leave data yet</div>` : leaveTypes.map(t => `
            <div class="li"><div class="k"><span class="dot" style="background:${leaveTypeColors[t] || '#8D8BA7'}"></span>${escapeHtml(t)}</div><div class="v">${typeCounts[t]}</div></div>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="dash-grid-bottom">
      <div class="activity-card">
        <h3>Recent Activities</h3>
        ${activityHtml}
      </div>
      <div class="ai-card">
        <div>
          <h3>AI Ask - Your HR Assistant</h3>
          <p>Get instant answers to HR policies, leave balance, payroll, and more.</p>
        </div>
        <button class="btn-ai" onclick="switchView('knowledgebase'); document.querySelectorAll('.sidebar-link').forEach(l=>l.classList.toggle('active', l.dataset.view==='knowledgebase'));">Ask Now →</button>
      </div>
    </div>

    <div class="filetab" style="margin-top:22px;">Recent applications</div>
    <div class="panel" style="border-top-left-radius:0;">
      <div class="panel-body">
        ${applications.length === 0 ? emptyState('No applications yet') : renderTable(
          ['Candidate', 'Role', 'Applied', 'Status'],
          applications.slice(0, 6).map(a => [escapeHtml(a.candidateName), escapeHtml(a.jobTitle), fmtDate(a.appliedDate), pill(a.status)])
        )}
      </div>
    </div>
  `;

  drawOverviewCharts(weekLabels, weekCounts, leaveTypes, leaveTypes.map(t => typeCounts[t]), leaveTypes.map(t => leaveTypeColors[t] || '#8D8BA7'));
}

function drawOverviewCharts(weekLabels, weekCounts, donutLabels, donutData, donutColors) {
  if (typeof Chart === 'undefined') return;
  if (OVERVIEW_CHARTS.bar) OVERVIEW_CHARTS.bar.destroy();
  if (OVERVIEW_CHARTS.donut) OVERVIEW_CHARTS.donut.destroy();

  const barCtx = document.getElementById('attendanceChart');
  if (barCtx) {
    OVERVIEW_CHARTS.bar = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: weekLabels,
        datasets: [{ data: weekCounts, backgroundColor: '#03A9E7', borderRadius: 6, maxBarThickness: 34 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#ECEBF6' }, ticks: { color: '#8D8BA7', font: { size: 11 } } },
          x: { grid: { display: false }, ticks: { color: '#8D8BA7', font: { size: 11 } } }
        }
      }
    });
  }

  const donutCtx = document.getElementById('leaveDonut');
  if (donutCtx && donutData.length) {
    OVERVIEW_CHARTS.donut = new Chart(donutCtx, {
      type: 'doughnut',
      data: { labels: donutLabels, datasets: [{ data: donutData, backgroundColor: donutColors, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { display: false } } }
    });
  }
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
          ['Candidate', 'Role', 'Contact', 'Resume', 'Applied', 'Status', ''],
          applications.map(a => [
            escapeHtml(a.candidateName),
            escapeHtml(a.jobTitle),
            `${escapeHtml(a.email)}${a.phone ? '<br><span class="muted">' + escapeHtml(a.phone) + '</span>' : ''}`,
            a.resumeDataUrl ? `<a href="${a.resumeDataUrl}" download="${escapeHtml(a.resumeName || 'resume')}">${escapeHtml(a.resumeName || 'Download')}</a>` : '<span class="muted">—</span>',
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
let empSearchQuery = '';

function onEmpSearchInput(value) {
  empSearchQuery = value;
  renderEmployees(false);
}

function matchesEmpSearch(e, query) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [e.employeeCode, e.name, e.managerName].filter(Boolean).join(' ').toLowerCase();
  // Every space-separated term must match somewhere across ID, name, and
  // manager combined — so "reddy priya" finds Priya's report named Reddy.
  return q.split(/\s+/).every(term => haystack.includes(term));
}

async function renderEmployees(refetch) {
  const searchHadFocus = document.activeElement && document.activeElement.id === 'empSearchInput';
  const searchCursorPos = searchHadFocus ? document.activeElement.selectionStart : null;

  if (refetch !== false || !CACHE.employees) {
    const { employees } = await api('/employees');
    CACHE.employees = employees;
  }
  const employees = CACHE.employees.filter(e => matchesEmpSearch(e, empSearchQuery));

  document.getElementById('main').innerHTML = `
    <h1>Employees</h1>
    <div class="subtitle">Manage the current workforce roster.</div>
    <div class="panel">
      <div class="panel-header">
        <h2>Roster</h2>
        <span style="display:flex; gap:8px; position:relative; align-items:center;">
          <input
            id="empSearchInput"
            type="search"
            placeholder="Search by employee ID, name, or manager…"
            value="${escapeHtml(empSearchQuery)}"
            oninput="onEmpSearchInput(this.value)"
            style="margin:0; width:260px; padding:6px 10px; font-size:13px;"
          >
          <button class="btn btn-primary btn-sm" onclick="openEmpModal()">+ Add employee</button>
        </span>
      </div>
      <div class="panel-body">
        ${employees.length === 0 ? emptyState(empSearchQuery ? 'No employees match your search' : 'No employees yet') : renderTable(
          ['Employee ID', 'Name', 'Department', 'Designation', 'Manager', 'Status', 'Login', ''],
          employees.map(e => [
            `<span class="timestamp">${escapeHtml(e.employeeCode || '—')}</span>`,
            `<span style="display:flex; align-items:center; gap:10px;">
              ${e.profilePhoto ? `<img src="${e.profilePhoto}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">` : `<span style="width:32px; height:32px; border-radius:50%; background:var(--tab-bg); display:inline-flex; align-items:center; justify-content:center; font-size:11px; color:var(--ink-soft);">${escapeHtml((e.name || '?').charAt(0))}</span>`}
              <span>${escapeHtml(e.name)}<br><span class="muted">${escapeHtml(e.email)}</span></span>
            </span>`,
            escapeHtml(e.department),
            escapeHtml(e.position),
            e.managerName ? escapeHtml(e.managerName) : '<span class="muted">—</span>',
            e.status === 'inactive'
              ? `${pill(e.status)}${e.inactiveReason ? `<br><span class="muted" style="font-size:11px;">${escapeHtml(e.inactiveReason)}</span>` : ''}`
              : pill(e.status),
            e.hasLogin ? `${pill('active')} <span class="muted" style="font-size:11px;">(${escapeHtml(e.loginRole || 'employee')})</span>` : `<button class="btn btn-ghost btn-sm" onclick="createLoginFor(${e.id})">Create login</button>`,
            `<span class="section-actions">
              <button class="btn btn-ghost btn-sm" onclick="openEmpModal(${e.id})">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteEmployee(${e.id})">Remove</button>
            </span>`
          ])
        )}
      </div>
    </div>
  `;
  if (searchHadFocus) {
    const input = document.getElementById('empSearchInput');
    input.focus();
    if (searchCursorPos != null) input.setSelectionRange(searchCursorPos, searchCursorPos);
  }
}

function recalcSalaryFields() {
  const monthlyCTC = Number(document.getElementById('empMonthlyCTC').value) || 0;
  const basic = monthlyCTC / 2;
  const hra = basic / 2;
  const flexibleAllowance = hra;
  const employerPF = Number(document.getElementById('empEmployerPF').value) || 0;
  const employeePF = Number(document.getElementById('empEmployeePF').value) || 0;
  const provisionTax = Number(document.getElementById('empProfessionalTax').value) || 0;

  const gross = basic + hra + flexibleAllowance;
  const totalDeductions = employeePF + employerPF + provisionTax;
  const netPay = gross - totalDeductions;

  document.getElementById('empBasicSalary').value = basic.toFixed(2);
  document.getElementById('empHra').value = hra.toFixed(2);
  document.getElementById('empAllowances').value = flexibleAllowance.toFixed(2);
  document.getElementById('empDeductions').value = netPay.toFixed(2);
}

function setSelectOrOther(selectId, otherId, value) {
  const select = document.getElementById(selectId);
  const other = document.getElementById(otherId);
  const options = Array.from(select.options).map(o => o.value);
  if (value && options.includes(value)) {
    select.value = value;
    other.style.display = 'none';
    other.value = '';
  } else if (value) {
    select.value = '__other__';
    other.style.display = 'block';
    other.value = value;
  } else {
    select.value = '';
    other.style.display = 'none';
    other.value = '';
  }
}

async function openEmpModal(id) {
  const form = document.getElementById('empForm');
  form.reset();
  document.getElementById('empId').value = '';
  document.getElementById('empModalTitle').textContent = 'Add employee';
  document.getElementById('loginPasswordWrap').style.display = 'none';
  document.getElementById('loginFieldsWrap').style.display = 'block';
  document.getElementById('empJoinDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('empDeptOther').style.display = 'none';
  document.getElementById('empPositionOther').style.display = 'none';
  document.getElementById('empInactiveReasonWrap').style.display = 'none';
  document.getElementById('empInactiveReason').value = '';
  document.getElementById('empInactiveReasonOther').style.display = 'none';
  document.getElementById('empInactiveReasonOther').value = '';

  const managerSelect = document.getElementById('empManager');
  const managerOptions = CACHE.employees.filter(e => !id || e.id !== id);
  managerSelect.innerHTML = '<option value="">No manager assigned</option>' +
    managerOptions.map(e => `<option value="${e.id}">${escapeHtml(e.name)} (${escapeHtml(e.employeeCode || '')})</option>`).join('');

  if (id) {
    // Fetch this employee fresh from the server rather than trusting the
    // cached roster list, so the form is always seeded from the real,
    // complete saved record — never from a stale or partial snapshot.
    let emp;
    try {
      ({ employee: emp } = await api(`/employees/${id}`));
    } catch (err) {
      toast('Could not load employee details: ' + err.message, true);
      return;
    }
    document.getElementById('empId').value = emp.id;
    document.getElementById('empName').value = emp.name;
    document.getElementById('empEmail').value = emp.email;
    setSelectOrOther('empDept', 'empDeptOther', emp.department);
    setSelectOrOther('empPosition', 'empPositionOther', emp.position);
    document.getElementById('empPhone').value = emp.phone || '';
    document.getElementById('empJoinDate').value = emp.joinDate || '';
    document.getElementById('empStatus').value = emp.status;
    document.getElementById('empInactiveReasonWrap').style.display = emp.status === 'inactive' ? 'block' : 'none';
    setSelectOrOther('empInactiveReason', 'empInactiveReasonOther', emp.inactiveReason || '');
    document.getElementById('empManager').value = emp.managerId || '';
    document.getElementById('empUan').value = emp.uan || '';
    document.getElementById('empPfNumber').value = emp.pfNumber || '';
    document.getElementById('empLocation').value = emp.location || '';
    document.getElementById('empAnnualCTC').value = emp.annualCTC || 0;
    document.getElementById('empMonthlyCTC').value = emp.monthlyCTC || 0;
    document.getElementById('empHra').value = emp.hra || 0;
    document.getElementById('empEmployerPF').value = emp.employerPF || 0;
    document.getElementById('empEmployeePF').value = emp.employeePF || 0;
    document.getElementById('empProfessionalTax').value = emp.professionalTax || 0;
    document.getElementById('empBasicSalary').value = emp.basicSalary || 0;
    document.getElementById('empAllowances').value = emp.allowances || 0;
    document.getElementById('empDeductions').value = emp.deductions || 0;
    document.getElementById('empDob').value = emp.dob || '';
    document.getElementById('empGender').value = emp.gender || '';
    document.getElementById('empBloodGroup').value = emp.bloodGroup || '';
    document.getElementById('empAddress').value = emp.address || '';
    document.getElementById('empEmergencyName').value = emp.emergencyContactName || '';
    document.getElementById('empEmergencyRelation').value = emp.emergencyContactRelation || '';
    document.getElementById('empEmergencyPhone').value = emp.emergencyContactPhone || '';
    document.getElementById('empAadhaar').value = emp.aadhaarNumber || '';
    document.getElementById('empPan').value = emp.panNumber || '';
    document.getElementById('empPassport').value = emp.passportNumber || '';
    document.getElementById('empBankName').value = emp.bankName || '';
    document.getElementById('empBankAccount').value = emp.bankAccountNumber || '';
    document.getElementById('empBankIfsc').value = emp.bankIFSC || '';
    document.getElementById('empModalTitle').textContent = 'Edit employee — ' + (emp.employeeCode || '');
    // Login accounts for existing employees are managed from the roster table, not this form.
    document.getElementById('loginFieldsWrap').style.display = 'none';

    if (emp.profilePhoto) {
      document.getElementById('empPhotoPreview').src = emp.profilePhoto;
      document.getElementById('empPhotoPreviewWrap').style.display = 'block';
    } else {
      document.getElementById('empPhotoPreviewWrap').style.display = 'none';
    }
    renderExistingDocs(emp);
  } else {
    document.getElementById('empPhotoPreviewWrap').style.display = 'none';
    document.getElementById('empExistingDocs').innerHTML = '';
  }
  document.getElementById('empModal').classList.add('show');
}

function renderExistingDocs(emp) {
  const docs = emp.documents || [];
  const wrap = document.getElementById('empExistingDocs');
  if (docs.length === 0) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = docs.map(d => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; font-size:13px; gap:8px; flex-wrap:wrap;">
      <span>
        <a href="${d.dataUrl}" download="${escapeHtml(d.name)}">${escapeHtml(d.name)}</a>
        ${d.uploadedBy === 'employee' ? (d.status === 'pending'
          ? ' <span class="pill pill-pending">shared by employee · pending review</span>'
          : ' <span class="pill pill-approved">shared by employee · reviewed</span>') : ''}
      </span>
      <span style="display:flex; gap:6px;">
        ${d.uploadedBy === 'employee' && d.status === 'pending' ? `<button type="button" class="btn btn-ghost btn-sm" onclick="markEmployeeDocReviewed(${emp.id}, ${d.id})">Mark reviewed</button>` : ''}
        <button type="button" class="btn btn-danger btn-sm" onclick="deleteEmployeeDocument(${emp.id}, ${d.id})">Remove</button>
      </span>
    </div>
  `).join('');
}

async function markEmployeeDocReviewed(empId, docId) {
  try {
    await api(`/employees/${empId}/documents/${docId}`, { method: 'PUT', body: { status: 'reviewed' } });
    const { employees } = await api('/employees');
    CACHE.employees = employees;
    const emp = employees.find(e => e.id === empId);
    if (emp) renderExistingDocs(emp);
    toast('Marked as reviewed');
    if (VIEW === 'documents') renderDocuments();
  } catch (err) { toast(err.message, true); }
}

async function deleteEmployeeDocument(empId, docId) {
  if (!confirm('Remove this document?')) return;
  try {
    await api(`/employees/${empId}/documents/${docId}`, { method: 'DELETE' });
    const { employees } = await api('/employees');
    CACHE.employees = employees;
    const emp = employees.find(e => e.id === empId);
    if (emp) renderExistingDocs(emp);
    toast('Document removed');
    if (VIEW === 'documents') renderDocuments();
  } catch (err) { toast(err.message, true); }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function submitEmployee(e) {
  e.preventDefault();
  const id = document.getElementById('empId').value;

  const aadhaar = document.getElementById('empAadhaar').value.trim();
  if (aadhaar && !/^\d{12}$/.test(aadhaar)) {
    toast('Aadhaar number must be exactly 12 digits', true);
    return;
  }
  const pan = document.getElementById('empPan').value.trim().toUpperCase();
  if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
    toast('PAN number must be in the format AAAAA9999A', true);
    return;
  }
  const bankAccount = document.getElementById('empBankAccount').value.trim();
  if (bankAccount && !/^\d{6,20}$/.test(bankAccount)) {
    toast('Bank account number must be 6-20 digits', true);
    return;
  }
  const ifsc = document.getElementById('empBankIfsc').value.trim().toUpperCase();
  if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    toast('IFSC code must be in the format AAAA0999999', true);
    return;
  }
  const uan = document.getElementById('empUan').value.trim();
  if (uan && !/^\d{12}$/.test(uan)) {
    toast('UAN must be exactly 12 digits', true);
    return;
  }

  const deptSelect = document.getElementById('empDept').value;
  const department = deptSelect === '__other__' ? document.getElementById('empDeptOther').value.trim() : deptSelect;
  if (!department) { toast('Please select or enter a department', true); return; }

  const positionSelect = document.getElementById('empPosition').value;
  const position = positionSelect === '__other__' ? document.getElementById('empPositionOther').value.trim() : positionSelect;
  if (!position) { toast('Please select or enter a designation', true); return; }

  const payload = {
    name: document.getElementById('empName').value,
    email: document.getElementById('empEmail').value,
    department,
    position,
    phone: document.getElementById('empPhone').value,
    joinDate: document.getElementById('empJoinDate').value,
    status: document.getElementById('empStatus').value,
    inactiveReason: document.getElementById('empStatus').value === 'inactive'
      ? (document.getElementById('empInactiveReason').value === '__other__'
          ? document.getElementById('empInactiveReasonOther').value.trim()
          : document.getElementById('empInactiveReason').value)
      : '',
    managerId: document.getElementById('empManager').value,
    uan,
    pfNumber: document.getElementById('empPfNumber').value.trim(),
    location: document.getElementById('empLocation').value.trim(),
    annualCTC: document.getElementById('empAnnualCTC').value,
    monthlyCTC: document.getElementById('empMonthlyCTC').value,
    hra: document.getElementById('empHra').value,
    employerPF: document.getElementById('empEmployerPF').value,
    employeePF: document.getElementById('empEmployeePF').value,
    professionalTax: document.getElementById('empProfessionalTax').value,
    basicSalary: document.getElementById('empBasicSalary').value,
    allowances: document.getElementById('empAllowances').value,
    deductions: document.getElementById('empDeductions').value,
    dob: document.getElementById('empDob').value,
    gender: document.getElementById('empGender').value,
    bloodGroup: document.getElementById('empBloodGroup').value,
    address: document.getElementById('empAddress').value,
    emergencyContactName: document.getElementById('empEmergencyName').value,
    emergencyContactRelation: document.getElementById('empEmergencyRelation').value,
    emergencyContactPhone: document.getElementById('empEmergencyPhone').value,
    aadhaarNumber: aadhaar,
    panNumber: pan,
    passportNumber: document.getElementById('empPassport').value,
    bankName: document.getElementById('empBankName').value,
    bankAccountNumber: bankAccount,
    bankIFSC: ifsc
  };
  if (!id) {
    payload.createLogin = document.getElementById('empCreateLogin').checked;
    payload.password = document.getElementById('empLoginPassword').value;
    payload.role = document.getElementById('empLoginRole').value;
  }

  const photoFile = document.getElementById('empPhotoFile').files[0];
  if (photoFile) {
    try { payload.profilePhoto = await readFileAsDataUrl(photoFile); }
    catch (err) { toast('Could not read the selected photo', true); return; }
  }

  try {
    let savedEmployeeId = id ? Number(id) : null;
    if (id) {
      await api(`/employees/${id}`, { method: 'PUT', body: payload });
    } else {
      const { credentials, employee } = await api('/employees', { method: 'POST', body: payload });
      savedEmployeeId = employee.id;
      if (credentials) showCredentials(credentials, employee);
    }

    // Upload any newly selected documents, one at a time.
    const docFiles = Array.from(document.getElementById('empDocFiles').files || []);
    for (const file of docFiles) {
      const dataUrl = await readFileAsDataUrl(file);
      await api(`/employees/${savedEmployeeId}/documents`, { method: 'POST', body: { name: file.name, dataUrl } });
    }

    toast('Employee saved');
    closeModal('empModal');
    renderEmployees();
  } catch (err) { toast(err.message, true); }
}

async function createLoginFor(id) {
  const emp = CACHE.employees.find(e => e.id === id);
  document.getElementById('setPasswordEmpId').value = id;
  document.getElementById('setPasswordEmpName').textContent = emp ? `— ${emp.name}` : '';
  document.getElementById('setPasswordValue').value = '';
  document.getElementById('setPasswordRole').value = 'employee';
  document.getElementById('setPasswordModal').classList.add('show');
}

async function submitLoginPassword(e) {
  e.preventDefault();
  const id = document.getElementById('setPasswordEmpId').value;
  const password = document.getElementById('setPasswordValue').value;
  const role = document.getElementById('setPasswordRole').value;
  try {
    const { credentials } = await api(`/employees/${id}/create-login`, { method: 'POST', body: { password, role } });
    closeModal('setPasswordModal');
    const emp = CACHE.employees.find(e => e.id === Number(id));
    showCredentials(credentials, emp);
    renderEmployees();
  } catch (err) { toast(err.message, true); }
}

function showCredentials(credentials, employee) {
  document.getElementById('credsEmployeeId').textContent = (employee && employee.employeeCode) || '—';
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
    <div class="subtitle">Final HR approval — requires manager approval first.</div>
    <div class="panel">
      <div class="panel-header"><h2>All requests</h2></div>
      <div class="panel-body">
        ${leave.length === 0 ? emptyState('No leave requests yet') : renderTable(
          ['Employee', 'Type', 'Dates', 'Reason', 'Manager', 'HR decision', ''],
          leave.map(l => [
            escapeHtml(l.employeeName), escapeHtml(l.type),
            `${fmtDate(l.startDate)} – ${fmtDate(l.endDate)}`,
            `<span class="muted">${escapeHtml(l.reason || '—')}</span>`,
            pill(l.managerStatus),
            pill(l.hrStatus),
            l.hrStatus === 'pending'
              ? (l.managerStatus === 'approved'
                  ? `<span class="section-actions">
                      <button class="btn btn-primary btn-sm" onclick="setLeaveStatus(${l.id}, 'approved')">Approve</button>
                      <button class="btn btn-danger btn-sm" onclick="setLeaveStatus(${l.id}, 'rejected')">Decline</button>
                    </span>`
                  : `<span class="muted" style="font-size:12px;">Waiting on manager</span>`)
              : '<span class="muted">Resolved</span>'
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

/* ---------------- Timesheets (admin/HR view) ---------------- */
let TS_ADMIN_CACHE = [];

async function renderTimesheetsAdmin() {
  const { timesheets } = await api('/timesheets');
  TS_ADMIN_CACHE = timesheets;
  document.getElementById('main').innerHTML = `
    <h1>Timesheets</h1>
    <div class="subtitle">Weekly timesheets across the company, and their manager-approval status.</div>
    <div class="panel">
      <div class="panel-header"><h2>All timesheets</h2></div>
      <div class="panel-body">
        ${timesheets.length === 0 ? emptyState('No timesheets submitted yet') : renderTable(
          ['Employee', 'Week starting', 'Total hours', 'Status', 'Manager decision', ''],
          timesheets.map(t => [
            escapeHtml(t.employeeName), fmtDate(t.weekStarting), t.totalHours,
            pill(t.status),
            t.status === 'draft' ? '<span class="muted">—</span>'
              : `${pill(t.managerStatus)}${t.managerComment ? `<br><span class="muted" style="font-size:11px;">${escapeHtml(t.managerComment)}</span>` : ''}`,
            `<span class="section-actions">
              <button class="btn btn-ghost btn-sm" onclick="viewAdminTimesheet(${t.id})">View</button>
              ${t.status === 'submitted' ? `
                <button class="btn btn-primary btn-sm" onclick="adminDecideTimesheet(${t.id}, 'approved')">Approve</button>
                <button class="btn btn-danger btn-sm" onclick="adminDecideTimesheetPrompt(${t.id})">Decline</button>
              ` : ''}
            </span>`
          ])
        )}
      </div>
    </div>
  `;
}

function viewAdminTimesheet(id) {
  const ts = TS_ADMIN_CACHE.find(t => t.id === id);
  if (!ts) return;
  const rows = (ts.entries || []).map(e => `${fmtDate(e.date)}: ${e.project || '—'} / ${e.task || '—'} — ${e.hours}h`).join('\n');
  alert(`${ts.employeeName} — week of ${fmtDate(ts.weekStarting)}\n\n${rows || 'No entries'}\n\nTotal: ${ts.totalHours}h${ts.notes ? `\n\nNotes: ${ts.notes}` : ''}`);
}

async function adminDecideTimesheet(id, status, comment) {
  try {
    await api(`/timesheets/${id}/manager-status`, { method: 'PUT', body: { status, comment: comment || '' } });
    toast('Decision recorded');
    renderTimesheetsAdmin();
  } catch (err) { toast(err.message, true); }
}

function adminDecideTimesheetPrompt(id) {
  const comment = prompt('Reason for declining this timesheet (optional):') || '';
  adminDecideTimesheet(id, 'rejected', comment);
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

/* ---------------- Shared helper: populate employee dropdowns ---------------- */
async function populateEmployeeSelect(selectId) {
  if (!CACHE.employees || CACHE.employees.length === 0) {
    const { employees } = await api('/employees');
    CACHE.employees = employees;
  }
  const select = document.getElementById(selectId);
  select.innerHTML = CACHE.employees.map(e => `<option value="${e.id}">${escapeHtml(e.name)} — ${escapeHtml(e.position)}</option>`).join('');
}

function fmtMoney(n) {
  return '₹' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ---------------- Payslips ---------------- */
async function renderPayslips() {
  const { payslips } = await api('/payslips');
  document.getElementById('main').innerHTML = `
    <h1>Payslips</h1>
    <div class="subtitle">Generate and review monthly payslips for employees.</div>
    <div class="panel">
      <div class="panel-header">
        <h2>All payslips</h2>
        <span class="section-actions">
          <button class="btn btn-ghost btn-sm" onclick="openBulkPayslipModal()">Auto-generate for everyone</button>
          <button class="btn btn-primary btn-sm" onclick="openPayslipModal()">+ Generate payslip</button>
        </span>
      </div>
      <div class="panel-body">
        ${payslips.length === 0 ? emptyState('No payslips generated yet') : renderTable(
          ['Employee', 'Month', 'Gross earnings', 'Gross deductions', 'Net pay', ''],
          payslips.map(p => [
            escapeHtml(p.employeeName), escapeHtml(p.month),
            fmtMoney(p.grossEarnings ?? (Number(p.basic) + Number(p.allowances))), fmtMoney(p.grossDeductions ?? p.deductions),
            `<strong>${fmtMoney(p.netPay)}</strong>`,
            `<span class="section-actions">
              <button class="btn btn-ghost btn-sm" onclick="viewPayslip(${p.id})">View</button>
              <button class="btn btn-ghost btn-sm" onclick="downloadPayslip(${p.id})">Download</button>
              <button class="btn btn-danger btn-sm" onclick="deletePayslip(${p.id})">Delete</button>
            </span>`
          ])
        )}
      </div>
    </div>
  `;
}

async function openPayslipModal() {
  document.getElementById('payslipForm').reset();
  await populateEmployeeSelect('payslipEmployee');
  autoFillPayslipAmounts();
  recalcPayslipTotals();
  document.getElementById('payslipModal').classList.add('show');
}

function autoFillPayslipAmounts() {
  const empId = Number(document.getElementById('payslipEmployee').value);
  const emp = CACHE.employees.find(e => e.id === empId);
  if (!emp) return;
  document.getElementById('payslipBasic').value = emp.basicSalary || 0;
  document.getElementById('payslipHra').value = emp.hra || 0;
  document.getElementById('payslipFlexAllowance').value = emp.allowances || 0;
  document.getElementById('payslipPersonalAllowance').value = 0;
  document.getElementById('payslipOtherAllowance').value = 0;
  document.getElementById('payslipEmployeePF').value = emp.employeePF || 0;
  document.getElementById('payslipProvisionTax').value = emp.professionalTax || 0;
  document.getElementById('payslipOtherDeduction').value = 0;
  document.getElementById('payslipLopDays').value = 0;
  recalcPayslipTotals();
}

function recalcPayslipTotals() {
  const val = (id) => Number(document.getElementById(id).value) || 0;
  const gross = val('payslipBasic') + val('payslipHra') + val('payslipFlexAllowance') + val('payslipPersonalAllowance') + val('payslipOtherAllowance');
  const deductions = val('payslipEmployeePF') + val('payslipProvisionTax') + val('payslipOtherDeduction');
  document.getElementById('payslipGrossEarnings').textContent = fmtMoney(gross);
  document.getElementById('payslipGrossDeductions').textContent = fmtMoney(deductions);
  document.getElementById('payslipNetPay').textContent = fmtMoney(gross - deductions);
}

function openBulkPayslipModal() {
  document.getElementById('bulkPayslipForm').reset();
  document.getElementById('bulkPayslipModal').classList.add('show');
}

async function submitPayslip(e) {
  e.preventDefault();
  try {
    await api('/payslips', {
      method: 'POST',
      body: {
        employeeId: Number(document.getElementById('payslipEmployee').value),
        month: document.getElementById('payslipMonth').value,
        basic: document.getElementById('payslipBasic').value,
        hra: document.getElementById('payslipHra').value,
        flexibleAllowance: document.getElementById('payslipFlexAllowance').value,
        personalAllowance: document.getElementById('payslipPersonalAllowance').value,
        otherAllowance: document.getElementById('payslipOtherAllowance').value,
        employeePF: document.getElementById('payslipEmployeePF').value,
        provisionTax: document.getElementById('payslipProvisionTax').value,
        otherDeduction: document.getElementById('payslipOtherDeduction').value,
        lopDays: document.getElementById('payslipLopDays').value,
        note: document.getElementById('payslipNote').value
      }
    });
    toast('Payslip generated');
    closeModal('payslipModal');
    renderPayslips();
  } catch (err) { toast(err.message, true); }
}

async function deletePayslip(id) {
  if (!confirm('Delete this payslip?')) return;
  try {
    await api(`/payslips/${id}`, { method: 'DELETE' });
    toast('Payslip deleted');
    renderPayslips();
  } catch (err) { toast(err.message, true); }
}

async function submitBulkPayslip(e) {
  e.preventDefault();
  const month = document.getElementById('bulkPayslipMonth').value;
  try {
    const { generatedCount, skippedCount } = await api('/payslips/generate-all', { method: 'POST', body: { month } });
    closeModal('bulkPayslipModal');
    toast(`Generated ${generatedCount} payslip${generatedCount === 1 ? '' : 's'}${skippedCount ? `, skipped ${skippedCount} already generated` : ''}`);
    renderPayslips();
  } catch (err) { toast(err.message, true); }
}

/* ---------------- Form 16 ---------------- */
async function renderForm16() {
  const { formSixteens } = await api('/form16');
  document.getElementById('main').innerHTML = `
    <h1>Form 16</h1>
    <div class="subtitle">Annual tax statements on file for each employee.</div>
    <div class="panel">
      <div class="panel-header"><h2>All records</h2><button class="btn btn-primary btn-sm" onclick="openForm16Modal()">+ Add Form 16</button></div>
      <div class="panel-body">
        ${formSixteens.length === 0 ? emptyState('No Form 16 records yet') : renderTable(
          ['Employee', 'Financial year', 'Gross salary', 'Tax deducted', ''],
          formSixteens.map(f => [
            escapeHtml(f.employeeName), escapeHtml(f.financialYear),
            fmtMoney(f.grossSalary), fmtMoney(f.taxDeducted),
            `<button class="btn btn-danger btn-sm" onclick="deleteForm16(${f.id})">Delete</button>`
          ])
        )}
      </div>
    </div>
  `;
}

async function openForm16Modal() {
  document.getElementById('form16Form').reset();
  await populateEmployeeSelect('form16Employee');
  document.getElementById('form16Modal').classList.add('show');
}

async function submitForm16(e) {
  e.preventDefault();
  try {
    await api('/form16', {
      method: 'POST',
      body: {
        employeeId: Number(document.getElementById('form16Employee').value),
        financialYear: document.getElementById('form16Year').value,
        grossSalary: document.getElementById('form16Gross').value,
        taxDeducted: document.getElementById('form16Tax').value
      }
    });
    toast('Form 16 saved');
    closeModal('form16Modal');
    renderForm16();
  } catch (err) { toast(err.message, true); }
}

async function deleteForm16(id) {
  if (!confirm('Delete this Form 16 record?')) return;
  try {
    await api(`/form16/${id}`, { method: 'DELETE' });
    toast('Record deleted');
    renderForm16();
  } catch (err) { toast(err.message, true); }
}

/* ---------------- Performance ---------------- */
async function renderPerformance() {
  const { performance } = await api('/performance');
  document.getElementById('main').innerHTML = `
    <h1>Performance</h1>
    <div class="subtitle">Review history and feedback for each employee.</div>
    <div class="panel">
      <div class="panel-header"><h2>All reviews</h2><button class="btn btn-primary btn-sm" onclick="openPerformanceModal()">+ Add review</button></div>
      <div class="panel-body">
        ${performance.length === 0 ? emptyState('No performance reviews yet') : renderTable(
          ['Employee', 'Period', 'Rating', 'Feedback', ''],
          performance.map(p => [
            escapeHtml(p.employeeName), escapeHtml(p.period), pill(p.rating.toLowerCase().replace(/\s+/g, '-')),
            `<span class="muted">${escapeHtml(p.feedback || '—')}</span>`,
            `<button class="btn btn-danger btn-sm" onclick="deletePerformance(${p.id})">Delete</button>`
          ])
        )}
      </div>
    </div>
  `;
}

async function openPerformanceModal() {
  document.getElementById('performanceForm').reset();
  await populateEmployeeSelect('perfEmployee');
  document.getElementById('performanceModal').classList.add('show');
}

async function submitPerformance(e) {
  e.preventDefault();
  try {
    await api('/performance', {
      method: 'POST',
      body: {
        employeeId: Number(document.getElementById('perfEmployee').value),
        period: document.getElementById('perfPeriod').value,
        rating: document.getElementById('perfRating').value,
        goals: document.getElementById('perfGoals').value,
        feedback: document.getElementById('perfFeedback').value
      }
    });
    toast('Review saved');
    closeModal('performanceModal');
    renderPerformance();
  } catch (err) { toast(err.message, true); }
}

async function deletePerformance(id) {
  if (!confirm('Delete this review?')) return;
  try {
    await api(`/performance/${id}`, { method: 'DELETE' });
    toast('Review deleted');
    renderPerformance();
  } catch (err) { toast(err.message, true); }
}

/* ---------------- Tasks ---------------- */
async function renderTasks() {
  const { tasks } = await api('/tasks');
  document.getElementById('main').innerHTML = `
    <h1>Tasks</h1>
    <div class="subtitle">Assign and track to-dos for employees.</div>
    <div class="panel">
      <div class="panel-header"><h2>All tasks</h2><button class="btn btn-primary btn-sm" onclick="openTaskModal()">+ Assign task</button></div>
      <div class="panel-body">
        ${tasks.length === 0 ? emptyState('No tasks yet') : renderTable(
          ['Employee', 'Title', 'Due', 'Status', ''],
          tasks.map(t => [
            escapeHtml(t.employeeName), escapeHtml(t.title), t.dueDate ? fmtDate(t.dueDate) : '—', pill(t.status),
            `<span class="section-actions">
              <select style="margin:0; width:auto; padding:5px 8px; font-size:12px;" onchange="updateTaskStatus(${t.id}, this.value)">
                ${['pending', 'in-progress', 'done'].map(s => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
              <button class="btn btn-danger btn-sm" onclick="deleteTask(${t.id})">Delete</button>
            </span>`
          ])
        )}
      </div>
    </div>
  `;
}
async function openTaskModal() {
  document.getElementById('taskForm').reset();
  await populateEmployeeSelect('taskEmployee');
  document.getElementById('taskModal').classList.add('show');
}
async function submitTask(e) {
  e.preventDefault();
  try {
    await api('/tasks', { method: 'POST', body: {
      employeeId: Number(document.getElementById('taskEmployee').value),
      title: document.getElementById('taskTitle').value,
      description: document.getElementById('taskDescription').value,
      dueDate: document.getElementById('taskDueDate').value
    }});
    toast('Task assigned');
    closeModal('taskModal');
    renderTasks();
  } catch (err) { toast(err.message, true); }
}
async function updateTaskStatus(id, status) {
  try { await api(`/tasks/${id}/status`, { method: 'PUT', body: { status } }); toast('Task updated'); }
  catch (err) { toast(err.message, true); }
}
async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  try { await api(`/tasks/${id}`, { method: 'DELETE' }); toast('Task deleted'); renderTasks(); }
  catch (err) { toast(err.message, true); }
}

/* ---------------- Documents ---------------- */
async function renderDocuments() {
  const [{ documents }, sharedDrive, { employees }] = await Promise.all([
    api('/documents'),
    api('/documents/shared-drive').catch(() => ({ link: '', label: '' })),
    api('/employees')
  ]);
  CACHE.employees = employees;
  const shared = [];
  employees.forEach(emp => {
    (emp.documents || []).filter(d => d.uploadedBy === 'employee').forEach(d => shared.push({ emp, doc: d }));
  });
  shared.sort((a, b) => new Date(b.doc.uploadedDate) - new Date(a.doc.uploadedDate));
  const pendingCount = shared.filter(s => s.doc.status === 'pending').length;
  document.getElementById('main').innerHTML = `
    <h1>Documents</h1>
    <div class="subtitle">Company document library visible to all employees.</div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-header"><h2>Company shared drive</h2></div>
      <div class="panel-body">
        <div class="muted" style="margin-bottom:10px;">Set a link to your company's shared folder (SharePoint, Google Drive, OneDrive, etc.) where staff can upload and access shared files. This link is shown to every employee.</div>
        <form id="sharedDriveForm" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
          <div style="flex:2; min-width:220px;">
            <label for="sharedDriveLink">Shared drive link</label>
            <input id="sharedDriveLink" placeholder="https://yourcompany.sharepoint.com/sites/hr" value="${escapeHtml(sharedDrive.link || '')}">
          </div>
          <div style="flex:1; min-width:160px;">
            <label for="sharedDriveLabel">Display name (optional)</label>
            <input id="sharedDriveLabel" placeholder="Novanest Shared Drive" value="${escapeHtml(sharedDrive.label || '')}">
          </div>
          <button class="btn btn-primary btn-sm" type="submit">Save link</button>
          ${sharedDrive.link ? `<a class="btn btn-ghost btn-sm" href="${escapeHtml(sharedDrive.link)}" target="_blank" rel="noopener">Open ↗</a>` : ''}
        </form>
      </div>
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-header"><h2>Shared by employees${pendingCount > 0 ? ` <span class="pill pill-pending">${pendingCount} pending</span>` : ''}</h2></div>
      <div class="panel-body">
        ${shared.length === 0 ? emptyState('No documents shared by employees yet') : renderTable(
          ['Employee', 'Document', 'Shared', 'Status', ''],
          shared.map(({ emp, doc }) => [
            escapeHtml(emp.name || ''),
            `<a href="${doc.dataUrl}" download="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</a>`,
            fmtDate(doc.uploadedDate),
            doc.status === 'pending' ? '<span class="pill pill-pending">pending review</span>' : '<span class="pill pill-approved">reviewed</span>',
            `${doc.status === 'pending' ? `<button class="btn btn-ghost btn-sm" onclick="markEmployeeDocReviewed(${emp.id}, ${doc.id})">Mark reviewed</button> ` : ''}<button class="btn btn-danger btn-sm" onclick="deleteEmployeeDocument(${emp.id}, ${doc.id})">Remove</button>`
          ])
        )}
      </div>
    </div>
    <div class="panel">
      <div class="panel-header"><h2>All documents</h2><button class="btn btn-primary btn-sm" onclick="document.getElementById('documentForm').reset(); document.getElementById('documentModal').classList.add('show');">+ Add document</button></div>
      <div class="panel-body">
        ${documents.length === 0 ? emptyState('No documents yet') : renderTable(
          ['Title', 'Category', 'Added', ''],
          documents.map(d => [
            `${escapeHtml(d.title)}${d.description ? '<br><span class="muted">' + escapeHtml(d.description) + '</span>' : ''}${d.link ? `<br><a href="${escapeHtml(d.link)}" target="_blank" style="font-size:12px;">${escapeHtml(d.link)}</a>` : ''}`,
            escapeHtml(d.category), fmtDate(d.uploadedDate),
            `<button class="btn btn-danger btn-sm" onclick="deleteDocument(${d.id})">Delete</button>`
          ])
        )}
      </div>
    </div>
  `;
  document.getElementById('sharedDriveForm').addEventListener('submit', submitSharedDrive);
}
async function submitSharedDrive(e) {
  e.preventDefault();
  try {
    await api('/documents/shared-drive', { method: 'PUT', body: {
      link: document.getElementById('sharedDriveLink').value,
      label: document.getElementById('sharedDriveLabel').value
    }});
    toast('Shared drive link saved');
    renderDocuments();
  } catch (err) { toast(err.message, true); }
}
async function submitDocument(e) {
  e.preventDefault();
  try {
    await api('/documents', { method: 'POST', body: {
      title: document.getElementById('docTitle').value,
      category: document.getElementById('docCategory').value,
      description: document.getElementById('docDescription').value,
      link: document.getElementById('docLink').value
    }});
    toast('Document added');
    closeModal('documentModal');
    renderDocuments();
  } catch (err) { toast(err.message, true); }
}
async function deleteDocument(id) {
  if (!confirm('Delete this document?')) return;
  try { await api(`/documents/${id}`, { method: 'DELETE' }); toast('Document deleted'); renderDocuments(); }
  catch (err) { toast(err.message, true); }
}

/* ---------------- Assets ---------------- */
async function renderAssets() {
  const { assets } = await api('/assets');
  document.getElementById('main').innerHTML = `
    <h1>Assets</h1>
    <div class="subtitle">Equipment issued to employees.</div>
    <div class="panel">
      <div class="panel-header"><h2>All assets</h2><button class="btn btn-primary btn-sm" onclick="openAssetModal()">+ Assign asset</button></div>
      <div class="panel-body">
        ${assets.length === 0 ? emptyState('No assets assigned yet') : renderTable(
          ['Employee', 'Asset', 'Type', 'Serial #', 'Status', ''],
          assets.map(a => [
            escapeHtml(a.employeeName), escapeHtml(a.assetName), escapeHtml(a.assetType), escapeHtml(a.serialNumber || '—'), pill(a.status),
            a.status === 'assigned' ? `<span class="section-actions">
              <button class="btn btn-ghost btn-sm" onclick="returnAsset(${a.id})">Mark returned</button>
              <button class="btn btn-danger btn-sm" onclick="deleteAsset(${a.id})">Delete</button>
            </span>` : `<button class="btn btn-danger btn-sm" onclick="deleteAsset(${a.id})">Delete</button>`
          ])
        )}
      </div>
    </div>
  `;
}
async function openAssetModal() {
  document.getElementById('assetForm').reset();
  await populateEmployeeSelect('assetEmployee');
  document.getElementById('assetModal').classList.add('show');
}
async function submitAsset(e) {
  e.preventDefault();
  try {
    await api('/assets', { method: 'POST', body: {
      employeeId: Number(document.getElementById('assetEmployee').value),
      assetName: document.getElementById('assetName').value,
      assetType: document.getElementById('assetType').value,
      serialNumber: document.getElementById('assetSerial').value
    }});
    toast('Asset assigned');
    closeModal('assetModal');
    renderAssets();
  } catch (err) { toast(err.message, true); }
}
async function returnAsset(id) {
  try { await api(`/assets/${id}/return`, { method: 'PUT' }); toast('Marked returned'); renderAssets(); }
  catch (err) { toast(err.message, true); }
}
async function deleteAsset(id) {
  if (!confirm('Delete this asset record?')) return;
  try { await api(`/assets/${id}`, { method: 'DELETE' }); toast('Asset deleted'); renderAssets(); }
  catch (err) { toast(err.message, true); }
}

/* ---------------- Cases ---------------- */
async function renderCases() {
  const { cases } = await api('/cases');
  document.getElementById('main').innerHTML = `
    <h1>Cases</h1>
    <div class="subtitle">Support requests raised by employees.</div>
    <div class="panel">
      <div class="panel-header"><h2>All cases</h2></div>
      <div class="panel-body">
        ${cases.length === 0 ? emptyState('No cases raised yet') : renderTable(
          ['Employee', 'Subject', 'Raised', 'Status', ''],
          cases.map(c => [
            escapeHtml(c.employeeName),
            `${escapeHtml(c.subject)}${c.description ? '<br><span class="muted">' + escapeHtml(c.description) + '</span>' : ''}${c.response ? '<br><span class="muted"><strong>Response:</strong> ' + escapeHtml(c.response) + '</span>' : ''}`,
            fmtDate(c.createdDate), pill(c.status),
            `<button class="btn btn-ghost btn-sm" onclick="openCaseModal(${c.id})">Respond</button>`
          ])
        )}
      </div>
    </div>
  `;
  CACHE.cases = cases;
}
function openCaseModal(id) {
  const c = CACHE.cases.find(x => x.id === id);
  document.getElementById('caseId').value = id;
  document.getElementById('caseStatus').value = c.status;
  document.getElementById('caseResponse').value = c.response || '';
  document.getElementById('caseModal').classList.add('show');
}
async function submitCaseResponse(e) {
  e.preventDefault();
  const id = document.getElementById('caseId').value;
  try {
    await api(`/cases/${id}`, { method: 'PUT', body: {
      status: document.getElementById('caseStatus').value,
      response: document.getElementById('caseResponse').value
    }});
    toast('Case updated');
    closeModal('caseModal');
    renderCases();
  } catch (err) { toast(err.message, true); }
}

/* ---------------- Surveys ---------------- */
async function renderSurveys() {
  const { surveys } = await api('/surveys');
  document.getElementById('main').innerHTML = `
    <h1>Surveys</h1>
    <div class="subtitle">Quick polls sent to employees.</div>
    <div class="panel">
      <div class="panel-header"><h2>All surveys</h2><button class="btn btn-primary btn-sm" onclick="document.getElementById('surveyForm').reset(); document.getElementById('surveyModal').classList.add('show');">+ Create survey</button></div>
      <div class="panel-body">
        ${surveys.length === 0 ? emptyState('No surveys yet') : surveys.map(s => `
          <div style="padding: 14px 0; border-bottom: 1px solid var(--line);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong>${escapeHtml(s.question)}</strong>
              <button class="btn btn-danger btn-sm" onclick="deleteSurvey(${s.id})">Delete</button>
            </div>
            <div class="muted" style="font-size:12.5px; margin: 6px 0;">${s.responseCount} response${s.responseCount === 1 ? '' : 's'}</div>
            ${s.options.map(o => `<div style="font-size:13px; margin-bottom:3px;">${escapeHtml(o)} — <span class="timestamp">${s.tally[o] || 0}</span></div>`).join('')}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
async function submitSurvey(e) {
  e.preventDefault();
  const options = document.getElementById('surveyOptions').value.split('\n').map(s => s.trim()).filter(Boolean);
  try {
    await api('/surveys', { method: 'POST', body: { question: document.getElementById('surveyQuestion').value, options } });
    toast('Survey created');
    closeModal('surveyModal');
    renderSurveys();
  } catch (err) { toast(err.message, true); }
}
async function deleteSurvey(id) {
  if (!confirm('Delete this survey?')) return;
  try { await api(`/surveys/${id}`, { method: 'DELETE' }); toast('Survey deleted'); renderSurveys(); }
  catch (err) { toast(err.message, true); }
}

/* ---------------- Knowledge base ---------------- */
async function renderKnowledgeBase() {
  const { articles } = await api('/knowledgebase');
  document.getElementById('main').innerHTML = `
    <h1>Knowledge base</h1>
    <div class="subtitle">Articles and FAQs for employees.</div>
    <div class="panel">
      <div class="panel-header"><h2>All articles</h2><button class="btn btn-primary btn-sm" onclick="document.getElementById('kbForm').reset(); document.getElementById('kbModal').classList.add('show');">+ Publish article</button></div>
      <div class="panel-body">
        ${articles.length === 0 ? emptyState('No articles yet') : articles.map(a => `
          <div style="padding: 14px 0; border-bottom: 1px solid var(--line);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <strong>${escapeHtml(a.title)}</strong>
              <button class="btn btn-danger btn-sm" onclick="deleteKb(${a.id})">Delete</button>
            </div>
            <div class="muted" style="font-size:12px; margin-bottom:6px;">${escapeHtml(a.category)} — ${fmtDate(a.publishedDate)}</div>
            <div style="font-size:13.5px; white-space: pre-wrap;">${escapeHtml(a.content)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
async function submitKb(e) {
  e.preventDefault();
  try {
    await api('/knowledgebase', { method: 'POST', body: {
      title: document.getElementById('kbTitle').value,
      category: document.getElementById('kbCategory').value,
      content: document.getElementById('kbContent').value
    }});
    toast('Article published');
    closeModal('kbModal');
    renderKnowledgeBase();
  } catch (err) { toast(err.message, true); }
}
async function deleteKb(id) {
  if (!confirm('Delete this article?')) return;
  try { await api(`/knowledgebase/${id}`, { method: 'DELETE' }); toast('Article deleted'); renderKnowledgeBase(); }
  catch (err) { toast(err.message, true); }
}

/* ---------------- Workflows ---------------- */
async function renderWorkflows() {
  const { workflows } = await api('/workflows');
  document.getElementById('main').innerHTML = `
    <h1>Workflows</h1>
    <div class="subtitle">Onboarding and process checklists assigned to employees.</div>
    <div class="panel">
      <div class="panel-header"><h2>All checklists</h2><button class="btn btn-primary btn-sm" onclick="openWorkflowModal()">+ Assign checklist</button></div>
      <div class="panel-body">
        ${workflows.length === 0 ? emptyState('No checklists yet') : workflows.map(w => {
          const doneCount = w.steps.filter(s => s.done).length;
          return `
          <div style="padding: 14px 0; border-bottom: 1px solid var(--line);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <strong>${escapeHtml(w.name)}</strong> <span class="muted" style="font-size:12.5px;">— ${escapeHtml(w.employeeName)}</span>
              <button class="btn btn-danger btn-sm" onclick="deleteWorkflow(${w.id})">Delete</button>
            </div>
            <div class="muted" style="font-size:12px; margin-bottom:6px;">${doneCount}/${w.steps.length} complete</div>
            ${w.steps.map(s => `
              <label style="display:flex; align-items:center; gap:8px; font-weight:400; font-size:13.5px; margin-bottom:4px;">
                <input type="checkbox" style="width:auto; margin:0;" ${s.done ? 'checked' : ''} onchange="toggleWorkflowStep(${w.id}, ${s.id}, this.checked)">
                <span style="${s.done ? 'text-decoration: line-through; color: var(--ink-soft);' : ''}">${escapeHtml(s.label)}</span>
              </label>
            `).join('')}
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}
async function openWorkflowModal() {
  document.getElementById('workflowForm').reset();
  await populateEmployeeSelect('workflowEmployee');
  document.getElementById('workflowModal').classList.add('show');
}
async function submitWorkflow(e) {
  e.preventDefault();
  const steps = document.getElementById('workflowSteps').value.split('\n').map(s => s.trim()).filter(Boolean);
  try {
    await api('/workflows', { method: 'POST', body: {
      employeeId: Number(document.getElementById('workflowEmployee').value),
      name: document.getElementById('workflowName').value,
      steps
    }});
    toast('Checklist assigned');
    closeModal('workflowModal');
    renderWorkflows();
  } catch (err) { toast(err.message, true); }
}
async function toggleWorkflowStep(workflowId, stepId, done) {
  try { await api(`/workflows/${workflowId}/steps/${stepId}`, { method: 'PUT', body: { done } }); }
  catch (err) { toast(err.message, true); renderWorkflows(); }
}
async function deleteWorkflow(id) {
  if (!confirm('Delete this checklist?')) return;
  try { await api(`/workflows/${id}`, { method: 'DELETE' }); toast('Checklist deleted'); renderWorkflows(); }
  catch (err) { toast(err.message, true); }
}

/* ---------------- Reports ---------------- */
async function renderReports() {
  const [{ employees }, { jobs }, { applications }, { leave }, { cases }, { assets }] = await Promise.all([
    api('/employees'), api('/jobs?all=1'), api('/applications'), api('/leave'), api('/cases'), api('/assets')
  ]);
  const byDept = {};
  employees.forEach(e => { byDept[e.department] = (byDept[e.department] || 0) + 1; });
  const openCases = cases.filter(c => c.status !== 'resolved').length;
  const pendingLeave = leave.filter(l => l.status === 'pending').length;
  const assignedAssets = assets.filter(a => a.status === 'assigned').length;

  document.getElementById('main').innerHTML = `
    <h1>Reports</h1>
    <div class="subtitle">A quick snapshot across the organization.</div>
    <div class="stat-row">
      <div class="stat-card"><div class="num">${employees.length}</div><div class="label">Total employees</div></div>
      <div class="stat-card"><div class="num">${jobs.filter(j => j.status === 'open').length}</div><div class="label">Open positions</div></div>
      <div class="stat-card"><div class="num">${pendingLeave}</div><div class="label">Pending leave</div></div>
      <div class="stat-card"><div class="num">${openCases}</div><div class="label">Open cases</div></div>
    </div>
    <div class="filetab">Headcount by department</div>
    <div class="panel" style="border-top-left-radius:0; margin-bottom: 20px;">
      <div class="panel-body">
        ${Object.keys(byDept).length === 0 ? emptyState('No employees yet') : renderTable(
          ['Department', 'Headcount'],
          Object.entries(byDept).map(([dept, count]) => [escapeHtml(dept), count])
        )}
      </div>
    </div>
    <div class="filetab">Applications by status</div>
    <div class="panel" style="border-top-left-radius:0;">
      <div class="panel-body">
        ${applications.length === 0 ? emptyState('No applications yet') : renderTable(
          ['Status', 'Count'],
          ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'].map(s => [pill(s), applications.filter(a => a.status === s).length])
        )}
      </div>
    </div>
    <div class="mt-24 muted" style="font-size:12.5px;">${assignedAssets} asset${assignedAssets === 1 ? '' : 's'} currently assigned across the team.</div>
  `;
}

/* ---------------- Backups ---------------- */
function fmtBackupSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function fmtBackupDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString();
}

async function renderBackups() {
  const { backups } = await api('/backups');
  document.getElementById('main').innerHTML = `
    <h1>Backups</h1>
    <div class="subtitle">A snapshot of all data is saved automatically before every change. If anything ever goes wrong, restore from any point below.</div>
    <div class="panel">
      <div class="panel-header">
        <h2>Snapshots (${backups.length})</h2>
        <button class="btn btn-primary btn-sm" onclick="createBackupNow()">Back up now</button>
      </div>
      <div class="panel-body">
        ${backups.length === 0 ? emptyState('No backups yet — one is taken automatically the next time anything is saved.') : renderTable(
          ['Taken', 'Size', ''],
          backups.map(b => [
            fmtBackupDate(b.createdAt),
            fmtBackupSize(b.size),
            `<span class="section-actions">
              <a class="btn btn-ghost btn-sm" href="/api/backups/${encodeURIComponent(b.filename)}/download">Download</a>
              <button class="btn btn-danger btn-sm" onclick="restoreBackupNow('${b.filename}', '${fmtBackupDate(b.createdAt)}')">Restore</button>
            </span>`
          ])
        )}
      </div>
    </div>
  `;
}

async function createBackupNow() {
  try {
    await api('/backups', { method: 'POST' });
    toast('Backup created');
    renderBackups();
  } catch (err) { toast(err.message, true); }
}

async function restoreBackupNow(filename, whenLabel) {
  if (!confirm(`Restore all data to the snapshot from ${whenLabel}?\n\nAnything saved after that point will be replaced — though the current state is backed up first too, so this can be undone.`)) return;
  try {
    await api(`/backups/${encodeURIComponent(filename)}/restore`, { method: 'POST' });
    toast('Data restored. Reloading…');
    setTimeout(() => window.location.reload(), 800);
  } catch (err) { toast(err.message, true); }
}

init();
