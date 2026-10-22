'use strict';
/* Extra features: encrypted backup, stats, body metrics/labs, stock & costs, convenience tools.
   Loaded before app.js; extraInit() is called by app.js once all of its globals exist. */
/* Common lab markers [name, unit options...]. Units differ between labs, so no unit is filled in silently. */
const LAB_GROUPS = {
  'Hormones': [['Total testosterone', 'ng/dL', 'nmol/L'], ['Free testosterone', 'pg/mL', 'pmol/L'], ['Estradiol (E2)', 'pg/mL', 'pmol/L'], ['LH', 'IU/L'], ['FSH', 'IU/L'], ['SHBG', 'nmol/L'], ['Prolactin', 'ng/mL', 'mIU/L'], ['Progesterone', 'ng/mL', 'nmol/L'], ['DHEA-S', 'µg/dL', 'µmol/L'], ['Cortisol', 'µg/dL', 'nmol/L'], ['IGF-1', 'ng/mL', 'nmol/L'], ['TSH', 'mIU/L'], ['Free T4', 'ng/dL', 'pmol/L'], ['Free T3', 'pg/mL', 'pmol/L']],
  'Blood count': [['Hematocrit', '%'], ['Hemoglobin', 'g/dL', 'g/L'], ['Red blood cells', '10^6/µL'], ['Platelets', '10^3/µL'], ['White blood cells', '10^3/µL']],
  'Liver': [['ALT', 'U/L'], ['AST', 'U/L'], ['GGT', 'U/L'], ['ALP', 'U/L'], ['Bilirubin', 'mg/dL', 'µmol/L']],
  'Kidney': [['Creatinine', 'mg/dL', 'µmol/L'], ['Cystatin C', 'mg/L'], ['Urea / BUN', 'mg/dL', 'mmol/L'], ['eGFR', 'mL/min/1.73m²']],
  'Lipids': [['Total cholesterol', 'mg/dL', 'mmol/L'], ['LDL', 'mg/dL', 'mmol/L'], ['HDL', 'mg/dL', 'mmol/L'], ['Triglycerides', 'mg/dL', 'mmol/L'], ['ApoB', 'mg/dL', 'g/L']],
  'Metabolic': [['Fasting glucose', 'mg/dL', 'mmol/L'], ['HbA1c', '%', 'mmol/mol'], ['Insulin', 'µIU/mL', 'pmol/L']],
  'Other': [['PSA', 'ng/mL'], ['Ferritin', 'ng/mL', 'µg/L'], ['Vitamin D (25-OH)', 'ng/mL', 'nmol/L'], ['CK', 'U/L'], ['CRP', 'mg/L']]
};
const LAB_UNITS = {}; Object.values(LAB_GROUPS).flat().forEach(([n, ...u]) => { LAB_UNITS[n] = u; });
const unitOpts = n => (LAB_UNITS[n] || []).map(u => `<option value="${esc(u)}">`).join('');
const BODY_NAMES = ['Waist', 'Body fat %', 'Resting pulse', 'BP systolic', 'BP diastolic', 'Chest', 'Hips'];
const snapshot = () => ({ app: 'private-tracker', version: 3, exported: new Date().toISOString(), unit: S.unit, peptides: S.peptides, logs: S.logs, weights: S.weights, vials: S.vials, metrics: S.metrics, symptoms: S.symptoms, prefs: S.prefs });
function saveFile(name, text, type) {
  const u = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a');
  a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 5000);
}

