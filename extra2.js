'use strict';
/* Extras 2: symptoms, templates, site map, check-in reminders (snooze/skip), analytics, doctor report, backup tools, PIN lock.
   Loaded before app.js; extra2Init() is called at the end of extraInit(). */
const SITES = ['Abdomen left', 'Abdomen right', 'Thigh left', 'Thigh right', 'Glute left', 'Glute right', 'Deltoid left', 'Deltoid right'];
const savePrefs = () => DB.put('meta', { key: 'prefs', value: S.prefs });
const rlabel = r => r.kind === 'weight' ? 'Weigh-in' : r.kind === 'photo' ? 'Weight photo' : r.name;
const metaFor = d => [{ key: 'unit', value: d.unit === 'lb' ? 'lb' : 'kg' }, ...(S.bg ? [{ key: 'bg', value: S.bg }] : []), ...(S.pin ? [{ key: 'pin', value: S.pin }] : []), ...(S.bio ? [{ key: 'bio', value: S.bio }] : []), ...(S.lastBackup ? [{ key: 'lastBackup', value: S.lastBackup }] : []), { key: 'prefs', value: cleanPrefs(d.prefs) }];
function cleanPrefs(p) {
  const o = {}; if (!p || typeof p !== 'object') return o;
  if (typeof p.goalKg === 'number' && p.goalKg > 0 && p.goalKg < 700) o.goalKg = p.goalKg;
  if (Number.isInteger(p.backupDays) && p.backupDays > 0 && p.backupDays <= 365) o.backupDays = p.backupDays;
  if ([0, 1, 5, 15].includes(p.lockMin)) o.lockMin = p.lockMin;
  if (['en', 'ru'].includes(p.lang)) o.lang = p.lang; if (typeof p.blur === 'boolean') o.blur = p.blur;
  o.hide = (Array.isArray(p.hide) ? p.hide : []).filter(k => typeof k === 'string' && k.length < 40).slice(0, 80);
  o.hidden = (Array.isArray(p.hidden) ? p.hidden : []).filter(x => ['log', 'journal', 'health', 'weight', 'stock', 'charts'].includes(x));
  o.mrem = (Array.isArray(p.mrem) ? p.mrem : []).filter(r => r && Number.isInteger(r.id) && ['weight', 'photo', 'metric'].includes(r.kind) && typeof r.name === 'string' && Number.isInteger(r.days) && r.days >= 1 && r.days <= 365).map(r => ({ id: r.id, kind: r.kind, name: r.name.slice(0, 40), days: r.days, at: /^\d\d:\d\d$/.test(r.at) ? r.at : '09:00' }));
  o.templates = (Array.isArray(p.templates) ? p.templates : []).filter(t => t && Number.isInteger(t.id) && Number.isInteger(t.peptideId) && typeof t.name === 'string').map(t => ({ id: t.id, name: t.name.slice(0, 40), peptideId: t.peptideId, amount: typeof t.amount === 'number' && t.amount > 0 ? t.amount : null, unit: UNITS.includes(t.unit) ? t.unit : null, site: typeof t.site === 'string' ? t.site.slice(0, 40) : null, vialId: Number.isInteger(t.vialId) ? t.vialId : null }));
  return o;
}

