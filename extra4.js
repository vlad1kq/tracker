'use strict';
/* Extras 4: health tracking (check-in, training, food, vitals), journal (feed, calendar, search, notes),
   photo slider/collage, stock extras, haptics. Loaded before app.js; extra4Init() is called by extra3Init(). */
const HL = { daily: 'Check-in', vital: 'Vitals', workout: 'Training', food: 'Food', note: 'Note' };
const HNUM = { daily: ['sleep', 'energy', 'mood', 'appetite', 'libido', 'wellbeing'], vital: ['sys', 'dia', 'pulse'], workout: ['weight', 'sets', 'reps'], food: ['kcal', 'protein', 'water'] };
const DLAB = { energy: 'Energy', mood: 'Mood', appetite: 'Appetite', libido: 'Libido', wellbeing: 'Overall feeling' };
const HOPTS = [['d:sleep', 'Sleep (hours)'], ['d:energy', 'Energy'], ['d:mood', 'Mood'], ['d:appetite', 'Appetite'], ['d:libido', 'Libido'], ['d:wellbeing', 'Overall feeling'], ['f:kcal', 'Calories'], ['f:protein', 'Protein (g)'], ['f:water', 'Water (ml)'], ['v:sys', 'Blood pressure systolic'], ['v:dia', 'Blood pressure diastolic'], ['v:pulse', 'Pulse']];
const numOrNull = v => typeof v === 'number' && isFinite(v) ? v : null;
function validHealth(a) {
  if (!(Array.isArray(a) && a.every(h => h && Number.isInteger(h.id) && HL[h.kind] && !isNaN(new Date(h.ts))))) return 'Invalid health entries.'; return null;
}
function cleanHealth(h) {
  const o = { id: h.id, kind: h.kind, ts: h.ts };
  (HNUM[h.kind] || []).forEach(k => { o[k] = numOrNull(h[k]); });
  if (h.kind === 'workout') o.exercise = String(h.exercise || '').slice(0, 40);
  if (h.kind === 'note') o.text = String(h.text || '').slice(0, 1000); else o.note = String(h.note || '').slice(0, 500);
  return o;
}
function healthSeries(k, add) { const kind = { d: 'daily', f: 'food', v: 'vital' }[k[0]], f = k.slice(2); S.health.filter(h => h.kind === kind && h[f] != null).forEach(h => add(h.ts, h[f])); }
const dayTs = d => new Date(d + 'T12:00').toISOString();
const hOnDay = (kind, d) => S.health.find(h => h.kind === kind && parts(h.ts).date === d);
const intIn = (v, a, b) => { const n = parseInt(v, 10); return Number.isInteger(n) && n >= a && n <= b ? n : null; };
const numIn = (v, a, b) => { const n = parseFloat(v); return isFinite(n) && n >= a && n <= b ? n : null; };
const nf = (name, label, val, attrs = '') => `<label>${label}<input name="${name}" type="number" inputmode="decimal" step="any" ${attrs} value="${val != null ? val : ''}"></label>`;

