'use strict';
/* Extras 6: customize the interface. Hide tabs, sub-sections, cards and form fields you do not use.
   Hiding never deletes data. Loaded before app.js; extra6Init() is called at the end of extra5Init(). */
const CUSTOM = [
  { g: 'Tabs', items: [['tab:journal', 'Journal'], ['tab:health', 'Health'], ['tab:log', 'Log'], ['tab:weight', 'Body'], ['tab:stock', 'Stock'], ['tab:charts', 'Stats']] },
  { g: 'Health sections', items: [['sub:h:daily', 'Check-in'], ['sub:h:train', 'Training'], ['sub:h:food', 'Food'], ['sub:h:vitals', 'Vitals']] },
  { g: 'Body sections', items: [['sub:b:weight', 'Weight'], ['sub:b:body', 'Measures'], ['sub:b:lab', 'Labs'], ['sub:b:cmp', 'Compare']] },
  { g: 'Journal sections', items: [['sub:j:feed', 'Feed'], ['sub:j:cal', 'Calendar'], ['sub:j:search', 'Search'], ['sub:j:notes', 'Notes']] },
  { g: 'Home cards', items: [['card:quick', 'Quick log'], ['card:actions', 'Action buttons'], ['card:summary', 'Latest weight, last log, month'], ['card:rem', 'Reminders'], ['card:goal', 'Goal weight'], ['card:backup', 'Backup reminder'], ['card:recent', 'Recent activity']] },
  { g: 'Log cards', items: [['card:history', 'History'], ['card:entries', 'Entries'], ['card:tpl', 'Templates'], ['card:sym', 'Symptoms'], ['card:courses', 'Courses']] },
  { g: 'Stats cards', items: [['card:s7', 'Last 7 / 30 days'], ['card:swt', 'Weight in period'], ['card:streaks', 'Streaks & gaps'], ['card:heat', 'Last 12 weeks'], ['card:evt', 'Events and entries charts'], ['card:amts', 'Amounts'], ['card:cmpm', 'This month vs last month'], ['card:sites', 'Injection sites'], ['card:two', 'Two series chart'], ['card:canal', 'Course analysis'], ['card:hours', 'Time of day'], ['card:wk', 'By weekday']] },
  { g: 'Stock cards', items: [['card:vials', 'Vials'], ['card:spend', 'Spending'], ['card:spendc', 'Spending by course']] },
  { g: 'Form fields', items: [['field:site', 'Injection site'], ['field:vial', 'Vial'], ['field:mood', 'Feeling'], ['field:tags', 'Tags'], ['field:photo', 'Photo & angle']] }
];
const hideSet = () => new Set((S.prefs && S.prefs.hide) || []);
const isHidden = k => hideSet().has(k);
const hiddenSeries = k => (k.startsWith('d:') && isHidden('sub:h:daily')) || (k.startsWith('f:') && isHidden('sub:h:food')) || (k.startsWith('v:') && isHidden('sub:h:vitals')) || (k === 'sym' && isHidden('card:sym'));
const h2t = el => { const h = el.querySelector(':scope > h2'); return h ? h.textContent.trim() : ''; };
const T = t => c => c.classList.contains('card') && h2t(c) === t;
const HIDEMAP = {
  home: [['quick', c => c.id === 'qf'], ['actions', c => c.classList.contains('row') && !!c.querySelector('[data-a=newweight]')], ['summary', c => (c.classList.contains('grid') && c.textContent.includes('Latest weight')) || (c.classList.contains('card') && !c.closest('.grid') && c.textContent.includes('Records created this month'))],
    ['rem', T('Reminders')], ['goal', c => c.classList.contains('card') && c.textContent.trim().startsWith('Goal weight')], ['backup', c => c.classList.contains('card') && c.textContent.includes('exists only on this phone')], ['recent', T('Recent activity')]],
  log: [['quick', c => c.id === 'qf'], ['actions', c => c.classList.contains('row') && !!c.querySelector('[data-a=newlog]')], ['history', T('History')], ['entries', T('Entries')], ['tpl', T('Templates')], ['sym', T('Symptoms & side effects')], ['courses', T('Courses')]],
  charts: [['s7', c => c.classList.contains('grid') && c.textContent.includes('Last 7 days')], ['swt', T('Weight in period')], ['streaks', T('Streaks & gaps')], ['heat', T('Last 12 weeks')], ['evt', c => T('Recorded events per day')(c) || T('Records by entry')(c)], ['amts', T('Amounts')], ['cmpm', T('This month vs last month')], ['sites', T('Injection sites')], ['two', T('Two series, one chart')], ['canal', T('Course analysis')], ['hours', T('Time of day')], ['wk', T('By weekday')]],
  stock: [['vials', T('Vials')], ['spend', T('Spending')], ['spendc', T('Spending by course')]]
};
const FIELDMAP = { site: ['Injection site'], vial: ['Vial ('], mood: ['How did you feel'], tags: ['Tags'], photo: ['Photo (', 'Angle (', 'Remove photo'] };
const SUBS = { h: ['daily', 'train', 'food', 'vitals'], b: ['weight', 'body', 'lab', 'cmp'], j: ['feed', 'cal', 'search', 'notes'] };