/* ---------- encrypted backup: AES-256-GCM, key from password via PBKDF2 (WebCrypto, all local) ---------- */
const b64 = buf => { let s = ''; new Uint8Array(buf).forEach(c => s += String.fromCharCode(c)); return btoa(s); };
const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function deriveKey(pw, salt, iter) {
  const m = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, m, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptObj(obj, pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 310000;
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(pw, salt, iter), new TextEncoder().encode(JSON.stringify(obj)));
  return { app: 'private-tracker', enc: 1, kdf: 'PBKDF2-SHA256', iter, salt: b64(salt), iv: b64(iv), data: b64(ct) };
}
async function decryptObj(o, pw) {
  const k = await deriveKey(pw, ub64(o.salt), o.iter);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(o.iv) }, k, ub64(o.data))));
}
function xExport() {
  openForm('Encrypted backup', `<label>Password (min. 8 characters)<input type="password" name="p1" autocomplete="new-password" required></label>
  <label>Repeat password<input type="password" name="p2" autocomplete="new-password" required></label>
  <small>If you forget the password the backup cannot be recovered. Nothing is sent anywhere.</small>`, async f => {
    if (f.get('p1').length < 8) return 'Use at least 8 characters.';
    if (f.get('p1') !== f.get('p2')) return 'Passwords do not match.';
    saveFile(`tracker-backup-${parts().date}.enc.json`, JSON.stringify(await encryptObj(snapshot(), f.get('p1'))), 'application/json');
  });
}
async function applyData(d) {
  const e = validate(d); if (e) return e;
  if (d.vials !== undefined && !(Array.isArray(d.vials) && d.vials.every(x => x && Number.isInteger(x.id) && Number.isInteger(x.peptideId) && typeof x.date === 'string'))) return 'Invalid vial entries.';
  if (d.metrics !== undefined && !(Array.isArray(d.metrics) && d.metrics.every(x => x && Number.isInteger(x.id) && typeof x.name === 'string' && typeof x.value === 'number' && !isNaN(new Date(x.ts))))) return 'Invalid measurement entries.';
  if (d.symptoms !== undefined && !(Array.isArray(d.symptoms) && d.symptoms.every(x => x && Number.isInteger(x.id) && typeof x.text === 'string' && !isNaN(new Date(x.ts))))) return 'Invalid symptom entries.';
  if (d.symptoms) d.symptoms.forEach(x => { x.sev = Number.isInteger(x.sev) && x.sev >= 1 && x.sev <= 5 ? x.sev : 3; });
  d.weights.forEach(w => { if (w.photo && !(typeof w.photo === 'string' && w.photo.startsWith('data:image/'))) w.photo = null; });
  d.peptides.forEach(p => { p.category = p.category === 'steroid' ? 'steroid' : 'peptide'; p.everyDays = Number.isInteger(p.everyDays) && p.everyDays >= 1 && p.everyDays <= 365 ? p.everyDays : null; });
  d.logs.forEach(l => { const ok = typeof l.amount === 'number' && isFinite(l.amount) && l.amount > 0 && UNITS.includes(l.unit); l.amount = ok ? l.amount : null; l.unit = ok ? l.unit : null; });
  if (!confirm(`Replace ALL current data with ${d.logs.length} entries, ${d.weights.length} weights, ${(d.metrics || []).length} measurements, ${(d.vials || []).length} vials?`)) return 'Import cancelled.';
  await DB.replaceAll({ peptides: d.peptides, logs: d.logs, weights: d.weights, vials: d.vials || [], metrics: d.metrics || [], symptoms: d.symptoms || [], meta: metaFor(d) });
  await load(); render(); toast('Import complete.'); return null;
}
async function importFile(file) {
  try {
    const o = JSON.parse(await file.text());
    if (o && o.enc) {
      openForm('Encrypted backup', '<label>Password<input type="password" name="p" required autocomplete="current-password"></label>', async f => {
        let d; try { d = await decryptObj(o, f.get('p')); } catch (x) { return 'Wrong password or damaged file.'; }
        return applyData(d);
      });
    } else { const m = await applyData(o); if (m) toast(m); }
  } catch (x) { toast('Import failed: ' + x.message); }
}

/* ---------- convenience ---------- */
const extraLines = r => {
  const v = r.vialId && S.vials.find(x => x.id === r.vialId);
  const bits = [r.site && `Site: ${esc(r.site)}`, r.mood && `Feeling: ${r.mood}/5`, r.tags && r.tags.length && `Tags: ${r.tags.map(esc).join(', ')}`, v && `Vial: ${esc(v.label || pName(v.peptideId))}`].filter(Boolean);
  return bits.length ? `<p>${bits.join('<br>')}</p>` : '';
};
function repeatLast() {
  const l = [...S.logs].sort(byTs).pop(); if (!l) { toast('No previous entry to repeat.'); return; }
  const { id, ...rest } = l; logForm({ ...rest, ts: new Date().toISOString() });
}

