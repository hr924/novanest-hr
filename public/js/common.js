/* ---------------- Sidebar icons ----------------
   Small feather-style icon set, keyed by the sidebar link's data-view.
   Decorating the sidebar here (instead of hand-writing <svg> in every
   HTML file) keeps admin.html / employee.html simple and makes it easy
   to add a new nav item later — it just falls back to a generic dot icon. */
const SIDEBAR_ICONS = {
  dashboard: '<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>',
  overview: '<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="none"/>',
  jobs: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" fill="none"/>',
  applications: '<path d="M4 4h16v12H8l-4 4V4z" fill="none"/>',
  employees: '<circle cx="9" cy="8" r="3"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7" fill="none"/><path d="M16 4.2a3 3 0 0 1 0 5.8M21 21c0-3-2-5.5-5-6.4" fill="none"/>',
  leave: '<rect x="3" y="5" width="18" height="16" rx="2" fill="none"/><path d="M3 10h18M8 3v4M16 3v4" fill="none"/>',
  leaveCalendar: '<rect x="3" y="5" width="18" height="16" rx="2" fill="none"/><path d="M3 10h18M8 3v4M16 3v4" fill="none"/><circle cx="9" cy="15" r="1.3"/><circle cx="15" cy="15" r="1.3"/>',
  timesheets: '<circle cx="12" cy="13" r="8" fill="none"/><path d="M12 9v4l3 2M9 2h6" fill="none"/>',
  teamApprovals: '<path d="M9 12l2 2 4-4" fill="none"/><circle cx="12" cy="12" r="9" fill="none"/>',
  attendance: '<path d="M9 12l2 2 4-4" fill="none"/><circle cx="12" cy="12" r="9" fill="none"/>',
  payslips: '<rect x="2" y="6" width="20" height="12" rx="2" fill="none"/><circle cx="12" cy="12" r="2.5" fill="none"/><path d="M6 6v0M18 6v0M6 18v0M18 18v0" fill="none"/>',
  form16: '<path d="M6 2h9l5 5v15H6V2z" fill="none"/><path d="M15 2v5h5M9 13h6M9 17h6" fill="none"/>',
  performance: '<path d="M4 20V10M12 20V4M20 20v-7" fill="none"/>',
  tasks: '<rect x="3" y="4" width="18" height="17" rx="2" fill="none"/><path d="M8 11l2 2 4-4M7 16h6" fill="none"/>',
  documents: '<path d="M4 20V6a2 2 0 0 1 2-2h6l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="none"/><path d="M12 4v4h4" fill="none"/>',
  assets: '<rect x="3" y="4" width="18" height="12" rx="2" fill="none"/><path d="M8 20h8M12 16v4" fill="none"/>',
  cases: '<circle cx="12" cy="12" r="9" fill="none"/><path d="M12 8v5M12 16.5v.01" fill="none"/>',
  surveys: '<path d="M4 20V10M11 20V4M18 20v-7" fill="none"/>',
  knowledgebase: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5z" fill="none"/><path d="M20 19H6.5A2.5 2.5 0 0 0 4 21.5" fill="none"/>',
  workflows: '<path d="M8 6h13M8 12h13M8 18h13" fill="none"/><circle cx="3.5" cy="6" r="1.5"/><circle cx="3.5" cy="12" r="1.5"/><circle cx="3.5" cy="18" r="1.5"/>',
  reports: '<circle cx="12" cy="12" r="9" fill="none"/><path d="M12 3v9l7 4" fill="none"/>',
  backups: '<ellipse cx="12" cy="5" rx="8" ry="3" fill="none"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" fill="none"/>'
};
const SIDEBAR_ICON_DEFAULT = '<circle cx="12" cy="12" r="3"/>';