/* ---------- forms ---------- */
function dailyForm(rec) {
  const d = rec ? parts(rec.ts).date : parts().date, ex = rec || hOnDay('daily', d) || {};
  openForm('Daily check-in', `<label>Date<input type="date" name="d" required value="${d}"></label>${nf('sleep', 'Sleep (hours)', ex.sleep, 'min="0" max="24"')}
  ${Object.keys(DLAB).map(k => `<label>${DLAB[k]} (1–5)<select name="${k}"><option value="">—</option>${[1, 2, 3, 4, 5].map(n => `<option ${ex[k] === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`).join('')}
  <label>Note (optional)<textarea name="o" maxlength="300">${esc(ex.note)}</textarea></label>`, async f => {
    const d2 = f.get('d'); if (!d2) return 'Please choose a date.';
    const sl = f.get('sleep') ? numIn(f.get('sleep'), 0, 24) : null; if (f.get('sleep') && sl === null) return 'Sleep must be between 0 and 24 hours.';
    const base = hOnDay('daily', d2) || {}, o = { ...base, kind: 'daily', ts: dayTs(d2), sleep: sl, note: f.get('o').trim() };
    Object.keys(DLAB).forEach(k => { o[k] = f.get(k) ? +f.get(k) : null; }); await DB.put('health', o);
  });
}
function foodForm(rec) {
  const d = rec ? parts(rec.ts).date : parts().date, ex = rec || hOnDay('food', d) || {};
  openForm('Food & water', `<label>Date<input type="date" name="d" required value="${d}"></label>${nf('kcal', 'Calories (kcal)', ex.kcal, 'min="0" max="20000"')}${nf('protein', 'Protein (g)', ex.protein, 'min="0" max="1000"')}${nf('water', 'Water (ml)', ex.water, 'min="0" max="20000"')}
  <label>Note (optional)<textarea name="o" maxlength="300">${esc(ex.note)}</textarea></label>`, async f => {
    const d2 = f.get('d'), v = { kcal: numIn(f.get('kcal'), 0, 20000), protein: numIn(f.get('protein'), 0, 1000), water: numIn(f.get('water'), 0, 20000) };
    if (!d2) return 'Please choose a date.'; if (v.kcal === null && v.protein === null && v.water === null) return 'Enter at least one value.';
    await DB.put('health', { ...(hOnDay('food', d2) || {}), kind: 'food', ts: dayTs(d2), ...v, note: f.get('o').trim() });
  });
}
function vitalForm(rec) {
  const t = parts(rec ? rec.ts : undefined), ex = rec || {};
  openForm(rec ? 'Edit vitals' : 'Add vitals', `<label>Date<input type="date" name="d" required value="${t.date}"></label><label>Time<input type="time" name="t" required value="${t.time}"></label>
  ${nf('sys', 'Systolic (mmHg)', ex.sys, 'min="50" max="300"')}${nf('dia', 'Diastolic (mmHg)', ex.dia, 'min="30" max="200"')}${nf('pulse', 'Pulse (bpm)', ex.pulse, 'min="20" max="250"')}
  <label>Note (optional)<textarea name="o" maxlength="300">${esc(ex.note)}</textarea></label>`, async f => {
    const ts = toISO(f.get('d'), f.get('t')), v = { sys: numIn(f.get('sys'), 50, 300), dia: numIn(f.get('dia'), 30, 200), pulse: numIn(f.get('pulse'), 20, 250) };
    if (isNaN(new Date(ts))) return 'Please enter a valid date and time.'; if (v.sys === null && v.dia === null && v.pulse === null) return 'Enter at least one valid value.';
    await DB.put('health', { ...(rec || {}), kind: 'vital', ts, ...v, note: f.get('o').trim() });
  });
}
function workoutForm(rec) {
  const ex = rec || {}, names = [...new Set(S.health.filter(h => h.kind === 'workout').map(h => h.exercise))];
  openForm(rec ? 'Edit exercise' : 'Add set / exercise', `<label>Date<input type="date" name="d" required value="${rec ? parts(rec.ts).date : parts().date}"></label>
  <label>Exercise<input name="x" required maxlength="40" list="exs" value="${esc(ex.exercise)}"><datalist id="exs">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
  ${nf('w', `Weight (${S.unit}, optional)`, ex.weight != null ? +(S.unit === 'lb' ? ex.weight * LB : ex.weight).toFixed(1) : '', 'min="0"')}${nf('s', 'Sets', ex.sets, 'min="1" max="99"')}${nf('r', 'Reps', ex.reps, 'min="1" max="999"')}
  <label>Note (optional)<textarea name="o" maxlength="300">${esc(ex.note)}</textarea></label>`, async f => {
    const name = f.get('x').trim(), w = f.get('w') ? numIn(f.get('w'), 0, 2000) : null, s = intIn(f.get('s'), 1, 99), r = intIn(f.get('r'), 1, 999);
    if (!name) return 'Exercise name is required.'; if (f.get('w') && w === null) return 'Please enter a valid weight.'; if (s === null || r === null) return 'Sets and reps are required (whole numbers).';
    await DB.put('health', { ...(rec || {}), kind: 'workout', ts: rec && parts(rec.ts).date === f.get('d') ? rec.ts : dayTs(f.get('d')), exercise: name, weight: w === null ? null : (S.unit === 'lb' ? w / LB : w), sets: s, reps: r, note: f.get('o').trim() });
  });
}
function noteForm(rec) {
  openForm(rec ? 'Edit note' : 'Add note', `<label>Date<input type="date" name="d" required value="${rec ? parts(rec.ts).date : parts().date}"></label><label>Note<textarea name="x" required maxlength="1000">${esc(rec && rec.text)}</textarea></label>`, async f => {
    const text = f.get('x').trim(); if (!text) return 'Please write something.';
    await DB.put('health', { ...(rec || {}), kind: 'note', ts: rec && parts(rec.ts).date === f.get('d') ? rec.ts : dayTs(f.get('d')), text });
  });
}
const FORMS = { daily: dailyForm, food: foodForm, vital: vitalForm, workout: workoutForm, note: noteForm };
function hSummary(h) {
  if (h.kind === 'note') return h.text || '';
  if (h.kind === 'daily') return [h.sleep != null && `Sleep ${h.sleep} h`, ...Object.keys(DLAB).map(k => h[k] != null && `${DLAB[k]} ${h[k]}/5`)].filter(Boolean).join(' · ') || 'Check-in';
  if (h.kind === 'food') return [h.kcal != null && `${h.kcal} kcal`, h.protein != null && `${h.protein} g protein`, h.water != null && `${h.water} ml`].filter(Boolean).join(' · ');
  if (h.kind === 'vital') return [h.sys != null && h.dia != null ? `${h.sys}/${h.dia}` : (h.sys != null ? `${h.sys}` : ''), h.pulse != null && `${h.pulse} bpm`].filter(Boolean).join(' · ');
  return `${h.exercise}: ${h.weight != null ? fmtW(h.weight) + ' ' : ''}${h.sets}×${h.reps}`;
}
const hTag = h => `<span class="tag ${h.kind === 'note' ? '' : 'weight'}">${HL[h.kind]}</span>`;
const rowH = h => `<li><button class="item" data-a="showh" data-id="${h.id}">${hTag(h)}${esc(hSummary(h))}<br><small>${h.kind === 'vital' ? fmtDT(h.ts) : fmtD(h.ts)}${h.note ? ' · ' + esc(h.note.slice(0, 40)) : ''}</small></button></li>`;
const showHealth = h => openDetail(HL[h.kind], `<p class="big">${esc(hSummary(h))}</p><p>${h.kind === 'vital' ? fmtDT(h.ts) : fmtD(h.ts)}</p>${h.note ? `<p>${esc(h.note)}</p>` : ''}`, () => FORMS[h.kind](h), () => DB.del('health', h.id));

/* ---------- Health view ---------- */
const hTabs = () => `<div class="seg" role="group" aria-label="Section">${[['daily', 'Check-in'], ['train', 'Training'], ['food', 'Food'], ['vitals', 'Vitals']].map(([v, l]) => `<button data-a="ht" data-v="${v}" class="${S.ht === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const avgOf = (a, k) => { const x = a.map(h => h[k]).filter(n => n != null); return x.length ? x.reduce((s, n) => s + n, 0) / x.length : null; };
function vHealth() {
  const kind = { daily: 'daily', food: 'food', vitals: 'vital' }[S.ht], recent = kind ? S.health.filter(h => h.kind === kind).sort((a, b) => b.ts.localeCompare(a.ts)) : [];
  const wk = recent.filter(h => new Date(h.ts) >= Date.now() - 7 * DAY);
  if (S.ht === 'train') return hTabs() + vTrain();
  if (S.ht === 'daily') {
    const cells = ['sleep', ...Object.keys(DLAB)].map(k => { const v = avgOf(wk, k); return `<div><small>${k === 'sleep' ? 'Sleep (hours)' : DLAB[k]}</small><div class="big">${v == null ? '—' : v.toFixed(1)}</div></div>`; }).join('');
    return `${hTabs()}<div class="row"><button class="primary" data-a="newh" data-k="daily">${hOnDay('daily', parts().date) ? 'Edit today' : 'Check in'}</button></div>
    <div class="card"><h2>7-day averages</h2><div class="cmp3">${cells}</div><small>Plain averages of what you entered.</small></div>
    <div class="card"><h2>History</h2>${recent.length ? `<ul>${recent.slice(0, 20).map(rowH).join('')}</ul>` : empty('No check-ins yet.')}</div>`;
  }
  if (S.ht === 'food') {
    const k = avgOf(wk, 'kcal'), p = avgOf(wk, 'protein'), w = avgOf(wk, 'water');
    return `${hTabs()}<div class="row"><button class="primary" data-a="newh" data-k="food">Add food</button></div>
    <div class="card"><h2>7-day averages</h2><div class="cmp3"><div><small>Calories</small><div class="big">${k == null ? '—' : Math.round(k)}</div></div><div><small>Protein (g)</small><div class="big">${p == null ? '—' : Math.round(p)}</div></div><div><small>Water (ml)</small><div class="big">${w == null ? '—' : Math.round(w)}</div></div></div></div>
    <div class="card"><h2>History</h2>${recent.length ? `<ul>${recent.slice(0, 20).map(rowH).join('')}</ul>` : empty('Nothing logged yet.')}</div>`;
  }
  const grp = (f) => { const a = wk.filter(h => f(new Date(h.ts).getHours())); if (!a.length) return '—'; const r = k => { const v = avgOf(a, k); return v == null ? null : Math.round(v); }, s = r('sys'), d = r('dia'), p = r('pulse'); return `${s != null && d != null ? s + '/' + d : '—'}${p != null ? ' · ' + p + ' bpm' : ''} <small>(${a.length})</small>`; };
  return `${hTabs()}<div class="row"><button class="primary" data-a="newh" data-k="vital">Add vitals</button></div>
  <div class="card"><div class="cmp"><div><small>Morning (7-day avg)</small><div class="big">${grp(h => h < 12)}</div></div><div><small>Evening (7-day avg)</small><div class="big">${grp(h => h >= 12)}</div></div></div><small>Averages of your own readings; no interpretation.</small></div>
  <div class="card"><h2>History</h2>${recent.length ? `<ul>${recent.slice(0, 20).map(rowH).join('')}</ul>` : empty('No readings yet.')}</div>`;
}
function vTrain() {
  const ws = S.health.filter(h => h.kind === 'workout'), names = [...new Set(ws.map(w => w.exercise))].sort(); if (!names.includes(S.ex)) S.ex = names[0];
  const rec = ws.filter(w => w.exercise === S.ex).sort(byTs), pr = rec.filter(w => w.weight != null).sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0];
  return `<div class="row"><button class="primary" data-a="newh" data-k="workout">Add set / exercise</button></div>${names.length ? `<div class="card"><label>Exercise<select id="exsel">${names.map(n => `<option ${n === S.ex ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
  ${pr ? `<small>Personal best</small><div class="big">${fmtW(pr.weight)} × ${pr.reps}</div><small>${fmtD(pr.ts)}</small>` : ''}${rec.length > 1 ? '<div class="cv"><canvas id="cwk" role="img" aria-label="Best weight per day"></canvas></div>' : empty('Add at least two sessions to see a chart.')}</div>
  <div class="card"><h2>Sessions</h2><ul>${[...rec].reverse().slice(0, 20).map(rowH).join('')}</ul></div>` : `<div class="card">${empty('No workouts yet.')}</div>`}`;
}
function drawTrain() {
  const rec = S.health.filter(h => h.kind === 'workout' && h.exercise === S.ex && h.weight != null).sort(byTs), best = {}; if (rec.length < 2) return;
  rec.forEach(w => { const d = parts(w.ts).date, v = +(S.unit === 'lb' ? w.weight * LB : w.weight).toFixed(1); best[d] = Math.max(best[d] || 0, v); });
  const ks = Object.keys(best).sort(); if (ks.length < 2) return;
  mk('cwk', { type: 'line', data: { labels: ks.map(d => fmtD(d + 'T12:00')), datasets: [{ data: ks.map(d => best[d]), borderColor: '#30d158', backgroundColor: '#30d158', tension: .2, pointRadius: 3 }] }, options: { scales: { x: { ticks: { maxTicksLimit: 5 } }, y: { title: { display: true, text: S.unit } } } } });
}

/* ---------- Journal view: feed, calendar, search, notes ---------- */
function feedItems() {
  const it = [], T = c => `<span class="tag ${c}">`;
  S.logs.forEach(l => it.push({ g: 'log', ts: l.ts, a: 'showlog', id: l.id, tag: tag(cat(l.peptideId)), text: `${pName(l.peptideId)}${l.amount ? ' · ' + fmtAmt(l) : ''}${l.site ? ' · ' + l.site : ''}${l.note ? ' · ' + l.note : ''}` }));
  S.weights.forEach(w => it.push({ g: 'weight', ts: w.ts, a: 'showw', id: w.id, tag: T('weight') + 'Weight</span>', text: `${fmtW(w.kg)}${w.note ? ' · ' + w.note : ''}` }));
  S.metrics.forEach(m => it.push({ g: 'body', ts: m.ts, a: 'showm', id: m.id, tag: T('') + (m.kind === 'lab' ? 'Lab' : 'Body') + '</span>', text: `${m.name}: ${m.value} ${m.unit || ''}` }));
  S.symptoms.forEach(y => it.push({ g: 'sym', ts: y.ts, a: 'showsym', id: y.id, tag: T('') + 'Symptom</span>', text: `${y.text} (${y.sev}/5)` }));
  S.health.forEach(h => it.push({ g: h.kind === 'note' ? 'note' : 'health', ts: h.ts, a: 'showh', id: h.id, tag: hTag(h), text: hSummary(h) }));
  return it.sort((a, b) => b.ts.localeCompare(a.ts));
}
const feedRow = i => `<li><button class="item" data-a="${i.a}" data-id="${i.id}">${i.tag}${esc(i.text)}<br><small>${fmtDT(i.ts)}</small></button></li>`;
const jTabs = () => `<div class="seg" role="group" aria-label="Section">${[['feed', 'Feed'], ['cal', 'Calendar'], ['search', 'Search'], ['notes', 'Notes']].map(([v, l]) => `<button data-a="jt" data-v="${v}" class="${S.jt === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
function vJournal() {
  const body = { feed: vFeed, cal: vCal, search: vSearch, notes: vNotes }[S.jt] || vFeed; return jTabs() + body();
}
function vFeed() {
  const F = [['all', 'All'], ['log', 'Entries'], ['weight', 'Weight'], ['body', 'Body & labs'], ['sym', 'Symptoms'], ['health', 'Health'], ['note', 'Notes']];
  const l = feedItems().filter(i => S.jf === 'all' || i.g === S.jf);
  return `<div class="card"><label>Show<select id="jfsel">${F.map(([v, n]) => `<option value="${v}" ${S.jf === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>${l.length ? `<ul>${l.slice(0, S.jl).map(feedRow).join('')}</ul>${l.length > S.jl ? '<button class="ghost" data-a="more" style="width:100%">Show more</button>' : ''}` : empty('Nothing here yet.')}</div>`;
}
function vCal() {
  const y = S.cy, m = S.cm, dow = (new Date(y, m, 1).getDay() + 6) % 7, dim = new Date(y, m + 1, 0).getDate(), cnt = {}, all = feedItems();
  all.forEach(i => { const d = parts(i.ts).date; cnt[d] = (cnt[d] || 0) + 1; });
  let cells = ''; for (let i = 0; i < dow; i++) cells += '<span></span>';
  for (let d = 1; d <= dim; d++) { const k = `${y}-${pad(m + 1)}-${pad(d)}`, n = cnt[k] || 0; cells += `<button class="day ${S.cd === k ? 'on' : ''}" data-a="calday" data-d="${k}" aria-label="${k}: ${n}">${d}<i style="opacity:${n ? Math.min(1, .3 + n * .2) : 0}"></i></button>`; }
  const wd = [...Array(7)].map((_, i) => `<small>${new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' })}</small>`).join('');
  const day = S.cd ? all.filter(i => parts(i.ts).date === S.cd) : [];
  return `<div class="card"><div class="row" style="align-items:center"><button class="ghost" data-a="calnav" data-v="-1" aria-label="Previous month">‹</button><strong style="flex:3;text-align:center">${new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong><button class="ghost" data-a="calnav" data-v="1" aria-label="Next month">›</button></div>
  <div class="cal wd">${wd}</div><div class="cal">${cells}</div></div>${S.cd ? `<div class="card"><h2>${fmtD(S.cd + 'T12:00')}</h2>${day.length ? `<ul>${day.map(feedRow).join('')}</ul>` : empty('Nothing recorded that day.')}</div>` : ''}`;
}
function vSearch() {
  const q = S.gq.trim().toLowerCase(), r = q ? feedItems().filter(i => (i.text + ' ' + i.tag.replace(/<[^>]+>/g, '')).toLowerCase().includes(q)) : [];
  return `<div class="card"><label>Search everything<input type="search" id="gq" value="${esc(S.gq)}" placeholder="entry, note, site, lab, exercise…"></label>${q ? (r.length ? `<ul>${r.slice(0, 100).map(feedRow).join('')}</ul>` : empty('No matches.')) : '<small>Type and press Enter to search entries, weights, labs, symptoms, health logs and notes.</small>'}</div>`;
}
function vNotes() {
  const n = S.health.filter(h => h.kind === 'note').sort((a, b) => b.ts.localeCompare(a.ts));
  return `<div class="row"><button class="primary" data-a="newh" data-k="note">Add note</button></div><div class="card"><h2>Notes</h2>${n.length ? `<ul>${n.map(rowH).join('')}</ul>` : empty('No notes yet.')}</div>`;
}

/* ---------- photos: angle filter, slider, collage ---------- */
const cmpWeights = () => [...S.weights].sort(byTs).filter(w => !S.an || w.angle === S.an);
function vCompare2() {
  const ws = cmpWeights(), angles = `<div class="seg" role="group" aria-label="Angle">${[['', 'All angles'], ['front', 'Front'], ['side', 'Side'], ['back', 'Back']].map(([v, l]) => `<button data-a="an" data-v="${v}" class="${(S.an || '') === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  if (ws.length < 2) return bodyTabs() + angles + `<div class="card">${empty('Log at least two weights' + (S.an ? ' with this angle' : '') + ' to compare.')}</div>`;
  if (!ws.some(w => w.id === S.ca)) S.ca = (ws.find(w => w.photo) || ws[0]).id; if (!ws.some(w => w.id === S.cb)) S.cb = ws[ws.length - 1].id;
  const A = ws.find(w => w.id === S.ca), B = ws.find(w => w.id === S.cb), when = w => w.hasTime ? fmtDT(w.ts) : fmtD(w.ts);
  const opt = sel => ws.map(w => `<option value="${w.id}" ${w.id === sel ? 'selected' : ''}>${when(w)} · ${fmtW(w.kg)}${w.photo ? ' · 📷' : ''}${w.angle ? ' · ' + w.angle : ''}</option>`).join('');
  const col = (w, l) => `<div><small>${l}</small><div class="big">${fmtW(w.kg)}</div><small>${when(w)}</small>${w.photo ? `<img class="ph" src="${w.photo}" alt="${l} photo">` : '<div class="ph none">No photo</div>'}</div>`;
  const dk = (B.kg - A.kg) * (S.unit === 'lb' ? LB : 1), dd = Math.round((new Date(B.ts) - new Date(A.ts)) / DAY), slider = S.cmode === 'slider' && A.photo && B.photo;
  return `${bodyTabs()}${angles}<div class="card"><div class="row"><label>From<select id="cpa">${opt(S.ca)}</select></label><label>To<select id="cpb">${opt(S.cb)}</select></label></div>
  <div class="seg" role="group" aria-label="Mode">${[['side', 'Side by side'], ['slider', 'Slider']].map(([v, l]) => `<button data-a="cmode" data-v="${v}" class="${(S.cmode || 'side') === v ? 'on' : ''}">${l}</button>`).join('')}</div>
  ${slider ? `<div class="ba"><img src="${B.photo}" alt="To photo"><img id="batop" src="${A.photo}" alt="From photo" style="clip-path:inset(0 50% 0 0)"><i class="bl" id="bal" style="left:50%"></i><input type="range" id="ba" min="0" max="100" value="50" aria-label="Before and after slider"></div><div class="row"><span><small>From</small> ${fmtW(A.kg)}</span><span style="text-align:right"><small>To</small> ${fmtW(B.kg)}</span></div>` : `<div class="cmp">${col(A, 'From')}${col(B, 'To')}</div>`}
  <p class="big" style="text-align:center">${dk > 0 ? '+' : ''}${dk.toFixed(1)} ${S.unit}</p><small>Difference between the two recorded values over ${dd} day${dd === 1 ? '' : 's'}. It does not show what changed in the body.</small>
  <button class="ghost" data-a="collage" style="width:100%;margin-top:10px">Create collage</button></div>`;
}
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Photo could not be read')); i.src = src; });
function saveCanvas(cv) {
  cv.toBlob(async b => {
    const f = new File([b], 'collage.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = 'collage.png'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 5000);
  });
}
async function makeCollage() {
  const ws = cmpWeights().filter(w => w.photo).slice(-12); if (!ws.length) { toast('No photos to use.'); return; }
  const cols = Math.min(3, ws.length), rows = Math.ceil(ws.length / cols), W = 300, H = 400, C = 34, cv = document.createElement('canvas'); cv.width = cols * W; cv.height = rows * (H + C);
  const x = cv.getContext('2d'); x.fillStyle = '#14141a'; x.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < ws.length; i++) {
    const img = await loadImg(ws[i].photo), cx = (i % cols) * W, cy = Math.floor(i / cols) * (H + C), s = Math.max(W / img.width, H / img.height), sw = W / s, sh = H / s;
    x.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, cx, cy, W, H); x.fillStyle = '#fff'; x.font = '16px sans-serif'; x.fillText(`${fmtD(ws[i].ts)} · ${fmtW(ws[i].kg)}`, cx + 8, cy + H + 22);
  }
  saveCanvas(cv);
}

/* ---------- stock extras ---------- */
function lastedDays(v) {
  const L = S.logs.filter(l => l.vialId === v.id).sort(byTs); if (L.length < 2) return null;
  return v.archived || (v.total && remaining(v) === 0) ? Math.max(1, Math.round((new Date(L[L.length - 1].ts) - new Date(L[0].ts)) / DAY) + 1) : null;
}
function vialExtra(v) {
  const own = lastedDays(v), prev = S.vials.filter(x => x.id !== v.id && x.peptideId === v.peptideId && x.date < v.date).sort((a, b) => b.date.localeCompare(a.date)).map(x => lastedDays(x)).find(Boolean);
  const L = S.logs.filter(l => l.vialId === v.id && l.unit === v.unit && l.amount).sort(byTs), r = v.total ? remaining(v) : null;
  let pace = ''; if (r > 0 && L.length > 1) { const days = Math.max(1, (Date.now() - new Date(L[0].ts)) / DAY), per = L.reduce((a, l) => a + l.amount, 0) / days; if (per > 0) pace = `<p>At your logged pace so far, the remaining amount would cover about ${Math.round(r / per)} days. This is only arithmetic on your own records.</p>`; }
  return `${own ? `<p>This vial: ${own} days between first and last logged use.</p>` : ''}${prev && !own ? `<p>The previous vial of this entry lasted ${prev} days.</p>` : ''}${pace}${v.photo ? `<img class="ph" src="${v.photo}" alt="Vial photo" style="aspect-ratio:auto;max-height:50vh;object-fit:contain">` : ''}`;
}
function spendCourseCard() {
  const rows = S.courses.map(c => { const ents = c.entries && c.entries.length ? c.entries : null, end = c.end || '9999-12-31', sp = S.vials.filter(v => v.price && v.date >= c.start && v.date <= end && (!ents || ents.includes(v.peptideId))).reduce((a, v) => a + v.price, 0), n = S.logs.filter(l => { const d = parts(l.ts).date; return d >= c.start && d <= end && (!ents || ents.includes(l.peptideId)); }).length; return { c, sp, n }; }).filter(r => r.sp);
  if (!rows.length) return '';
  return `<div class="card"><h2>Spending by course</h2>${rows.map(r => `<div class="rem"><span>${esc(r.c.name)}</span><span class="st soon">${r.sp.toFixed(2)}${r.n ? ` · ${(r.sp / r.n).toFixed(2)} / entry` : ''}</span></div>`).join('')}<small>Vials are counted by purchase date inside the course; cost per entry = spending ÷ entries logged in the course.</small></div>`;
}

/* ---------- haptics (vibration where supported; iOS 17.4+ switch trick, not guaranteed in every mode) ---------- */
let lastHap = 0;
function haptic() {
  if (S.prefs.haptic === false || Date.now() - lastHap < 80) return; lastHap = Date.now();
  try {
    if (navigator.vibrate) { navigator.vibrate(12); return; }
    let l = document.getElementById('hp'); if (!l) { l = document.createElement('label'); l.id = 'hp'; l.style.cssText = 'position:fixed;left:-99px;top:0;opacity:0;pointer-events:none'; l.innerHTML = '<input type="checkbox" switch>'; document.body.appendChild(l); }
    l.click();
  } catch (e) { /* haptics are best-effort */ }
}

/* ---------- wiring ---------- */
function extra4Init() {
  S.health = []; S.ht = 'daily'; S.jt = 'feed'; S.jf = 'all'; S.jl = 60; S.gq = ''; S.cy = new Date().getFullYear(); S.cm = new Date().getMonth(); S.cd = null; S.an = ''; S.cmode = 'side'; S.ex = null;
  Object.assign(RU, { 'Journal': 'Дневник', 'Health': 'Здоровье', 'Feed': 'Лента', 'Training': 'Тренировки', 'Food': 'Питание', 'Vitals': 'Давление и пульс', 'Check-in': 'Чек-ин', 'Daily check-in': 'Ежедневный чек-ин', 'Check in': 'Заполнить', 'Edit today': 'Изменить сегодня', 'Sleep (hours)': 'Сон (часы)', 'Energy': 'Энергия', 'Mood': 'Настроение', 'Appetite': 'Аппетит', 'Libido': 'Либидо', 'Overall feeling': 'Общее самочувствие',
    'Energy (1–5)': 'Энергия (1–5)', 'Mood (1–5)': 'Настроение (1–5)', 'Appetite (1–5)': 'Аппетит (1–5)', 'Libido (1–5)': 'Либидо (1–5)', 'Overall feeling (1–5)': 'Общее самочувствие (1–5)', '7-day averages': 'Средние за 7 дней', 'Add note': 'Добавить заметку', 'Note': 'Заметка', 'Add set / exercise': 'Добавить подход / упражнение', 'Exercise': 'Упражнение', 'Personal best': 'Личный рекорд', 'Sessions': 'Тренировки', 'Sets': 'Подходы', 'Reps': 'Повторы',
    'Add food': 'Добавить питание', 'Food & water': 'Питание и вода', 'Calories': 'Калории', 'Calories (kcal)': 'Калории (ккал)', 'Protein (g)': 'Белок (г)', 'Water (ml)': 'Вода (мл)', 'Add vitals': 'Добавить давление и пульс', 'Systolic (mmHg)': 'Верхнее (мм рт. ст.)', 'Diastolic (mmHg)': 'Нижнее (мм рт. ст.)', 'Pulse (bpm)': 'Пульс (уд/мин)', 'Morning (7-day avg)': 'Утро (среднее за 7 дней)', 'Evening (7-day avg)': 'Вечер (среднее за 7 дней)',
    'Other': 'Другое', 'All angles': 'Все ракурсы', 'Front': 'Спереди', 'Side': 'Сбоку', 'Back': 'Сзади', 'Side by side': 'Рядом', 'Slider': 'Ползунок', 'Create collage': 'Создать коллаж', 'Angle (optional)': 'Ракурс (необязательно)', 'Spending by course': 'Расходы по курсам', 'Haptic feedback': 'Тактильный отклик', 'Show': 'Показать', 'Show more': 'Показать ещё', 'Search everything': 'Искать везде', 'Nothing here yet.': 'Пока ничего нет.', 'Notes': 'Заметки', 'Symptom': 'Симптом', 'Lab': 'Анализ', 'Entries': 'Вещества' });
  const load3 = load; load = async () => { await load3(); S.health = await DB.all('health'); };
  vCompare = vCompare2;
  VIEWS.health = ['Health', vHealth]; VIEWS.journal = ['Journal', vJournal];
  const st0 = VIEWS.stock[1]; VIEWS.stock = ['Stock', () => st0() + spendCourseCard()];
  const se0 = VIEWS.settings[1]; VIEWS.settings = ['Settings', () => { const h = se0(), k = '<div class="card"><button class="danger" data-a="wipe">', x = `<div class="card"><label class="chk"><input type="checkbox" id="hapchk" ${S.prefs.haptic !== false ? 'checked' : ''}>Haptic feedback</label><small>Vibration where the browser supports it; on iPhone it uses the system haptic available in iOS 17.4+ and may not fire in every mode.</small></div>`; return h.includes(k) ? h.replace(k, x + k) : h + x; }];
  const ed1 = extraDraw; extraDraw = () => { ed1(); if (S.view === 'health' && S.ht === 'train') drawTrain(); };
  document.addEventListener('click', e => { if (e.target.closest('button,nav button')) haptic(); });
  document.addEventListener('submit', () => haptic());
  document.addEventListener('input', e => { if (e.target.id === 'ba') { const v = +e.target.value, t = document.getElementById('batop'), l = document.getElementById('bal'); if (t) t.style.clipPath = `inset(0 ${100 - v}% 0 0)`; if (l) l.style.left = v + '%'; } });
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, id = +b.dataset.id;
    try {
      if (a === 'ht') { S.ht = b.dataset.v; render(); } else if (a === 'jt') { S.jt = b.dataset.v; render(); }
      else if (a === 'newh') FORMS[b.dataset.k](); else if (a === 'showh') showHealth(S.health.find(h => h.id === id));
      else if (a === 'more') { S.jl += 60; render(); }
      else if (a === 'calnav') { const d = new Date(S.cy, S.cm + +b.dataset.v, 1); S.cy = d.getFullYear(); S.cm = d.getMonth(); S.cd = null; render(); }
      else if (a === 'calday') { S.cd = S.cd === b.dataset.d ? null : b.dataset.d; render(); }
      else if (a === 'an') { S.an = b.dataset.v; render(); } else if (a === 'cmode') { S.cmode = b.dataset.v; render(); }
      else if (a === 'collage') await makeCollage();
    } catch (x) { toast('Error: ' + x.message); }
  });
  document.addEventListener('change', async e => {
    const t = e.target;
    try {
      if (t.id === 'exsel') { S.ex = t.value; render(); } else if (t.id === 'jfsel') { S.jf = t.value; S.jl = 60; render(); } else if (t.id === 'gq') { S.gq = t.value; render(); }
      else if (t.id === 'hapchk') { S.prefs.haptic = t.checked; await savePrefs(); if (t.checked) haptic(); }
    } catch (x) { toast('Error: ' + x.message); }
  });
  if (typeof extra5Init === 'function') extra5Init();
}
