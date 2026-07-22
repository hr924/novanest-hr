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
  document.getElementById('caseForm').addEventListener('submit', submitCase);

  await switchView('profile');
}

async function switchView(view) {
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.toggle('active', l.dataset.view === view));
  const renderers = {
    profile: renderProfile, attendance: renderAttendance, leave: renderLeave,
    payslips: renderPayslips, form16: renderForm16, performance: renderPerformance,
    tasks: renderTasks, documents: renderDocuments, assets: renderAssets,
    cases: renderCases, surveys: renderSurveys, knowledgebase: renderKnowledgeBase, workflows: renderWorkflows
  };
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
          <tr><td class="muted" style="width:160px;">Employee ID</td><td class="timestamp">${escapeHtml(employee.employeeCode || '—')}</td></tr>
          <tr><td class="muted">Full name</td><td>${escapeHtml(employee.name)}</td></tr>
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
        ['Month', 'Basic', 'Allowances', 'Deductions', 'Net pay'],
        payslips.map(p => [escapeHtml(p.month), fmtMoney(p.basic), fmtMoney(p.allowances), fmtMoney(p.deductions), `<strong>${fmtMoney(p.netPay)}</strong>`])
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

init();