function fixSubs() {
  const fix = (cur, p) => { const vis = SUBS[p].filter(k => !isHidden(`sub:${p}:${k}`)); return vis.includes(cur) ? cur : (vis[0] || cur); };
  S.ht = fix(S.ht, 'h'); S.bt = fix(S.bt, 'b'); S.jt = fix(S.jt, 'j');
}
function applyHide() {
  const hs = hideSet(); if (!hs.size) return; const main = document.getElementById('view'); if (!main) return;
  main.querySelectorAll('[data-a=ht],[data-a=bt],[data-a=jt]').forEach(b => { if (hs.has(`sub:${{ ht: 'h', bt: 'b', jt: 'j' }[b.dataset.a]}:${b.dataset.v}`)) b.style.display = 'none'; });
  const cards = [...main.querySelectorAll('.card, .grid, #view > .row')];
  (HIDEMAP[S.view] || []).forEach(([key, test]) => { if (hs.has('card:' + key)) cards.forEach(c => { if (c.isConnected && test(c)) c.remove(); }); });
}
function hideFields() {
  const hs = hideSet(); if (!hs.size) return;
  Object.entries(FIELDMAP).forEach(([k, ps]) => { if (!hs.has('field:' + k)) return; document.querySelectorAll('#dlg label').forEach(l => { const t = l.textContent.trim(); if (ps.some(p => t.startsWith(p))) l.style.display = 'none'; }); });
}
function customizeCard() {
  const hid = new Set(S.prefs.hidden || []), hs = hideSet(), oc = S.oc || new Set();
  const ck = (attr, key, label, on) => `<label class="chk"><input type="checkbox" data-${attr}="${key}" ${on ? 'checked' : ''}>${label}</label>`;
  const groups = CUSTOM.map(g => `<details data-g="${g.g}" ${oc.has(g.g) ? 'open' : ''}><summary>${g.g}</summary>${g.items.map(([k, l]) => k.startsWith('tab:') ? ck('tab', k.slice(4), l, !hid.has(k.slice(4))) : ck('hide', k, l, !hs.has(k))).join('')}</details>`).join('');
  return `<div class="card"><h2>Customize</h2><small>Untick what you do not need. Hidden items disappear from the screens; your data is not deleted and you can bring them back at any time.</small>${groups}<button class="ghost" data-a="showall" style="margin-top:10px">Show everything</button></div>`;
}

function extra6Init() {
  S.oc = new Set();
  Object.assign(RU, { 'Customize': 'Настройка интерфейса', 'Show everything': 'Показать всё', 'Health sections': 'Разделы «Здоровье»', 'Body sections': 'Разделы «Тело»', 'Journal sections': 'Разделы «Дневник»', 'Home cards': 'Карточки главной', 'Log cards': 'Карточки журнала', 'Stats cards': 'Карточки статистики', 'Stock cards': 'Карточки запасов', 'Form fields': 'Поля форм', 'Tabs': 'Вкладки',
    'Action buttons': 'Кнопки действий', 'Latest weight, last log, month': 'Вес, последняя запись, месяц', 'Backup reminder': 'Напоминание о копии', 'Recent activity': 'Недавние события', 'Symptoms': 'Симптомы', 'Last 7 / 30 days': 'Последние 7 / 30 дней', 'Events and entries charts': 'Графики записей', 'Two series chart': 'График двух показателей', 'Injection site': 'Место укола', 'Vial': 'Флакон', 'Feeling': 'Самочувствие', 'Tags': 'Теги', 'Photo & angle': 'Фото и ракурс', 'Measures': 'Замеры',
    'Untick what you do not need. Hidden items disappear from the screens; your data is not deleted and you can bring them back at any time.': 'Снимите галочки с ненужного. Скрытое пропадает с экранов, данные не удаляются, вернуть можно в любой момент.' });
  const render2 = render; render = () => { fixSubs(); render2(); applyHide(); };
  const of0 = openForm; openForm = (t, b, s) => { of0(t, b, s); hideFields(); };
  const fi0 = feedItems;
  feedItems = () => fi0().filter(i => !(i.k && isHidden({ daily: 'sub:h:daily', workout: 'sub:h:train', food: 'sub:h:food', vital: 'sub:h:vitals' }[i.k])) && !(i.g === 'sym' && isHidden('card:sym')) && !(i.g === 'weight' && isHidden('sub:b:weight')));
  const s0 = VIEWS.settings[1];
  VIEWS.settings = ['Settings', () => { const h = s0().replace(/<div class="card"><h2>Tabs<\/h2>[\s\S]*?<\/div>/, ''), k = '<div class="card"><button class="danger" data-a="wipe">', x = customizeCard(); return h.includes(k) ? h.replace(k, x + k) : h + x; }];
  document.addEventListener('toggle', e => { const d = e.target; if (d.matches && d.matches('details[data-g]')) { d.open ? S.oc.add(d.dataset.g) : S.oc.delete(d.dataset.g); } }, true);
  document.addEventListener('change', async e => {
    const t = e.target; if (!t.dataset || !t.dataset.hide) return;
    const k = t.dataset.hide, h = new Set(S.prefs.hide || []);
    try {
      if (!t.checked) {
        const m = k.match(/^sub:(\w):/);
        if (m) { const sibs = CUSTOM.flatMap(g => g.items).map(x => x[0]).filter(x => x.startsWith(`sub:${m[1]}:`)); if (sibs.every(x => x === k || h.has(x))) { t.checked = true; toast('Keep at least one section visible, or hide the whole tab instead.'); return; } }
        h.add(k);
      } else h.delete(k);
      S.prefs.hide = [...h]; await savePrefs(); render();
    } catch (x) { toast('Error: ' + x.message); }
  });
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-a="showall"]'); if (!b) return;
    try { S.prefs.hide = []; S.prefs.hidden = []; await savePrefs(); render(); toast('Everything is visible again.'); } catch (x) { toast('Error: ' + x.message); }
  });
}