/* ---------- body measurements and lab results ---------- */
const bodyTabs = () => `<div class="seg" role="group" aria-label="Section">${[['weight', 'Weight'], ['body', 'Measures'], ['lab', 'Labs'], ['cmp', 'Compare']].map(([v, l]) => `<button data-a="bt" data-v="${v}" class="${S.bt === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
function vBody() {
  if (S.bt === 'weight') return bodyTabs() + vWeight();
  if (S.bt === 'cmp') return vCompare();
  const all = S.metrics.filter(m => m.kind === S.bt).sort((a, b) => b.ts.localeCompare(a.ts)), names = [...new Set(all.map(m => m.name))];
  if (!names.includes(S.mn)) S.mn = names[0];
  const recs = all.filter(m => m.name === S.mn), lab = S.bt === 'lab';
  return `${bodyTabs()}<div class="row"><button class="primary" data-a="newm">${lab ? 'Add lab result' : 'Add measurement'}</button></div>
  ${names.length ? `<div class="card"><label>Metric<select id="mname">${names.map(n => `<option ${n === S.mn ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
  ${recs.length > 1 ? '<div class="cv"><canvas id="cm" role="img" aria-label="Values over time"></canvas></div>' : empty('Add at least two values to see a chart.')}</div>
  <div class="card"><h2>History</h2><ul>${recs.map(m => `<li><button class="item" data-a="showm" data-id="${m.id}"><strong>${m.value} ${esc(m.unit)}</strong><br><small>${m.hasTime ? fmtDT(m.ts) : fmtD(m.ts)}${m.note ? ' · ' + esc(m.note.slice(0, 40)) : ''}</small></button></li>`).join('')}</ul></div>` : `<div class="card">${empty(lab ? 'No lab results yet.' : 'No measurements yet.')}</div>`}`;
}
function metricForm(m) {
  const k = m ? m.kind : S.bt, t = parts(m ? m.ts : undefined);
  const known = [...new Set([...(k === 'lab' ? [] : BODY_NAMES), ...S.metrics.filter(x => x.kind === k).map(x => x.name)])];
  openForm(m ? 'Edit value' : (k === 'lab' ? 'Add lab result' : 'Add measurement'), `
    ${k === 'lab' ? `<label>Marker<select name="pre"><option value="">Custom…</option>${Object.entries(LAB_GROUPS).map(([g, a]) => `<optgroup label="${g}">${a.map(([n]) => `<option ${m && m.name === n ? 'selected' : ''}>${n}</option>`).join('')}</optgroup>`).join('')}</select></label>
    <label>Custom name (only if not in the list)<input name="n" maxlength="40" list="mn" value="${esc(m && !LAB_UNITS[m.name] ? m.name : '')}"><datalist id="mn">${known.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>`
    : `<label>Name<input name="n" required maxlength="40" list="mn" value="${esc(m && m.name)}"><datalist id="mn">${known.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>`}
    <label>Value<input name="v" type="number" step="any" inputmode="decimal" required value="${m ? m.value : ''}"></label>
    <label>Unit (optional)<input name="u" maxlength="12" list="un" placeholder="${k === 'lab' && m && LAB_UNITS[m.name] ? esc(LAB_UNITS[m.name].join(' or ')) : 'unit'}" value="${esc(m && m.unit)}"><datalist id="un">${k === 'lab' && m ? unitOpts(m.name) : ''}</datalist></label>
    ${k === 'lab' ? '<small>Units differ between labs: enter the unit printed on your report. The app only records values and shows no reference ranges.</small>' : ''}
    <label>Date<input type="date" name="d" required value="${t.date}"></label>
    <label>Time (optional)<input type="time" name="tm" value="${m && m.hasTime ? t.time : ''}"></label>
    <label>Note (optional)<textarea name="o" maxlength="500">${esc(m && m.note)}</textarea></label>`, async f => {
    const name = (f.get('n').trim() || (f.get('pre') || '')), v = parseFloat(f.get('v')), ts = toISO(f.get('d'), f.get('tm'));
    if (!name) return 'Name is required.';
    if (!isFinite(v) || Math.abs(v) > 1e7) return 'Please enter a valid value.';
    if (isNaN(new Date(ts))) return 'Please enter a valid date.';
    await DB.put('metrics', { ...(m || {}), kind: k, name, value: v, unit: f.get('u').trim(), ts, hasTime: !!f.get('tm'), note: f.get('o').trim() }); S.mn = name;
  });
}
const showMetric = m => openDetail(m.name, `<p class="big">${m.value} ${esc(m.unit)}</p><p>${m.hasTime ? fmtDT(m.ts) : fmtD(m.ts)}</p><p>${m.note ? esc(m.note) : '<span class="mu">No note</span>'}</p>`, () => metricForm(m), () => DB.del('metrics', m.id));
function drawMetric() {
  const r = S.metrics.filter(m => m.kind === S.bt && m.name === S.mn).sort(byTs); if (r.length < 2) return;
  mk('cm', { type: 'line', data: { labels: r.map(m => fmtD(m.ts)), datasets: [{ data: r.map(m => m.value), borderColor: '#ffd60a', backgroundColor: '#ffd60a', tension: .2, pointRadius: 3 }] }, options: { scales: { x: { ticks: { maxTicksLimit: 5 } } } } });
}

/* ---------- stock and costs ---------- */
const remaining = v => v.total ? Math.max(0, v.total - S.logs.filter(l => l.vialId === v.id && l.unit === v.unit).reduce((a, l) => a + (l.amount || 0), 0)) : null;
const expired = v => v.expiry && v.expiry < parts().date;
function vStock() {
  const vs = [...S.vials].sort((a, b) => (!!a.archived - !!b.archived) || b.date.localeCompare(a.date)), by = {};
  S.vials.forEach(v => { if (v.price) by[v.date.slice(0, 7)] = (by[v.date.slice(0, 7)] || 0) + v.price; });
  const ks = Object.keys(by).sort().reverse(), total = S.vials.reduce((a, v) => a + (v.price || 0), 0);
  return `<div class="row"><button class="primary" data-a="newv">Add vial</button></div>
  <div class="card"><h2>Vials</h2>${vs.length ? `<ul>${vs.map(v => { const r = remaining(v); return `<li><button class="item" data-a="showv" data-id="${v.id}">${tag(cat(v.peptideId))}<strong>${esc(pName(v.peptideId))}</strong>${v.label ? ' · ' + esc(v.label) : ''}${v.archived ? ' <span class="tag">archived</span>' : ''}${expired(v) ? ' <span class="tag expired">Expired</span>' : ''}<br><small>${r != null ? `${+r.toFixed(3)} of ${v.total} ${v.unit} left · ` : ''}${v.expiry ? 'expires ' + fmtD(v.expiry + 'T12:00') : 'no expiry date'}</small></button></li>`; }).join('')}</ul>` : empty('No vials yet.')}
  <small>Remaining = total minus the amounts you logged against this vial (same unit only).</small></div>
  <div class="card"><h2>Spending</h2>${ks.length ? ks.slice(0, 6).map(k => `<div class="rem"><span>${k}</span><span class="st soon">${by[k].toFixed(2)}</span></div>`).join('') + `<div class="rem"><span><strong>All time</strong></span><span class="st">${total.toFixed(2)}</span></div>` : empty('Add prices to your vials to see totals.')}<small>Counted by purchase/opened date, in the currency you enter.</small></div>`;
}
function vialForm(v) {
  const ents = S.peptides.filter(p => !p.archived || (v && p.id === v.peptideId));
  if (!ents.length) { toast('Add an entry first (Log tab → Entries).'); return; }
  openForm(v ? 'Edit vial' : 'Add vial', `
    <label>Entry<select name="p" required>${ents.map(p => `<option value="${p.id}" ${v && v.peptideId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    <label>Label / batch (optional)<input name="l" maxlength="60" value="${esc(v && v.label)}"></label>
    <label>Total amount (optional)<div class="row"><input name="t" type="number" step="any" min="0" inputmode="decimal" value="${v && v.total ? v.total : ''}"><select name="u" aria-label="Unit">${UNITS.map(u => `<option ${((v && v.unit) || 'mg') === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div></label>
    <label>Purchase / opened date<input type="date" name="d" value="${v ? v.date : parts().date}"></label>
    <label>Expiry date (optional)<input type="date" name="x" value="${esc(v && v.expiry)}"></label>
    <label>Price (optional)<input name="c" type="number" step="any" min="0" inputmode="decimal" value="${v && v.price != null ? v.price : ''}"></label>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="ar" ${v && v.archived ? 'checked' : ''} style="width:auto;min-height:0;margin:0">Archived</label>`, async f => {
    const total = f.get('t') ? parseFloat(f.get('t')) : null, price = f.get('c') ? parseFloat(f.get('c')) : null;
    if (total !== null && !(total > 0 && total < 1e7)) return 'Total amount must be greater than 0.';
    if (price !== null && !(price >= 0 && price < 1e7)) return 'Please enter a valid price.';
    await DB.put('vials', { ...(v || {}), peptideId: +f.get('p'), label: f.get('l').trim(), total, unit: total ? f.get('u') : null, date: f.get('d') || parts().date, expiry: f.get('x') || null, price, archived: f.has('ar') });
  });
}
const showVial = v => { const r = remaining(v); openDetail(pName(v.peptideId), `<p>${esc(v.label || '')}</p>${v.total ? `<p class="big">${+r.toFixed(3)} / ${v.total} ${v.unit}</p>` : ''}<p>Date: ${fmtD(v.date + 'T12:00')}<br>Expiry: ${v.expiry ? fmtD(v.expiry + 'T12:00') : '—'}${expired(v) ? ' (past)' : ''}<br>Price: ${v.price != null ? v.price : '—'}</p>`, () => vialForm(v), () => DB.del('vials', v.id)); };

/* ---------- statistics ---------- */
const dayNum = k => Math.round(new Date(k + 'T12:00').getTime() / DAY);
function streaks() {
  const ks = [...new Set(S.logs.map(l => parts(l.ts).date))].sort(); if (!ks.length) return null;
  let best = 1, cur = 1, gap = 0;
  for (let i = 1; i < ks.length; i++) { const d = dayNum(ks[i]) - dayNum(ks[i - 1]); if (d === 1) { cur++; best = Math.max(best, cur); } else { cur = 1; gap = Math.max(gap, d - 1); } }
  const since = dayNum(parts().date) - dayNum(ks[ks.length - 1]);
  return { best, cur: since <= 1 ? cur : 0, gap, since };
}
function summary(days) {
  const cut = Date.now() - days * DAY, n = S.logs.filter(l => new Date(l.ts) >= cut), pe = n.filter(l => cat(l.peptideId) === 'peptide').length;
  const w = S.weights.filter(x => new Date(x.ts) >= cut).sort(byTs);
  return { n: n.length, pe, st: n.length - pe, w: w.length > 1 ? `${fmtW(w[0].kg)} → ${fmtW(w[w.length - 1].kg)}` : '—' };
}
function heat() {
  const cnt = {}; S.logs.forEach(l => { const k = parts(l.ts).date; cnt[k] = (cnt[k] || 0) + 1; });
  const end = new Date(), start = new Date(end); start.setDate(end.getDate() - ((end.getDay() + 6) % 7) - 77);
  let h = '';
  for (let i = 0; i < 84; i++) { const d = new Date(start); d.setDate(start.getDate() + i); const k = parts(d).date, n = cnt[k] || 0; h += `<i class="hc" style="${d > end ? 'visibility:hidden' : 'opacity:' + (n ? Math.min(1, .35 + n * .25) : .12)}" title="${k}: ${n}"></i>`; }
  return `<div class="heat">${h}</div>`;
}
const amtOpts = () => { const m = {}; S.logs.filter(l => l.amount).forEach(l => { m[l.peptideId + '|' + l.unit] = 1; }); return Object.keys(m); };
function vStats() {
  const a = summary(7), b = summary(30), s = streaks(), o = amtOpts(); if (o.length && !o.includes(S.sa)) S.sa = o[0];
  return `<div class="grid"><div class="card"><small>Last 7 days</small><div class="big">${a.n}</div><small>${a.pe} peptide · ${a.st} steroid</small></div><div class="card"><small>Last 30 days</small><div class="big">${b.n}</div><small>${b.pe} peptide · ${b.st} steroid</small></div></div>
  <div class="card"><h2>Weight in period</h2><small>7 days: ${a.w}<br>30 days: ${b.w}<br>Recorded values only; this does not explain the cause of a change.</small></div>
  ${s ? `<div class="card"><h2>Streaks &amp; gaps</h2><div class="grid"><div><div class="big">${s.cur}</div><small>current streak (days in a row)</small></div><div><div class="big">${s.best}</div><small>longest streak</small></div><div><div class="big">${s.since}</div><small>days since last entry</small></div><div><div class="big">${s.gap}</div><small>longest gap (days)</small></div></div></div>` : ''}
  <div class="card"><h2>Last 12 weeks</h2>${heat()}<small>Brighter = more entries that day.</small></div>
  ${vCharts()}
  ${o.length ? `<div class="card"><h2>Amounts</h2><label>Entry<select id="sa">${o.map(k => { const [p, u] = k.split('|'); return `<option value="${k}" ${k === S.sa ? 'selected' : ''}>${esc(pName(+p))} (${u})</option>`; }).join('')}</select></label><div class="cv"><canvas id="ca" role="img" aria-label="Logged amounts over time"></canvas></div></div>` : ''}`;
}
function drawAmt() {
  if (!amtOpts().length) return; const [p, u] = S.sa.split('|');
  const r = S.logs.filter(l => l.peptideId === +p && l.unit === u && l.amount).sort(byTs);
  mk('ca', { type: 'line', data: { labels: r.map(l => fmtD(l.ts)), datasets: [{ data: r.map(l => l.amount), borderColor: '#bf5af2', backgroundColor: '#bf5af2', tension: .2, pointRadius: 3 }] }, options: { scales: { x: { ticks: { maxTicksLimit: 5 } }, y: { title: { display: true, text: u } } } } });
}
function extraDraw() {
  if (S.view === 'weight' && S.bt !== 'weight' && S.bt !== 'cmp') drawMetric();
  if (S.view === 'charts') drawAmt();
}

/* ---------- wiring (called by app.js) ---------- */
function extraInit() {
  S.vials = []; S.metrics = []; S.bt = 'weight';
  VIEWS.weight = ['Body', vBody]; VIEWS.charts = ['Stats', vStats]; VIEWS.stock = ['Stock', vStock];
  const load0 = load; load = async () => { await load0(); [S.vials, S.metrics] = await Promise.all([DB.all('vials'), DB.all('metrics')]); };
  const render0 = render; render = () => { render0(); extraDraw(); };
  const rc0 = remCard; remCard = () => { const n = S.vials.filter(v => !v.archived && expired(v)).length; return rc0() + (n ? `<div class="card"><small>${n} vial${n > 1 ? 's are' : ' is'} past the expiry date you entered (Stock tab).</small></div>` : ''); };
  const del0 = DB.del.bind(DB);
  DB.del = async (s, id) => { // keep the deleted record so it can be restored for a few seconds
    const rec = s === 'meta' ? null : await DB.run(s, 'readonly', st => st.get(id));
    await del0(s, id);
    if (rec) { S.undo = { s, rec }; const t = $('#toast'); t.innerHTML = 'Deleted. <button id="undo" class="ghost" style="min-height:34px;padding:4px 14px;margin-left:8px">Undo</button>'; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', 7000); }
  };
  doImport = importFile;
  document.addEventListener('click', async e => {
    if (e.target.closest('#undo') && S.undo) { try { await DB.put(S.undo.s, S.undo.rec); S.undo = null; $('#toast').style.display = 'none'; await load(); render(); } catch (x) { toast('Undo failed: ' + x.message); } return; }
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a, id = +b.dataset.id;
    try {
      if (a === 'bt') { S.bt = b.dataset.v; render(); }
      else if (a === 'newm') metricForm(); else if (a === 'showm') showMetric(S.metrics.find(m => m.id === id));
      else if (a === 'newv') vialForm(); else if (a === 'showv') showVial(S.vials.find(v => v.id === id));
      else if (a === 'repeat') repeatLast(); else if (a === 'xexport') xExport();
    } catch (x) { toast('Error: ' + x.message); }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'mname') { S.mn = t.value; render(); } else if (t.id === 'sa') { S.sa = t.value; render(); } else if (t.id === 'fq') { S.f.q = t.value; render(); } else if (t.id === 'cpa') { S.ca = +t.value; render(); } else if (t.id === 'cpb') { S.cb = +t.value; render(); } else if (t.name === 'pre') { const dl = document.querySelector('#un'), u = document.querySelector('#f [name=u]'); if (dl) dl.innerHTML = unitOpts(t.value); if (u) u.placeholder = (LAB_UNITS[t.value] || []).join(' or ') || 'unit'; }
  });
  if (typeof extra2Init === 'function') extra2Init();
}

/* ---------- weight photos and compare ---------- */
/** Downscale a chosen photo so it stays small in IndexedDB. */
function readPhoto(file) {
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1000 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      res(c.toDataURL('image/jpeg', .72));
    };
    img.onerror = () => rej(new Error('Unsupported image'));
    img.src = u;
  });
}
async function photoFrom(f, r) {
  if (f.has('rmph')) return null;
  const file = f.get('ph'); if (file && file.size) return readPhoto(file);
  return (r && r.photo) || null;
}
const photoField = r => `<label>Photo (optional)<input type="file" name="ph" accept="image/*"></label>${r && r.photo ? `<img class="ph" src="${r.photo}" alt="Current photo" style="aspect-ratio:auto;max-height:160px;width:auto;object-fit:contain"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="rmph" style="width:auto;min-height:0;margin:0">Remove photo</label>` : ''}`;
function vCompare() {
  const ws = [...S.weights].sort(byTs);
  if (ws.length < 2) return bodyTabs() + `<div class="card">${empty('Log at least two weights to compare.')}</div>`;
  if (!ws.some(w => w.id === S.ca)) S.ca = (ws.find(w => w.photo) || ws[0]).id;
  if (!ws.some(w => w.id === S.cb)) S.cb = ws[ws.length - 1].id;
  const A = ws.find(w => w.id === S.ca), B = ws.find(w => w.id === S.cb);
  const when = w => w.hasTime ? fmtDT(w.ts) : fmtD(w.ts);
  const opt = sel => ws.map(w => `<option value="${w.id}" ${w.id === sel ? 'selected' : ''}>${when(w)} · ${fmtW(w.kg)}${w.photo ? ' · 📷' : ''}</option>`).join('');
  const col = (w, l) => `<div><small>${l}</small><div class="big">${fmtW(w.kg)}</div><small>${when(w)}</small>${w.photo ? `<img class="ph" src="${w.photo}" alt="${l} photo">` : '<div class="ph none">No photo</div>'}</div>`;
  const dk = (B.kg - A.kg) * (S.unit === 'lb' ? LB : 1), dd = Math.round((new Date(B.ts) - new Date(A.ts)) / DAY);
  return `${bodyTabs()}<div class="card"><div class="row"><label>From<select id="cpa">${opt(S.ca)}</select></label><label>To<select id="cpb">${opt(S.cb)}</select></label></div>
  <div class="cmp">${col(A, 'From')}${col(B, 'To')}</div>
  <p class="big" style="text-align:center">${dk > 0 ? '+' : ''}${dk.toFixed(1)} ${S.unit}</p>
  <small>Difference between the two recorded values over ${dd} day${dd === 1 ? '' : 's'}. It does not show what changed in the body.</small></div>`;
}
