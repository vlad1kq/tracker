'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const LB = 2.20462262;
const S = { view: 'home', unit: 'kg', range: '30', peptides: [], logs: [], weights: [], f: { p: '', from: '', to: '' }, charts: {} };
const parts = (d = new Date()) => { d = new Date(d); return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }; };
const toISO = (d, t) => new Date(`${d}T${t || '12:00'}`).toISOString();
const fmtDT = i => new Date(i).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const fmtD = i => new Date(i).toLocaleDateString(undefined, { dateStyle: 'medium' });
const fmtW = kg => (S.unit === 'lb' ? kg * LB : kg).toFixed(1) + ' ' + S.unit;
const pName = id => (S.peptides.find(p => p.id === id) || { name: '(removed)' }).name;
const byTs = (a, b) => a.ts.localeCompare(b.ts);
const toast = m => { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', 3500); };

async function load() {
  [S.peptides, S.logs, S.weights] = await Promise.all([DB.all('peptides'), DB.all('logs'), DB.all('weights')]);
  const u = (await DB.all('meta')).find(m => m.key === 'unit');
  S.unit = u ? u.value : 'kg';
}

/* ---------- dialogs ---------- */
function openForm(title, body, onSave) {
  const d = $('#dlg');
  d.innerHTML = `<form id="f"><h2>${esc(title)}</h2>${body}<p id="err" class="err" role="alert"></p><div class="row"><button type="button" class="ghost" data-close>Cancel</button><button class="primary">Save</button></div></form>`;
  d.querySelector('[data-close]').onclick = () => d.close();
  d.querySelector('#f').onsubmit = async e => {
    e.preventDefault();
    try {
      const m = await onSave(new FormData(e.target));
      if (m) { $('#err').textContent = m; return; }
      d.close(); await load(); render();
    } catch (x) { $('#err').textContent = 'Could not save: ' + x.message; }
  };
  d.showModal();
}
function openDetail(title, html, onEdit, onDelete) {
  const d = $('#dlg');
  d.innerHTML = `<h2>${esc(title)}</h2>${html}<div class="row"><button class="ghost" data-x>Close</button><button class="ghost" data-e>Edit</button><button class="danger" data-d>Delete</button></div>`;
  d.querySelector('[data-x]').onclick = () => d.close();
  d.querySelector('[data-e]').onclick = () => { d.close(); onEdit(); };
  d.querySelector('[data-d]').onclick = async () => {
    if (!confirm('Delete this record? This cannot be undone.')) return;
    try { await onDelete(); d.close(); await load(); render(); } catch (x) { toast('Delete failed: ' + x.message); }
  };
  d.showModal();
}

/* ---------- forms ---------- */
function logForm(r) {
  const opts = S.peptides.filter(p => !p.archived || (r && p.id === r.peptideId));
  if (!opts.length) { toast('Add a peptide first (Log tab → Peptides).'); return; }
  const t = parts(r ? r.ts : undefined);
  openForm(r ? 'Edit log entry' : 'Log peptide', `
    <label>Peptide<select name="p" required>${opts.map(p => `<option value="${p.id}" ${r && r.peptideId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    <label>Date<input type="date" name="d" required value="${t.date}"></label>
    <label>Time<input type="time" name="t" required value="${t.time}"></label>
    <label>Note (optional)<textarea name="n" maxlength="500">${esc(r && r.note)}</textarea></label>`,
  async f => {
    const ts = toISO(f.get('d'), f.get('t'));
    if (!f.get('d') || !f.get('t') || isNaN(new Date(ts))) return 'Please enter a valid date and time.';
    await DB.put('logs', { ...(r || {}), peptideId: +f.get('p'), ts, note: f.get('n').trim() });
  });
}
function weightForm(r) {
  const t = parts(r ? r.ts : undefined);
  const val = r ? (S.unit === 'lb' ? r.kg * LB : r.kg).toFixed(1) : '';
  openForm(r ? 'Edit weight' : 'Log weight', `
    <label>Weight (${S.unit})<input type="number" name="w" inputmode="decimal" step="0.1" min="1" required value="${val}"></label>
    <label>Date<input type="date" name="d" required value="${t.date}"></label>
    <label>Time (optional)<input type="time" name="t" value="${!r || r.hasTime ? (r ? t.time : t.time) : ''}"></label>
    <label>Note (optional)<textarea name="n" maxlength="500">${esc(r && r.note)}</textarea></label>`,
  async f => {
    let kg = parseFloat(f.get('w')); if (S.unit === 'lb') kg /= LB;
    if (!isFinite(kg) || kg < 1 || kg > 700) return 'Please enter a realistic weight.';
    const time = f.get('t'), ts = toISO(f.get('d'), time);
    if (!f.get('d') || isNaN(new Date(ts))) return 'Please enter a valid date.';
    await DB.put('weights', { ...(r || {}), kg: Math.round(kg * 1000) / 1000, ts, hasTime: !!time, note: f.get('n').trim() });
  });
}
function peptideForm(r) {
  openForm(r ? 'Rename peptide' : 'New peptide', `
    <label>Name<input name="n" required maxlength="60" value="${esc(r && r.name)}"></label>
    <label>Note (optional)<textarea name="o" maxlength="500">${esc(r && r.note)}</textarea></label>`,
  async f => {
    const name = f.get('n').trim();
    if (!name) return 'Name is required.';
    if (S.peptides.some(p => p.name.toLowerCase() === name.toLowerCase() && (!r || p.id !== r.id))) return 'That name already exists.';
    await DB.put('peptides', { archived: false, created: new Date().toISOString(), ...(r || {}), name, note: f.get('o').trim() });
  });
}
const showLog = r => openDetail(pName(r.peptideId), `<p>${fmtDT(r.ts)}</p><p>${r.note ? esc(r.note) : '<span class="mu">No note</span>'}</p><small>Recorded event (not a schedule or recommendation)</small>`, () => logForm(r), () => DB.del('logs', r.id));
const showWeight = r => openDetail(fmtW(r.kg), `<p>${r.hasTime ? fmtDT(r.ts) : fmtD(r.ts)}</p><p>${r.note ? esc(r.note) : '<span class="mu">No note</span>'}</p>`, () => weightForm(r), () => DB.del('weights', r.id));

/* ---------- charts ---------- */
function mk(id, cfg) {
  const c = document.getElementById(id); if (!c) return;
  if (S.charts[id]) S.charts[id].destroy();
  if (typeof Chart === 'undefined') { c.parentElement.innerHTML = '<p class="empty">Chart.js is missing. Add vendor/chart.umd.js (see README).</p>'; return; }
  Chart.defaults.color = '#a1a1aa'; Chart.defaults.borderColor = '#2c2c2e';
  S.charts[id] = new Chart(c, { ...cfg, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, ...cfg.options } });
}
const weightsInRange = () => { const d = S.range === 'all' ? 0 : +S.range; const cut = d ? Date.now() - d * 864e5 : 0; return S.weights.filter(w => new Date(w.ts) >= cut).sort(byTs); };
const rangeSel = () => `<label>Range<select id="range">${[['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '1 year'], ['all', 'All records']].map(([v, l]) => `<option value="${v}" ${S.range === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
function drawWeight() {
  const w = weightsInRange(); if (!w.length) return;
  mk('cw', { type: 'line', data: { labels: w.map(x => x.hasTime ? fmtDT(x.ts) : fmtD(x.ts)), datasets: [{ data: w.map(x => +(S.unit === 'lb' ? x.kg * LB : x.kg).toFixed(1)), borderColor: '#0a84ff', backgroundColor: '#0a84ff', tension: .2, pointRadius: 3 }] }, options: { scales: { x: { ticks: { maxTicksLimit: 5 } }, y: { title: { display: true, text: S.unit } } } } });
}
function drawCounts() {
  if (S.logs.length) {
    const perDay = {}; S.logs.forEach(l => { const k = parts(l.ts).date; perDay[k] = (perDay[k] || 0) + 1; });
    const keys = Object.keys(perDay).sort();
    mk('c1', { type: 'bar', data: { labels: keys.map(k => fmtD(k + 'T12:00')), datasets: [{ data: keys.map(k => perDay[k]), backgroundColor: '#0a84ff' }] }, options: { scales: { x: { ticks: { maxTicksLimit: 5 } }, y: { beginAtZero: true, ticks: { precision: 0 } } } } });
    const per = {}; S.logs.forEach(l => { const n = pName(l.peptideId); per[n] = (per[n] || 0) + 1; });
    mk('c2', { type: 'bar', data: { labels: Object.keys(per), datasets: [{ data: Object.values(per), backgroundColor: '#30d158' }] }, options: { indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } } });
  }
}

/* ---------- views ---------- */
const empty = m => `<p class="empty">${m}</p>`;
function vHome() {
  const now = new Date(), lw = [...S.weights].sort(byTs).pop(), ll = [...S.logs].sort(byTs).pop();
  const month = S.logs.length + S.weights.length && [...S.logs, ...S.weights].filter(r => { const d = new Date(r.ts); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }).length;
  const recent = [...S.logs.map(l => ({ ...l, k: 'l' })), ...S.weights.map(w => ({ ...w, k: 'w' }))].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 8);
  return `<p class="mu">${now.toLocaleDateString(undefined, { dateStyle: 'full' })}</p>
  <div class="grid"><div class="card"><small>Latest weight</small><div class="big">${lw ? fmtW(lw.kg) : '—'}</div><small>${lw ? fmtD(lw.ts) : 'No entries'}</small></div>
  <div class="card"><small>Last peptide log</small><div class="big">${ll ? fmtD(ll.ts) : '—'}</div><small>${ll ? new Date(ll.ts).toLocaleTimeString(undefined, { timeStyle: 'short' }) : 'No entries'}</small></div></div>
  <div class="card" style="margin-top:12px"><small>Records created this month</small><div class="big">${month || 0}</div></div>
  <div class="row"><button class="primary" data-a="newlog">Log peptide</button><button class="primary" data-a="newweight">Log weight</button></div>
  <div class="card"><h2>Recent activity</h2>${recent.length ? `<ul>${recent.map(r => `<li><button class="item" data-a="${r.k === 'l' ? 'showlog' : 'showw'}" data-id="${r.id}"><span class="tag">${r.k === 'l' ? 'peptide' : 'weight'}</span>${r.k === 'l' ? esc(pName(r.peptideId)) : fmtW(r.kg)}<br><small>${fmtDT(r.ts)}</small></button></li>`).join('')}</ul>` : empty('Nothing recorded yet.')}</div>`;
}
function vLog() {
  let l = [...S.logs].sort((a, b) => b.ts.localeCompare(a.ts));
  if (S.f.p) l = l.filter(x => x.peptideId === +S.f.p);
  if (S.f.from) l = l.filter(x => parts(x.ts).date >= S.f.from);
  if (S.f.to) l = l.filter(x => parts(x.ts).date <= S.f.to);
  return `<div class="row"><button class="primary" data-a="newlog">Log peptide</button></div>
  <div class="card"><h2>History</h2><div class="row"><label>Peptide<select id="fp"><option value="">All</option>${S.peptides.map(p => `<option value="${p.id}" ${+S.f.p === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
  <label>From<input type="date" id="ff" value="${S.f.from}"></label><label>To<input type="date" id="ft" value="${S.f.to}"></label></div>
  ${l.length ? `<ul>${l.map(r => `<li><button class="item" data-a="showlog" data-id="${r.id}"><strong>${esc(pName(r.peptideId))}</strong><br><small>${fmtDT(r.ts)}${r.note ? ' · ' + esc(r.note.slice(0, 40)) : ''}</small></button></li>`).join('')}</ul>` : empty(S.logs.length ? 'No records match the filters.' : 'No peptide records yet.')}</div>
  <div class="card"><h2>Peptides</h2><button class="ghost" data-a="newpep">Add peptide</button>
  ${S.peptides.length ? `<ul>${S.peptides.map(p => `<li class="row" style="align-items:center"><span style="flex:2">${esc(p.name)} ${p.archived ? '<span class="tag">archived</span>' : ''}<br><small>${esc(p.note)} · created ${fmtD(p.created)}</small></span><button class="ghost" data-a="renpep" data-id="${p.id}">Rename</button><button class="ghost" data-a="arcpep" data-id="${p.id}">${p.archived ? 'Restore' : 'Archive'}</button></li>`).join('')}</ul>` : empty('No peptides yet. Add your own names.')}</div>`;
}
function vWeight() {
  const w = weightsInRange(), all = [...S.weights].sort((a, b) => b.ts.localeCompare(a.ts));
  return `<div class="row"><button class="primary" data-a="newweight">Log weight</button></div>
  <div class="card">${rangeSel()}${w.length ? '<div class="cv"><canvas id="cw" role="img" aria-label="Weight over time"></canvas></div>' : empty('No weight records in this range.')}
  <small>Charts show only recorded values. Weight changes do not by themselves indicate fat gain or loss.</small></div>
  <div class="card"><h2>History</h2>${all.length ? `<ul>${all.map(r => `<li><button class="item" data-a="showw" data-id="${r.id}"><strong>${fmtW(r.kg)}</strong><br><small>${r.hasTime ? fmtDT(r.ts) : fmtD(r.ts)}${r.note ? ' · ' + esc(r.note.slice(0, 40)) : ''}</small></button></li>`).join('')}</ul>` : empty('No weight records yet.')}</div>`;
}
function vCharts() {
  if (!S.logs.length) return `<div class="card">${empty('Log a peptide entry to see charts.')}</div>`;
  return `<div class="card"><h2>Recorded events per day</h2><div class="cv"><canvas id="c1" role="img" aria-label="Events per day"></canvas></div></div>
  <div class="card"><h2>Records by peptide</h2><div class="cv"><canvas id="c2" role="img" aria-label="Records grouped by peptide"></canvas></div></div>`;
}
function vSettings() {
  return `<div class="card"><h2>Weight unit</h2><select id="unit"><option value="kg" ${S.unit === 'kg' ? 'selected' : ''}>Kilograms</option><option value="lb" ${S.unit === 'lb' ? 'selected' : ''}>Pounds</option></select><small>Values are always stored in kg.</small></div>
  <div class="card"><h2>Backup</h2><div class="row"><button class="ghost" data-a="export">Export JSON</button><button class="ghost" data-a="import">Import JSON</button></div><input type="file" id="file" accept="application/json,.json" hidden>
  <small>A backup file contains private information. Store it safely. Importing replaces all current data.</small></div>
  <div class="card"><h2>Privacy</h2><small>All records stay in this browser's IndexedDB on this device. Nothing is sent anywhere and there is no sync or analytics. Data can be lost if website data is cleared or the device is lost, so export backups regularly. This app does not encrypt data. It is a logging tool only and gives no medical advice, doses, or reminders.</small></div>
  <div class="card"><h2>Install on iPhone</h2><small>Open the site in Safari → Share → Add to Home Screen → Add. Notifications are not offered: iOS gives ordinary websites no reliable background execution.</small></div>
  <div class="card"><button class="danger" data-a="wipe">Delete all data</button></div>`;
}

const VIEWS = { home: ['Home', vHome], log: ['Log', vLog], weight: ['Weight', vWeight], charts: ['Charts', vCharts], settings: ['Settings', vSettings] };
function render() {
  const [t, fn] = VIEWS[S.view];
  $('#title').textContent = t; $('#view').innerHTML = fn();
  document.querySelectorAll('nav button').forEach(b => b.toggleAttribute('aria-current', b.dataset.v === S.view) || b.removeAttribute('aria-current'));
  document.querySelectorAll('nav button').forEach(b => { if (b.dataset.v === S.view) b.setAttribute('aria-current', 'page'); });
  if (S.view === 'weight') drawWeight(); if (S.view === 'charts') drawCounts();
}

/* ---------- backup ---------- */
function validate(d) {
  const ok = a => Array.isArray(a), okTs = t => typeof t === 'string' && !isNaN(new Date(t));
  if (!d || d.app !== 'private-tracker' || !ok(d.peptides) || !ok(d.logs) || !ok(d.weights)) return 'Not a valid backup file.';
  if (!d.peptides.every(p => Number.isInteger(p.id) && typeof p.name === 'string' && p.name.trim())) return 'Invalid peptide entries.';
  if (!d.logs.every(l => Number.isInteger(l.id) && Number.isInteger(l.peptideId) && okTs(l.ts))) return 'Invalid log entries.';
  if (!d.weights.every(w => Number.isInteger(w.id) && typeof w.kg === 'number' && w.kg > 0 && w.kg < 700 && okTs(w.ts))) return 'Invalid weight entries.';
  return null;
}
async function doImport(file) {
  try {
    const d = JSON.parse(await file.text()), e = validate(d);
    if (e) return toast(e);
    if (!confirm(`Replace ALL current data with ${d.logs.length} peptide records, ${d.weights.length} weights, ${d.peptides.length} peptides?`)) return;
    await DB.replaceAll({ peptides: d.peptides, logs: d.logs, weights: d.weights, meta: [{ key: 'unit', value: d.unit === 'lb' ? 'lb' : 'kg' }] });
    await load(); render(); toast('Import complete.');
  } catch (x) { toast('Import failed: ' + x.message); }
}

/* ---------- events ---------- */
document.addEventListener('click', async e => {
  const nb = e.target.closest('nav button'); if (nb) { S.view = nb.dataset.v; render(); scrollTo(0, 0); return; }
  const b = e.target.closest('[data-a]'); if (!b) return;
  const id = +b.dataset.id, a = b.dataset.a;
  try {
    if (a === 'newlog') logForm(); else if (a === 'newweight') weightForm(); else if (a === 'newpep') peptideForm();
    else if (a === 'showlog') showLog(S.logs.find(x => x.id === id)); else if (a === 'showw') showWeight(S.weights.find(x => x.id === id));
    else if (a === 'renpep') peptideForm(S.peptides.find(x => x.id === id));
    else if (a === 'arcpep') { const p = S.peptides.find(x => x.id === id); await DB.put('peptides', { ...p, archived: !p.archived }); await load(); render(); }
    else if (a === 'import') $('#file').click();
    else if (a === 'export') {
      const data = { app: 'private-tracker', version: 1, exported: new Date().toISOString(), unit: S.unit, peptides: S.peptides, logs: S.logs, weights: S.weights };
      const u = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const l = document.createElement('a'); l.href = u; l.download = `tracker-backup-${parts().date}.json`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 5000);
    } else if (a === 'wipe') {
      if (confirm('Delete ALL data on this device? This cannot be undone.') && prompt('Type DELETE to confirm') === 'DELETE') { await DB.replaceAll({}); await load(); render(); toast('All data deleted.'); }
    }
  } catch (x) { toast('Error: ' + x.message); }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'range') { S.range = t.value; render(); }
  else if (t.id === 'fp') { S.f.p = t.value; render(); } else if (t.id === 'ff') { S.f.from = t.value; render(); } else if (t.id === 'ft') { S.f.to = t.value; render(); }
  else if (t.id === 'unit') { try { await DB.put('meta', { key: 'unit', value: t.value }); S.unit = t.value; render(); } catch (x) { toast('Error: ' + x.message); } }
  else if (t.id === 'file' && t.files[0]) { await doImport(t.files[0]); t.value = ''; }
});

(async () => {
  try { await DB.open(); await load(); render(); }
  catch (x) { $('#view').innerHTML = `<div class="card"><h2>Storage unavailable</h2><p>${esc(x.message)}</p><p class="mu">Private browsing or blocked storage can cause this.</p></div>`; }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
})();