/* ---------- symptoms and templates (Log tab) ---------- */
function symForm(y) {
  const t = parts(y ? y.ts : undefined);
  openForm(y ? 'Edit symptom' : 'Log symptom / side effect', `<label>What did you notice?<input name="x" required maxlength="200" value="${esc(y && y.text)}"></label>
  <label>Severity (1–5)<select name="s">${[1, 2, 3, 4, 5].map(n => `<option ${y && y.sev === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
  <label>Date<input type="date" name="d" required value="${t.date}"></label><label>Time<input type="time" name="t" required value="${t.time}"></label>`, async f => {
    const text = f.get('x').trim(), ts = toISO(f.get('d'), f.get('t'));
    if (!text) return 'Please describe it.'; if (isNaN(new Date(ts))) return 'Please enter a valid date and time.';
    await DB.put('symptoms', { ...(y || {}), text, sev: +f.get('s'), ts });
  });
}
const symCard = () => `<div class="card"><h2>Symptoms &amp; side effects</h2><button class="ghost" data-a="newsym">Log symptom</button>${S.symptoms.length ? `<ul>${[...S.symptoms].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 8).map(y => `<li><button class="item" data-a="showsym" data-id="${y.id}"><span class="tag" style="background:rgba(255,107,97,.25);color:#ff8a80">${y.sev}/5</span>${esc(y.text)}<br><small>${fmtDT(y.ts)}</small></button></li>`).join('')}</ul>` : empty('Nothing logged.')}<small>Shown as red ticks on the weight chart. A record only; no interpretation.</small></div>`;
const tplCard = () => { const T = S.prefs.templates || []; return `<div class="card"><h2>Templates</h2><button class="ghost" data-a="newtpl">New template</button>${T.length ? `<ul>${T.map(t => `<li class="row" style="align-items:center"><span style="flex:2"><strong>${esc(t.name)}</strong><br><small>${esc(pName(t.peptideId))}${t.amount ? ' · ' + t.amount + ' ' + t.unit : ''}${t.site ? ' · ' + esc(t.site) : ''}</small></span><button class="ghost" data-a="usetpl" data-id="${t.id}">Use</button><button class="danger" data-a="deltpl" data-id="${t.id}" aria-label="Delete template">✕</button></li>`).join('')}</ul>` : empty('No templates yet.')}<small>Templates only prefill what you saved; you can change everything before saving.</small></div>`; };
function tplForm() {
  const ents = S.peptides.filter(p => !p.archived); if (!ents.length) { toast('Add an entry first.'); return; }
  openForm('New template', `<label>Template name<input name="n" required maxlength="40"></label>
  <label>Entry<select name="p">${ents.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
  <label>Amount (optional)<div class="row"><input name="a" type="number" step="any" min="0" inputmode="decimal"><select name="u" aria-label="Unit">${UNITS.map(u => `<option>${u}</option>`).join('')}</select></div></label>
  <label>Site (optional)<input name="s" maxlength="40" list="tsites"><datalist id="tsites">${SITES.map(x => `<option value="${x}">`).join('')}</datalist></label>
  <label>Vial (optional)<select name="v"><option value="">None</option>${S.vials.filter(v => !v.archived).map(v => `<option value="${v.id}">${esc(pName(v.peptideId))}${v.label ? ' · ' + esc(v.label) : ''}</option>`).join('')}</select></label>`, async f => {
    const name = f.get('n').trim(), a = f.get('a') ? parseFloat(f.get('a')) : null;
    if (!name) return 'Name is required.'; if (a !== null && !(a > 0 && a <= 100000)) return 'Please enter a valid amount.';
    S.prefs.templates = [...(S.prefs.templates || []), { id: Date.now(), name, peptideId: +f.get('p'), amount: a, unit: a ? f.get('u') : null, site: f.get('s').trim() || null, vialId: f.get('v') ? +f.get('v') : null }];
    await savePrefs();
  });
}

/* ---------- reminders: entries + check-ins, with snooze / skip ---------- */
function dueFrom(last, days, at, key) {
  const sk = (S.prefs.skip || {})[key]; if (sk && (!last || sk > last)) last = sk;
  if (!last) return { state: 'none', key };
  const d = new Date(last); d.setDate(d.getDate() + days); const [h, m] = (at || '09:00').split(':'); d.setHours(+h, +m, 0, 0);
  const n = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / DAY), sn = (S.prefs.snooze || {})[key], snz = sn && sn > new Date().toISOString();
  return { due: d, n, key, snooze: snz ? sn : null, state: snz ? 'snz' : n > 0 ? 'over' : n === 0 ? 'today' : 'soon' };
}
const lastOf = r => { const pick = a => a.sort(byTs).pop(); const x = r.kind === 'weight' ? pick([...S.weights]) : r.kind === 'photo' ? pick(S.weights.filter(w => w.photo)) : pick(S.metrics.filter(m => m.name.toLowerCase() === r.name.toLowerCase())); return x && x.ts; };
function dueList2() {
  return S.peptides.filter(p => !p.archived && p.everyDays).map(p => { const l = S.logs.filter(x => x.peptideId === p.id).sort(byTs).pop(); return { p, ...dueFrom(l && l.ts, p.everyDays, p.at, 'e' + p.id) }; });
}
function remCard2() {
  const rows = [...dueList().map(x => ({ ...x, label: tag(x.p.category || 'peptide') + esc(x.p.name) })), ...(S.prefs.mrem || []).map(r => ({ ...dueFrom(lastOf(r), r.days, r.at, 'm' + r.id), label: '<span class="tag weight">Check-in</span>' + esc(rlabel(r)) }))];
  const o = { over: 0, today: 1, snz: 2, soon: 3, none: 4 }; rows.sort((a, b) => o[a.state] - o[b.state] || (a.due || 0) - (b.due || 0));
  const nx = S.vials.filter(v => !v.archived && expired(v)).length;
  return (rows.length ? `<div class="card"><h2>Reminders</h2>${rows.map(x => `<div class="rem"><span>${x.label}</span><span class="st ${x.state}">${x.state === 'snz' ? 'Snoozed until ' + new Date(x.snooze).toLocaleTimeString(undefined, { timeStyle: 'short' }) : rLabel(x)}</span><button class="ghost" data-a="remopt" data-k="${x.key}" aria-label="Reminder options" style="flex:0 0 auto;min-height:34px;padding:2px 12px">⋯</button></div>`).join('')}<small>Based on the intervals you set. Skipping restarts the interval.</small></div>` : '')
    + (nx ? `<div class="card"><small>${nx} vial${nx > 1 ? 's are' : ' is'} past the expiry date you entered (Stock tab).</small></div>` : '');
}
function remOptions(key) {
  const nm = key[0] === 'e' ? pName(+key.slice(1)) : rlabel((S.prefs.mrem || []).find(r => 'm' + r.id === key) || { kind: 'metric', name: '?' });
  openForm('Reminder options', `<label>Action<select name="a"><option value="1h">Snooze 1 hour</option><option value="tm">Snooze until tomorrow 09:00</option><option value="skip">Mark as skipped</option></select></label><label>Reason if skipped (optional)<input name="r" maxlength="120"></label>`, async f => {
    S.prefs.snooze = S.prefs.snooze || {}; S.prefs.skip = S.prefs.skip || {}; const now = new Date(), a = f.get('a');
    if (a === '1h') S.prefs.snooze[key] = new Date(now.getTime() + 36e5).toISOString();
    else if (a === 'tm') { const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(9, 0, 0, 0); S.prefs.snooze[key] = t.toISOString(); }
    else { S.prefs.skip[key] = now.toISOString(); S.prefs.skipLog = [...(S.prefs.skipLog || []), { name: nm, ts: now.toISOString(), reason: f.get('r').trim() }].slice(-100); }
    await savePrefs();
  });
}
function remForm() {
  const names = [...new Set(S.metrics.map(m => m.name))];
  openForm('Add check-in reminder', `<label>What<select name="k"><option value="weight">Weigh-in</option><option value="photo">Weight photo</option><option value="metric">Measurement</option></select></label>
  <label>Measurement name (only for "Measurement")<input name="n" maxlength="40" list="rn"><datalist id="rn">${[...new Set([...BODY_NAMES, ...names])].map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
  <label>Repeat every (days)<input name="d" type="number" min="1" max="365" inputmode="numeric" required></label><label>Time<input name="t" type="time" value="09:00" required></label>`, async f => {
    const days = parseInt(f.get('d'), 10), k = f.get('k'), name = f.get('n').trim();
    if (!(days >= 1 && days <= 365)) return 'Interval must be between 1 and 365 days.'; if (k === 'metric' && !name) return 'Enter the measurement name.';
    S.prefs.mrem = [...(S.prefs.mrem || []), { id: Date.now(), kind: k, name: k === 'metric' ? name : '', days, at: f.get('t') || '09:00' }]; await savePrefs();
  });
}
function icsBlock(name, days, st, wd) {
  const f = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`, nm = name.replace(/[\\;,\r\n]/g, ' ');
  return ['BEGIN:VEVENT', `UID:${crypto.randomUUID()}@private-tracker`, `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, '')}`, `DTSTART:${f(st)}`, wd && wd.length ? `RRULE:FREQ=WEEKLY;BYDAY=${wd.map(i => ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'][i]).join(',')}` : `RRULE:FREQ=DAILY;INTERVAL=${days}`, `SUMMARY:Reminder: ${nm}`, 'BEGIN:VALARM', 'TRIGGER:PT0S', 'ACTION:DISPLAY', `DESCRIPTION:Reminder: ${nm}`, 'END:VALARM', 'END:VEVENT'];
}
function exportAllIcs() {
  const it = [...dueList().map(x => ({ name: x.p.name, days: x.p.everyDays, at: x.p.at, due: x.due, wd: x.p.weekdays })), ...(S.prefs.mrem || []).map(r => ({ name: rlabel(r), days: r.days, at: r.at, due: dueFrom(lastOf(r), r.days, r.at, 'm' + r.id).due }))];
  if (!it.length) { toast('No reminders set.'); return; }
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Private Tracker//EN'];
  it.forEach(i => { const [h, m] = (i.at || '09:00').split(':'); const st = i.wd && i.wd.length ? nextOcc(i.wd, i.at) : i.due && i.due > new Date() ? i.due : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(+h, +m, 0, 0); return d; })(); L.push(...icsBlock(i.name, i.days, st, i.wd)); });
  L.push('END:VCALENDAR'); saveFile('reminders.ics', L.join('\r\n'), 'text/calendar');
}

/* ---------- analytics ---------- */
const eventsPlugin = w => ({ id: 'ev', afterDatasetsDraw(ch) {
  const x = ch.scales.x, y = ch.scales.y, c = ch.ctx, t0 = new Date(w[0].ts).getTime(), t1 = new Date(w[w.length - 1].ts).getTime();
  const px = ts => { const t = new Date(ts).getTime(); if (t < t0 - DAY || t > t1 + DAY) return null; let i = w.findIndex(q => new Date(q.ts).getTime() >= t); if (i < 0) i = w.length - 1; return x.getPixelForValue(i); };
  c.save();
  S.logs.forEach(l => { const p = px(l.ts); if (p == null) return; c.fillStyle = { peptide: '#64d2ff', steroid: '#ff9f0a', other: '#bf5af2' }[cat(l.peptideId)]; c.fillRect(p - 1, y.bottom - 9, 2, 9); });
  S.symptoms.forEach(s => { const p = px(s.ts); if (p == null) return; c.fillStyle = '#ff6b61'; c.fillRect(p - 1, y.top, 2, 9); });
  S.vials.forEach(v => { const p = px(v.date + 'T12:00'); if (p == null) return; c.strokeStyle = '#bf5af2'; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(p, y.top); c.lineTo(p, y.bottom); c.stroke(); });
  c.restore();
} });
function drawWeight2() {
  const w = weightsInRange(); if (!w.length) return;
  const cv = k => +(S.unit === 'lb' ? k * LB : k).toFixed(1);
  const ma = w.map(x => { const t = new Date(x.ts).getTime(), g = w.filter(y => { const u = new Date(y.ts).getTime(); return u <= t && u >= t - 7 * DAY; }); return cv(g.reduce((a, y) => a + y.kg, 0) / g.length); });
  const ds = [{ label: 'Weight', data: w.map(x => cv(x.kg)), borderColor: '#0a84ff', backgroundColor: '#0a84ff', tension: .2, pointRadius: 3 }, { label: '7-day average', data: ma, borderColor: 'rgba(255,255,255,.6)', borderDash: [4, 4], pointRadius: 0, tension: .3 }];
  if (S.prefs.goalKg) ds.push({ label: 'Goal', data: w.map(() => cv(S.prefs.goalKg)), borderColor: '#30d158', borderDash: [2, 4], pointRadius: 0 });
  mk('cw', { type: 'line', data: { labels: w.map(x => x.hasTime ? fmtDT(x.ts) : fmtD(x.ts)), datasets: ds }, plugins: [eventsPlugin(w), coursePlugin(w)], options: { plugins: { legend: { display: true, labels: { boxWidth: 12 } } }, scales: { x: { ticks: { maxTicksLimit: 5 } }, y: { title: { display: true, text: S.unit } } } } });
}
const withPeriod = fn => (...a) => { const keep = S.logs; if (S.sp !== 'all') { const cut = Date.now() - S.sp * DAY; S.logs = S.logs.filter(l => new Date(l.ts) >= cut); } try { return fn(...a); } finally { S.logs = keep; } };
const periodBar = () => `<div class="seg" role="group" aria-label="Period">${[['all', 'All time'], ['30', '30 d'], ['90', '90 d'], ['365', '1 year']].map(([v, l]) => `<button data-a="sp" data-v="${v}" class="${S.sp === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
function mstat(off) {
  const d = new Date(); d.setMonth(d.getMonth() - off, 1); const y = d.getFullYear(), m = d.getMonth(), inM = x => { const t = new Date(x.ts); return t.getFullYear() === y && t.getMonth() === m; };
  const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null, L = S.logs.filter(inM);
  return { label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), n: L.length, w: avg(S.weights.filter(inM).map(x => x.kg)), mood: avg(L.map(x => x.mood).filter(Boolean)), sym: S.symptoms.filter(inM).length };
}
function compareCard() {
  const a = mstat(0), b = mstat(1), col = s => `<div><small>${esc(s.label)}</small><div class="big">${s.n}</div><small>entries<br>avg weight: ${s.w == null ? '—' : fmtW(s.w)}<br>avg feeling: ${s.mood == null ? '—' : s.mood.toFixed(1) + '/5'}<br>symptoms: ${s.sym}</small></div>`;
  return `<div class="card"><h2>This month vs last month</h2><div class="cmp">${col(a)}${col(b)}</div><small>Plain numbers from your records; no conclusions drawn.</small></div>`;
}
function siteMap() {
  const st = {}; S.logs.filter(l => l.site).forEach(l => { const k = l.site.trim().toLowerCase(), o = st[k] = st[k] || { name: l.site, last: '', n30: 0 }; if (l.ts > o.last) o.last = l.ts; if (Date.now() - new Date(l.ts) < 30 * DAY) o.n30++; });
  if (!Object.keys(st).length) return '';
  const ago = o => { const n = Math.round((Date.now() - new Date(o.last)) / DAY); return n <= 0 ? 'today' : n + ' d ago'; };
  const Z = { 'abdomen left': [128, 138], 'abdomen right': [92, 138], 'thigh left': [126, 210], 'thigh right': [94, 210], 'deltoid left': [158, 92], 'deltoid right': [62, 92] };
  const dots = Object.entries(Z).map(([k, [x, y]]) => { const o = st[k]; return `<circle cx="${x}" cy="${y}" r="14" fill="${o ? '#64d2ff' : 'none'}" fill-opacity="${o ? Math.min(.85, .3 + o.n30 * .15) : 0}" stroke="#fff" stroke-opacity=".6"/>${o ? `<text x="${x}" y="${y + 3}" text-anchor="middle" font-size="9" fill="#fff">${ago(o).replace(' ago', '')}</text>` : ''}`; }).join('');
  const list = Object.values(st).sort((a, b) => b.last.localeCompare(a.last));
  return `<div class="card"><h2>Injection sites</h2><svg viewBox="0 0 220 300" style="width:100%;max-width:240px;display:block;margin:auto" role="img" aria-label="Body diagram with logged sites"><g fill="none" stroke="#fff" stroke-opacity=".35"><circle cx="110" cy="30" r="18"/><path d="M80 60h60l16 70-9 4-8-30-4 80 8 90h-24l-9-70-9 70H81l8-90-4-80-8 30-9-4z"/></g>${dots}</svg>
  <ul>${list.map(o => `<li class="rem"><span>${esc(o.name)}</span><span class="st soon">${ago(o)} · ${o.n30}× in 30 d</span></li>`).join('')}</ul><small>Shows only where and when you logged. Numbers in circles = days since last use; the app gives no rotation advice. Glute sites are listed but not drawn.</small></div>`;
}

/* ---------- doctor report ---------- */
function reportForm() {
  const f0 = new Date(); f0.setDate(f0.getDate() - 90);
  openForm('Report for a doctor', `<label>From<input type="date" name="a" required value="${parts(f0).date}"></label><label>To<input type="date" name="b" required value="${parts().date}"></label><small>Creates a printable summary of what you recorded. Use Print → Save as PDF.</small>`, async f => {
    if (f.get('a') > f.get('b')) return 'The start date must be before the end date.'; showReport(f.get('a'), f.get('b'));
  });
}
function showReport(a, b) {
  const inR = x => { const d = parts(x.ts).date; return d >= a && d <= b; }, srt = x => x.filter(inR).sort(byTs);
  const tb = (h, rows) => rows.length ? `<table><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</table>` : '<p>None recorded.</p>';
  const L = srt(S.logs), W = srt(S.weights), M = srt(S.metrics), Y = srt(S.symptoms), K = (S.prefs.skipLog || []).filter(inR);
  let el = $('#rep'); if (!el) { el = document.createElement('div'); el.id = 'rep'; document.body.appendChild(el); }
  el.innerHTML = `<div class="no-print"><button class="primary" id="prt">Print / Save as PDF</button> <button class="ghost" id="repx">Close</button></div>
  <h1>Personal log summary</h1><p>${a} – ${b} · created ${fmtDT(new Date().toISOString())}<br>Self-recorded values; not medical advice, a prescription or a schedule.</p>
  <h2>Entries (${L.length})</h2>${tb(['Date', 'Entry', 'Type', 'Amount', 'Site', 'Feeling', 'Note'], L.map(l => [fmtDT(l.ts), esc(pName(l.peptideId)), CL[cat(l.peptideId)], l.amount ? fmtAmt(l) : '', esc(l.site || ''), l.mood ? l.mood + '/5' : '', esc(l.note || '')]))}
  <h2>Weight</h2>${tb(['Date', 'Weight', 'Note'], W.map(w => [w.hasTime ? fmtDT(w.ts) : fmtD(w.ts), fmtW(w.kg), esc(w.note || '')]))}
  <h2>Measurements and labs</h2>${tb(['Date', 'Name', 'Value', 'Type'], M.map(m => [fmtD(m.ts), esc(m.name), m.value + ' ' + esc(m.unit), m.kind === 'lab' ? 'Lab' : 'Body']))}
  <h2>Symptoms and side effects</h2>${tb(['Date', 'Description', 'Severity'], Y.map(y => [fmtDT(y.ts), esc(y.text), y.sev + '/5']))}
  ${K.length ? `<h2>Skipped reminders</h2>${tb(['Date', 'Item', 'Reason'], K.map(k => [fmtDT(k.ts), esc(k.name), esc(k.reason || '')]))}` : ''}`;
  el.style.display = 'block';
}

/* ---------- backup helpers ---------- */
function shrink(url) {
  return new Promise((res, rej) => { const img = new Image(); img.onload = () => { const k = Math.min(1, 600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .6)); }; img.onerror = () => rej(new Error('Photo could not be read')); img.src = url; });
}
function xExport2() {
  openForm('Encrypted backup', `<label>Password (min. 8 characters)<input type="password" name="p1" autocomplete="new-password" required></label><label>Repeat password<input type="password" name="p2" autocomplete="new-password" required></label>
  <label>Photos<select name="ph"><option value="full">Include (full size)</option><option value="small">Include (smaller)</option><option value="none">Exclude</option></select></label>
  <small>If you forget the password the backup cannot be recovered. Importing a backup without photos removes the photos stored in the app.</small>`, async f => {
    if (f.get('p1').length < 8) return 'Use at least 8 characters.'; if (f.get('p1') !== f.get('p2')) return 'Passwords do not match.';
    const snap = snapshot(), m = f.get('ph');
    if (m !== 'full') snap.weights = await Promise.all(snap.weights.map(async w => w.photo ? { ...w, photo: m === 'none' ? null : await shrink(w.photo) } : w));
    const o = await encryptObj(snap, f.get('p1')), back = await decryptObj(o, f.get('p1')); // verify the file decrypts before saving
    if (back.logs.length !== snap.logs.length || back.weights.length !== snap.weights.length) return 'Verification failed. Backup not saved.';
    saveFile(`tracker-backup-${parts().date}.enc.json`, JSON.stringify(o), 'application/json'); toast('Backup saved and verified.');
  });
}
const markBackup = () => { S.lastBackup = new Date().toISOString(); DB.put('meta', { key: 'lastBackup', value: S.lastBackup }); };
const backupNudge = () => {
  if (!(S.logs.length + S.weights.length)) return ''; const days = S.prefs.backupDays || 14, age = S.lastBackup ? Math.floor((Date.now() - new Date(S.lastBackup)) / DAY) : null;
  if (age !== null && age < days) return '';
  return `<div class="card"><small>${age === null ? 'No backup yet.' : `Last backup ${age} days ago.`} Your data exists only on this phone.</small><div class="row"><button class="ghost" data-a="xexport">Encrypted export</button></div></div>`;
};
const goalCard = () => {
  const g = S.prefs.goalKg, lw = [...S.weights].sort(byTs).pop(); if (!g || !lw) return '';
  const d = (lw.kg - g) * (S.unit === 'lb' ? LB : 1);
  return `<div class="card"><small>Goal weight</small><div class="big">${fmtW(g)}</div><small>Latest ${fmtW(lw.kg)} · ${Math.abs(d) < .05 ? 'at your goal' : Math.abs(d).toFixed(1) + ' ' + S.unit + (d > 0 ? ' above' : ' below') + ' your goal'}</small></div>`;
};

