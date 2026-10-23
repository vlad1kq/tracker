'use strict';
/* Extras 5: quick one-line entry, weekday reminders, weekday statistics, app icon choice.
   Loaded before app.js; extra5Init() is called at the end of extra4Init(). */

/* ---------- quick one-line entry (parsed locally, then confirmed in the normal form) ---------- */
const UMAP = { mg: 'mg', mcg: 'mcg', 'µg': 'mcg', ug: 'mcg', iu: 'IU', ml: 'ml', 'мг': 'mg', 'мкг': 'mcg', 'ме': 'IU', 'ед': 'IU', 'мл': 'ml' };
const SITE_RX = [[/^(жив\S*|belly|abdom\S*|stomach)$/i, 'Abdomen'], [/^(бедр\S*|thigh\S*|quad\S*)$/i, 'Thigh'], [/^(ягод\S*|glute\S*|butt\S*)$/i, 'Glute'], [/^(плеч\S*|дельт\S*|delt\S*|shoulder\S*)$/i, 'Deltoid']];
function parseQuick(text) {
  let s = ' ' + text.trim() + ' ', off = null, dateStr = null, time = null, amount = null, unit = null;
  s = s.replace(/\s(вчера|yesterday)(?=\s)/i, () => { off = -1; return ' '; }).replace(/\s(сегодня|today)(?=\s)/i, () => { off = 0; return ' '; });
  s = s.replace(/\s(\d{4}-\d{2}-\d{2})(?=\s)/, (m, a) => { dateStr = a; return ' '; });
  s = s.replace(/\s(\d{1,2}):(\d{2})(?=\s)/, (m, h, mi) => { if (+h < 24 && +mi < 60) { time = `${pad(+h)}:${mi}`; return ' '; } return m; });
  s = s.replace(/\s(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|ug|iu|ml|мг|мкг|ме|ед|мл)(?=[\s.,;])/i, (m, a, u) => { amount = parseFloat(a.replace(',', '.')); unit = UMAP[u.toLowerCase()]; return ' '; });
  let base = null, side = null, rest = [], sides = [];
  for (const w of s.trim().split(/\s+/).filter(Boolean)) {
    const sr = SITE_RX.find(([r]) => r.test(w));
    if (sr && !base) { base = sr[1]; continue; }
    if (/^(лев\S*|слева|left|l)$/i.test(w) && !side) { side = 'left'; sides.push(w); continue; }
    if (/^(прав\S*|справа|right|r)$/i.test(w) && !side) { side = 'right'; sides.push(w); continue; }
    rest.push(w);
  }
  if (!base && sides.length) { rest.push(...sides); side = null; }
  const cand = S.peptides.filter(p => !p.archived); let best = null, score = 0, idx = -1, multi = null;
  rest.forEach((w, i) => { const wl = w.toLowerCase(); if (wl.length < 2) return; cand.forEach(p => { const n = p.name.toLowerCase(); let sc = 0; if (n === wl) sc = 100 + wl.length; else if (n.startsWith(wl)) sc = 50 + wl.length; else if (wl.length >= 3 && wl.startsWith(n)) sc = 40 + n.length; if (sc > score) { score = sc; best = p; idx = i; multi = null; } }); });
  cand.forEach(p => { const n = p.name.toLowerCase(); if (n.includes(' ') && rest.join(' ').toLowerCase().includes(n) && 120 + n.length > score) { score = 120 + n.length; best = p; multi = n; } });
  if (best) {
    if (multi) rest = rest.join(' ').replace(new RegExp(multi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ').split(/\s+/).filter(Boolean); else rest.splice(idx, 1);
    if (amount === null) { const k = rest.findIndex(w => /^\d+([.,]\d+)?$/.test(w)); if (k >= 0) { amount = parseFloat(rest[k].replace(',', '.')); rest.splice(k, 1); const l = S.logs.filter(x => x.peptideId === best.id && x.unit).sort(byTs).pop(); unit = l ? l.unit : 'mg'; } }
  }
  if (!(amount > 0 && amount <= 100000)) { amount = null; unit = null; }
  const d = new Date();
  if (dateStr) { const [y, m, dd] = dateStr.split('-').map(Number); d.setFullYear(y, m - 1, dd); } else if (off !== null) d.setDate(d.getDate() + off);
  if (time) { const [h, mi] = time.split(':'); d.setHours(+h, +mi, 0, 0); }
  return { found: !!best, peptideId: best ? best.id : undefined, amount, unit: amount ? unit : null, site: base ? (side ? `${base} ${side}` : base) : null, ts: d.toISOString(), note: rest.join(' ').replace(/^[,;.\-–]+|[,;.\-–]+$/g, '').trim() };
}
function quickGo(text) {
  if (!S.peptides.some(p => !p.archived)) { toast('Add an entry first (Log tab → Entries).'); return; }
  const r = parseQuick(text); if (!r.found) toast('No matching entry found; choose it in the form.');
  logForm({ peptideId: r.peptideId, amount: r.amount, unit: r.unit, site: r.site, ts: r.ts, note: r.note });
}
const quickCard = () => `<form class="card" id="qf"><label>Quick log<input id="qi" type="text" autocomplete="off" autocapitalize="none" enterkeyhint="go" placeholder="BPC 0.5 mg abdomen left"></label><small>Type an entry, amount, site, “yesterday” or a time (21:30), then press Go. Nothing is saved until you confirm the form.</small></form>`;

/* ---------- weekday reminders ---------- */
const wdName = i => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' });
const hasSched = p => !!(p.everyDays || (p.weekdays && p.weekdays.length));
const schedText = p => p.weekdays && p.weekdays.length ? `${p.weekdays.map(wdName).join(', ')} at ${p.at || '09:00'}` : `every ${p.everyDays} d`;
const sod = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
function nextOcc(wd, at) {
  const [h, m] = (at || '09:00').split(':'), now = new Date();
  for (let i = 0; i <= 7; i++) { const d = sod(now); d.setDate(d.getDate() + i); d.setHours(+h, +m, 0, 0); if (wd.includes((d.getDay() + 6) % 7) && d > now) return d; }
  return new Date(now.getTime() + DAY);
}
function dueWd(p, key, lastTs) {
  const wd = new Set(p.weekdays), today = sod(new Date()), [h, m] = (p.at || '09:00').split(':'); let sched = null;
  for (let i = 0; i <= 7; i++) { const d = new Date(today); d.setDate(d.getDate() - i); if (wd.has((d.getDay() + 6) % 7)) { sched = d; break; } }
  const sk = (S.prefs.skip || {})[key], cover = [lastTs, sk, p.created].filter(Boolean).map(t => sod(t).getTime()).sort((a, b) => b - a)[0];
  let due, n, state;
  if (cover < sched.getTime()) { n = Math.round((today - sched) / DAY); due = new Date(sched); due.setHours(+h, +m, 0, 0); state = n > 0 ? 'over' : 'today'; }
  else { let i = 1; for (; i <= 7; i++) { const d = new Date(today); d.setDate(d.getDate() + i); if (wd.has((d.getDay() + 6) % 7)) break; } due = new Date(today); due.setDate(due.getDate() + i); due.setHours(+h, +m, 0, 0); n = -i; state = 'soon'; }
  const sn = (S.prefs.snooze || {})[key], snz = sn && sn > new Date().toISOString();
  return { due, n, key, snooze: snz ? sn : null, state: snz ? 'snz' : state };
}
function dueList5() {
  return S.peptides.filter(p => !p.archived && hasSched(p)).map(p => {
    const l = S.logs.filter(x => x.peptideId === p.id).sort(byTs).pop(), key = 'e' + p.id;
    return { p, ...(p.weekdays && p.weekdays.length ? dueWd(p, key, l && l.ts) : dueFrom(l && l.ts, p.everyDays, p.at, key)) };
  });
}
function exportIcs5(p) {
  const x = dueList().find(v => v.p.id === p.id), wd = p.weekdays && p.weekdays.length ? p.weekdays : null;
  const st = wd ? nextOcc(wd, p.at) : x && x.due && x.due > new Date() ? x.due : (() => { const [h, m] = (p.at || '09:00').split(':'), d = new Date(); d.setDate(d.getDate() + 1); d.setHours(+h, +m, 0, 0); return d; })();
  saveFile('reminder.ics', ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Private Tracker//EN', ...icsBlock(p.name, p.everyDays, st, wd), 'END:VCALENDAR'].join('\r\n'), 'text/calendar');
}

/* ---------- statistics by weekday ---------- */
function weekdayCard() {
  const o = seriesOpts(); if (!o.some(([k]) => k === S.wk)) S.wk = 'mood';
  return `<div class="card"><h2>By weekday</h2><label>Show<select id="wk">${o.map(([k, l]) => `<option value="${esc(k)}" ${k === S.wk ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><div class="cv"><canvas id="cwd" role="img" aria-label="Average by weekday"></canvas></div><small>Plain averages by weekday over the selected period; a pattern may be coincidence. “Entries per day” averages over all days in the span.</small></div>`;
}
function drawWeekday() {
  if (!document.getElementById('cwd')) return;
  const data = seriesData(S.wk), keys = Object.keys(data).sort(); if (!keys.length) return;
  const sum = Array(7).fill(0), cnt = Array(7).fill(0), dow = d => (new Date(d + 'T12:00').getDay() + 6) % 7;
  if (S.wk === 'entries') { const a = new Date(keys[0] + 'T12:00'), b = new Date(); for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) cnt[(d.getDay() + 6) % 7]++; keys.forEach(k => { sum[dow(k)] += data[k]; }); }
  else keys.forEach(k => { sum[dow(k)] += data[k]; cnt[dow(k)]++; });
  const avg = sum.map((s, i) => cnt[i] ? +(s / cnt[i]).toFixed(2) : null);
  mk('cwd', { type: 'bar', data: { labels: [...Array(7)].map((_, i) => wdName(i)), datasets: [{ data: avg, backgroundColor: '#64d2ff', borderRadius: 4 }] }, options: { plugins: { tooltip: { callbacks: { afterLabel: c => `${cnt[c.dataIndex]} day(s)` } } }, scales: { y: { beginAtZero: true } } } });
}

/* ---------- app icon choice ---------- */
const ICONS = [['aurora', 'icon-180.png', 'Tracker'], ['sunset', 'alt-sunset.png', 'Tracker'], ['graphite', 'alt-graphite.png', 'Tracker'], ['mint', 'alt-mint.png', 'Tracker'], ['notes', 'alt-notes.png', 'Notes'], ['calc', 'alt-calc.png', 'Calc']];
function iconCard() {
  const base = location.origin + location.pathname.replace(/index\.html$/, '');
  return `<div class="card"><h2>App icon</h2><div class="icons">${ICONS.map(([id, f]) => `<div><img src="icons/${f}" alt="${id} icon" width="64" height="64"><button class="ghost" data-a="copyicon" data-u="${esc(base + '?icon=' + id)}" style="min-height:34px;padding:2px 10px;font-size:.8rem">Copy link</button></div>`).join('')}</div>
  <small>iOS fixes the Home Screen icon and name when an app is added. To change it: 1) export an encrypted backup, 2) paste the copied link into Safari, 3) Share → Add to Home Screen, 4) open the new app and import the backup, 5) delete the old app. Deleting a Home Screen app removes its data, so do not skip the backup. “Notes” and “Calc” also use a neutral name.</small></div>`;
}
function applyIconParam() {
  if (typeof URLSearchParams === 'undefined') return;
  const q = new URLSearchParams(location.search || ''), it = ICONS.find(i => i[0] === q.get('icon')); if (!it) return;
  const l = document.querySelector('link[rel="apple-touch-icon"]'), m = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (l) l.href = 'icons/' + it[1]; if (m) m.content = it[2]; document.title = it[2];
}

/* ---------- wiring ---------- */
function extra5Init() {
  S.wk = 'mood';
  Object.assign(RU, { 'Quick log': 'Быстрая запись', 'By weekday': 'По дням недели', 'App icon': 'Иконка приложения', 'Or remind me on these weekdays': 'Или напоминать в эти дни недели', 'Mon': 'Пн', 'Tue': 'Вт', 'Wed': 'Ср', 'Thu': 'Чт', 'Fri': 'Пт', 'Sat': 'Сб', 'Sun': 'Вс',
    'Type an entry, amount, site, “yesterday” or a time (21:30), then press Go. Nothing is saved until you confirm the form.': 'Введите вещество, количество, место, «вчера» или время (21:30) и нажмите «Ввод». Ничего не сохранится, пока вы не подтвердите форму.' });
  dueList = dueList5; exportIcs = exportIcs5;
  const h1 = VIEWS.home[1], l1 = VIEWS.log[1], c1 = VIEWS.charts[1], s1 = VIEWS.settings[1];
  VIEWS.home = ['Home', () => { const h = h1(), k = '<div class="grid">'; return h.includes(k) ? h.replace(k, quickCard() + k) : quickCard() + h; }];
  VIEWS.log = ['Log', () => quickCard() + l1()];
  VIEWS.charts = ['Stats', () => c1() + weekdayCard()];
  VIEWS.settings = ['Settings', () => { const h = s1(), k = '<div class="card"><button class="danger" data-a="wipe">'; return h.includes(k) ? h.replace(k, iconCard() + k) : h + iconCard(); }];
  const ed2 = extraDraw; extraDraw = () => { ed2(); if (S.view === 'charts') drawWeekday(); };
  applyIconParam();
  document.addEventListener('submit', e => { if (e.target.id === 'qf') { e.preventDefault(); const v = document.getElementById('qi').value.trim(); if (v) quickGo(v); } });
  document.addEventListener('change', e => { if (e.target.id === 'wk') { S.wk = e.target.value; render(); } });
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-a="copyicon"]'); if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.u); toast('Link copied. Paste it into Safari.'); } catch (x) { toast('Error: ' + x.message); }
  });
  if (typeof extra6Init === 'function') extra6Init();
}
