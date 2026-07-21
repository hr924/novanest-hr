let CURRENT_USER = null;

async function init() {
  CURRENT_USER = await requireSession(['employee', 'admin']);
  if (!CURRENT_USER) return;
  document.getElementById('whoName').textContent = CURRENT_USER.name;

  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => switchView(link.dataset.view));
  });
  document.getElementById('logoutLink').addEventListener('click', async (e) => {
    e.preventDefault();
    await api('/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });
  document.getElementById('leaveForm').addEventListener('submit', submitLeave);

  await switchView('profile');
}

async function switchView(view) {
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.toggle('active', l.dataset.view === view));
  const renderers = { profile: renderProfile, attendance: renderAttendance, leave: renderLeave };
  await renderers[view]();
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

/* ---------------- Profile ---------------- */
async function renderProfile() {
  const main = document.getElementById('main');
  try {
    const { employee } = await api('/employees/me');
    main.innerHTML = `
      <h1>My profile</h1>
      <div class="subtitle">Your employment record on file.</div>
      <div class="panel"><div class="panel-body">
        <table>
          <tr><td class="muted" style="width:160px;">Full name</td><td>${escapeHtml(employee.name)}</td></tr>
          <tr><td class="muted">Email</td><td>${escapeHtml(employee.email)}</td></tr>
          <tr><td class="muted">Phone</td><td>${escapeHtml(employee.phone || '—')}</td></tr>
          <tr><td class="muted">Department</td><td>${escapeHtml(employee.department)}</td></tr>
          <tr><td class="muted">Position</td><td>${escapeHtml(employee.position)}</td></tr>
          <tr><td class="muted">Joined</td><td>${fmtDate(employee.joinDate)}</td></tr>
          <tr><td class="muted">Status</td><td>${pill(employee.status)}</td></tr>
        </table>
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
  const { leave } = await api('/leave');
  document.getElementById('main').innerHTML = `
    <h1>Leave requests</h1>
    <div class="subtitle">Submit time-off requests and track their status.</div>
    <div class="panel">
      <div class="panel-header"><h2>My requests</h2><button class="btn btn-primary btn-sm" onclick="document.getElementById('leaveModal').classList.add('show')">+ Request leave</button></div>
      <div class="panel-body">
        ${leave.length === 0 ? emptyState('No leave requests yet') : renderTable(
          ['Type', 'Dates', 'Reason', 'Status'],
          leave.map(l => [escapeHtml(l.type), `${fmtDate(l.startDate)} – ${fmtDate(l.endDate)}`, `<span class="muted">${escapeHtml(l.reason || '—')}</span>`, pill(l.status)])
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

init();
