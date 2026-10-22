'use strict';
/* Extras 3: courses, two-series chart, time-of-day map, chart export, Face ID, privacy blur, gestures, tabs, quick links, Russian UI.
   Loaded before app.js; extra3Init() is called at the end of extra2Init(). */

/* ---------- courses ---------- */
function courseForm(c) {
  openForm(c ? 'Edit course' : 'New course', `<label>Name<input name="n" required maxlength="40" value="${esc(c && c.name)}"></label>
  <label>Start date<input type="date" name="s" required value="${c ? c.start : parts().date}"></label>
  <label>End date (leave empty if ongoing)<input type="date" name="e" value="${esc(c && c.end)}"></label>
  <fieldset class="fs"><legend>Entries in this course (none selected = all)</legend>${S.peptides.map(p => `<label class="chk"><input type="checkbox" name="p" value="${p.id}" ${c && c.entries && c.entries.includes(p.id) ? 'checked' : ''}>${esc(p.name)}</label>`).join('')}</fieldset>
  <label>Note (optional)<textarea name="o" maxlength="500">${esc(c && c.note)}</textarea></label>`, async f => {
    const name = f.get('n').trim(), s = f.get('s'), e = f.get('e') || null;
    if (!name) return 'Name is required.'; if (!s) return 'Start date is required.'; if (e && e < s) return 'The end date must not be before the start date.';
    await DB.put('courses', { ...(c || {}), name, start: s, end: e, entries: f.getAll('p').map(Number), note: f.get('o').trim() });
  });
}
const courseCard = () => `<div class="card"><h2>Courses</h2><button class="ghost" data-a="newcourse">New course</button>${S.courses.length ? `<ul>${[...S.courses].sort((a, b) => b.start.localeCompare(a.start)).map(c => `<li><button class="item" data-a="showcourse" data-id="${c.id}"><strong>${esc(c.name)}</strong>${c.end ? '' : ' <span class="tag weight">Ongoing</span>'}<br><small>${fmtD(c.start + 'T12:00')} – ${c.end ? fmtD(c.end + 'T12:00') : 'now'}${c.entries && c.entries.length ? ' · ' + c.entries.map(i => esc(pName(i))).join(', ') : ''}</small></button></li>`).join('')}</ul>` : empty('No courses yet.')}<small>A course is a label for a date range you define. It appears as a band on the charts.</small></div>`;
const coursePlugin = recs => ({ id: 'courses', beforeDatasetsDraw(ch) {
  if (!S.courses.length || !recs.length) return;
  const x = ch.scales.x, y = ch.scales.y, c = ch.ctx, t0 = new Date(recs[0].ts).getTime(), t1 = new Date(recs[recs.length - 1].ts).getTime();
  const idx = t => { const i = recs.findIndex(q => new Date(q.ts).getTime() >= t); return i < 0 ? recs.length - 1 : i; };
  c.save();
  S.courses.forEach(co => {
    const a = new Date(co.start + 'T00:00').getTime(), b = co.end ? new Date(co.end + 'T23:59').getTime() : Infinity; if (b < t0 || a > t1) return;
    const x1 = a <= t0 ? x.left : x.getPixelForValue(idx(a)), x2 = b >= t1 ? x.right : x.getPixelForValue(idx(b));
    c.fillStyle = 'rgba(255,214,10,.12)'; c.fillRect(x1, y.top, Math.max(2, x2 - x1), y.bottom - y.top);
    c.fillStyle = 'rgba(255,214,10,.9)'; c.font = '10px sans-serif'; c.fillText(co.name, x1 + 3, y.top + 11);
  });
  c.restore();
} });
function courseStats(c) {
  const today = parts().date, L = Math.max(1, Math.round((new Date((c.end || today) + 'T12:00') - new Date(c.start + 'T12:00')) / DAY) + 1);
  const add = (d, n) => { const t = new Date(d + 'T12:00'); t.setDate(t.getDate() + n); return parts(t).date; };
  const ents = c.entries && c.entries.length ? c.entries : null, avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
  const stat = r => { if (!r) return null; const inR = x => { const d = parts(x.ts).date; return d >= r[0] && d <= r[1]; }, Lg = S.logs.filter(x => inR(x) && (!ents || ents.includes(x.peptideId)));
    return { n: Lg.length, w: avg(S.weights.filter(inR).map(x => x.kg)), mood: avg(Lg.map(x => x.mood).filter(Boolean)), sym: S.symptoms.filter(inR).length, met: avg(S.metrics.filter(m => inR(m) && m.name === S.cmet).map(m => m.value)) }; };
  return { L, before: stat([add(c.start, -L), add(c.start, -1)]), during: stat([c.start, c.end || today]), after: c.end ? stat([add(c.end, 1), add(c.end, L)]) : null };
}
function courseAnalysis() {
  if (!S.courses.length) return '';
  if (!S.courses.some(c => c.id === S.cs)) S.cs = [...S.courses].sort((a, b) => b.start.localeCompare(a.start))[0].id;
  const c = S.courses.find(x => x.id === S.cs), mn = [...new Set(S.metrics.map(m => m.name))]; if (!mn.includes(S.cmet)) S.cmet = mn[0] || null;
  const r = courseStats(c);
  const col = (t, s) => s ? `<div><small>${t}</small><div class="big">${s.n}</div><small>entries<br>avg weight: ${s.w == null ? '—' : fmtW(s.w)}<br>avg feeling: ${s.mood == null ? '—' : s.mood.toFixed(1) + '/5'}<br>symptoms: ${s.sym}${S.cmet ? `<br>${esc(S.cmet)}: ${s.met == null ? '—' : +s.met.toFixed(2)}` : ''}</small></div>` : `<div><small>${t}</small><div class="big">—</div><small>not ended yet</small></div>`;
  return `<div class="card"><h2>Course analysis</h2><div class="row"><label>Course<select id="cs">${S.courses.map(x => `<option value="${x.id}" ${x.id === S.cs ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>${mn.length ? `<label>Metric<select id="cmet">${mn.map(n => `<option ${n === S.cmet ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}</div>
  <div class="cmp3">${col('Before', r.before)}${col('During', r.during)}${col('After', r.after)}</div><small>Averages of your recorded values. The before/after windows are as long as the course (${r.L} days). No conclusions are drawn.</small></div>`;
}

/* ---------- two series on one chart, time-of-day map, chart export ---------- */
const seriesOpts = () => [['weight', 'Weight'], ['mood', 'Feeling (avg/day)'], ['entries', 'Entries per day'], ['sym', 'Symptom severity (avg/day)'], ...[...new Set(S.metrics.map(m => m.name))].map(n => ['m:' + n, n])];
function seriesData(k) {
  const cut = S.sp === 'all' ? 0 : Date.now() - S.sp * DAY, m = {}, add = (ts, v) => { if (new Date(ts) < cut || v == null) return; (m[parts(ts).date] = m[parts(ts).date] || []).push(v); };
  if (k === 'weight') S.weights.forEach(x => add(x.ts, +(S.unit === 'lb' ? x.kg * LB : x.kg).toFixed(2)));
  else if (k === 'mood') S.logs.forEach(l => add(l.ts, l.mood || null)); else if (k === 'entries') S.logs.forEach(l => add(l.ts, 1));
  else if (k === 'sym') S.symptoms.forEach(y => add(y.ts, y.sev)); else S.metrics.filter(x => 'm:' + x.name === k).forEach(x => add(x.ts, x.value));
  const o = {}; for (const d in m) o[d] = k === 'entries' ? m[d].length : m[d].reduce((a, b) => a + b, 0) / m[d].length; return o;
}
function twoCard() {
  const o = seriesOpts(); if (!o.some(([k]) => k === S.s1)) S.s1 = 'weight'; if (!o.some(([k]) => k === S.s2)) S.s2 = 'entries';
  const sel = (id, v) => `<select id="${id}">${o.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return `<div class="card"><h2>Two series, one chart</h2><div class="row"><label>Left axis${sel('s1', S.s1)}</label><label>Right axis${sel('s2', S.s2)}</label></div><div class="cv"><canvas id="c2s" role="img" aria-label="Two series over time"></canvas></div><small>Follows the period selected above. Recorded values only; no causes implied.</small></div>`;
}
function drawTwo() {
  if (!document.getElementById('c2s')) return;
  const a = seriesData(S.s1), b = seriesData(S.s2), labels = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(); if (!labels.length) return;
  const nm = k => (seriesOpts().find(([x]) => x === k) || [0, k])[1], ds = (k, d, col, ax) => ({ label: nm(k), data: labels.map(x => d[x] ?? null), borderColor: col, backgroundColor: col, yAxisID: ax, spanGaps: true, tension: .2, pointRadius: 3 });
  mk('c2s', { type: 'line', plugins: [coursePlugin(labels.map(d => ({ ts: d + 'T12:00' })))], data: { labels: labels.map(d => fmtD(d + 'T12:00')), datasets: [ds(S.s1, a, '#0a84ff', 'y'), ds(S.s2, b, '#ffd60a', 'y1')] }, options: { plugins: { legend: { display: true, labels: { boxWidth: 12 } } }, scales: { x: { ticks: { maxTicksLimit: 5 } }, y: { position: 'left' }, y1: { position: 'right', grid: { drawOnChartArea: false } } } } });
}
function hoursCard() {
  const n = Array(24).fill(0); S.logs.forEach(l => { n[new Date(l.ts).getHours()]++; }); const mx = Math.max(...n); if (!mx) return '';
  return `<div class="card"><h2>Time of day</h2><div class="hours">${n.map((v, h) => `<i style="opacity:${v ? .25 + .75 * v / mx : .1}" title="${h}:00 — ${v}"></i>`).join('')}</div><div class="hl"><small>0</small><small>6</small><small>12</small><small>18</small><small>24</small></div><small>When you usually log entries (by the time you entered).</small></div>`;
}
function addShots() {
  document.querySelectorAll('.cv').forEach(cv => {
    const c = cv.querySelector('canvas'), nx = cv.nextElementSibling; if (!c || (nx && nx.classList.contains('shot'))) return;
    const b = document.createElement('button'); b.className = 'ghost shot'; b.dataset.a = 'shot'; b.dataset.c = c.id; b.textContent = 'Save chart as image'; cv.after(b);
  });
}
function shotChart(id) {
  const c = document.getElementById(id); if (!c) return;
  const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const x = t.getContext('2d'); x.fillStyle = '#14141a'; x.fillRect(0, 0, t.width, t.height); x.drawImage(c, 0, 0);
  t.toBlob(async b => {
    const f = new File([b], 'chart.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = 'chart.png'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 5000);
  });
}

/* ---------- Face ID (WebAuthn platform authenticator; a local convenience lock, verified on-device only) ---------- */
async function bioAvailable() { return !!(window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }
async function bioRegister() {
  const c = await navigator.credentials.create({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: 'Private Tracker' }, user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'user', displayName: 'User' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000 } });
  S.bio = b64(c.rawId); await DB.put('meta', { key: 'bio', value: S.bio });
}
async function bioAuth() {
  await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: 'public-key', id: ub64(S.bio) }], userVerification: 'required', timeout: 60000 } }); return true;
}

