'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const LB = 2.20462262;
const PRESETS = [
  { id: 'aurora', name: 'Aurora', css: 'radial-gradient(900px 500px at 90% -10%,#5e5ce6,transparent 60%),radial-gradient(700px 400px at -10% 5%,#0a84ff,transparent 60%),#05060a' },
  { id: 'ocean', name: 'Ocean', css: 'linear-gradient(160deg,#0a3d91,#1e88e5 50%,#7fd6ff)' },
  { id: 'sunset', name: 'Sunset', css: 'linear-gradient(160deg,#ff7e5f,#c2417c 55%,#4b2a8f)' },
  { id: 'forest', name: 'Forest', css: 'linear-gradient(160deg,#0b3b2e,#1f7a5a 55%,#8bd3a8)' },
  { id: 'violet', name: 'Violet', css: 'linear-gradient(160deg,#2b1055,#7b4bd6 55%,#d7a8ff)' },
  { id: 'graphite', name: 'Graphite', css: 'linear-gradient(160deg,#2a2a31,#0a0a0d)' }
];
const S = { bg: null, view: 'home', unit: 'kg', range: '30', peptides: [], logs: [], weights: [], cat: 'all', f: { p: '', q: '', from: '', to: '' }, charts: {} };
const parts = (d = new Date()) => { d = new Date(d); return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }; };
const toISO = (d, t) => new Date(`${d}T${t || '12:00'}`).toISOString();
const fmtDT = i => new Date(i).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const fmtD = i => new Date(i).toLocaleDateString(undefined, { dateStyle: 'medium' });
const fmtW = kg => (S.unit === 'lb' ? kg * LB : kg).toFixed(1) + ' ' + S.unit;
const pName = id => (S.peptides.find(p => p.id === id) || { name: '(removed)' }).name;
const cat = id => ((S.peptides.find(p => p.id === id) || {}).category === 'steroid' ? 'steroid' : 'peptide');
const CL = { peptide: 'Peptide', steroid: 'Steroid' };
const UNITS = ['mg', 'mcg', 'IU', 'ml'];
const fmtAmt = r => r.amount ? `${+r.amount.toFixed(3)} ${r.unit}` : '';
const tag = c => `<span class="tag ${c}">${CL[c]}</span>`;
const catBar = () => `<div class="seg" role="group" aria-label="Category">${[['all', 'All'], ['peptide', 'Peptides'], ['steroid', 'Steroids']].map(([v, l]) => `<button data-a="cat" data-v="${v}" class="${S.cat === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const mc = c => S.logs.filter(l => { const d = new Date(l.ts), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && cat(l.peptideId) === c; }).length;
const byTs = (a, b) => a.ts.localeCompare(b.ts);
const toast = m => { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', 3500); };

async function load() {
  [S.peptides, S.logs, S.weights] = await Promise.all([DB.all('peptides'), DB.all('logs'), DB.all('weights')]);
  const meta = await DB.all('meta'), u = meta.find(m => m.key === 'unit'), bg = meta.find(m => m.key === 'bg');
  S.unit = u ? u.value : 'kg'; S.bg = bg ? bg.value : null; applyBg();
}

/* ---------- reminders (user-defined interval per entry; the app never suggests one) ---------- */
const DAY = 864e5;
function dueList() {
  return S.peptides.filter(p => !p.archived && p.everyDays).map(p => {
    const last = S.logs.filter(l => l.peptideId === p.id).sort(byTs).pop();
    if (!last) return { p, state: 'none' };
    const d = new Date(last.ts); d.setDate(d.getDate() + p.everyDays);
    const [h, m] = (p.at || '09:00').split(':'); d.setHours(+h, +m, 0, 0);
    const n = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / DAY);
    return { p, due: d, n, state: n > 0 ? 'over' : n === 0 ? 'today' : 'soon' };
  });
}
const rLabel = x => x.state === 'none' ? 'No log yet' : x.n > 0 ? `Overdue ${x.n} d` : x.n === 0 ? `Due today ${x.due.toLocaleTimeString(undefined, { timeStyle: 'short' })}` : `In ${-x.n} d · ${fmtD(x.due)}`;
function remCard() {
  const l = dueList(); if (!l.length) return '';
  const o = { over: 0, today: 1, soon: 2, none: 3 };
  l.sort((a, b) => o[a.state] - o[b.state] || (a.due || 0) - (b.due || 0));
  return `<div class="card"><h2>Reminders</h2>${l.map(x => `<div class="rem"><span>${tag(x.p.category || 'peptide')}${esc(x.p.name)}</span><span class="st ${x.state}">${rLabel(x)}</span></div>`).join('')}<small>Based on the interval you set for each entry.</small></div>`;
}
/** Repeating calendar event so iOS Calendar delivers real alerts (a website cannot do this in the background). */
function exportIcs(p) {
  const x = dueList().find(v => v.p.id === p.id), [h, m] = (p.at || '09:00').split(':');
  const st = x && x.due && x.due > new Date() ? x.due : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(+h, +m, 0, 0); return d; })();
  const f = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const nm = p.name.replace(/[\\;,\r\n]/g, ' ');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Private Tracker//EN', 'BEGIN:VEVENT', `UID:${crypto.randomUUID()}@private-tracker`, `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, '')}`, `DTSTART:${f(st)}`, `RRULE:FREQ=DAILY;INTERVAL=${p.everyDays}`, `SUMMARY:Reminder: ${nm}`, 'BEGIN:VALARM', 'TRIGGER:PT0S', 'ACTION:DISPLAY', `DESCRIPTION:Reminder: ${nm}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const u = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a'); a.href = u; a.download = 'reminder.ics'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 5000);
}

