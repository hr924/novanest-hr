let CURRENT_USER = null;

async function init() {
  CURRENT_USER = await requireSession(['employee', 'manager', 'admin']);
  if (!CURRENT_USER) return;
  const whoNameEl0 = document.getElementById('whoName');
  if (whoNameEl0) whoNameEl0.textContent = CURRENT_USER.name;
  const whoRoleEl0 = document.getElementById('whoRole');
  if (whoRoleEl0) whoRoleEl0.textContent = CURRENT_USER.role === 'manager' ? 'Manager' : 'Employee';
  if (CURRENT_USER.role === 'manager') {
    const teamLinkEl = document.getElementById('teamApprovalsLink');
    if (teamLinkEl) teamLinkEl.style.display = 'block';
  }

  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => switchView(link.dataset.view));
  });
  document.getElementById('logoutLink').addEventListener('click', async (e) => {
    e.preventDefault();
    await api('/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });
  document.getElementById('editAccountLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('myAccountForm').reset();
    document.getElementById('myAccountName').value = CURRENT_USER.name;
    const isEmployee = CURRENT_USER.role === 'employee';
    document.getElementById('myAccountPasswordWrap').style.display = isEmployee ? 'none' : 'block';
    document.getElementById('myAccountPasswordHint').style.display = isEmployee ? 'block' : 'none';
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
      const whoNameEl = document.getElementById('whoName');
      if (whoNameEl) whoNameEl.textContent = user.name;
      toast('Account updated');
      closeModal('myAccountModal');
    } catch (err) { toast(err.message, true); }
  });
  document.getElementById('leaveForm').addEventListener('submit', submitLeave);
  document.getElementById('caseForm').addEventListener('submit', submitCase);

  await switchView('dashboard');
}

async function switchView(view) {
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.toggle('active', l.dataset.view === view));
  const renderers = {
    dashboard: renderDashboard,
    profile: renderProfile, attendance: renderAttendance, leave: renderLeave,
    timesheets: renderTimesheets,
    payslips: renderPayslips, form16: renderForm16, performance: renderPerformance,
    tasks: renderTasks, documents: renderDocuments, assets: renderAssets,
    cases: renderCases, surveys: renderSurveys, knowledgebase: renderKnowledgeBase, workflows: renderWorkflows,
    teamApprovals: renderTeamApprovals
  };
  await renderers[view]();
  restoreFormDraft(view);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
