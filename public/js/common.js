if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
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