/* ---------- background ---------- */
function applyBg() {
  const b = S.bg;
  const v = b && b.type === 'image' ? `url("${b.data}")` : (PRESETS.find(p => b && p.id === b.id) || PRESETS[0]).css;
  document.body.style.setProperty('--bg-img', v);
}
/** Downscale a chosen photo so it stays small in IndexedDB. */
function readBg(file) {
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      res(c.toDataURL('image/jpeg', .82));
    };
    img.onerror = () => rej(new Error('Unsupported image'));
    img.src = u;
  });
}
const appearance = () => `<div class="card"><h2>Appearance</h2><div class="sw">${PRESETS.map(p => `<button class="swb ${S.bg && S.bg.type === 'preset' && S.bg.id === p.id || (!S.bg && p.id === 'aurora') ? 'on' : ''}" data-a="bg" data-id="${p.id}" style="background:${p.css}" aria-label="${p.name}"></button>`).join('')}</div>
  <div class="row"><button class="ghost" data-a="bgphoto">Choose photo</button><button class="ghost" data-a="bgreset">Reset</button></div><input type="file" id="bgfile" accept="image/*" hidden>
  <small>Your photo is stored only on this device and is not included in backups.</small></div>`;

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
  if (!opts.length) { toast('Add an entry first (Log tab → Entries).'); return; }
  const grp = c => { const o = opts.filter(p => (p.category || 'peptide') === c); return o.length ? `<optgroup label="${CL[c]}s">${o.map(p => `<option value="${p.id}" ${r && r.peptideId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>` : ''; };
  const t = parts(r ? r.ts : undefined);
  openForm(r && r.id ? 'Edit log entry' : 'Log entry', `
    <label>Entry<select name="p" required>${['peptide', 'steroid'].map(grp).join('')}</select></label>
    <label>Date<input type="date" name="d" required value="${t.date}"></label>
    <label>Time<input type="time" name="t" required value="${t.time}"></label>
    <label>Amount (optional)<div class="row"><input type="number" name="a" step="any" min="0" inputmode="decimal" placeholder="amount" value="${r && r.amount ? r.amount : ''}"><select name="u" aria-label="Unit">${UNITS.map(u => `<option ${((r && r.unit) || 'mg') === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div></label>
    <label>Injection site (optional)<input name="s" maxlength="40" list="sites" value="${esc(r && r.site)}"><datalist id="sites">${[...new Set(S.logs.map(l => l.site).filter(Boolean))].map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
    <label>Vial (optional)<select name="v"><option value="">None</option>${S.vials.filter(v => !v.archived || (r && r.vialId === v.id)).map(v => `<option value="${v.id}" ${r && r.vialId === v.id ? 'selected' : ''}>${esc(pName(v.peptideId))}${v.label ? ' · ' + esc(v.label) : ''}</option>`).join('')}</select></label>
    <label>How did you feel? 1–5 (optional)<select name="m"><option value="">—</option>${[1, 2, 3, 4, 5].map(n => `<option ${r && r.mood === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label>Tags (optional, comma-separated)<input name="g" maxlength="80" value="${esc(((r && r.tags) || []).join(', '))}"></label>
    <label>Note (optional)<textarea name="n" maxlength="500">${esc(r && r.note)}</textarea></label>`,
  async f => {
    const ts = toISO(f.get('d'), f.get('t'));
    if (!f.get('d') || !f.get('t') || isNaN(new Date(ts))) return 'Please enter a valid date and time.';
    const raw = f.get('a').trim(), amt = raw === '' ? null : parseFloat(raw), unit = f.get('u');
    if (amt !== null && (!isFinite(amt) || amt <= 0 || amt > 100000)) return 'Please enter a valid amount.';
    if (!UNITS.includes(unit)) return 'Please choose a unit.';
    await DB.put('logs', { ...(r || {}), peptideId: +f.get('p'), ts, note: f.get('n').trim(), amount: amt, unit: amt === null ? null : unit, site: f.get('s').trim() || null, vialId: f.get('v') ? +f.get('v') : null, mood: f.get('m') ? +f.get('m') : null, tags: f.get('g').split(',').map(x => x.trim()).filter(Boolean).slice(0, 8) });
  });
}
function weightForm(r) {
  const t = parts(r ? r.ts : undefined);
  const val = r ? (S.unit === 'lb' ? r.kg * LB : r.kg).toFixed(1) : '';
  openForm(r ? 'Edit weight' : 'Log weight', `
    <label>Weight (${S.unit})<input type="number" name="w" inputmode="decimal" step="0.1" min="1" required value="${val}"></label>
    <label>Date<input type="date" name="d" required value="${t.date}"></label>
    <label>Time (optional)<input type="time" name="t" value="${!r || r.hasTime ? (r ? t.time : t.time) : ''}"></label>
    ${photoField(r)}
    <label>Note (optional)<textarea name="n" maxlength="500">${esc(r && r.note)}</textarea></label>`,
  async f => {
    let kg = parseFloat(f.get('w')); if (S.unit === 'lb') kg /= LB;
    if (!isFinite(kg) || kg < 1 || kg > 700) return 'Please enter a realistic weight.';
    const time = f.get('t'), ts = toISO(f.get('d'), time);
    if (!f.get('d') || isNaN(new Date(ts))) return 'Please enter a valid date.';
    await DB.put('weights', { ...(r || {}), kg: Math.round(kg * 1000) / 1000, ts, hasTime: !!time, note: f.get('n').trim(), photo: await photoFrom(f, r) });
  });
}
function peptideForm(r) {
  openForm(r ? 'Edit entry' : 'New entry', `
    <div class="seg" role="radiogroup" aria-label="Category">${[['peptide', 'Peptide'], ['steroid', 'Steroid']].map(([v, l]) => `<label><input type="radio" name="c" value="${v}" ${(r ? r.category : 'peptide') === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
    <label>Name<input name="n" required maxlength="60" value="${esc(r && r.name)}"></label>
    <label>Note (optional)<textarea name="o" maxlength="500">${esc(r && r.note)}</textarea></label>
    <label>Remind me every<div class="row"><input type="number" name="ev" min="1" max="365" inputmode="numeric" placeholder="(no reminder)" value="${r && r.everyDays ? (r.everyDays % 7 ? r.everyDays : r.everyDays / 7) : ''}"><select name="eu"><option value="1">days</option><option value="7" ${r && r.everyDays && r.everyDays % 7 === 0 ? 'selected' : ''}>weeks</option></select></div></label>
    <label>Reminder time<input type="time" name="at" value="${esc((r && r.at) || '09:00')}"></label>
    <small>Reminders only repeat the interval you enter. The app does not suggest intervals or amounts.</small>`,
  async f => {
    const name = f.get('n').trim();
    if (!name) return 'Name is required.';
    if (S.peptides.some(p => p.name.toLowerCase() === name.toLowerCase() && (!r || p.id !== r.id))) return 'That name already exists.';
    const n = parseInt(f.get('ev'), 10), days = f.get('ev') ? n * +f.get('eu') : null;
    if (f.get('ev') && !(n >= 1 && days <= 365)) return 'Reminder interval must be between 1 and 365 days.';
    await DB.put('peptides', { archived: false, created: new Date().toISOString(), ...(r || {}), name, category: f.get('c') === 'steroid' ? 'steroid' : 'peptide', note: f.get('o').trim(), everyDays: days, at: f.get('at') || '09:00' });
  });
}
const showLog = r => openDetail(pName(r.peptideId), `<p>${tag(cat(r.peptideId))}${fmtDT(r.ts)}</p>${r.amount ? `<p class="big">${fmtAmt(r)}</p>` : ''}${extraLines(r)}<p>${r.note ? esc(r.note) : '<span class="mu">No note</span>'}</p><small>Recorded event (not a schedule or recommendation)</small>`, () => logForm(r), () => DB.del('logs', r.id));
const showWeight = r => openDetail(fmtW(r.kg), `<p>${r.hasTime ? fmtDT(r.ts) : fmtD(r.ts)}</p><p>${r.note ? esc(r.note) : '<span class="mu">No note</span>'}</p>${r.photo ? `<img class="ph" src="${r.photo}" alt="Progress photo" style="aspect-ratio:auto;max-height:55vh;object-fit:contain">` : ''}`, () => weightForm(r), () => DB.del('weights', r.id));

/* ---------- charts ---------- */
function mk(id, cfg) {
  const c = document.getElementById(id); if (!c) return;
  if (S.charts[id]) S.charts[id].destroy();
  if (typeof Chart === 'undefined') { c.parentElement.innerHTML = '<p class="empty">Chart.js is missing. Add vendor/chart.umd.js (see README).</p>'; return; }
  Chart.defaults.color = 'rgba(255,255,255,.75)'; Chart.defaults.borderColor = 'rgba(255,255,255,.12)';
  S.charts[id] = new Chart(c, { ...cfg, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, ...cfg.options } });
}
const weightsInRange = () => { const d = S.range === 'all' ? 0 : +S.range; const cut = d ? Date.now() - d * 864e5 : 0; return S.weights.filter(w => new Date(w.ts) >= cut).sort(byTs); };
const rangeSel = () => `<label>Range<select id="range">${[['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '1 year'], ['all', 'All records']].map(([v, l]) => `<option value="${v}" ${S.range === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
function drawWeight() {
  const w = weightsInRange(); if (!w.length) return;
  mk('cw', { type: 'line', data: { labels: w.map(x => x.hasTime ? fmtDT(x.ts) : fmtD(x.ts)), datasets: [{ data: w.map(x => +(S.unit === 'lb' ? x.kg * LB : x.kg).toFixed(1)), borderColor: '#0a84ff', backgroundColor: '#0a84ff', tension: .2, pointRadius: 3 }] }, options: { scales: { x: { ticks: { maxTicksLimit: 5 } }, y: { title: { display: true, text: S.unit } } } } });
}
function drawCounts() {
  if (!S.logs.length) return;
  const days = {}, C = { peptide: '#64d2ff', steroid: '#ff9f0a' };
  S.logs.forEach(l => { const k = parts(l.ts).date; (days[k] = days[k] || { peptide: 0, steroid: 0 })[cat(l.peptideId)]++; });
  const keys = Object.keys(days).sort();
  mk('c1', { type: 'bar', data: { labels: keys.map(k => fmtD(k + 'T12:00')), datasets: ['peptide', 'steroid'].map(c => ({ label: CL[c], data: keys.map(k => days[k][c]), backgroundColor: C[c], borderRadius: 4 })) }, options: { plugins: { legend: { display: true } }, scales: { x: { stacked: true, ticks: { maxTicksLimit: 5 } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } } });
  const per = {}; S.logs.forEach(l => { const n = pName(l.peptideId); per[n] = per[n] || { n: 0, c: cat(l.peptideId) }; per[n].n++; });
  const names = Object.keys(per);
  mk('c2', { type: 'bar', data: { labels: names, datasets: [{ data: names.map(n => per[n].n), backgroundColor: names.map(n => C[per[n].c]), borderRadius: 4 }] }, options: { indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } } });
}

/* ---------- views ---------- */
const empty = m => `<p class="empty">${m}</p>`;
function vHome() {
  const now = new Date(), lw = [...S.weights].sort(byTs).pop(), ll = [...S.logs].sort(byTs).pop();
  const month = S.logs.length + S.weights.length && [...S.logs, ...S.weights].filter(r => { const d = new Date(r.ts); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }).length;
  const recent = [...S.logs.map(l => ({ ...l, k: 'l' })), ...S.weights.map(w => ({ ...w, k: 'w' }))].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 8);
  return `<p class="mu">${now.toLocaleDateString(undefined, { dateStyle: 'full' })}</p>
  <div class="grid"><div class="card"><small>Latest weight</small><div class="big">${lw ? fmtW(lw.kg) : '—'}</div><small>${lw ? fmtD(lw.ts) : 'No entries'}</small></div>
  <div class="card"><small>Last log</small><div class="big">${ll ? fmtD(ll.ts) : '—'}</div><small>${ll ? new Date(ll.ts).toLocaleTimeString(undefined, { timeStyle: 'short' }) : 'No entries'}</small></div></div>
  <div class="card" style="margin-top:12px"><small>Records created this month</small><div class="big">${month || 0}</div><small>${mc('peptide')} peptide · ${mc('steroid')} steroid logs</small></div>
  <div class="row"><button class="primary" data-a="newlog">Log entry</button><button class="primary" data-a="newweight">Log weight</button><button class="ghost" data-a="repeat">Repeat last</button></div>
  ${remCard()}
  <div class="card"><h2>Recent activity</h2>${recent.length ? `<ul>${recent.map(r => `<li><button class="item" data-a="${r.k === 'l' ? 'showlog' : 'showw'}" data-id="${r.id}">${r.k === 'l' ? tag(cat(r.peptideId)) : '<span class="tag weight">Weight</span>'}${r.k === 'l' ? esc(pName(r.peptideId)) : fmtW(r.kg)}<br><small>${fmtDT(r.ts)}${r.k === 'l' && r.amount ? ' · ' + fmtAmt(r) : ''}</small></button></li>`).join('')}</ul>` : empty('Nothing recorded yet.')}</div>`;
}
function vLog() {
  let l = [...S.logs].sort((a, b) => b.ts.localeCompare(a.ts));
  if (S.cat !== 'all') l = l.filter(x => cat(x.peptideId) === S.cat);
  if (S.f.q) { const q = S.f.q.toLowerCase(); l = l.filter(x => [pName(x.peptideId), x.note, x.site, (x.tags || []).join(' ')].join(' ').toLowerCase().includes(q)); }
  if (S.f.p) l = l.filter(x => x.peptideId === +S.f.p);
  if (S.f.from) l = l.filter(x => parts(x.ts).date >= S.f.from);
  if (S.f.to) l = l.filter(x => parts(x.ts).date <= S.f.to);
  return `<div class="row"><button class="primary" data-a="newlog">Log entry</button><button class="ghost" data-a="repeat">Repeat last</button></div>
  ${catBar()}<div class="card"><h2>History</h2><div class="row"><label>Entry<select id="fp"><option value="">All</option>${S.peptides.filter(p => S.cat === 'all' || (p.category || 'peptide') === S.cat).map(p => `<option value="${p.id}" ${+S.f.p === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
  <label>From<input type="date" id="ff" value="${S.f.from}"></label><label>To<input type="date" id="ft" value="${S.f.to}"></label></div><label>Search<input type="search" id="fq" value="${esc(S.f.q)}" placeholder="entry, note, site, tag"></label>
  ${l.length ? `<ul>${l.map(r => `<li><button class="item" data-a="showlog" data-id="${r.id}">${tag(cat(r.peptideId))}<strong>${esc(pName(r.peptideId))}</strong><br><small>${fmtDT(r.ts)}${r.amount ? ' · ' + fmtAmt(r) : ''}${r.site ? ' · ' + esc(r.site) : ''}${r.note ? ' · ' + esc(r.note.slice(0, 40)) : ''}</small></button></li>`).join('')}</ul>` : empty(S.logs.length ? 'No records match the filters.' : 'No peptide records yet.')}</div>
  <div class="card"><h2>Entries</h2><button class="ghost" data-a="newpep">Add entry</button>
  ${S.peptides.length ? `<ul>${S.peptides.filter(p => S.cat === 'all' || (p.category || 'peptide') === S.cat).map(p => `<li class="row" style="align-items:center"><span style="flex:2">${tag(p.category || 'peptide')}${esc(p.name)} ${p.archived ? '<span class="tag">archived</span>' : ''}<br><small>${esc(p.note)} · created ${fmtD(p.created)}${p.everyDays ? ' · every ' + p.everyDays + ' d' : ''}</small></span><button class="ghost" data-a="renpep" data-id="${p.id}">Edit</button> ${p.everyDays ? `<button class="ghost" data-a="ics" data-id="${p.id}">Calendar</button>` : ''}<button class="ghost" data-a="arcpep" data-id="${p.id}">${p.archived ? 'Restore' : 'Archive'}</button></li>`).join('')}</ul>` : empty('No entries yet. Add your own names.')}</div>`;
}
function vWeight() {
  const w = weightsInRange(), all = [...S.weights].sort((a, b) => b.ts.localeCompare(a.ts));
  return `<div class="row"><button class="primary" data-a="newweight">Log weight</button></div>
  <div class="card">${rangeSel()}${w.length ? '<div class="cv"><canvas id="cw" role="img" aria-label="Weight over time"></canvas></div>' : empty('No weight records in this range.')}
  <small>Charts show only recorded values. Weight changes do not by themselves indicate fat gain or loss.</small></div>
  <div class="card"><h2>History</h2>${all.length ? `<ul>${all.map(r => `<li><button class="item" data-a="showw" data-id="${r.id}"><strong>${fmtW(r.kg)}</strong>${r.photo ? ' <span class="tag">Photo</span>' : ''}<br><small>${r.hasTime ? fmtDT(r.ts) : fmtD(r.ts)}${r.note ? ' · ' + esc(r.note.slice(0, 40)) : ''}</small></button></li>`).join('')}</ul>` : empty('No weight records yet.')}</div>`;
}
function vCharts() {
  if (!S.logs.length) return `<div class="card">${empty('Log a peptide entry to see charts.')}</div>`;
  return `<div class="card"><h2>Recorded events per day</h2><div class="cv"><canvas id="c1" role="img" aria-label="Events per day"></canvas></div></div>
  <div class="card"><h2>Records by entry</h2><div class="cv"><canvas id="c2" role="img" aria-label="Records grouped by peptide"></canvas></div></div>`;
}
function vSettings() {
  return `${appearance()}<div class="card"><h2>Weight unit</h2><select id="unit"><option value="kg" ${S.unit === 'kg' ? 'selected' : ''}>Kilograms</option><option value="lb" ${S.unit === 'lb' ? 'selected' : ''}>Pounds</option></select><small>Values are always stored in kg.</small></div>
  <div class="card"><h2>Backup</h2><div class="row"><button class="ghost" data-a="xexport">Encrypted export</button><button class="ghost" data-a="export">Plain JSON</button><button class="ghost" data-a="import">Import JSON</button></div><input type="file" id="file" accept="application/json,.json" hidden>
  <small>Encrypted backups use AES-256-GCM with a key derived from your password (PBKDF2); a forgotten password cannot be recovered. Plain JSON is unencrypted private data. Importing replaces all current data.</small></div>
  <div class="card"><h2>Privacy</h2><small>All records stay in this browser's IndexedDB on this device. Nothing is sent anywhere and there is no sync or analytics. Data can be lost if website data is cleared or the device is lost, so export backups regularly. This app does not encrypt data. It is a logging tool only and gives no medical advice, doses, or reminders.</small></div>
  <div class="card"><h2>Install on iPhone</h2><small>Open the site in Safari → Share → Add to Home Screen → Add. Reminders show inside the app and on its icon badge when the app runs. A website cannot send reliable background notifications on iOS, so for real alerts use Log → Calendar on an entry to add a repeating calendar reminder (the entry name appears in your calendar).</small></div>
  <div class="card"><button class="danger" data-a="wipe">Delete all data</button></div>`;
}

const VIEWS = { home: ['Home', vHome], log: ['Log', vLog], weight: ['Weight', vWeight], charts: ['Charts', vCharts], settings: ['Settings', vSettings] };
function render() {
  const [t, fn] = VIEWS[S.view];
  $('#title').textContent = t; $('#view').innerHTML = fn();
  document.querySelectorAll('nav button').forEach(b => b.toggleAttribute('aria-current', b.dataset.v === S.view) || b.removeAttribute('aria-current'));
  document.querySelectorAll('nav button').forEach(b => { if (b.dataset.v === S.view) b.setAttribute('aria-current', 'page'); });
  if (S.view === 'weight') drawWeight(); if (S.view === 'charts') drawCounts();
  try { const n = dueList().filter(x => x.state === 'over' || x.state === 'today').length; if (navigator.setAppBadge) { n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } } catch (e) { /* badge not supported */ }
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
    d.peptides.forEach(p => { p.category = p.category === 'steroid' ? 'steroid' : 'peptide'; p.everyDays = Number.isInteger(p.everyDays) && p.everyDays >= 1 && p.everyDays <= 365 ? p.everyDays : null; });
    d.logs.forEach(l => { const ok = typeof l.amount === 'number' && isFinite(l.amount) && l.amount > 0 && UNITS.includes(l.unit); l.amount = ok ? l.amount : null; l.unit = ok ? l.unit : null; });
    await DB.replaceAll({ peptides: d.peptides, logs: d.logs, weights: d.weights, meta: [{ key: 'unit', value: d.unit === 'lb' ? 'lb' : 'kg' }, ...(S.bg ? [{ key: 'bg', value: S.bg }] : [])] });
    await load(); render(); toast('Import complete.');
  } catch (x) { toast('Import failed: ' + x.message); }
}

/* ---------- events ---------- */
document.addEventListener('click', async e => {
  const nb = e.target.closest('nav button'); if (nb) { S.view = nb.dataset.v; render(); scrollTo(0, 0); return; }
  const b = e.target.closest('[data-a]'); if (!b) return;
  const id = +b.dataset.id, a = b.dataset.a;
  try {
    if (a === 'bg') { S.bg = { type: 'preset', id: b.dataset.id }; await DB.put('meta', { key: 'bg', value: S.bg }); applyBg(); render(); }
    else if (a === 'bgphoto') $('#bgfile').click();
    else if (a === 'bgreset') { await DB.del('meta', 'bg'); S.bg = null; applyBg(); render(); }
    else if (a === 'cat') { S.cat = b.dataset.v; render(); } else if (a === 'newlog') logForm(); else if (a === 'newweight') weightForm(); else if (a === 'newpep') peptideForm();
    else if (a === 'showlog') showLog(S.logs.find(x => x.id === id)); else if (a === 'showw') showWeight(S.weights.find(x => x.id === id));
    else if (a === 'renpep') peptideForm(S.peptides.find(x => x.id === id));
    else if (a === 'arcpep') { const p = S.peptides.find(x => x.id === id); await DB.put('peptides', { ...p, archived: !p.archived }); await load(); render(); }
    else if (a === 'ics') exportIcs(S.peptides.find(x => x.id === id));
    else if (a === 'import') $('#file').click();
    else if (a === 'export') {
      const data = snapshot();
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
  else if (t.id === 'bgfile' && t.files[0]) { try { S.bg = { type: 'image', data: await readBg(t.files[0]) }; await DB.put('meta', { key: 'bg', value: S.bg }); applyBg(); render(); } catch (x) { toast('Could not use image: ' + x.message); } t.value = ''; }
  else if (t.id === 'file' && t.files[0]) { await doImport(t.files[0]); t.value = ''; }
});

document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#dlg').open && DB._db) render(); });
extraInit();
(async () => {
  try { await DB.open(); await load(); render(); }
  catch (x) { $('#view').innerHTML = `<div class="card"><h2>Storage unavailable</h2><p>${esc(x.message)}</p><p class="mu">Private browsing or blocked storage can cause this.</p></div>`; }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
})();
