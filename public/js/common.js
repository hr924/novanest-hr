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
      <td class="ps-key">Department</td><td>${p.department || '—'}</td>
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
      <td></td><td></td>
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
  ${p.note ? `<div class="ps-note">${p.note}</div>` : ''}
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