/* ---------- PIN lock (screen lock only, not encryption) ---------- */
async function pinHash(pin, salt, iter) {
  const m = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, m, 256));
}
const checkPin = async p => !!S.pin && (await pinHash(p, ub64(S.pin.salt), S.pin.iter)) === S.pin.hash;
async function setPin(p) { const salt = crypto.getRandomValues(new Uint8Array(16)); S.pin = { salt: b64(salt), iter: 200000, hash: await pinHash(p, salt, 200000) }; await DB.put('meta', { key: 'pin', value: S.pin }); }
function pinForm() {
  openForm(S.pin ? 'Change PIN' : 'Set PIN', `${S.pin ? '<label>Current PIN<input name="c" type="password" inputmode="numeric" autocomplete="off" required></label>' : ''}
  <label>New PIN (4–8 digits)<input name="n" type="password" inputmode="numeric" pattern="[0-9]{4,8}" autocomplete="new-password" required></label>
  <label>Repeat PIN<input name="r" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required></label><small>This locks the screen only; it is not encryption.</small>`, async f => {
    if (S.pin && !(await checkPin(f.get('c')))) return 'Current PIN is wrong.';
    if (!/^\d{4,8}$/.test(f.get('n'))) return 'Use 4–8 digits.'; if (f.get('n') !== f.get('r')) return 'PINs do not match.';
    await setPin(f.get('n'));
  });
}
function pinRemove() {
  openForm('Remove PIN', '<label>Current PIN<input name="c" type="password" inputmode="numeric" autocomplete="off" required></label>', async f => {
    if (!(await checkPin(f.get('c')))) return 'PIN is wrong.'; await DB.del('meta', 'pin'); S.pin = null; if (S.bio) { await DB.del('meta', 'bio'); S.bio = null; }
  });
}
function showLock() {
  const d = $('#dlg'); if (d.open) d.close(); const r = $('#rep'); if (r) r.style.display = 'none';
  let el = $('#lock'); if (!el) { el = document.createElement('div'); el.id = 'lock'; document.body.appendChild(el); }
  let buf = '', fail = 0, until = 0; S.locked = true; el.style.display = 'flex';
  const draw = (msg = '') => { el.innerHTML = `<div class="lk"><h2>Enter PIN</h2><div class="dots" aria-live="polite">${[...Array(Math.max(4, buf.length))].map((_, i) => `<i class="${i < buf.length ? 'on' : ''}"></i>`).join('')}</div><p class="err" role="alert">${msg}</p><div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, 'OK'].map(k => `<button class="ghost" data-k="${k}">${k}</button>`).join('')}</div>${S.bio ? '<button class="ghost" data-k="bio" style="margin:16px 6px 0">Use Face ID</button>' : ''}<button class="ghost" data-k="forgot" style="margin-top:16px;font-size:.8rem">Forgot PIN</button></div>`; };
  draw();
  el.onclick = async e => {
    const b = e.target.closest('[data-k]'); if (!b) return; const k = b.dataset.k;
    if (k === '⌫') buf = buf.slice(0, -1); else if (k === 'bio') { try { await bioAuth(); S.locked = false; el.style.display = 'none'; el.innerHTML = ''; } catch (x) { draw('Face ID failed. Use your PIN.'); } return; } else if (k === 'forgot') {
      if (confirm('This erases ALL data in the app and removes the PIN. Continue?') && prompt('Type DELETE to confirm') === 'DELETE') { await DB.replaceAll({}); S.pin = null; S.bio = null; S.locked = false; el.style.display = 'none'; await load(); render(); } return;
    } else if (k === 'OK') {
      if (Date.now() < until) return draw('Please wait a moment.');
      if (await checkPin(buf)) { S.locked = false; el.style.display = 'none'; el.innerHTML = ''; return; }
      fail++; buf = ''; if (fail >= 5) until = Date.now() + 30000 * (fail - 4); return draw('Wrong PIN');
    } else if (buf.length < 8) buf += k;
    draw();
  };
}