/* ---------- gestures: swipe left to delete (with Undo), pull down to refresh ---------- */
function gestures() {
  let sx = 0, sy = 0, li = null, pull = false;
  const STORE = { showlog: 'logs', showw: 'weights', showm: 'metrics', showv: 'vials', showsym: 'symptoms', showcourse: 'courses' };
  document.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; li = e.target.closest('li'); if (li && !li.querySelector('button.item[data-a]')) li = null; pull = window.scrollY <= 0 && !e.target.closest('dialog,#lock,#rep'); }, { passive: true });
  document.addEventListener('touchmove', e => { const t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy; if (li && dx < 0 && Math.abs(dx) > Math.abs(dy) * 2) { li.style.transform = `translateX(${Math.max(dx, -140)}px)`; li.style.opacity = 1 + dx / 400; } }, { passive: true });
  document.addEventListener('touchend', async e => {
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (li) {
      const b = li.querySelector('button.item[data-a]'), st = STORE[b.dataset.a]; li.style.transform = ''; li.style.opacity = '';
      if (st && dx < -110 && Math.abs(dy) < 40) { try { await DB.del(st, +b.dataset.id); await load(); render(); } catch (x) { toast('Delete failed: ' + x.message); } li = null; return; }
    }
    if (pull && dy > 110 && Math.abs(dx) < 60 && window.scrollY <= 0 && !S.locked) { await load(); render(); toast('Refreshed'); if (navigator.serviceWorker) navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {}); }
  }, { passive: true });
}

