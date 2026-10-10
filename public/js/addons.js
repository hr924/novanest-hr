// Admin add-ons:
//  1. Makes the "Face ID — Kiosk & enrollment" card (and a sidebar link) open face-id.html
//  2. Bulk import employees from an Excel / CSV file
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Excel column  ->  employee field sent to POST /api/employees.
  // Field names match the "Add employee" form. If any imported field
  // shows up blank, only the right-hand names here need changing.
  // ------------------------------------------------------------------
  const COLUMNS = [
    // [Excel heading, field name, required, other accepted headings]
    ['Full Name', 'name', false, ['name', 'employee name', 'emp name']],
    ['Email', 'email', false, ['email id', 'mail', 'email address', 'official email']],
    ['Department', 'department', false, ['dept']],
    ['Designation', 'position', false, ['position', 'role', 'job title']],
    ['Phone', 'phone', false, ['mobile', 'mobile number', 'phone number', 'contact number']],
    ['Joining Date', 'joinDate', false, ['date of joining', 'doj', 'join date']],
    ['Status', 'status', false, []],
    ['UAN', 'uan', false, ['uan number']],
    ['PF Number', 'pfNumber', false, ['pf no', 'pf']],
    ['Work Location', 'location', false, ['location']],
    ['Annual CTC', 'annualCTC', false, ['ctc', 'annual ctc', 'yearly ctc']],
    ['Monthly CTC', 'monthlyCTC', false, []],
    ['Employer PF', 'employerPF', false, []],
    ['Employee PF', 'employeePF', false, []],
    ['Professional Tax', 'professionalTax', false, ['provision tax', 'pt']],
    ['Date of Birth', 'dob', false, ['dob', 'birth date']],
    ['Gender', 'gender', false, []],
    ['Blood Group', 'bloodGroup', false, []],
    ['Address', 'address', false, []],
    ['Emergency Contact Name', 'emergencyName', false, ['emergency name']],
    ['Emergency Contact Relation', 'emergencyRelation', false, ['emergency relation', 'relationship']],
    ['Emergency Contact Phone', 'emergencyPhone', false, ['emergency phone']],
    ['Aadhaar', 'aadhaar', false, ['aadhaar number', 'aadhar', 'aadhar number']],
    ['PAN', 'pan', false, ['pan number']],
    ['Passport', 'passport', false, ['passport number']],
    ['Bank Name', 'bankName', false, []],
    ['Bank Account Number', 'bankAccount', false, ['account number', 'bank account', 'account no']],
    ['IFSC', 'bankIfsc', false, ['ifsc code']]
  ];
  const NUMBER_FIELDS = ['annualCTC', 'monthlyCTC', 'employerPF', 'employeePF', 'professionalTax'];
  const DATE_FIELDS = ['joinDate', 'dob'];
  const CONCURRENCY = 4;

  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const headingMap = {};
  COLUMNS.forEach(([label, field, , alts]) => {
    [label, field].concat(alts).forEach((h) => { headingMap[norm(h)] = field; });
  });

  // ------------------------------------------------------------------
  // 1. Face ID
  // ------------------------------------------------------------------
  function openFaceId() { location.href = 'face-id.html'; }

  // Any card/tile whose text says "Face ID" opens the Face ID page.
  document.addEventListener('click', function (ev) {
    let el = ev.target;
    for (let i = 0; el && i < 6; i++, el = el.parentElement) {
      if (el === document.body) break;
      const t = (el.textContent || '').trim();
      if (t.length < 160 && /face\s*id/i.test(t) && /(kiosk|enrol)/i.test(t)) {
        ev.preventDefault(); ev.stopPropagation(); openFaceId(); return;
      }
    }
  }, true);

  // ------------------------------------------------------------------
  // Sidebar links
  // ------------------------------------------------------------------
  function addSidebarLinks() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar || document.getElementById('addonLinks')) return;
    const box = document.createElement('div');
    box.id = 'addonLinks';
    box.style.cssText = 'margin-top:10px; padding-top:10px; border-top:1px solid var(--line, #e2e8f0);';
    box.innerHTML =
      '<div class="addon-link" data-act="face" style="padding:9px 12px; cursor:pointer; border-radius:8px; font-size:14px;">🙂 Face ID</div>' +
      '<div class="addon-link" data-act="bulk" style="padding:9px 12px; cursor:pointer; border-radius:8px; font-size:14px;">📥 Bulk import employees</div>';
    box.addEventListener('click', (ev) => {
      const a = ev.target.closest('.addon-link'); if (!a) return;
      ev.stopPropagation();
      if (a.dataset.act === 'face') openFaceId(); else openBulk();
    });
    box.querySelectorAll('.addon-link').forEach((l) => {
      l.onmouseenter = () => (l.style.background = 'rgba(3,169,231,0.10)');
      l.onmouseleave = () => (l.style.background = '');
    });
    sidebar.appendChild(box);
  }

  // A "Bulk import" button next to any "Add employee" button admin.js renders
  function addBulkButton() {
    if (document.getElementById('bulkImportBtn')) return;
    const btn = Array.from(document.querySelectorAll('#main button, #main a.btn')).find((b) => /add employee/i.test(b.textContent));
    if (!btn) return;
    const b = document.createElement('button');
    b.id = 'bulkImportBtn'; b.type = 'button';
    b.className = btn.className.replace('btn-primary', '') + ' btn';
    b.style.marginLeft = '8px';
    b.textContent = '📥 Bulk import (Excel)';
    b.addEventListener('click', openBulk);
    btn.insertAdjacentElement('afterend', b);
  }

  // ------------------------------------------------------------------
  // 2. Bulk import modal
  // ------------------------------------------------------------------
  let rows = [], errors = [], running = false;

  function buildModal() {
    if (document.getElementById('bulkOverlay')) return;
    const o = document.createElement('div');
    o.id = 'bulkOverlay';
    o.style.cssText = 'position:fixed; inset:0; background:rgba(11,37,69,.55); z-index:9999; display:none; align-items:flex-start; justify-content:center; padding:30px 12px; overflow:auto;';
    o.innerHTML = `
      <div style="background:#fff; width:100%; max-width:900px; border-radius:16px; padding:22px; font-size:14px; color:#14213d; box-shadow:0 20px 60px rgba(0,0,0,.25);">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
          <h3 style="margin:0;">Bulk import employees</h3>
          <button type="button" id="bulkClose" style="border:0; background:none; font-size:26px; cursor:pointer; line-height:1;">&times;</button>
        </div>
        <ol style="color:#475569; line-height:1.7; padding-left:18px;">
          <li><a href="#" id="bulkTemplate" style="color:#03A9E7; font-weight:600;">Download the Excel template</a> and fill one employee per row. No column is compulsory — fill whatever you have and leave the rest blank.</li>
          <li>Choose the filled file (.xlsx, .xls or .csv). You'll see a preview before anything is saved.</li>
          <li>Click <b>Import</b>. New people are added. People who already exist (same email, or same name + phone when email is blank) are <b>updated</b> with only the cells you filled; blank cells keep their current value. Re-upload the same sheet any time to fill in missing details.</li>
        </ol>
        <input type="file" id="bulkFile" accept=".xlsx,.xls,.csv" style="margin:6px 0 14px;">
        <div id="bulkSummary" style="color:#475569;"></div>
        <div id="bulkPreview" style="max-height:320px; overflow:auto; margin-top:10px;"></div>
        <div id="bulkProgressWrap" style="display:none; margin-top:14px;">
          <div style="height:10px; background:#e2e8f0; border-radius:999px; overflow:hidden;"><div id="bulkBar" style="height:100%; width:0; background:#03A9E7; transition:width .2s;"></div></div>
          <div id="bulkProgressText" style="margin-top:6px; color:#475569;"></div>
        </div>
        <div style="display:flex; gap:8px; margin-top:16px; flex-wrap:wrap;">
          <button type="button" id="bulkStart" disabled style="padding:10px 18px; border:0; border-radius:10px; background:#03A9E7; color:#fff; font-weight:600; cursor:pointer;">Import</button>
          <button type="button" id="bulkErrors" style="display:none; padding:10px 18px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">Download error report</button>
          <button type="button" id="bulkReload" style="display:none; padding:10px 18px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">Refresh employee list</button>
        </div>
      </div>`;
    document.body.appendChild(o);
    o.querySelector('#bulkClose').onclick = closeBulk;
    o.addEventListener('click', (e) => { if (e.target === o) closeBulk(); });
    o.querySelector('#bulkTemplate').onclick = (e) => { e.preventDefault(); downloadTemplate(); };
    o.querySelector('#bulkFile').onchange = (e) => readFile(e.target.files[0]);
    o.querySelector('#bulkStart').onclick = runImport;
    o.querySelector('#bulkErrors').onclick = downloadErrors;
    o.querySelector('#bulkReload').onclick = () => location.reload();
  }

  function openBulk() {
    buildModal();
    document.getElementById('bulkOverlay').style.display = 'flex';
    if (!window.XLSX) {
      document.getElementById('bulkSummary').innerHTML = '<span style="color:#dc2626;">The Excel reader did not load. Check your internet connection and refresh the page.</span>';
    }
  }
  function closeBulk() {
    if (running && !confirm('Import is still running. Close anyway? (Rows already saved will stay saved.)')) return;
    document.getElementById('bulkOverlay').style.display = 'none';
  }

  function downloadTemplate() {
    const head = COLUMNS.map((c) => c[0]);
    const example = ['Ravi Kumar', 'ravi.kumar@example.com', 'SAP MM', 'SAP MM Consultant', '9876543210', '2026-04-01', 'active',
      '100123456789', 'APHYD3655951000', 'Hyderabad', 600000, 50000, 1800, 1800, 200, '1995-06-15', 'Male', 'O+',
      'Ameerpet, Hyderabad', 'Lakshmi', 'Mother', '9876500000', '123412341234', 'ABCDE1234F', '', 'State Bank of India', '12345678901', 'SBIN0001234'];
    const ws = XLSX.utils.aoa_to_sheet([head, example]);
    ws['!cols'] = head.map((h) => ({ wch: Math.max(14, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, 'employee-bulk-import-template.xlsx');
  }

  function toDate(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v)) {
      return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); // Indian DD-MM-YYYY
    if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    if (/^\d{5}$/.test(s)) { // Excel serial number
      const d = new Date(Math.round((Number(s) - 25569) * 86400000));
      return d.toISOString().slice(0, 10);
    }
    return 'INVALID:' + s;
  }
  function toNum(v) {
    if (v == null || v === '') return 0;
    const n = Number(String(v).replace(/[₹,\s]/g, ''));
    return isFinite(n) ? n : NaN;
  }
  const r2 = (n) => Math.round(n * 100) / 100;

  function buildEmployee(raw, line) {
    const emp = {}; const problems = []; const warnings = [];
    Object.keys(raw).forEach((k) => {
      const field = headingMap[norm(k)];
      if (!field) return;
      let v = raw[k];
      if (typeof v === 'string') v = v.trim();
      emp[field] = v;
    });
    // fields that actually have a value in this row (used when updating existing employees)
    const filled = new Set(Object.keys(emp).filter((f) => emp[f] !== '' && emp[f] != null));
    if (!emp.name) warnings.push('Name missing');
    if (emp.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emp.email)) warnings.push('Email looks invalid');
    if (emp.email) emp.email = String(emp.email).toLowerCase();

    DATE_FIELDS.forEach((f) => {
      if (emp[f] == null) return;
      const d = toDate(emp[f]);
      if (d.startsWith('INVALID:')) { warnings.push(f + ' date not understood: ' + d.slice(8)); emp[f] = ''; } else emp[f] = d;
    });
    NUMBER_FIELDS.forEach((f) => {
      const n = toNum(emp[f]);
      if (isNaN(n)) { warnings.push(f + ' is not a number, saved as 0'); emp[f] = 0; } else emp[f] = n;
    });
    ['phone', 'uan', 'aadhaar', 'bankAccount', 'emergencyPhone'].forEach((f) => { if (emp[f] != null) emp[f] = String(emp[f]).replace(/\s/g, ''); });
    ['pan', 'bankIfsc'].forEach((f) => { if (emp[f]) emp[f] = String(emp[f]).toUpperCase(); });
    if (emp.uan && !/^\d{12}$/.test(emp.uan)) warnings.push('UAN should be 12 digits');
    if (emp.aadhaar && !/^\d{12}$/.test(emp.aadhaar)) warnings.push('Aadhaar should be 12 digits');
    if (emp.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(emp.pan)) warnings.push('PAN format looks wrong');
    if (emp.bankIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(emp.bankIfsc)) warnings.push('IFSC format looks wrong');

    if (filled.has('annualCTC') || filled.has('monthlyCTC')) ['annualCTC', 'monthlyCTC', 'basicSalary', 'hra', 'allowances', 'deductions'].forEach((f) => filled.add(f));
    const st = String(emp.status || 'active').toLowerCase();
    emp.status = st.startsWith('in') ? 'inactive' : 'active';
    if (emp.email == null) emp.email = '';
    ['phone', 'uan', 'pfNumber', 'location', 'dob', 'gender', 'bloodGroup', 'address', 'emergencyName', 'emergencyRelation',
      'emergencyPhone', 'aadhaar', 'pan', 'passport', 'bankName', 'bankAccount', 'bankIfsc', 'department', 'position', 'joinDate']
      .forEach((f) => { if (emp[f] == null) emp[f] = ''; });

    // Same salary rules as the Add employee form
    if (!emp.monthlyCTC && emp.annualCTC) emp.monthlyCTC = r2(emp.annualCTC / 12);
    if (!emp.annualCTC && emp.monthlyCTC) emp.annualCTC = r2(emp.monthlyCTC * 12);
    emp.basicSalary = r2(emp.monthlyCTC / 2);
    emp.hra = r2(emp.basicSalary / 2);
    emp.allowances = emp.hra;
    emp.deductions = r2(emp.basicSalary + emp.hra + emp.allowances - (emp.employeePF + emp.employerPF + emp.professionalTax));

    return { line, emp, problems, warnings, filled };
  }

  async function fetchExistingEmails() {
    try {
      const res = await fetch('/api/employees', { credentials: 'same-origin' });
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.employees || data.data || []);
      const emails = new Map(), people = new Map();
      list.forEach((e) => {
        if (e.email) emails.set(String(e.email).toLowerCase(), e);
        if (e.name) people.set(norm(e.name) + '|' + norm(e.phone), e);
      });
      return { emails, people };
    } catch (e) { return { emails: new Map(), people: new Map() }; }
  }

  async function readFile(file) {
    const sum = document.getElementById('bulkSummary');
    document.getElementById('bulkPreview').innerHTML = '';
    document.getElementById('bulkStart').disabled = true;
    document.getElementById('bulkErrors').style.display = 'none';
    document.getElementById('bulkProgressWrap').style.display = 'none';
    rows = []; errors = [];
    if (!file) return;
    sum.textContent = 'Reading ' + file.name + '…';
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
      if (!raw.length) { sum.innerHTML = '<span style="color:#dc2626;">The first sheet has no rows.</span>'; return; }

      const headings = Object.keys(raw[0]);
      const unknown = headings.filter((h) => !headingMap[norm(h)] && !/^__EMPTY/.test(h));
      const existing = await fetchExistingEmails();
      const seen = new Set();

      raw.forEach((r, i) => {
        if (Object.values(r).every((v) => v === '' || v == null)) return;
        const b = buildEmployee(r, i + 2);
        const key = b.emp.email ? 'e:' + b.emp.email : (b.emp.name ? 'p:' + norm(b.emp.name) + '|' + norm(b.emp.phone) : '');
        const match = b.emp.email ? existing.emails.get(b.emp.email) : (b.emp.name ? existing.people.get(key.slice(2)) : null);
        if (key && seen.has(key)) {
          b.skip = 'Same employee appears earlier in this file — skipped';
        } else if (match) {
          // Existing employee: only the filled cells are changed, blank cells keep the current value
          const changes = Array.from(b.filled).filter((f) => String(match[f] == null ? '' : match[f]) !== String(b.emp[f]));
          if (!changes.length) b.skip = 'Already up to date — no changes';
          else { b.update = match; b.changes = changes; }
        }
        if (key) seen.add(key);
        rows.push(b);
      });

      const ok = rows.filter((r) => !r.problems.length && !r.skip).length;
      const upd = rows.filter((r) => !r.problems.length && !r.skip && r.update).length;
      const bad = rows.filter((r) => r.problems.length).length;
      const warn = rows.filter((r) => !r.problems.length && !r.skip && r.warnings.length).length;
      const skip = rows.filter((r) => r.skip && !r.problems.length).length;
      sum.innerHTML = `<b>${rows.length}</b> rows found · <b style="color:#16a34a;">${ok - upd} new</b> · <b style="color:#03A9E7;">${upd} will update existing</b> · ${skip} unchanged/skipped` + (bad ? ` · <b style="color:#dc2626;">${bad} with errors</b>` : '') +
        (warn ? `<br><span style="color:#b45309;">${warn} rows will import with notes — the flagged fields can be corrected later in Edit employee.</span>` : '') +
        (unknown.length ? `<br><span style="color:#b45309;">Ignored columns: ${esc(unknown.join(', '))}</span>` : '');

      const show = rows.slice(0, 50);
      document.getElementById('bulkPreview').innerHTML =
        '<table style="width:100%; border-collapse:collapse; font-size:12.5px;"><thead><tr>' +
        ['Row', 'Name', 'Email', 'Department', 'Designation', 'Joining', 'Monthly CTC', 'Check'].map((h) => `<th style="text-align:left; padding:6px; border-bottom:1px solid #e2e8f0; color:#64748b;">${h}</th>`).join('') +
        '</tr></thead><tbody>' +
        show.map((r) => `<tr><td style="padding:6px; border-bottom:1px solid #f1f5f9;">${r.line}</td><td style="padding:6px; border-bottom:1px solid #f1f5f9;">${esc(r.emp.name)}</td><td style="padding:6px; border-bottom:1px solid #f1f5f9;">${esc(r.emp.email)}</td><td style="padding:6px; border-bottom:1px solid #f1f5f9;">${esc(r.emp.department)}</td><td style="padding:6px; border-bottom:1px solid #f1f5f9;">${esc(r.emp.position)}</td><td style="padding:6px; border-bottom:1px solid #f1f5f9;">${esc(r.emp.joinDate)}</td><td style="padding:6px; border-bottom:1px solid #f1f5f9;">${r.emp.monthlyCTC ? '₹' + r.emp.monthlyCTC.toLocaleString('en-IN') : ''}</td><td style="padding:6px; border-bottom:1px solid #f1f5f9; color:${r.problems.length ? '#dc2626' : r.skip ? '#64748b' : r.warnings.length ? '#b45309' : '#16a34a'};">${r.problems.length ? esc(r.problems.join('; ')) : r.skip ? esc(r.skip) : (r.update ? 'Update: ' + esc(r.changes.join(', ')) : 'New') + (r.warnings.length ? ' · ' + esc(r.warnings.join('; ')) : '')}</td></tr>`).join('') +
        '</tbody></table>' + (rows.length > 50 ? `<div style="color:#64748b; margin-top:6px;">Showing first 50 of ${rows.length} rows.</div>` : '');

      const btn = document.getElementById('bulkStart');
      btn.disabled = ok === 0;
      btn.textContent = `Import ${ok - upd} new + update ${upd}`;
      errors = rows.filter((r) => r.problems.length).map((r) => ({ line: r.line, name: r.emp.name, email: r.emp.email, error: r.problems.join('; ') }));
      if (errors.length) document.getElementById('bulkErrors').style.display = '';
    } catch (e) {
      sum.innerHTML = '<span style="color:#dc2626;">Could not read this file: ' + esc(e.message) + '</span>';
    }
  }

  async function runImport() {
    const todo = rows.filter((r) => !r.problems.length && !r.skip);
    if (!todo.length || running) return;
    running = true;
    const btn = document.getElementById('bulkStart'); btn.disabled = true;
    document.getElementById('bulkProgressWrap').style.display = '';
    const bar = document.getElementById('bulkBar'), txt = document.getElementById('bulkProgressText');
    let done = 0, saved = 0, updated = 0, idx = 0;

    async function worker() {
      while (idx < todo.length) {
        const r = todo[idx++];
        try {
          let res;
          if (r.update) {
            const id = r.update.id != null ? r.update.id : r.update._id;
            const body = Object.assign({}, r.update);
            r.changes.forEach((f) => { body[f] = r.emp[f]; });
            const opts = { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
            res = await fetch('/api/employees/' + encodeURIComponent(id), Object.assign({ method: 'PUT' }, opts));
            if (res.status === 404 || res.status === 405) res = await fetch('/api/employees/' + encodeURIComponent(id), Object.assign({ method: 'PATCH' }, opts));
          } else {
            res = await fetch('/api/employees', {
              method: 'POST', credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(r.emp)
            });
          }
          if (res.status === 401) throw new Error('Session expired — sign in again and re-upload (saved rows will be skipped).');
          if (!res.ok) {
            const b = await res.json().catch(() => ({}));
            throw new Error(b.error || b.message || ('Server error ' + res.status));
          }
          saved++;
          if (r.update) updated++;
          r.skip = r.update ? 'Updated' : 'Imported';
        } catch (e) {
          errors.push({ line: r.line, name: r.emp.name, email: r.emp.email, error: e.message });
        }
        done++;
        bar.style.width = Math.round((done / todo.length) * 100) + '%';
        txt.textContent = `${done} / ${todo.length} processed · ${saved} saved · ${done - saved} failed`;
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    running = false;
    txt.innerHTML = `<b>Done.</b> ${saved - updated} new employees added, ${updated} existing employees updated` + (done - saved ? `, <span style="color:#dc2626;">${done - saved} failed</span> — download the error report to see why.` : '.');
    btn.textContent = 'Import finished';
    if (errors.length) document.getElementById('bulkErrors').style.display = '';
    document.getElementById('bulkReload').style.display = '';
  }

  function downloadErrors() {
    const ws = XLSX.utils.json_to_sheet(errors.map((e) => ({ 'Excel row': e.line, Name: e.name, Email: e.email, Problem: e.error })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Errors');
    XLSX.writeFile(wb, 'employee-import-errors.xlsx');
  }

  // ------------------------------------------------------------------
  function init() {
    addSidebarLinks();
    addBulkButton();
    // admin.js re-renders the main area when you switch views
    const main = document.getElementById('main');
    if (main) new MutationObserver(addBulkButton).observe(main, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.openBulkEmployeeImport = openBulk;
})();