function decorateSidebarIcons() {
  document.querySelectorAll('.sidebar-link[data-view]').forEach((link) => {
    if (link.querySelector('.ico')) return; // already decorated
    const view = link.dataset.view;
    const path = SIDEBAR_ICONS[view] || SIDEBAR_ICON_DEFAULT;
    const label = link.textContent;
    link.innerHTML = `<span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span><span>${label}</span>`;
  });
}
document.addEventListener('DOMContentLoaded', decorateSidebarIcons);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then((reg) => {
      // Explicitly ask the browser to check for a new service-worker.js
      // right away, instead of waiting for its normal (slow, throttled)
      // background update check. This is what makes app-shell fixes show
      // up on the very next reload rather than being stuck behind an old
      // cached version indefinitely.
      reg.update().catch(() => {});
    }).catch(() => {});
  });

  // When a new service worker takes control (i.e. an update just
  // finished installing), reload once so the page picks up the fresh
  // HTML/CSS/JS immediately instead of the person having to reload
  // manually to see fixes.
  let hasReloadedForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hasReloadedForUpdate) return;
    hasReloadedForUpdate = true;
    window.location.reload();
  });
}

async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    method: options.method || 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function toast(msg, isError = false) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function pill(status) {
  return `<span class="pill pill-${status}">${status}</span>`;
}

async function requireSession(allowedRoles) {
  const { user } = await api('/auth/me');
  if (!user || (allowedRoles && !allowedRoles.includes(user.role))) {
    window.location.href = '/login.html';
    return null;
  }
  return user;
}