/* ---------- settings: language, tabs, quick links, Face ID, blur ---------- */
function comfortCard() {
  const base = location.origin + location.pathname.replace(/index\.html$/, ''), hid = S.prefs.hidden || [];
  return `<div class="card"><h2>Language</h2><select id="lang" aria-label="Language"><option value="en" ${S.prefs.lang !== 'ru' ? 'selected' : ''}>English</option><option value="ru" ${S.prefs.lang === 'ru' ? 'selected' : ''}>Русский</option></select><small>Russian covers menus, buttons and labels; some longer texts stay in English.</small></div>
  <div class="card"><h2>Tabs</h2>${[['log', 'Log'], ['weight', 'Body'], ['stock', 'Stock'], ['charts', 'Stats']].map(([k, l]) => `<label class="chk"><input type="checkbox" data-tab="${k}" ${hid.includes(k) ? '' : 'checked'}>${l}</label>`).join('')}<small>Home and Settings always stay visible.</small></div>
  <div class="card"><h2>Quick links</h2>${[['Log entry', 'log'], ['Log weight', 'weight'], ['Repeat last', 'repeat']].map(([l, a]) => `<div class="rem"><span>${l}</span><button class="ghost" data-a="copylink" data-u="${esc(base + '?a=' + a)}" style="flex:0 0 auto;min-height:34px;padding:2px 14px">Copy link</button></div>`).join('')}<small>In the Shortcuts app: New shortcut → Open URL → paste the link → Add to Home Screen. The app then opens straight to that form.</small></div>
  <div class="card"><h2>Face ID &amp; privacy</h2>${S.pin ? (S.bio ? '<button class="ghost" data-a="biooff">Disable Face ID</button>' : '<button class="ghost" data-a="bioon">Enable Face ID</button>') : '<small>Set a PIN first to enable Face ID unlock.</small>'}
  <label class="chk"><input type="checkbox" id="blurchk" ${S.prefs.blur !== false ? 'checked' : ''}>Blur the app in the app switcher</label><small>Face ID is a convenience unlock on top of the PIN, not encryption. Blurring works best when the app is added to the Home Screen; iOS may still show a snapshot in some cases.</small></div>`;
}