/* ---------- settings extras ---------- */
function settingsExtra() {
  const p = S.prefs, goal = p.goalKg ? +(S.unit === 'lb' ? p.goalKg * LB : p.goalKg).toFixed(1) : '';
  return `<div class="card"><h2>Goal &amp; backup</h2><label>Goal weight (${S.unit}, optional)<input id="goal" type="number" step="0.1" inputmode="decimal" value="${goal}"></label>
  <label>Remind me to back up every (days)<input id="bdays" type="number" min="1" max="365" inputmode="numeric" value="${p.backupDays || 14}"></label><small>The goal only shows your distance to a number you chose.</small></div>
  <div class="card"><h2>Check-in reminders</h2><div class="row"><button class="ghost" data-a="newrem">Add check-in</button><button class="ghost" data-a="allics">All reminders → Calendar</button></div>
  ${(p.mrem || []).length ? `<ul>${p.mrem.map(r => `<li class="row" style="align-items:center"><span style="flex:2">${esc(rlabel(r))}<br><small>every ${r.days} d at ${esc(r.at)}</small></span><button class="danger" data-a="delrem" data-id="${r.id}" aria-label="Delete reminder">✕</button></li>`).join('')}</ul>` : ''}<small>Weigh-in, weight photo or any measurement, repeated at the interval you choose.</small></div>
  <div class="card"><h2>Report</h2><button class="ghost" data-a="report">Report for a doctor</button></div>
  <div class="card"><h2>Security</h2>${S.pin ? `<div class="row"><button class="ghost" data-a="setpin">Change PIN</button><button class="danger" data-a="rmpin">Remove PIN</button></div><label>Auto-lock after<select id="alock">${[[0, 'Immediately'], [1, '1 minute'], [5, '5 minutes'], [15, '15 minutes']].map(([v, l]) => `<option value="${v}" ${(p.lockMin ?? 1) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : '<button class="ghost" data-a="setpin">Set PIN</button>'}
  <small>A PIN only locks the screen. It does not encrypt your data; use an encrypted backup for that.</small></div>`;
}

/* ---------- wiring ---------- */
function extra2Init() {
  S.symptoms = []; S.prefs = {}; S.pin = null; S.lastBackup = null; S.sp = 'all'; S.hiddenAt = 0;
  const load1 = load;
  load = async () => {
    await load1(); S.symptoms = await DB.all('symptoms'); const m = await DB.all('meta'), g = k => (m.find(x => x.key === k) || {}).value;
    S.prefs = g('prefs') || {}; S.pin = g('pin') || null; S.lastBackup = g('lastBackup') || null;
    if (S.pin && !S.lockInit) { S.lockInit = true; showLock(); }
  };
  dueList = dueList2; remCard = remCard2; drawWeight = drawWeight2; drawCounts = withPeriod(drawCounts); drawAmt = withPeriod(drawAmt); xExport = xExport2;
  const sf0 = saveFile;
  saveFile = (n, t, ty) => { sf0(n, t, ty); if (/tracker-backup/.test(n)) { markBackup(); if (!/enc/.test(n)) { try { if (JSON.parse(t).logs.length === S.logs.length) toast('Backup saved and verified.'); } catch (e) { toast('Backup could not be verified.'); } } } };
  const h0 = VIEWS.home[1], l0 = VIEWS.log[1], s0 = VIEWS.settings[1], vs = VIEWS.charts[1];
  VIEWS.home = ['Home', () => { const h = h0(), add = backupNudge() + goalCard(), k = '<div class="card"><h2>Recent'; return h.includes(k) ? h.replace(k, add + k) : h + add; }];
  VIEWS.log = ['Log', () => l0() + tplCard() + symCard()];
  VIEWS.charts = ['Stats', () => periodBar() + withPeriod(vs)() + compareCard() + siteMap()];
  VIEWS.settings = ['Settings', () => { const h = s0(), k = '<div class="card"><button class="danger" data-a="wipe">'; return h.includes(k) ? h.replace(k, settingsExtra() + k) : h + settingsExtra(); }];
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) S.hiddenAt = Date.now();
    else if (S.pin && !S.locked && Date.now() - S.hiddenAt >= (S.prefs.lockMin ?? 1) * 60000) showLock();
  });
  document.addEventListener('click', async e => {
    if (e.target.id === 'repx') { $('#rep').style.display = 'none'; return; } if (e.target.id === 'prt') { window.print(); return; }
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, id = +b.dataset.id;
    try {
      if (a === 'newsym') symForm(); else if (a === 'showsym') { const y = S.symptoms.find(v => v.id === id); openDetail(`${y.sev}/5`, `<p>${esc(y.text)}</p><p>${fmtDT(y.ts)}</p>`, () => symForm(y), () => DB.del('symptoms', y.id)); }
      else if (a === 'newtpl') tplForm();
      else if (a === 'usetpl') { const t = S.prefs.templates.find(x => x.id === id); logForm({ peptideId: t.peptideId, amount: t.amount, unit: t.unit, site: t.site, vialId: t.vialId, ts: new Date().toISOString() }); }
      else if (a === 'deltpl') { if (confirm('Delete this template?')) { S.prefs.templates = S.prefs.templates.filter(x => x.id !== id); await savePrefs(); render(); } }
      else if (a === 'remopt') remOptions(b.dataset.k); else if (a === 'newrem') remForm();
      else if (a === 'delrem') { if (confirm('Delete this reminder?')) { S.prefs.mrem = S.prefs.mrem.filter(x => x.id !== id); await savePrefs(); render(); } }
      else if (a === 'allics') exportAllIcs(); else if (a === 'report') reportForm();
      else if (a === 'sp') { S.sp = b.dataset.v; render(); }
      else if (a === 'setpin') pinForm(); else if (a === 'rmpin') pinRemove();
    } catch (x) { toast('Error: ' + x.message); }
  });
  document.addEventListener('change', async e => {
    const t = e.target;
    try {
      if (t.id === 'goal') { const v = parseFloat(t.value); if (v > 0) S.prefs.goalKg = S.unit === 'lb' ? v / LB : v; else delete S.prefs.goalKg; await savePrefs(); }
      else if (t.id === 'bdays') { const v = parseInt(t.value, 10); if (v >= 1 && v <= 365) S.prefs.backupDays = v; await savePrefs(); }
      else if (t.id === 'alock') { S.prefs.lockMin = +t.value; await savePrefs(); }
    } catch (x) { toast('Error: ' + x.message); }
  });
  if (typeof extra3Init === 'function') extra3Init();
}