function payslipMoney(n) {
  return (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function payslipMonthLabel(month) {
  if (!month) return '';
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long' }).toUpperCase() + ' - ' + y;
}

function payslipDateLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleDateString('en-US', { month: 'short' });
  return `${dd}/${mon}/${d.getFullYear()}`;
}

function payslipMaskLast4(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '—';
  if (digits.length <= 4) return digits;
  return '*'.repeat(digits.length - 4) + digits.slice(-4);
}

function buildPayslipHTML(p, autoPrint) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Payslip - ${p.employeeName} - ${payslipMonthLabel(p.month)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; padding: 32px; max-width: 820px; margin: 0 auto; }
  .ps-logo-row { text-align: center; margin-bottom: 20px; }
  .ps-logo-row img { height: 56px; }
  table.ps-table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
  table.ps-table td, table.ps-table th { border: 1px solid #999; padding: 6px 10px; font-size: 13px; }
  .ps-header-bar { background: #4a72c4; color: #fff; font-weight: bold; padding: 6px 10px; border: 1px solid #999; }
  .ps-title-bar { text-align: center; font-weight: bold; padding: 6px 10px; border: 1px solid #999; border-top: none; }
  .ps-info-table td { width: 25%; }
  .ps-info-table td.ps-key { font-weight: bold; background: #f5f5f5; }
  .ps-earn-header { background: #f5f5f5; font-weight: bold; text-align: center; }
  .ps-amount { text-align: right; }
  .ps-total-row td { font-weight: bold; background: #f5f5f5; }
  .ps-note { font-size: 12px; text-align: center; margin-top: 18px; }
  .ps-footer { font-size: 12px; font-weight: bold; text-align: center; margin-top: 48px; }
  .ps-print-btn { display: block; margin: 0 auto 24px; padding: 8px 18px; font-size: 13px; cursor: pointer; }
  @media print { .ps-print-btn { display: none; } }
</style>
</head>
<body>
  <button class="ps-print-btn" onclick="window.print()">Print / Save as PDF</button>
  <div class="ps-logo-row"><img src="/img/logo.png" alt="Company logo"></div>
  <table class="ps-table">
    <tr><td class="ps-header-bar" colspan="4">Novanest Careers Pvt Ltd</td></tr>
    <tr><td class="ps-title-bar" colspan="4">Payslip For ${payslipMonthLabel(p.month)}</td></tr>
    <tr>
      <td class="ps-key">Employee ID</td><td>${p.employeeCode || '—'}</td>
      <td class="ps-key">Name</td><td>${p.employeeName || '—'}</td>
    </tr>
    <tr>
      <td class="ps-key">Bank</td><td>${p.bankName || '—'}</td>
      <td class="ps-key">Bank A/c No.</td><td>${payslipMaskLast4(p.bankAccountNumber)}</td>
    </tr>
    <tr>
      <td class="ps-key">DOJ</td><td>${payslipDateLabel(p.doj)}</td>
      <td class="ps-key">LOP Days</td><td>${p.lopDays ?? 0}</td>
    </tr>
    <tr>
      <td class="ps-key">Designation</td><td>${p.designation || '—'}</td>
      <td class="ps-key">STD Days</td><td>${p.stdDays ?? '—'}</td>
    </tr>
    <tr>
      <td class="ps-key">Location</td><td>${p.location || '—'}</td>
      <td class="ps-key">Worked Days</td><td>${p.workedDays ?? '—'}</td>
    </tr>
    <tr>
      <td class="ps-key">PF No.</td><td>${p.pfNumber || '—'}</td>
      <td class="ps-key">PF – UAN</td><td>${payslipMaskLast4(p.uan)}</td>
    </tr>
  </table>
  <br>
  <table class="ps-table">
    <tr>
      <td class="ps-earn-header" style="width:37%;">Earnings</td>
      <td class="ps-earn-header" style="width:13%;">Amount in Rs.</td>
      <td class="ps-earn-header" style="width:37%;">Deductions</td>
      <td class="ps-earn-header" style="width:13%;">Amount in Rs.</td>
    </tr>
    <tr>
      <td>BASIC</td><td class="ps-amount">${payslipMoney(p.basic)}</td>
      <td>PROVIDENT FUND</td><td class="ps-amount">${payslipMoney(p.employeePF)}</td>
    </tr>
    <tr>
      <td>FLEXIBLE ALLOWANCE</td><td class="ps-amount">${payslipMoney(p.flexibleAllowance ?? p.allowances)}</td>
      <td>PROFESSIONAL TAX</td><td class="ps-amount">${payslipMoney(p.provisionTax)}</td>
    </tr>
    <tr>
      <td>HOUSE RENT ALLOWANCE</td><td class="ps-amount">${payslipMoney(p.hra)}</td>
      <td>OTHER DEDUCTION LOA / ADJUSTMENTS</td><td class="ps-amount">${payslipMoney(p.otherDeduction)}</td>
    </tr>
    <tr>
      <td>PERSONAL ALLOWANCE</td><td class="ps-amount">${payslipMoney(p.personalAllowance)}</td>
      <td>${Number(p.lopDeduction) > 0 ? 'LOSS OF PAY' : ''}</td><td class="ps-amount">${Number(p.lopDeduction) > 0 ? payslipMoney(p.lopDeduction) : ''}</td>
    </tr>
    <tr>
      <td>OTHER ALLOWANCE</td><td class="ps-amount">${payslipMoney(p.otherAllowance)}</td>
      <td></td><td></td>
    </tr>
    <tr class="ps-total-row">
      <td>GROSS EARNINGS</td><td class="ps-amount">${payslipMoney(p.grossEarnings)}</td>
      <td>GROSS DEDUCTIONS</td><td class="ps-amount">${payslipMoney(p.grossDeductions)}</td>
    </tr>
    <tr class="ps-total-row">
      <td colspan="2">NET PAY</td><td class="ps-amount" colspan="2">${payslipMoney(p.netPay)}</td>
    </tr>
  </table>
  ${p.note ? `<div class="ps-note">${p.note}</div>` : (Number(p.lopDays) > 0 ? `<div class="ps-note">${p.lopDays} day(s) this period exceeded the annual 12 Casual + 12 Sick leave allowance and were deducted as Loss of Pay.</div>` : '')}
  <div class="ps-footer">** This is a computer generated payslip and does not require signature and stamp.</div>
  ${autoPrint ? `<script>window.onload = function() { setTimeout(function() { window.print(); }, 300); };<\/script>` : ''}
</body>
</html>`;
}

async function viewPayslip(id) {
  try {
    const { payslip } = await api(`/payslips/${id}`);
    const win = window.open('', '_blank');
    if (!win) { toast('Please allow pop-ups to view the payslip', true); return; }
    win.document.write(buildPayslipHTML(payslip));
    win.document.close();
  } catch (err) {
    toast(err.message, true);
  }
}

// Opens the payslip in a new tab and immediately triggers the browser's
// print dialog so the person can choose "Save as PDF" as the destination —
// this is what gives them an actual downloadable file.
async function downloadPayslip(id) {
  try {
    const { payslip } = await api(`/payslips/${id}`);
    const win = window.open('', '_blank');
    if (!win) { toast('Please allow pop-ups to download the payslip', true); return; }
    win.document.write(buildPayslipHTML(payslip, true));
    win.document.close();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ================================================================
   Idle auto-logout — signs the user out after 5 minutes of no
   mouse / keyboard / touch activity. Whatever they were typing in
   the currently open view is saved to localStorage right before
   the sign-out, then quietly restored the next time they land on
   that same view (after logging back in) — so nothing is lost.
   Only runs on the admin/employee app shell (pages with .dash),
   never on the public careers page or the login screen itself.
   ================================================================ */
const IDLE_LOGOUT_MS = 5 * 60 * 1000;   // 5 minutes — do not set lower than this
const IDLE_WARNING_MS = 30 * 1000;      // show the "still there?" prompt 30s beforehand
const DRAFT_MAX_AGE_MS = 30 * 60 * 1000; // discard drafts older than 30 minutes

let _idleTimer = null, _idleWarnTimer = null, _idleCountdownInt = null;

function _currentViewName() {
  return document.querySelector('.sidebar-link.active')?.dataset.view || 'unknown';
}

function saveFormDraft() {
  try {
    const main = document.getElementById('main');
    if (!main) return;
    const view = _currentViewName();
    const fields = {};
    main.querySelectorAll('input[id], select[id], textarea[id]').forEach((el) => {
      if (el.type === 'password') return;
      fields[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    if (Object.keys(fields).length === 0) return;
    localStorage.setItem(`hrDraft:${view}`, JSON.stringify({ fields, savedAt: Date.now() }));
  } catch (e) { /* best effort only */ }
}

function restoreFormDraft(view) {
  try {
    const key = `hrDraft:${view || _currentViewName()}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const { fields, savedAt } = JSON.parse(raw);
    localStorage.removeItem(key);
    if (Date.now() - savedAt > DRAFT_MAX_AGE_MS) return;
    let restored = false;
    Object.entries(fields).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = val; else el.value = val;
      restored = true;
    });
    if (restored) toast('Restored what you were filling in before you were signed out.');
  } catch (e) { /* ignore */ }
}

function _hideIdleWarning() {
  const modal = document.getElementById('idleWarningModal');
  if (modal) modal.classList.remove('show');
  clearInterval(_idleCountdownInt);
}

function _showIdleWarning() {
  let seconds = Math.round(IDLE_WARNING_MS / 1000);
  let modal = document.getElementById('idleWarningModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'idleWarningModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal" style="max-width:360px;">
        <div class="modal-head"><h3>Still there?</h3></div>
        <div class="modal-body">
          <p style="margin-top:0; color: var(--ink-soft); font-size:13.5px;">
            You've been inactive for a while. For security you'll be signed out in
            <strong id="idleCountdown">${seconds}</strong>s. Anything you're filling in will be saved.
          </p>
          <button class="btn btn-primary" style="width:100%; justify-content:center;" onclick="stayLoggedIn()">Stay signed in</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.classList.add('show');
  clearInterval(_idleCountdownInt);
  _idleCountdownInt = setInterval(() => {
    seconds -= 1;
    const el = document.getElementById('idleCountdown');
    if (el) el.textContent = Math.max(seconds, 0);
    if (seconds <= 0) clearInterval(_idleCountdownInt);
  }, 1000);
}

async function _triggerAutoLogout() {
  saveFormDraft();
  _hideIdleWarning();
  try { await api('/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
  window.location.href = 'login.html?reason=idle';
}

function stayLoggedIn() {
  resetIdleTimer();
  api('/auth/me').catch(() => {}); // touches the session so the server-side cookie doesn't expire either
}

function resetIdleTimer() {
  clearTimeout(_idleTimer);
  clearTimeout(_idleWarnTimer);
  _hideIdleWarning();
  _idleWarnTimer = setTimeout(_showIdleWarning, IDLE_LOGOUT_MS - IDLE_WARNING_MS);
  _idleTimer = setTimeout(_triggerAutoLogout, IDLE_LOGOUT_MS);
}

function initIdleAutoLogout() {
  if (!document.querySelector('.dash')) return; // only inside the signed-in app shell
  ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach((evt) => {
    document.addEventListener(evt, () => {
      const warning = document.getElementById('idleWarningModal');
      if (warning && warning.classList.contains('show')) return; // let the "stay signed in" button handle it
      resetIdleTimer();
    }, { passive: true });
  });
  resetIdleTimer();
}
document.addEventListener('DOMContentLoaded', initIdleAutoLogout);