/* ---------- Russian UI: exact-text dictionary applied to the DOM (longer paragraphs stay English) ---------- */
const RU = {
  'Home': 'Главная', 'Log': 'Журнал', 'Body': 'Тело', 'Stock': 'Запасы', 'Stats': 'Статистика', 'Settings': 'Настройки',
  'Latest weight': 'Последний вес', 'Last log': 'Последняя запись', 'Records created this month': 'Записей за этот месяц', 'Log entry': 'Записать', 'Log weight': 'Записать вес', 'Repeat last': 'Повторить последнюю',
  'Recent activity': 'Недавние события', 'Reminders': 'Напоминания', 'Nothing recorded yet.': 'Пока ничего не записано.', 'Goal weight': 'Целевой вес', 'No entries': 'Нет записей', 'Weight': 'Вес', 'Photo': 'Фото',
  'Peptide': 'Пептид', 'Steroid': 'Стероид', 'Check-in': 'Проверка', 'Expired': 'Просрочено', 'archived': 'в архиве', 'Ongoing': 'Идёт',
  'History': 'История', 'Peptides': 'Пептиды', 'Steroids': 'Стероиды', 'All': 'Все', 'Entry': 'Вещество', 'From': 'От', 'To': 'До', 'Search': 'Поиск', 'Entries': 'Вещества', 'Add entry': 'Добавить вещество', 'Edit': 'Изменить', 'Archive': 'В архив', 'Restore': 'Вернуть', 'Calendar': 'Календарь',
  'No records match the filters.': 'Нет записей по фильтрам.', 'No peptide records yet.': 'Записей пока нет.', 'No entries yet. Add your own names.': 'Веществ пока нет. Добавьте свои названия.',
  'Templates': 'Шаблоны', 'New template': 'Новый шаблон', 'Use': 'Применить', 'No templates yet.': 'Шаблонов пока нет.', 'Symptoms & side effects': 'Симптомы и побочные эффекты', 'Log symptom': 'Записать симптом', 'Nothing logged.': 'Ничего не записано.',
  'Courses': 'Курсы', 'New course': 'Новый курс', 'No courses yet.': 'Курсов пока нет.', 'Edit course': 'Изменить курс', 'Start date': 'Дата начала', 'End date (leave empty if ongoing)': 'Дата окончания (пусто, если идёт)',
  'Cancel': 'Отмена', 'Save': 'Сохранить', 'Close': 'Закрыть', 'Delete': 'Удалить', 'Date': 'Дата', 'Time': 'Время', 'Time (optional)': 'Время (необязательно)', 'Name': 'Название',
  'Amount (optional)': 'Количество (необязательно)', 'Injection site (optional)': 'Место укола (необязательно)', 'Vial (optional)': 'Флакон (необязательно)', 'None': 'Нет', 'How did you feel? 1–5 (optional)': 'Самочувствие 1–5 (необязательно)',
  'Tags (optional, comma-separated)': 'Теги (через запятую, необязательно)', 'Note (optional)': 'Заметка (необязательно)', 'Photo (optional)': 'Фото (необязательно)', 'Remove photo': 'Удалить фото',
  'Edit log entry': 'Изменить запись', 'Edit weight': 'Изменить вес', 'New entry': 'Новое вещество', 'Edit entry': 'Изменить вещество', 'Remind me every': 'Напоминать каждые', 'days': 'дн.', 'weeks': 'нед.', 'Reminder time': 'Время напоминания',
  'Range': 'Период', '7 days': '7 дней', '30 days': '30 дней', '90 days': '90 дней', '1 year': '1 год', 'All records': 'Все записи', '30 d': '30 д', '90 d': '90 д', 'All time': 'За всё время',
  'Measures': 'Замеры', 'Labs': 'Анализы', 'Compare': 'Сравнение', 'Add measurement': 'Добавить замер', 'Add lab result': 'Добавить анализ', 'Metric': 'Показатель', 'Marker': 'Маркер', 'Custom…': 'Свой…', 'Value': 'Значение', 'Unit (optional)': 'Единица (необязательно)',
  'Custom name (only if not in the list)': 'Своё название (если нет в списке)', 'Add at least two values to see a chart.': 'Добавьте минимум два значения для графика.', 'No weight records yet.': 'Записей веса пока нет.', 'No weight records in this range.': 'Нет записей веса за этот период.',
  'No lab results yet.': 'Анализов пока нет.', 'No measurements yet.': 'Замеров пока нет.', 'Log at least two weights to compare.': 'Для сравнения нужно минимум два значения веса.', 'No photo': 'Нет фото', 'Save chart as image': 'Сохранить график как картинку',
  'Add vial': 'Добавить флакон', 'Vials': 'Флаконы', 'Spending': 'Расходы', 'No vials yet.': 'Флаконов пока нет.', 'Add prices to your vials to see totals.': 'Добавьте цены флаконов, чтобы видеть суммы.', 'Edit vial': 'Изменить флакон',
  'Label / batch (optional)': 'Метка / партия (необязательно)', 'Total amount (optional)': 'Общее количество (необязательно)', 'Purchase / opened date': 'Дата покупки / вскрытия', 'Expiry date (optional)': 'Срок годности (необязательно)', 'Price (optional)': 'Цена (необязательно)', 'Archived': 'В архиве',
  'Last 7 days': 'Последние 7 дней', 'Last 30 days': 'Последние 30 дней', 'Weight in period': 'Вес за период', 'Streaks & gaps': 'Серии и пропуски', 'Last 12 weeks': 'Последние 12 недель', 'Recorded events per day': 'Записей по дням', 'Records by entry': 'Записи по веществам',
  'Amounts': 'Количества', 'Injection sites': 'Места уколов', 'This month vs last month': 'Этот месяц и прошлый', 'Time of day': 'Время суток', 'Two series, one chart': 'Два показателя на одном графике', 'Left axis': 'Левая ось', 'Right axis': 'Правая ось',
  'Course analysis': 'Анализ курса', 'Course': 'Курс', 'Before': 'До', 'During': 'Во время', 'After': 'После', 'Log a peptide entry to see charts.': 'Добавьте запись, чтобы увидеть графики.',
  'Weight': 'Вес', 'Feeling (avg/day)': 'Самочувствие (среднее за день)', 'Entries per day': 'Записей в день', 'Symptom severity (avg/day)': 'Тяжесть симптомов (среднее)',
  'Appearance': 'Оформление', 'Choose photo': 'Выбрать фото', 'Reset': 'Сбросить', 'Weight unit': 'Единица веса', 'Kilograms': 'Килограммы', 'Pounds': 'Фунты', 'Backup': 'Резервная копия', 'Encrypted export': 'Экспорт с шифрованием', 'Plain JSON': 'Обычный JSON', 'Import JSON': 'Импорт JSON',
  'Privacy': 'Приватность', 'Install on iPhone': 'Установка на iPhone', 'Delete all data': 'Удалить все данные', 'Goal & backup': 'Цель и резервные копии', 'Check-in reminders': 'Напоминания о замерах', 'Add check-in': 'Добавить напоминание', 'All reminders → Calendar': 'Все напоминания → Календарь',
  'Report': 'Отчёт', 'Report for a doctor': 'Отчёт для врача', 'Print / Save as PDF': 'Печать / PDF', 'Security': 'Безопасность', 'Set PIN': 'Установить PIN', 'Change PIN': 'Сменить PIN', 'Remove PIN': 'Удалить PIN', 'Auto-lock after': 'Автоблокировка через', 'Immediately': 'Сразу',
  '1 minute': '1 минута', '5 minutes': '5 минут', '15 minutes': '15 минут', 'Language': 'Язык', 'Tabs': 'Вкладки', 'Quick links': 'Быстрые ссылки', 'Copy link': 'Копировать ссылку', 'Face ID & privacy': 'Face ID и приватность', 'Enable Face ID': 'Включить Face ID', 'Disable Face ID': 'Выключить Face ID', 'Use Face ID': 'Войти по Face ID',
  'Blur the app in the app switcher': 'Размывать приложение в переключателе', 'Enter PIN': 'Введите PIN', 'Forgot PIN': 'Забыли PIN', 'Wrong PIN': 'Неверный PIN', 'Undo': 'Отменить', 'Reminder options': 'Параметры напоминания', 'Snooze 1 hour': 'Отложить на час', 'Snooze until tomorrow 09:00': 'Отложить до завтра 09:00', 'Mark as skipped': 'Отметить как пропущенное',
  'Notes': 'Заметки', 'No note': 'Без заметки', 'Edit value': 'Изменить значение', 'Add vial': 'Добавить флакон', 'Encrypted backup': 'Зашифрованная копия', 'Password': 'Пароль', 'Photos': 'Фото', 'No log yet': 'Записей ещё нет', 'Refreshed': 'Обновлено'
};
const RUPAT = [[/^Weight \((kg|lb)\)$/, 'Вес ($1)'], [/^Overdue (\d+) d$/, 'Просрочено на $1 д'], [/^Due today (.+)$/, 'Сегодня $1'], [/^In (\d+) d · (.+)$/, 'Через $1 д · $2'], [/^Snoozed until (.+)$/, 'Отложено до $1']];
function trStr(s) {
  const t = s.trim(); if (!t) return s; let r = RU[t];
  if (r == null) for (const [re, rp] of RUPAT) if (re.test(t)) { r = t.replace(re, rp); break; }
  return r == null ? s : s.replace(t, () => r);
}
function trAll() {
  if (S.prefs.lang !== 'ru') return; document.documentElement.lang = 'ru';
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const p = n.parentNode && n.parentNode.nodeName; if (p === 'SCRIPT' || p === 'STYLE' || p === 'TEXTAREA') continue; const v = trStr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
  document.querySelectorAll('[placeholder],[aria-label]').forEach(el => { for (const a of ['placeholder', 'aria-label']) { const v = el.getAttribute(a); if (v) { const t = trStr(v); if (t !== v) el.setAttribute(a, t); } } });
}