function emptyState(msg) { return `<div class="empty-state"><div class="glyph">— · —</div>${msg}</div>`; }
function renderTable(headers, rows) {
  return `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/* ---------------- Dashboard ---------------- */
let OVERVIEW_CHARTS = { bar: null, donut: null };

async function renderDashboard() {
  const main = document.getElementById('main');
  const [attendanceRes, leaveRes, tasksRes, casesRes, timesheetsRes, payslipsRes, performanceRes, documentsRes, assetsRes, surveysRes, kbRes, workflowsRes] = await Promise.all([
    api('/attendance').catch(() => ({ attendance: [] })),
    api('/leave').catch(() => ({ leave: [] })),
    api('/tasks').catch(() => ({ tasks: [] })),
    api('/cases').catch(() => ({ cases: [] })),
    api('/timesheets').catch(() => ({ timesheets: [] })),
    api('/payslips').catch(() => ({ payslips: [] })),
    api('/performance').catch(() => ({ performance: [] })),
    api('/documents').catch(() => ({ documents: [] })),
    api('/assets').catch(() => ({ assets: [] })),
    api('/surveys').catch(() => ({ surveys: [] })),
    api('/knowledgebase').catch(() => ({ articles: [] })),
    api('/workflows').catch(() => ({ workflows: [] }))
  ]);
  const attendance = attendanceRes.attendance || [];
  const leave = leaveRes.leave || [];
  const tasks = tasksRes.tasks || [];
  const cases = casesRes.cases || [];
  const timesheets = timesheetsRes.timesheets || [];
  const payslips = payslipsRes.payslips || [];
  const performance = performanceRes.performance || [];
  const documents = documentsRes.documents || [];
  const assets = assetsRes.assets || [];
  const surveys = surveysRes.surveys || [];
  const kbArticles = kbRes.articles || [];
  const workflows = workflowsRes.workflows || [];

  const now = new Date();
  const monthPrefix = now.toISOString().slice(0, 7);
  const presentThisMonth = attendance.filter(a => a.date.startsWith(monthPrefix)).length;
  const pendingLeave = leave.filter(l => l.overallStatus === 'pending-manager' || l.overallStatus === 'pending-hr').length;
  const pendingTasks = tasks.filter(t => t.status !== 'done').length;
  const openCases = cases.filter(c => c.status !== 'resolved').length;
  const pendingTimesheets = timesheets.filter(t => t.status === 'draft' || t.status === 'submitted').length;
  const payslipThisMonth = payslips.some(p => p.month === monthPrefix);
  const myAssets = assets.filter(a => a.status === 'assigned').length;
  const activeSurveys = surveys.filter(s => s.status === 'active' || !s.status).length;

  // ---- Module status grid: quick snapshot of my own modules ----
  const MODULES = [
    { icon: 'profile', title: 'My profile', view: 'profile',
      status: 'View & update', tone: 'idle' },
    { icon: 'attendance', title: 'Attendance', view: 'attendance',
      status: `${presentThisMonth} days this month`, tone: 'good' },
    { icon: 'leave', title: 'Leave', view: 'leave',
      status: pendingLeave ? `${pendingLeave} pending` : 'Up to date', tone: pendingLeave ? 'warn' : 'good' },
    { icon: 'timesheets', title: 'Timesheets', view: 'timesheets',
      status: pendingTimesheets ? `${pendingTimesheets} pending` : 'Up to date', tone: pendingTimesheets ? 'warn' : 'good' },
    { icon: 'payslips', title: 'Payslips', view: 'payslips',
      status: payslipThisMonth ? 'Processed' : 'Not available yet', tone: payslipThisMonth ? 'good' : 'idle' },
    { icon: 'form16', title: 'Form 16', view: 'form16',
      status: 'Annual document', tone: 'idle' },
    { icon: 'performance', title: 'Performance', view: 'performance',
      status: performance.length ? `${performance.length} reviews` : 'No reviews yet', tone: performance.length ? 'good' : 'idle' },
    { icon: 'tasks', title: 'Tasks', view: 'tasks',
      status: pendingTasks ? `${pendingTasks} pending` : 'All done', tone: pendingTasks ? 'warn' : 'good' },
    { icon: 'documents', title: 'Documents', view: 'documents',
      status: `${documents.length} files`, tone: 'good' },
    { icon: 'assets', title: 'My Assets', view: 'assets',
      status: `${myAssets} assigned`, tone: 'good' },
    { icon: 'cases', title: 'Cases', view: 'cases',
      status: openCases ? `${openCases} open` : 'All resolved', tone: openCases ? 'warn' : 'good' },
    { icon: 'surveys', title: 'Surveys', view: 'surveys',
      status: activeSurveys ? `${activeSurveys} active` : 'No active surveys', tone: activeSurveys ? 'good' : 'idle' },
    { icon: 'knowledgebase', title: 'Knowledge base', view: 'knowledgebase',
      status: `${kbArticles.length} articles`, tone: 'good' },
    { icon: 'workflows', title: 'Checklists', view: 'workflows',
      status: `${workflows.length} active`, tone: workflows.length ? 'good' : 'idle' },
  ];
  const MODULE_TINTS = SIDEBAR_ICON_TINTS; // shared with the navbar so colors always match
  const checkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>';
  const warnSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16.5v.01"/></svg>';
  const moduleGridHtml = MODULES.map((m, i) => `
    <div class="module-card" data-view="${m.view}" onclick="switchView('${m.view}'); document.querySelectorAll('.sidebar-link').forEach(l=>l.classList.toggle('active', l.dataset.view==='${m.view}'));" style="cursor:pointer;">
      <div class="module-icon ${MODULE_TINTS[m.icon] || 'm-slate'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SIDEBAR_ICONS[m.icon] || SIDEBAR_ICON_DEFAULT}</svg></div>
      <div>
        <div class="module-title">${escapeHtml(m.title)}</div>
        <div class="module-status ${m.tone}">${escapeHtml(m.status)}</div>
      </div>
      <div class="module-badge ${m.tone === 'warn' ? 'warn' : 'good'}">${m.tone === 'warn' ? warnSvg : checkSvg}</div>
    </div>`).join('');

  const dow = now.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now); monday.setDate(now.getDate() + mondayOffset); monday.setHours(0, 0, 0, 0);
  const weekDays = [];
  for (let i = 0; i < 7; i++) { const d = new Date(monday); d.setDate(monday.getDate() + i); weekDays.push(d.toISOString().slice(0, 10)); }
  const weekLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekCounts = weekDays.map(ds => attendance.some(a => a.date === ds) ? 1 : 0);

  const leaveTypeColors = { Casual: '#03A9E7', Sick: '#2ED47A', Personal: '#184B76', Bereavement: '#FF9F6B', Other: '#F0506E' };
  const typeCounts = {};
  leave.forEach(l => { typeCounts[l.type] = (typeCounts[l.type] || 0) + 1; });
  const leaveTypes = Object.keys(typeCounts);
  const leaveTotal = leave.length;

  const activity = [];
  leave.slice(0, 3).forEach(l => activity.push({ text: `${l.type} leave request — ${l.overallStatus.replace('-', ' ')}`, date: l.requestedDate || l.startDate, icon: 'leave' }));
  tasks.slice(0, 3).forEach(t => activity.push({ text: `Task assigned: ${t.title}`, date: t.assignedDate || t.dueDate, icon: 'tasks' }));
  attendance.slice(0, 2).forEach(a => activity.push({ text: `Checked in — ${fmtDate(a.date)}`, date: a.date, icon: 'attendance' }));
  activity.sort((a, b) => new Date(b.date) - new Date(a.date));
  const activityHtml = activity.slice(0, 6).map(a => `
    <div class="activity-item">
      <div class="a-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SIDEBAR_ICONS[a.icon] || SIDEBAR_ICON_DEFAULT}</svg></div>
      <div><div class="a-text">${escapeHtml(a.text)}</div><div class="a-time">${fmtDate(a.date)}</div></div>
    </div>`).join('') || emptyState('No recent activity yet');

  main.innerHTML = `
    <div class="main-head">
      <div><h1>Dashboard</h1><div class="subtitle">Welcome back, ${escapeHtml((CURRENT_USER.name || '').split(' ')[0] || '')}.</div></div>
      <div class="head-action"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z"/></svg></div>
    </div>

    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-top"><div class="stat-icon i-green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SIDEBAR_ICONS.attendance}</svg></div></div>
        <div class="num">${presentThisMonth}</div><div class="label">Present Days (This Month)</div>
      </div>
      <div class="stat-card">
        <div class="stat-top"><div class="stat-icon i-orange"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SIDEBAR_ICONS.leave}</svg></div></div>
        <div class="num">${pendingLeave}</div><div class="label">Leave Requests Pending</div>
      </div>
      <div class="stat-card">
        <div class="stat-top"><div class="stat-icon i-purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SIDEBAR_ICONS.tasks}</svg></div></div>
        <div class="num">${pendingTasks}</div><div class="label">Tasks Pending</div>
      </div>
      <div class="stat-card">
        <div class="stat-top"><div class="stat-icon i-blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SIDEBAR_ICONS.cases}</svg></div></div>
        <div class="num">${openCases}</div><div class="label">Open Cases</div>
      </div>
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
          ${leaveTypes.length === 0 ? `<div class="muted" style="font-size:12.5px; text-align:center;">No leave requests yet</div>` : leaveTypes.map(t => `
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
        <button class="btn-ai" onclick="switchView('knowledgebase');">Ask Now →</button>
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
      data: { labels: weekLabels, datasets: [{ data: weekCounts, backgroundColor: '#03A9E7', borderRadius: 6, maxBarThickness: 34 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#ECEBF6' }, ticks: { color: '#8D8BA7', font: { size: 11 }, stepSize: 1 } },
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

/* ---------------- Profile ---------------- */
async function renderProfile() {
  const main = document.getElementById('main');
  try {
    const { employee } = await api('/employees/me');
    const row = (label, value) => `<tr><td class="muted" style="width:180px;">${label}</td><td>${value}</td></tr>`;
    main.innerHTML = `
      <h1>My profile</h1>
      <div class="subtitle">Your employment record on file.</div>
      <div class="panel" style="margin-bottom:20px;"><div class="panel-body">
        ${employee.profilePhoto ? `<img src="${employee.profilePhoto}" style="width:72px; height:72px; border-radius:50%; object-fit:cover; margin-bottom:16px; border:1px solid var(--line);">` : ''}
        <table>
          ${row('Employee ID', `<span class="timestamp">${escapeHtml(employee.employeeCode || '—')}</span>`)}
          ${row('Full name', escapeHtml(employee.name))}
          ${row('Email', escapeHtml(employee.email))}
          ${row('Phone', escapeHtml(employee.phone || '—'))}
          ${row('Department', escapeHtml(employee.department))}
          ${row('Designation', escapeHtml(employee.position))}
          ${row('Joined', fmtDate(employee.joinDate))}
          ${row('Status', pill(employee.status) + (employee.status === 'inactive' && employee.inactiveReason ? ` <span class="muted">(${escapeHtml(employee.inactiveReason)})</span>` : ''))}
        </table>
      </div></div>

      <div class="filetab">Personal information</div>
      <div class="panel" style="border-top-left-radius:0; margin-bottom:20px;"><div class="panel-body">
        <table>
          ${row('Date of birth', employee.dob ? fmtDate(employee.dob) : '—')}
          ${row('Gender', escapeHtml(employee.gender || '—'))}
          ${row('Blood group', escapeHtml(employee.bloodGroup || '—'))}
          ${row('Address', escapeHtml(employee.address || '—'))}
        </table>
      </div></div>

      <div class="filetab">Emergency contact</div>
      <div class="panel" style="border-top-left-radius:0; margin-bottom:20px;"><div class="panel-body">
        <table>
          ${row('Name', escapeHtml(employee.emergencyContactName || '—'))}
          ${row('Relationship', escapeHtml(employee.emergencyContactRelation || '—'))}
          ${row('Phone', escapeHtml(employee.emergencyContactPhone || '—'))}
        </table>
      </div></div>

      <div class="filetab">ID documents</div>
      <div class="panel" style="border-top-left-radius:0; margin-bottom:20px;"><div class="panel-body">
        <table>
          ${row('Aadhaar number', escapeHtml(employee.aadhaarNumber || '—'))}
          ${row('PAN number', escapeHtml(employee.panNumber || '—'))}
          ${row('Passport number', escapeHtml(employee.passportNumber || '—'))}
        </table>
      </div></div>

      <div class="filetab">Bank details</div>
      <div class="panel" style="border-top-left-radius:0; margin-bottom:20px;"><div class="panel-body">
        <table>
          ${row('Bank name', escapeHtml(employee.bankName || '—'))}
          ${row('Account number', escapeHtml(employee.bankAccountNumber || '—'))}
          ${row('IFSC code', escapeHtml(employee.bankIFSC || '—'))}
        </table>
      </div></div>

      <div class="filetab">Documents</div>
      <div class="panel" style="border-top-left-radius:0;"><div class="panel-body">
        ${(employee.documents || []).length === 0 ? emptyState('No documents uploaded yet') : (employee.documents || []).map(d => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--line); font-size:13.5px;">
            <a href="${d.dataUrl}" download="${escapeHtml(d.name)}">${escapeHtml(d.name)}</a>
            <span class="timestamp" style="font-size:11px;">${fmtDate(d.uploadedDate)}</span>
          </div>
        `).join('')}
      </div></div>
    `;
  } catch (err) {
    main.innerHTML = `<h1>My profile</h1><div class="panel"><div class="panel-body">${emptyState('No employee profile is linked to this account yet. Contact HR.')}</div></div>`;
  }
}

/* ---------------- Attendance ---------------- */
async function renderAttendance() {
  const { attendance } = await api('/attendance');
  const today = new Date().toISOString().slice(0, 10);
  const todayRecord = attendance.find(a => a.date === today);

  document.getElementById('main').innerHTML = `
    <h1>Attendance</h1>
    <div class="subtitle">Check in and out, and review your history.</div>
    <div class="panel" style="margin-bottom: 20px;">
      <div class="panel-body" style="display:flex; align-items:center; justify-content:space-between; gap: 16px; flex-wrap: wrap;">
        <div>
          <div class="muted" style="font-size:12.5px;">Today, ${fmtDate(new Date().toISOString())}</div>
          <div style="font-family: var(--font-mono); font-size: 14px; margin-top:4px;">
            In: ${todayRecord ? fmtTime(todayRecord.checkIn) : '—'} &nbsp;·&nbsp; Out: ${todayRecord && todayRecord.checkOut ? fmtTime(todayRecord.checkOut) : '—'}
          </div>
        </div>
        <div class="section-actions">
          <button class="btn btn-primary btn-sm" id="checkinBtn" ${todayRecord ? 'disabled' : ''}>Check in</button>
          <button class="btn btn-ghost btn-sm" id="checkoutBtn" ${(!todayRecord || todayRecord.checkOut) ? 'disabled' : ''}>Check out</button>
        </div>
      </div>
    </div>
    <div class="filetab">History</div>
    <div class="panel" style="border-top-left-radius:0;">
      <div class="panel-body">
        ${attendance.length === 0 ? emptyState('No attendance records yet') : renderTable(
          ['Date', 'Check in', 'Check out', 'Status'],
          attendance.map(a => [fmtDate(a.date), `<span class="timestamp">${fmtTime(a.checkIn)}</span>`, `<span class="timestamp">${a.checkOut ? fmtTime(a.checkOut) : '—'}</span>`, pill(a.status)])
        )}
      </div>
    </div>
  `;

  document.getElementById('checkinBtn').addEventListener('click', async () => {
    try { await api('/attendance/checkin', { method: 'POST' }); toast('Checked in'); renderAttendance(); }
    catch (err) { toast(err.message, true); }
  });
  document.getElementById('checkoutBtn').addEventListener('click', async () => {
    try { await api('/attendance/checkout', { method: 'POST' }); toast('Checked out'); renderAttendance(); }
    catch (err) { toast(err.message, true); }
  });
}

/* ---------------- Leave ---------------- */
async function renderLeave() {
  const [{ leave }, balanceRes] = await Promise.all([
    api('/leave'),
    api(`/leave/balance?year=${new Date().getFullYear()}`).catch(() => ({ balance: null }))
  ]);
  const b = balanceRes.balance;
  document.getElementById('main').innerHTML = `
    <h1>Leave requests</h1>
    <div class="subtitle">Submit time-off requests and track their status.</div>
    ${b ? `
    <div class="stat-row" style="grid-template-columns: repeat(3, 1fr); margin-bottom:20px;">
      <div class="stat-card">
        <div class="num">${b.casualUsed}<span style="font-size:15px; color:var(--ink-soft); font-weight:500;"> / ${b.casualEntitlement}</span></div>
        <div class="label">Casual leave used (${b.year})</div>
      </div>
      <div class="stat-card">
        <div class="num">${b.sickUsed}<span style="font-size:15px; color:var(--ink-soft); font-weight:500;"> / ${b.sickEntitlement}</span></div>
        <div class="label">Sick leave used (${b.year})</div>
      </div>
      <div class="stat-card">
        <div class="num" style="color:${b.lopDaysYtd > 0 ? 'var(--rust)' : 'var(--ink)'};">${b.remaining}</div>
        <div class="label">Days remaining${b.lopDaysYtd > 0 ? ` · ${b.lopDaysYtd} day(s) went to Loss of Pay` : ''}</div>
      </div>
    </div>
    <div class="subtitle" style="margin-top:-10px;">Casual + Sick leave together give you 24 paid days a year. Public holidays don't count against this. Anything beyond 24 is deducted from salary as Loss of Pay.</div>
    ` : ''}
    <div class="panel">
      <div class="panel-header"><h2>My requests</h2><button class="btn btn-primary btn-sm" onclick="document.getElementById('leaveModal').classList.add('show')">+ Request leave</button></div>
      <div class="panel-body">
        ${leave.length === 0 ? emptyState('No leave requests yet') : renderTable(
          ['Type', 'Dates', 'Reason', 'Manager', 'HR', 'Overall'],
          leave.map(l => [
            escapeHtml(l.type), `${fmtDate(l.startDate)} – ${fmtDate(l.endDate)}`,
            `<span class="muted">${escapeHtml(l.reason || '—')}</span>`,
            pill(l.managerStatus), pill(l.hrStatus), pill(l.overallStatus)
          ])
        )}
      </div>
    </div>
  `;
}

async function submitLeave(e) {
  e.preventDefault();
  try {
    await api('/leave', {
      method: 'POST',
      body: {
        type: document.getElementById('leaveType').value,
        startDate: document.getElementById('leaveStart').value,
        endDate: document.getElementById('leaveEnd').value,
        reason: document.getElementById('leaveReason').value
      }
    });
    toast('Leave request submitted');
    closeModal('leaveModal');
    document.getElementById('leaveForm').reset();
    renderLeave();
  } catch (err) { toast(err.message, true); }
}

/* ---------------- Timesheets ---------------- */
let TS_CACHE = [];

async function renderTimesheets() {
  const { timesheets } = await api('/timesheets');
  TS_CACHE = timesheets;
  document.getElementById('main').innerHTML = `
    <h1>Timesheets</h1>
    <div class="subtitle">Fill your weekly timesheet and track manager approval.</div>
    <div class="panel">
      <div class="panel-header"><h2>Your timesheets</h2><button class="btn btn-primary btn-sm" onclick="openTimesheetModal()">+ Fill timesheet</button></div>
      <div class="panel-body">
        ${timesheets.length === 0 ? emptyState('No timesheets yet') : renderTable(
          ['Week starting', 'Working hours', 'Leave/Holiday', 'Status', 'Manager decision', ''],
          timesheets.map(t => [
            fmtDate(t.weekStarting),
            t.totalHours,
            t.totalLeaveHours || 0,
            pill(t.status),
            t.status === 'submitted' || t.status === 'approved' || t.status === 'rejected'
              ? `${pill(t.managerStatus)}${t.managerComment ? `<br><span class="muted" style="font-size:11px;">${escapeHtml(t.managerComment)}</span>` : ''}`
              : '<span class="muted">—</span>',
            ['draft', 'rejected'].includes(t.status) ? `<span class="section-actions">
              <button class="btn btn-ghost btn-sm" onclick="openTimesheetModal(${t.id})">Edit</button>
              ${t.status === 'draft' ? `<button class="btn btn-danger btn-sm" onclick="deleteTimesheet(${t.id})">Delete</button>` : ''}
            </span>` : '<span class="muted">Locked</span>'
          ])
        )}
      </div>
    </div>
  `;
}

function mostRecentMonday() {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday .. 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function timesheetWeekDates(weekStarting) {
  const dates = [];
  const start = new Date(weekStarting + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

let TS_CURRENT_ID = null;
let TS_CURRENT_ENTRIES = [];

function openTimesheetModal(id) {
  const ts = id ? TS_CACHE.find(t => t.id === id) : null;
  TS_CURRENT_ID = ts ? ts.id : null;
  TS_CURRENT_ENTRIES = ts ? ts.entries : [];
  document.getElementById('timesheetForm').reset();
  document.getElementById('timesheetModalTitle').textContent = ts ? 'Edit timesheet' : 'Fill timesheet';
  document.getElementById('tsWeekStart').value = ts ? ts.weekStarting : mostRecentMonday();
  document.getElementById('tsNotes').value = ts ? (ts.notes || '') : '';
  renderTimesheetEntryRows();
  document.getElementById('timesheetModal').classList.add('show');
}

const TS_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thr', 'Fri', 'Sat'];

function tsShortDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-US', { month: 'short' });
  return `${dd}-${mon}`;
}

// Days-as-columns grid: Date/day, Project, Working hours, Leave/Holiday — with an
// auto-calculated "Total" column, matching the required timesheet layout.
function renderTimesheetEntryRows() {
  const weekStart = document.getElementById('tsWeekStart').value;
  const container = document.getElementById('tsEntriesContainer');
  if (!weekStart) { container.innerHTML = ''; return; }
  const dates = timesheetWeekDates(weekStart);
  container.innerHTML = `
    <table class="ts-grid">
      <tr>
        <th style="text-align:left; white-space:nowrap;">Date/day</th>
        ${dates.map((date, i) => `<th style="text-align:center;">${tsShortDate(date)}<br><span class="muted" style="font-weight:400;">${TS_DAY_NAMES[new Date(date + 'T00:00:00').getDay()]}</span></th>`).join('')}
        <th style="text-align:center;">Total</th>
      </tr>
      <tr>
        <td style="font-weight:600;">Project</td>
        ${dates.map((date, i) => {
          const existing = TS_CURRENT_ENTRIES.find(e => e.date === date) || {};
          return `<td><input id="tsProject${i}" value="${escapeHtml(existing.project || '')}" style="width:72px;" placeholder="Project"></td>`;
        }).join('')}
        <td></td>
      </tr>
      <tr>
        <td style="font-weight:600;">Working hours</td>
        ${dates.map((date, i) => {
          const existing = TS_CURRENT_ENTRIES.find(e => e.date === date) || {};
          return `<td><input id="tsWorkHours${i}" type="number" min="0" max="24" step="0.5" value="${existing.workHours || 0}" oninput="updateTimesheetTotal()"></td>`;
        }).join('')}
        <td style="text-align:center; font-weight:600;" id="tsWorkTotalCell">0</td>
      </tr>
      <tr>
        <td style="font-weight:600;">Leave/Holiday</td>
        ${dates.map((date, i) => {
          const existing = TS_CURRENT_ENTRIES.find(e => e.date === date) || {};
          return `<td><input id="tsLeaveHours${i}" type="number" min="0" max="24" step="0.5" value="${existing.leaveHours || 0}" oninput="updateTimesheetTotal()"></td>`;
        }).join('')}
        <td style="text-align:center; font-weight:600;" id="tsLeaveTotalCell">0</td>
      </tr>
    </table>
  `;
  updateTimesheetTotal();
}

function updateTimesheetTotal() {
  let workTotal = 0, leaveTotal = 0;
  for (let i = 0; i < 7; i++) {
    const workEl = document.getElementById('tsWorkHours' + i);
    const leaveEl = document.getElementById('tsLeaveHours' + i);
    if (workEl) workTotal += Number(workEl.value) || 0;
    if (leaveEl) leaveTotal += Number(leaveEl.value) || 0;
  }
  document.getElementById('tsTotalHours').textContent = workTotal;
  document.getElementById('tsTotalLeave').textContent = leaveTotal;
  const workCell = document.getElementById('tsWorkTotalCell');
  const leaveCell = document.getElementById('tsLeaveTotalCell');
  if (workCell) workCell.textContent = workTotal;
  if (leaveCell) leaveCell.textContent = leaveTotal;
}

function collectTimesheetEntries() {
  const weekStart = document.getElementById('tsWeekStart').value;
  return timesheetWeekDates(weekStart).map((date, i) => ({
    date,
    project: document.getElementById('tsProject' + i).value.trim(),
    workHours: Number(document.getElementById('tsWorkHours' + i).value) || 0,
    leaveHours: Number(document.getElementById('tsLeaveHours' + i).value) || 0
  })).filter(e => e.project || e.workHours > 0 || e.leaveHours > 0);
}

async function saveTimesheetDraft() {
  const weekStarting = document.getElementById('tsWeekStart').value;
  if (!weekStarting) { toast('Pick a week first', true); return; }
  try {
    const { timesheet } = await api('/timesheets', {
      method: 'POST',
      body: {
        weekStarting,
        entries: collectTimesheetEntries(),
        notes: document.getElementById('tsNotes').value
      }
    });
    TS_CURRENT_ID = timesheet.id;
    toast('Saved as draft');
    closeModal('timesheetModal');
    renderTimesheets();
  } catch (err) { toast(err.message, true); }
}

async function submitTimesheetForApproval() {
  const weekStarting = document.getElementById('tsWeekStart').value;
  if (!weekStarting) { toast('Pick a week first', true); return; }
  const entries = collectTimesheetEntries();
  if (entries.length === 0) { toast('Add at least one entry before submitting', true); return; }
  try {
    const { timesheet } = await api('/timesheets', {
      method: 'POST',
      body: { weekStarting, entries, notes: document.getElementById('tsNotes').value }
    });
    await api(`/timesheets/${timesheet.id}/submit`, { method: 'PUT' });
    toast('Submitted for manager approval');
    closeModal('timesheetModal');
    renderTimesheets();
  } catch (err) { toast(err.message, true); }
}

async function deleteTimesheet(id) {
  if (!confirm('Delete this draft timesheet?')) return;
  try {
    await api(`/timesheets/${id}`, { method: 'DELETE' });
    toast('Timesheet deleted');
    renderTimesheets();
  } catch (err) { toast(err.message, true); }
}

function fmtMoney(n) {
  return '₹' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ---------------- Payslips (read-only) ---------------- */
async function renderPayslips() {
  const { payslips } = await api('/payslips');
  document.getElementById('main').innerHTML = `
    <h1>Payslips</h1>
    <div class="subtitle">Your monthly payslip history.</div>
    <div class="panel"><div class="panel-body">
      ${payslips.length === 0 ? emptyState('No payslips on file yet') : renderTable(
        ['Month', 'Gross earnings', 'Gross deductions', 'Net pay', ''],
        payslips.map(p => [
          escapeHtml(p.month),
          fmtMoney(p.grossEarnings ?? (Number(p.basic) + Number(p.allowances))),
          fmtMoney(p.grossDeductions ?? p.deductions),
          `<strong>${fmtMoney(p.netPay)}</strong>`,
          `<span class="section-actions">
            <button class="btn btn-ghost btn-sm" onclick="viewPayslip(${p.id})">View</button>
            <button class="btn btn-ghost btn-sm" onclick="downloadPayslip(${p.id})">Download</button>
          </span>`
        ])
      )}
    </div></div>
  `;
}

/* ---------------- Form 16 (read-only) ---------------- */
async function renderForm16() {
  const { formSixteens } = await api('/form16');
  document.getElementById('main').innerHTML = `
    <h1>Form 16</h1>
    <div class="subtitle">Your annual tax statements.</div>
    <div class="panel"><div class="panel-body">
      ${formSixteens.length === 0 ? emptyState('No Form 16 records on file yet') : renderTable(
        ['Financial year', 'Gross salary', 'Tax deducted'],
        formSixteens.map(f => [escapeHtml(f.financialYear), fmtMoney(f.grossSalary), fmtMoney(f.taxDeducted)])
      )}
    </div></div>
  `;
}

/* ---------------- Performance (read-only) ---------------- */
async function renderPerformance() {
  const { performance } = await api('/performance');
  document.getElementById('main').innerHTML = `
    <h1>Performance</h1>
    <div class="subtitle">Your review history and feedback.</div>
    <div class="panel"><div class="panel-body">
      ${performance.length === 0 ? emptyState('No performance reviews on file yet') : performance.map(p => `
        <div style="padding: 14px 0; border-bottom: 1px solid var(--line);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <strong>${escapeHtml(p.period)}</strong>
            ${pill(p.rating.toLowerCase().replace(/\s+/g, '-'))}
          </div>
          ${p.feedback ? `<div class="muted" style="font-size:13.5px; margin-bottom:4px;">${escapeHtml(p.feedback)}</div>` : ''}
          ${p.goals ? `<div class="muted" style="font-size:13px;"><strong>Goals:</strong> ${escapeHtml(p.goals)}</div>` : ''}
          <div class="timestamp" style="margin-top:6px; font-size:11px;">Reviewed by ${escapeHtml(p.reviewedBy)} — ${fmtDate(p.reviewDate)}</div>
        </div>
      `).join('')}
    </div></div>
  `;
}

/* ---------------- Tasks (employee marks own status) ---------------- */
async function renderTasks() {
  const { tasks } = await api('/tasks');
  document.getElementById('main').innerHTML = `
    <h1>Tasks</h1>
    <div class="subtitle">To-dos assigned to you.</div>
    <div class="panel"><div class="panel-body">
      ${tasks.length === 0 ? emptyState('No tasks assigned yet') : tasks.map(t => `
        <div style="padding: 12px 0; border-bottom: 1px solid var(--line); display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <div>
            <strong>${escapeHtml(t.title)}</strong>
            ${t.description ? `<div class="muted" style="font-size:13px;">${escapeHtml(t.description)}</div>` : ''}
            ${t.dueDate ? `<div class="timestamp" style="font-size:11px; margin-top:2px;">Due ${fmtDate(t.dueDate)}</div>` : ''}
          </div>
          <select style="margin:0; width:auto; padding:5px 8px; font-size:12px;" onchange="updateTaskStatus(${t.id}, this.value)">
            ${['pending', 'in-progress', 'done'].map(s => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
      `).join('')}
    </div></div>
  `;
}
async function updateTaskStatus(id, status) {
  try { await api(`/tasks/${id}/status`, { method: 'PUT', body: { status } }); toast('Task updated'); }
  catch (err) { toast(err.message, true); }
}

/* ---------------- Documents (read-only) ---------------- */
async function renderDocuments() {
  const { documents } = await api('/documents');
  document.getElementById('main').innerHTML = `
    <h1>Documents</h1>
    <div class="subtitle">Company documents and policies.</div>
    <div class="panel"><div class="panel-body">
      ${documents.length === 0 ? emptyState('No documents published yet') : renderTable(
        ['Title', 'Category', 'Added'],
        documents.map(d => [
          `${escapeHtml(d.title)}${d.description ? '<br><span class="muted">' + escapeHtml(d.description) + '</span>' : ''}${d.link ? `<br><a href="${escapeHtml(d.link)}" target="_blank" style="font-size:12px;">${escapeHtml(d.link)}</a>` : ''}`,
          escapeHtml(d.category), fmtDate(d.uploadedDate)
        ])
      )}
    </div></div>
  `;
}

/* ---------------- Assets (read-only) ---------------- */
async function renderAssets() {
  const { assets } = await api('/assets');
  document.getElementById('main').innerHTML = `
    <h1>My assets</h1>
    <div class="subtitle">Equipment issued to you.</div>
    <div class="panel"><div class="panel-body">
      ${assets.length === 0 ? emptyState('No assets on file') : renderTable(
        ['Asset', 'Type', 'Serial #', 'Status'],
        assets.map(a => [escapeHtml(a.assetName), escapeHtml(a.assetType), escapeHtml(a.serialNumber || '—'), pill(a.status)])
      )}
    </div></div>
  `;
}

/* ---------------- Cases ---------------- */
async function renderCases() {
  const { cases } = await api('/cases');
  document.getElementById('main').innerHTML = `
    <h1>Cases</h1>
    <div class="subtitle">Support requests you've raised with HR.</div>
    <div class="panel">
      <div class="panel-header"><h2>My cases</h2><button class="btn btn-primary btn-sm" onclick="document.getElementById('caseForm').reset(); document.getElementById('caseModal').classList.add('show');">+ Raise a case</button></div>
      <div class="panel-body">
        ${cases.length === 0 ? emptyState('No cases raised yet') : cases.map(c => `
          <div style="padding: 12px 0; border-bottom: 1px solid var(--line);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong>${escapeHtml(c.subject)}</strong>
              ${pill(c.status)}
            </div>
            ${c.description ? `<div class="muted" style="font-size:13px; margin-top:4px;">${escapeHtml(c.description)}</div>` : ''}
            ${c.response ? `<div style="font-size:13px; margin-top:6px;"><strong>HR response:</strong> ${escapeHtml(c.response)}</div>` : ''}
            <div class="timestamp" style="font-size:11px; margin-top:4px;">${fmtDate(c.createdDate)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
async function submitCase(e) {
  e.preventDefault();
  try {
    await api('/cases', { method: 'POST', body: {
      subject: document.getElementById('caseSubject').value,
      description: document.getElementById('caseDescription').value
    }});
    toast('Case submitted');
    closeModal('caseModal');
    renderCases();
  } catch (err) { toast(err.message, true); }
}

/* ---------------- Surveys ---------------- */
async function renderSurveys() {
  const { surveys } = await api('/surveys');
  document.getElementById('main').innerHTML = `
    <h1>Surveys</h1>
    <div class="subtitle">Quick polls from HR.</div>
    <div class="panel"><div class="panel-body">
      ${surveys.length === 0 ? emptyState('No surveys right now') : surveys.map(s => `
        <div style="padding: 14px 0; border-bottom: 1px solid var(--line);">
          <strong>${escapeHtml(s.question)}</strong>
          <div style="margin-top:8px;">
            ${s.myAnswer
              ? `<div class="muted" style="font-size:13px;">You answered: <strong>${escapeHtml(s.myAnswer)}</strong></div>`
              : s.options.map(o => `<button class="btn btn-ghost btn-sm" style="margin: 3px 6px 3px 0;" onclick="respondSurvey(${s.id}, '${o.replace(/'/g, "\\'")}')">${escapeHtml(o)}</button>`).join('')
            }
          </div>
        </div>
      `).join('')}
    </div></div>
  `;
}
async function respondSurvey(surveyId, answer) {
  try {
    await api(`/surveys/${surveyId}/respond`, { method: 'POST', body: { answer } });
    toast('Response recorded');
    renderSurveys();
  } catch (err) { toast(err.message, true); }
}

/* ---------------- Knowledge base (read-only) ---------------- */
async function renderKnowledgeBase() {
  const { articles } = await api('/knowledgebase');
  document.getElementById('main').innerHTML = `
    <h1>Knowledge base</h1>
    <div class="subtitle">Articles and FAQs.</div>
    <div class="panel"><div class="panel-body">
      ${articles.length === 0 ? emptyState('No articles published yet') : articles.map(a => `
        <div style="padding: 14px 0; border-bottom: 1px solid var(--line);">
          <strong>${escapeHtml(a.title)}</strong>
          <div class="muted" style="font-size:12px; margin: 2px 0 6px;">${escapeHtml(a.category)}</div>
          <div style="font-size:13.5px; white-space: pre-wrap;">${escapeHtml(a.content)}</div>
        </div>
      `).join('')}
    </div></div>
  `;
}

/* ---------------- Workflows / checklists ---------------- */
async function renderWorkflows() {
  const { workflows } = await api('/workflows');
  document.getElementById('main').innerHTML = `
    <h1>Checklists</h1>
    <div class="subtitle">Onboarding and process checklists assigned to you.</div>
    <div class="panel"><div class="panel-body">
      ${workflows.length === 0 ? emptyState('No checklists assigned yet') : workflows.map(w => {
        const doneCount = w.steps.filter(s => s.done).length;
        return `
        <div style="padding: 14px 0; border-bottom: 1px solid var(--line);">
          <strong>${escapeHtml(w.name)}</strong>
          <div class="muted" style="font-size:12px; margin: 2px 0 8px;">${doneCount}/${w.steps.length} complete</div>
          ${w.steps.map(s => `
            <label style="display:flex; align-items:center; gap:8px; font-weight:400; font-size:13.5px; margin-bottom:4px;">
              <input type="checkbox" style="width:auto; margin:0;" ${s.done ? 'checked' : ''} onchange="toggleWorkflowStep(${w.id}, ${s.id}, this.checked)">
              <span style="${s.done ? 'text-decoration: line-through; color: var(--ink-soft);' : ''}">${escapeHtml(s.label)}</span>
            </label>
          `).join('')}
        </div>`;
      }).join('')}
    </div></div>
  `;
}
async function toggleWorkflowStep(workflowId, stepId, done) {
  try { await api(`/workflows/${workflowId}/steps/${stepId}`, { method: 'PUT', body: { done } }); }
  catch (err) { toast(err.message, true); renderWorkflows(); }
}

/* ---------------- Team approvals (manager only) ---------------- */
async function renderTeamApprovals() {
  const { leave } = await api('/leave');
  const { timesheets } = await api('/timesheets');
  TS_CACHE = timesheets;
  const pendingTimesheets = timesheets.filter(t => t.status === 'submitted');
  document.getElementById('main').innerHTML = `
    <h1>Team approvals</h1>
    <div class="subtitle">Leave requests and timesheets from people who report to you.</div>
    <div class="panel"><div class="panel-header"><h2>Leave requests</h2></div><div class="panel-body">
      ${leave.length === 0 ? emptyState('No requests from your team yet') : renderTable(
        ['Employee', 'Type', 'Dates', 'Reason', 'Your decision', ''],
        leave.map(l => [
          escapeHtml(l.employeeName), escapeHtml(l.type),
          `${fmtDate(l.startDate)} – ${fmtDate(l.endDate)}`,
          `<span class="muted">${escapeHtml(l.reason || '—')}</span>`,
          pill(l.managerStatus),
          l.managerStatus === 'pending' ? `<span class="section-actions">
            <button class="btn btn-primary btn-sm" onclick="managerDecide(${l.id}, 'approved')">Approve</button>
            <button class="btn btn-danger btn-sm" onclick="managerDecide(${l.id}, 'rejected')">Decline</button>
          </span>` : '<span class="muted">Decided</span>'
        ])
      )}
    </div></div>
    <div class="panel" style="margin-top:16px;"><div class="panel-header"><h2>Timesheets</h2></div><div class="panel-body">
      ${timesheets.length === 0 ? emptyState('No timesheets from your team yet') : renderTable(
        ['Employee', 'Week starting', 'Working hours', 'Leave/Holiday', 'Status', ''],
        timesheets.map(t => [
          escapeHtml(t.employeeName), fmtDate(t.weekStarting), t.totalHours, t.totalLeaveHours || 0, pill(t.status),
          t.status === 'submitted' ? `<span class="section-actions">
            <button class="btn btn-ghost btn-sm" onclick="viewTeamTimesheet(${t.id})">View</button>
            <button class="btn btn-primary btn-sm" onclick="managerDecideTimesheet(${t.id}, 'approved')">Approve</button>
            <button class="btn btn-danger btn-sm" onclick="managerDecideTimesheetPrompt(${t.id})">Decline</button>
          </span>` : `<button class="btn btn-ghost btn-sm" onclick="viewTeamTimesheet(${t.id})">View</button>`
        ])
      )}
    </div></div>
  `;
}

function viewTeamTimesheet(id) {
  const ts = TS_CACHE.find(t => t.id === id);
  if (!ts) return;
  const rows = (ts.entries || []).map(e => `${fmtDate(e.date)}: ${e.project || '—'} — Work ${e.workHours || 0}h / Leave ${e.leaveHours || 0}h`).join('\n');
  alert(`${ts.employeeName} — week of ${fmtDate(ts.weekStarting)}\n\n${rows || 'No entries'}\n\nWorking hours: ${ts.totalHours}h  |  Leave/Holiday: ${ts.totalLeaveHours || 0}h${ts.notes ? `\n\nNotes: ${ts.notes}` : ''}`);
}

async function managerDecideTimesheet(id, status, comment) {
  try {
    await api(`/timesheets/${id}/manager-status`, { method: 'PUT', body: { status, comment: comment || '' } });
    toast('Decision recorded');
    renderTeamApprovals();
  } catch (err) { toast(err.message, true); }
}

function managerDecideTimesheetPrompt(id) {
  const comment = prompt('Reason for declining this timesheet (optional):') || '';
  managerDecideTimesheet(id, 'rejected', comment);
}

async function managerDecide(id, status) {
  try {
    await api(`/leave/${id}/manager-status`, { method: 'PUT', body: { status } });
    toast('Decision recorded');
    renderTeamApprovals();
  } catch (err) { toast(err.message, true); }
}

init();