/* ---------- wiring ---------- */
function extra3Init() {
  S.courses = []; S.bio = null; S.cs = null; S.cmet = null; S.s1 = 'weight'; S.s2 = 'entries';
  S.pending = typeof URLSearchParams !== 'undefined' ? new URLSearchParams(location.search || '').get('a') : null;
  const load2 = load; load = async () => { await load2(); S.courses = await DB.all('courses'); S.bio = ((await DB.all('meta')).find(x => x.key === 'bio') || {}).value || null; };
  const ed0 = extraDraw; extraDraw = () => { ed0(); if (S.view === 'charts') drawTwo(); addShots(); };
  const render1 = render;
  render = () => {
    render1();
    document.querySelectorAll('nav button').forEach(b => { b.style.display = (S.prefs.hidden || []).includes(b.dataset.v) ? 'none' : ''; });
    const a = S.pending; S.pending = null;
    if (a && !S.locked) { if (history.replaceState) history.replaceState(null, '', location.pathname); if (a === 'log') logForm(); else if (a === 'weight') weightForm(); else if (a === 'repeat') repeatLast(); }
  };
  const l0 = VIEWS.log[1], s0 = VIEWS.charts[1], t0 = VIEWS.settings[1];
  VIEWS.log = ['Log', () => l0() + courseCard()];
  VIEWS.charts = ['Stats', () => s0() + twoCard() + courseAnalysis() + hoursCard()];
  VIEWS.settings = ['Settings', () => { const h = t0(), k = '<div class="card"><button class="danger" data-a="wipe">', x = comfortCard(); return h.includes(k) ? h.replace(k, x + k) : h + x; }];
  const priv = on => document.documentElement.classList.toggle('priv', on && S.prefs.blur !== false);
  document.addEventListener('visibilitychange', () => priv(document.hidden));
  window.addEventListener('pagehide', () => priv(true)); window.addEventListener('blur', () => priv(true));
  window.addEventListener('focus', () => priv(false)); window.addEventListener('pageshow', () => priv(false));
  gestures();
  if (typeof MutationObserver !== 'undefined') {
    let busy = false;
    new MutationObserver(() => { if (busy || S.prefs.lang !== 'ru') return; busy = true; try { trAll(); } finally { setTimeout(() => { busy = false; }, 0); } }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, id = +b.dataset.id;
    try {
      if (a === 'newcourse') courseForm();
      else if (a === 'showcourse') { const c = S.courses.find(x => x.id === id); openDetail(c.name, `<p>${fmtD(c.start + 'T12:00')} – ${c.end ? fmtD(c.end + 'T12:00') : 'now'}</p>${c.entries && c.entries.length ? `<p>${c.entries.map(i => esc(pName(i))).join(', ')}</p>` : ''}<p>${c.note ? esc(c.note) : '<span class="mu">No note</span>'}</p>`, () => courseForm(c), () => DB.del('courses', c.id)); }
      else if (a === 'shot') shotChart(b.dataset.c);
      else if (a === 'copylink') { await navigator.clipboard.writeText(b.dataset.u); toast('Link copied'); }
      else if (a === 'bioon') { if (!(await bioAvailable())) { toast('Face ID is not available in this browser.'); return; } await bioRegister(); toast('Face ID enabled'); render(); }
      else if (a === 'biooff') { await DB.del('meta', 'bio'); S.bio = null; render(); }
    } catch (x) { toast('Error: ' + x.message); }
  });
  document.addEventListener('change', async e => {
    const t = e.target;
    try {
      if (t.id === 's1') { S.s1 = t.value; render(); } else if (t.id === 's2') { S.s2 = t.value; render(); }
      else if (t.id === 'cs') { S.cs = +t.value; render(); } else if (t.id === 'cmet') { S.cmet = t.value; render(); }
      else if (t.id === 'lang') { S.prefs.lang = t.value; await savePrefs(); location.reload(); }
      else if (t.id === 'blurchk') { S.prefs.blur = t.checked; await savePrefs(); }
      else if (t.dataset && t.dataset.tab) { const h = new Set(S.prefs.hidden || []); t.checked ? h.delete(t.dataset.tab) : h.add(t.dataset.tab); S.prefs.hidden = [...h]; await savePrefs(); if (h.has(S.view)) S.view = 'home'; render(); }
    } catch (x) { toast('Error: ' + x.message); }
  });
}
