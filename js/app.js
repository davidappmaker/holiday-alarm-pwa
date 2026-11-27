/* 闹钟 PWA 主逻辑：闹钟计算、页面交互、本地存储、通知 */
(function () {
  'use strict';
  const KEY = 'holiday_alarm_pwa_v1';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const TYPES = {
    normal:  { label: '普通闹钟', emoji: '⏰', desc: '类似系统闹钟,但可适配法定节假日和补班,支持个人加班休假和跳过' },
    shift:   { label: '轮班闹钟', emoji: '🗓️', desc: '用于上四休二之类的倒班和排班等特殊工作制,仅需设置一个闹钟,适合工人医生护士和教师等' },
    once:    { label: '定时闹钟', emoji: '🕒', desc: '指定日期响起，可用于线上抢购和驾驶证换证等' },
    cycle:   { label: '特殊周期闹钟', emoji: '⏳', desc: '每隔几天或几周或几月或几年响一次,可用于吃药,大小周周六(周期设置为每2周周六),补习等' },
    yearly:  { label: '年度闹钟', emoji: '📅', desc: '一年响一次,可用于生日和各种节日,纪念日(不支持强力模式)' },
    monthly: { label: '月度闹钟', emoji: '🌙', desc: '一个月响一次,可用于还信用卡,房贷等(不支持强力模式)' }
  };
  const RINGTONES = ['经典铃声', '系统默认', '雷达', '闹铃', '无铃声'];
  const RINGTONE_FILES = {
    '经典铃声': 'sounds/classic.wav',
    '系统默认': 'sounds/default.wav',
    '雷达': 'sounds/radar.wav',
    '闹铃': 'sounds/alarm.wav',
    // 兼容旧存档中的名称
    '雷达.m4r': 'sounds/radar.wav', '鸟鸣': 'sounds/radar.wav', '轻音乐': 'sounds/classic.wav'
  };
  const EARLY = ['不提前', '提前5分钟', '提前15分钟', '提前30分钟', '提前1小时'];
  const SNOOZE = ['不推迟', '5分钟后', '10分钟后', '15分钟后'];
  const YEARS = ['不限起始年份', '2025', '2026', '2027', '2028', '2029', '2030'];

  let state = load();
  let draft = newDraft();
  let installEvent = null;
  let toastTimer = null;

  /* ---------------- 存储 ---------------- */
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      return Object.assign({ alarms: [], reminders: { '报时': false, '喝水吃药': false },
        marks: {}, muted: true, hideTypePicker: false }, raw);
    } catch (e) { return { alarms: [], reminders: { '报时': false, '喝水吃药': false }, marks: {}, muted: true, hideTypePicker: false }; }
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
  function uid() { return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------------- 闹钟下一次响铃计算 ---------------- */
  function timeOf(day, hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(day); d.setHours(h, m, 0, 0); return d;
  }
  function parseRepeat(text) {
    text = (text || '').trim();
    let m = text.match(/每\s*(\d+)\s*(天|周|月|年)/);
    if (m) return { n: Math.max(1, +m[1]), unit: m[2] };
    m = text.match(/做\s*(\d+)\s*休\s*(\d+)/);
    if (m) return { work: Math.max(1, +m[1]), rest: Math.max(1, +m[2]), unit: 'shift' };
    m = text.match(/周([一二三四五六日天1-7])/);
    if (m) { const map = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 }; return { weekday: map[m[1]] !== undefined ? map[m[1]] : (+m[1] || 0) % 7, unit: 'week' }; }
    return null;
  }
  function dayMatches(alarm, date) {
    const r = parseRepeat(alarm.repeat);
    if (r && r.unit === 'week' && r.weekday !== undefined && date.getDay() !== r.weekday) return false;
    if (r && r.unit === 'shift') {
      const start = alarm.startDate ? new Date(alarm.startDate + 'T00:00:00') : new Date(alarm.createdAt || date);
      const span = Math.floor((date - start) / 86400000);
      if (span < 0) return false;
      if (span % (r.work + r.rest) >= r.work) return false;
    }
    if (alarm.skipped && alarm.skipped.includes(Cal.key(date))) return false;
    const mark = state.marks[Cal.key(date)];
    if (mark === '休假') return false;
    return true;
  }
  function nextOccurrence(alarm, from, ignoreEnabled) {
    from = from || new Date();
    if (!alarm.enabled && !ignoreEnabled) return null;
    const base = from;
    const max = alarm.type === 'once' ? 1 : 3700;
    for (let i = 0; i < max; i++) {
      const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      const t = timeOf(date, alarm.time);
      if (t <= base) continue;
      if (!dayMatches(alarm, date)) continue;
      let ok = false;
      switch (alarm.type) {
        case 'once': {
          const d = alarm.date || alarm.startDate;
          ok = !!d && Cal.key(date) === d;
          break;
        }
        case 'yearly': {
          const start = alarm.startDate || alarm.date;
          if (start && date < new Date(start + 'T00:00:00')) { ok = false; break; }
          if (alarm.calendarMode === 'lunar' && alarm.lunarDate) {
            ok = Cal.lunarKey(date) === alarm.lunarDate;
          } else {
            const md = (alarm.date || start || Cal.key(date)).slice(5);
            ok = Cal.key(date).slice(5) === md;
          }
          break;
        }
        case 'monthly': {
          const start = alarm.startDate || alarm.date;
          if (start && date < new Date(start + 'T00:00:00')) { ok = false; break; }
          if (alarm.calendarMode === 'lunar' && alarm.lunarDate) {
            ok = Cal.lunarParts(date).day === alarm.lunarDate.split('-')[1];
          } else {
            const dayNum = +(alarm.date || start || Cal.key(date)).slice(8);
            ok = date.getDate() === Math.min(dayNum, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate());
          }
          break;
        }
        case 'cycle': {
          const r = parseRepeat(alarm.repeat);
          const start = alarm.startDate || alarm.date || Cal.key(base);
          const s = new Date(start + 'T00:00:00');
          if (date < s) { ok = false; break; }
          if (!r) { ok = i === 0 || Cal.key(date) === Cal.key(s); break; }
          if (r.unit === '天') ok = Math.round((date - s) / 86400000) % (r.n || 1) === 0;
          else if (r.unit === '周') ok = Math.round((date - s) / 86400000) % (7 * r.n) === 0;
          else if (r.unit === '月') ok = ((date.getFullYear() - s.getFullYear()) * 12 + date.getMonth() - s.getMonth()) % r.n === 0 && date.getDate() === s.getDate();
          else if (r.unit === '年') ok = (date.getFullYear() - s.getFullYear()) % r.n === 0 && Cal.key(date).slice(5) === Cal.key(s).slice(5);
          break;
        }
        case 'shift': ok = !!parseRepeat(alarm.repeat) || true; break;
        default: ok = true;
      }
      if (ok) return t;
    }
    return null;
  }
  function countdownText(next, now) {
    const diff = next - now;
    if (diff < 0) return '已到时间';
    if (diff < 24 * 3600 * 1000) {
      const h = Math.floor(diff / 3600000), m = Math.floor(diff % 3600000 / 60000);
      return '还有 ' + h + ' 小时 ' + m + ' 分';
    }
    return Cal.fullDate(next) + ' ' + Math.ceil(diff / 86400000) + '天';
  }
  function switchColor(a) {
    if (state.marks[Cal.key(nextOccurrence(a, new Date()) || new Date())] === '加班') return 'orange';
    return a.type === 'normal' ? 'green' : 'blue';
  }

  /* ---------------- 导出到系统日历（关闭网页也照常提醒） ---------------- */
  const EXPORT_DAYS = { '未来 1 个月': 31, '未来 3 个月': 92, '未来 1 年': 366 };
  function earlyMinutes(a) {
    const s = a.early || '';
    if (s.indexOf('不提前') >= 0) return 0;
    const m = s.match(/(\d+)/);
    if (!m) return 0;
    return s.indexOf('小时') >= 0 ? (+m[1]) * 60 : (+m[1]);
  }
  function expandOccurrences(alarm, from, until, max) {
    const out = [];
    let cursor = new Date(from.getTime());
    for (let guard = 0; out.length < max && guard < max * 3; guard++) {
      const next = nextOccurrence(alarm, cursor);
      if (!next || next > until) break;
      out.push(next);
      cursor = new Date(next.getTime() + 1000);
    }
    return out;
  }
  function icsText(s) {
    return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function icsFold(line) {
    const encoder = new TextEncoder();
    const out = [];
    let cur = '', bytes = 0;
    for (const ch of line) {
      const n = encoder.encode(ch).length;
      if (bytes + n > 75) { out.push(cur); cur = ' '; bytes = 1; }
      cur += ch; bytes += n;
    }
    out.push(cur);
    return out.join('\r\n');
  }
  function icsLocal(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + 'T' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  function icsUTC(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
  }
  function buildICS(days) {
    const now = new Date();
    const until = new Date(now.getTime() + days * 86400000);
    const stamp = icsUTC(now);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Holiday Alarm PWA//ZH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:闹钟提醒'];
    let count = 0;
    state.alarms.forEach(a => {
      if (!a.enabled) return;
      expandOccurrences(a, now, until, 400).forEach(t => {
        const end = new Date(t.getTime() + 5 * 60000);
        const title = a.name || TYPES[a.type].label;
        const desc = [a.note, a.repeat, a.calendarMode === 'lunar' && a.lunarDate ? '农历' + a.lunarDate : ''].filter(Boolean).join(' · ');
        lines.push('BEGIN:VEVENT',
          'UID:' + a.id + '-' + icsLocal(t) + '@holiday-alarm-pwa',
          'DTSTAMP:' + stamp,
          'DTSTART:' + icsLocal(t),
          'DTEND:' + icsLocal(end),
          'SUMMARY:' + icsText(title),
          'DESCRIPTION:' + icsText(desc || '闹钟提醒'));
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(title + ' 时间到'), 'TRIGGER:-PT0M', 'END:VALARM');
        const em = earlyMinutes(a);
        if (em > 0) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(title + ' 提前提醒'), 'TRIGGER:-PT' + em + 'M', 'END:VALARM');
        lines.push('END:VEVENT');
        count++;
      });
    });
    lines.push('END:VCALENDAR');
    return { text: lines.map(icsFold).join('\r\n') + '\r\n', count };
  }
  function downloadICS(days) {
    const out = buildICS(days);
    if (!out.count) { toast('没有可导出的已开启闹钟'); return; }
    const blob = new Blob([out.text], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = '闹钟提醒-' + Cal.key(new Date()) + '.ics';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('已生成 ' + out.count + ' 条提醒，请在下载中打开并添加到日历');
  }
  function exportCalendar() {
    openSheet('导出到系统日历', Object.keys(EXPORT_DAYS), v => downloadICS(EXPORT_DAYS[v]));
  }

  /* ---------------- 页面切换 ---------------- */
  function showPage(name) {
    const map = { home: 'page-home', calendar: 'page-calendar', add: 'page-add', types: 'page-types', reminders: 'page-reminders', profile: 'page-profile' };
    $$('.page').forEach(p => p.classList.toggle('active', p.id === map[name]));
    const isForm = name === 'add' || name === 'types';
    $('#app').classList.toggle('hide-tabbar', isForm);
    $$('#tabbar button[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    if (name === 'home') renderHome();
    if (name === 'calendar') renderCalendar();
    if (name === 'reminders') renderReminders();
    if (name === 'types') renderTypes();
    window.scrollTo(0, 0);
  }
  function toast(msg, ms) {
    const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), ms || 2200);
  }
  function openSheet(title, options, onSelect, selected, onPreview) {
    $('#sheet-title').textContent = title;
    const box = $('#sheet-options'); box.innerHTML = '';
    options.forEach(o => {
      const label = typeof o === 'string' ? o : o.label;
      const b = document.createElement('button');
      b.className = 'sheet-option' + (label === selected ? ' selected' : '') + (onPreview ? ' with-preview' : '');
      if (onPreview && label !== '无铃声') {
        const span = document.createElement('span'); span.className = 'opt-label'; span.textContent = label;
        const prev = document.createElement('span'); prev.className = 'opt-play'; prev.textContent = '▶';
        prev.setAttribute('aria-label', '试听 ' + label);
        prev.onclick = e => { e.stopPropagation(); onPreview(label); };
        b.appendChild(span); b.appendChild(prev);
      } else b.textContent = label;
      b.onclick = () => { closeSheet(); onSelect(label); };
      box.appendChild(b);
    });
    $('#sheet-mask').classList.remove('hidden');
  }
  function closeSheet() { $('#sheet-mask').classList.add('hidden'); }
  $('#sheet-cancel').onclick = closeSheet;
  $('#sheet-mask').onclick = e => { if (e.target.id === 'sheet-mask') closeSheet(); };

  /* ---------------- 首页 ---------------- */
  function renderHome() {
    const now = new Date();
    $('#today-line').textContent = Cal.shortDate(now) + ' ' + Cal.weekdayCN(now) + ' ' + now.toTimeString().slice(0, 8);
    $('#holiday-line').textContent = Cal.holiday(now) || Cal.lunarFull(now);
    $('#mute-chip').textContent = state.muted ? '🔇 您已静音' : '🔊 声音已开启';
    const q = ($('#alarm-search').value || '').trim().toLowerCase();
    const groups = { '今天': [], '明天': [], '一周内': [], '一个月内': [], '以后': [] };
    const todayKey = Cal.key(now), tomorrowKey = Cal.key(Cal.addDays(now, 1));
    state.alarms.forEach(a => {
      if (q && !((a.name || '') + (a.note || '') + a.time).toLowerCase().includes(q)) return;
      const next = nextOccurrence(a, now, true);
      if (!next) return;
      const k = Cal.key(next), d = (next - now) / 86400000;
      const g = k === todayKey ? '今天' : k === tomorrowKey ? '明天' : d <= 7 ? '一周内' : d <= 30 ? '一个月内' : '以后';
      groups[g].push({ a, next });
    });
    const box = $('#alarm-groups'); box.innerHTML = '';
    if (!state.alarms.length) {
      box.innerHTML = '<div class="empty-state"><span class="big">⏰</span>还没有闹钟<br>点击底部的 ＋ 添加一个吧</div>';
      return;
    }
    Object.keys(groups).forEach(g => {
      if (!groups[g].length) return;
      groups[g].sort((x, y) => x.next - y.next);
      const h = document.createElement('div'); h.className = 'group-title'; h.textContent = g; box.appendChild(h);
      groups[g].forEach(({ a, next }) => {
        const card = document.createElement('div');
        card.className = 'alarm-card';
        const skipped = a.skipped && a.skipped.includes(Cal.key(next));
        const note = [a.name || TYPES[a.type].label, a.note, a.repeat && a.repeat !== '每周一' ? a.repeat : ''].filter(Boolean).join(' · ');
        card.innerHTML =
          '<div class="alarm-main"><div><div class="alarm-time">' + a.time + '</div>' +
          '<div class="alarm-note"><span class="type-pill">' + TYPES[a.type].label + '</span>' + escapeHtml(note) + '</div></div>' +
          '<div class="alarm-right"><div class="countdown ' + (next - now < 3600000 ? 'near' : '') + '">' + (a.enabled ? countdownText(next, now) : '已关闭') + '</div>' +
          '<div class="alarm-actions"><button class="skip-btn ' + (skipped ? 'skipped' : '') + '" data-act="skip" data-id="' + a.id + '">' + (skipped ? '已跳过' : '跳过') + '</button>' +
          '<button class="switch ' + switchColor(a) + (a.enabled ? ' on' : '') + '" data-act="toggle" data-id="' + a.id + '" aria-label="开关"></button></div></div></div>';
        card.addEventListener('click', e => {
          if (e.target.closest('[data-act]')) return;
          openEditor(a);
        });
        box.appendChild(card);
      });
    });
  }
  function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  $('#alarm-groups').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const a = state.alarms.find(x => x.id === btn.dataset.id); if (!a) return;
    if (btn.dataset.act === 'toggle') { a.enabled = !a.enabled; toast(a.enabled ? '闹钟已开启' : '闹钟已关闭'); }
    if (btn.dataset.act === 'skip') {
      const next = nextOccurrence(a, new Date(), true); if (!next) return;
      a.skipped = a.skipped || [];
      const k = Cal.key(next);
      a.skipped = a.skipped.includes(k) ? a.skipped.filter(x => x !== k) : a.skipped.concat(k);
      toast(a.skipped.includes(k) ? '本次已跳过' : '已恢复本次提醒');
    }
    save(); renderHome();
  });
  $('#btn-search').onclick = () => { $('#search-bar').classList.toggle('hidden'); renderHome(); };
  $('#alarm-search').oninput = renderHome;
  $('#mute-chip').onclick = () => { state.muted = !state.muted; save(); renderHome(); toast(state.muted ? '已静音' : '声音已开启'); };
  $('#btn-export-ics').onclick = exportCalendar;

  /* ---------------- 日程 ---------------- */
  let selectedDate = new Date();
  function renderCalendar() {
    const y = selectedDate.getFullYear(), m = selectedDate.getMonth();
    $('#month-picker').innerHTML = (m + 1) + '月 <span class="caret">⌄</span><small>' + y + '</small>';
    const grid = $('#calendar-grid'); grid.innerHTML = '';
    Cal.buildMonth(y, m).forEach(cell => {
      if (!cell) { const e = document.createElement('div'); e.className = 'day-cell empty'; grid.appendChild(e); return; }
      const b = document.createElement('button');
      b.className = 'day-cell' + (cell.weekend ? ' weekend' : '') + (cell.holiday ? ' holiday' : '') + (Cal.key(cell.date) === Cal.key(selectedDate) ? ' selected' : '');
      b.innerHTML = '<span>' + cell.day + '</span><span class="lunar">' + escapeHtml(cell.holiday || cell.lunar) + '</span>';
      const mark = state.marks[cell.key];
      if (mark) b.innerHTML += '<span class="mark">' + (mark === '加班' ? '💼' : '🏖️') + '</span>';
      if (state.alarms.some(a => a.date === cell.key || a.startDate === cell.key)) b.innerHTML += '<span class="dot"></span>';
      b.onclick = () => { selectedDate = cell.date; renderCalendar(); };
      grid.appendChild(b);
    });
    const detail = $('#day-detail');
    const h = Cal.holiday(selectedDate), l = Cal.lunarFull(selectedDate);
    let html = '<h3>' + Cal.fullDate(selectedDate) + '</h3><h4>' + escapeHtml([h, l].filter(Boolean).join(' · ')) + '</h4>';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const matched = state.alarms.filter(a => {
      const n = nextOccurrence(a, today); return n && Cal.key(n) === Cal.key(selectedDate);
    });
    matched.forEach(a => {
      const t = timeOf(selectedDate, a.time);
      const cd = t > new Date() ? countdownText(t, new Date()) : '今天已响';
      html += '<div class="alarm-card"><div class="alarm-main"><div><div class="alarm-time">' + a.time + '</div>' +
        '<div class="alarm-note">' + escapeHtml(a.name || TYPES[a.type].label) + '</div></div>' +
        '<div class="alarm-right"><div class="countdown">' + cd + '</div>' +
        '<button class="skip-btn" data-cal-skip="' + a.id + '">跳过</button></div></div></div>';
    });
    if (!matched.length) html += '<p style="color:#9a9aa0">当天暂无闹钟</p>';
    detail.innerHTML = html;
  }
  $('#month-picker').onclick = () => {
    const now = new Date();
    const opts = ['上一年'].concat(Array.from({ length: 12 }, (_, i) => (i + 1) + '月')).concat(['下一年']);
    openSheet('选择月份', opts, v => {
      if (v === '上一年') selectedDate = new Date(selectedDate.getFullYear() - 1, selectedDate.getMonth(), 1);
      else if (v === '下一年') selectedDate = new Date(selectedDate.getFullYear() + 1, selectedDate.getMonth(), 1);
      else { const mm = parseInt(v) - 1; selectedDate = new Date(selectedDate.getFullYear(), mm, Math.min(selectedDate.getDate(), new Date(selectedDate.getFullYear(), mm + 1, 0).getDate())); }
      renderCalendar();
    }, (selectedDate.getMonth() + 1) + '月');
  };
  $('#btn-overtime').onclick = () => markDay('加班');
  $('#btn-vacation').onclick = () => markDay('休假');
  $('#btn-delete-day').onclick = () => markDay(null);
  function markDay(value) {
    const k = Cal.key(selectedDate);
    if (value) state.marks[k] = value; else delete state.marks[k];
    save(); renderCalendar(); toast(value ? Cal.shortDate(selectedDate) + ' 已标记' + value : '已清除标记');
  }
  $('#btn-cal-info').onclick = () => openSheet('标记说明', ['加班：当天闹钟照常响（橙色开关）', '休假：当天闹钟自动跳过', '删除：清除当天标记'], () => {});
  $('#day-detail').addEventListener('click', e => {
    const b = e.target.closest('[data-cal-skip]'); if (!b) return;
    const a = state.alarms.find(x => x.id === b.dataset.calSkip); if (!a) return;
    a.skipped = a.skipped || []; a.skipped.push(Cal.key(selectedDate)); save(); renderCalendar(); toast('当天已跳过');
  });

  /* ---------------- 添加 / 编辑闹钟 ---------------- */
  function newDraft() {
    const now = new Date();
    return { id: null, type: 'yearly', time: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
      date: Cal.key(now), startDate: '', name: '', note: '', ringtone: '经典铃声', early: '不提前', snooze: '不推迟',
      calendarMode: 'solar', lunarDate: '', repeat: '', openApp: '', enabled: true, skipped: [] };
  }
  function openEditor(alarm) {
    draft = alarm ? Object.assign(newDraft(), JSON.parse(JSON.stringify(alarm))) : newDraft();
    $('#add-title').textContent = alarm ? '编辑闹钟' : '添加闹钟';
    renderForm(); showPage('add'); buildWheel();
  }
  $('#add-back').onclick = () => showPage('home');
  $('#add-save').onclick = () => {
    readWheel();
    if (!draft.date) draft.date = Cal.key(new Date());
    if (draft.type === 'once') draft.startDate = draft.date;
    else if (draft.startDate && draft.startDate > draft.date) draft.startDate = draft.date;
    const idx = state.alarms.findIndex(a => a.id === draft.id);
    const alarm = Object.assign({}, draft, {
      id: idx >= 0 ? state.alarms[idx].id : uid(),
      createdAt: idx >= 0 ? state.alarms[idx].createdAt : Date.now(),
      skipped: draft.skipped || []
    });
    if (idx >= 0) state.alarms[idx] = alarm; else state.alarms.push(alarm);
    save(); askNotify();
    toast(idx >= 0 ? '已保存修改' : '闹钟已添加'); showPage('home');
  };
  function renderForm() {
    $('#val-type').innerHTML = TYPES[draft.type].label + ' <span class="chev">›</span>';
    $('#val-name').value = draft.name || '';
    $('#val-ringtone').innerHTML = draft.ringtone + ' <span class="chev">›</span>';
    $('#val-early').innerHTML = draft.early + ' <span class="chev">›</span>';
    $('#val-snooze').innerHTML = draft.snooze + ' <span class="chev">›</span>';
    $('#val-note').value = draft.note || '';
    $('#val-start').innerHTML = (draft.startDate || '请选择起始年份') + ' <span class="chev">›</span>';
    $('#val-openapp').value = draft.openApp || '';
    $('#val-repeat').value = draft.repeat || '';
    $$('#calendar-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === draft.calendarMode));
  }
  ['name', 'note', 'openapp', 'repeat'].forEach(f => {
    $('#val-' + f).addEventListener('input', e => {
      draft[{ name: 'name', note: 'note', openapp: 'openApp', repeat: 'repeat' }[f]] = e.target.value;
    });
  });
  $('#row-type').onclick = () => { if (!state.hideTypePicker) showPage('types'); else cycleType(); };
  $('#row-ringtone').onclick = () => openSheet('铃声 · 点 ▶ 试听', RINGTONES, v => {
    draft.ringtone = v; renderForm(); playRingtone(v);
  }, draft.ringtone, v => playRingtone(v));
  $('#row-early').onclick = () => openSheet('提前提醒', EARLY, v => { draft.early = v; renderForm(); }, draft.early);
  $('#row-snooze').onclick = () => openSheet('稍后提醒', SNOOZE, v => { draft.snooze = v; renderForm(); }, draft.snooze);
  $('#row-start').onclick = () => openSheet('起始年份', YEARS, v => {
    draft.startDate = v.startsWith('不限') ? '' : v + '-01-01'; renderForm();
  });
  $('#calendar-tabs').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const oldHour = Math.min(23, Math.round($('.wheel-col[data-col="hour"]').scrollTop / 44));
    const oldMin = Math.min(59, Math.round($('.wheel-col[data-col="minute"]').scrollTop / 44));
    draft.calendarMode = b.dataset.tab; renderForm(); buildWheel();
    $('.wheel-col[data-col="hour"]').scrollTop = oldHour * 44;
    $('.wheel-col[data-col="minute"]').scrollTop = oldMin * 44;
    toast(b.dataset.tab === 'lunar' ? '日期列已切换为农历，按农历月日响铃' : b.dataset.tab === 'flexible' ? '弹性模式：前后 15 分钟内随机响铃' : '日期列已切换为公历');
  };
  function cycleType() { const keys = Object.keys(TYPES); draft.type = keys[(keys.indexOf(draft.type) + 1) % keys.length]; renderForm(); }
  function renderTypes() {
    $('#dont-show').checked = !!state.hideTypePicker;
    const box = $('#type-list'); box.innerHTML = '';
    Object.keys(TYPES).forEach(k => {
      const b = document.createElement('button');
      b.className = 'type-card' + (draft.type === k ? ' selected' : '');
      b.innerHTML = '<span class="emoji">' + TYPES[k].emoji + '</span><span><strong>' + TYPES[k].label + '</strong><p>' + TYPES[k].desc + '</p></span>' + (draft.type === k ? '<span class="choose-tag">选择</span>' : '');
      b.onclick = () => {
        draft.type = k; state.hideTypePicker = $('#dont-show').checked; save(); renderForm(); showPage('add');
      };
      box.appendChild(b);
    });
  }
  $('#types-back').onclick = () => showPage('add');
  $('#dont-show').onchange = e => { state.hideTypePicker = e.target.checked; save(); };

  /* 时间滚轮 */
  let wheelDates = [];
  function updateWheelHint() {
    const idx = Math.max(0, Math.min(wheelDates.length - 1, Math.round($('.wheel-col[data-col="date"]').scrollTop / 44)));
    const d = wheelDates[idx]; if (!d) return;
    $('#wheel-hint').textContent = draft.calendarMode === 'lunar'
      ? '选中农历：' + Cal.lunarFull(d) + '（对应公历 ' + Cal.shortDate(d) + '）'
      : '选中公历：' + Cal.fullDate(d) + ' · 农历 ' + Cal.lunarFull(d);
  }
  $('.wheel-col[data-col="date"]').addEventListener('scroll', updateWheelHint);
  function buildWheel() {
    const base = new Date((draft.date || Cal.key(new Date())) + 'T00:00:00');
    wheelDates = Array.from({ length: 14 }, (_, i) => Cal.addDays(base, i));
    const dateCol = $('.wheel-col[data-col="date"]');
    const lunar = draft.calendarMode === 'lunar';
    dateCol.innerHTML = wheelDates.map((d, i) => {
      const prefix = i === 0 ? '今天' : i === 1 ? '明天' : Cal.weekdayCN(d);
      const label = lunar ? prefix + ' · ' + Cal.lunarFull(d) : i === 0 ? '今天' : i === 1 ? '明天' : Cal.shortDate(d) + ' ' + Cal.weekdayCN(d);
      return '<div class="wheel-item">' + label + '</div>';
    }).join('');
    $('.wheel-col[data-col="hour"]').innerHTML = Array.from({ length: 24 }, (_, i) => '<div class="wheel-item">' + String(i).padStart(2, '0') + '</div>').join('');
    $('.wheel-col[data-col="minute"]').innerHTML = Array.from({ length: 60 }, (_, i) => '<div class="wheel-item">' + String(i).padStart(2, '0') + '</div>').join('');
    const [h, m] = draft.time.split(':').map(Number);
    dateCol.scrollTop = 0;
    $('.wheel-col[data-col="hour"]').scrollTop = h * 44;
    $('.wheel-col[data-col="minute"]').scrollTop = m * 44;
    updateWheelHint();
  }
  function readWheel() {
    const idx = col => Math.max(0, Math.round($(col).scrollTop / 44));
    const d = wheelDates[Math.min(idx('.wheel-col[data-col="date"]'), wheelDates.length - 1)] || new Date();
    const h = Math.min(23, idx('.wheel-col[data-col="hour"]'));
    const m = Math.min(59, idx('.wheel-col[data-col="minute"]'));
    draft.date = Cal.key(d);
    if (draft.calendarMode === 'lunar') draft.lunarDate = Cal.lunarKey(d);
    else draft.lunarDate = '';
    draft.time = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  /* ---------------- 提醒 ---------------- */
  function renderReminders() {
    const box = $('#reminders-list'); box.innerHTML = '';
    const icons = { '报时': '⏰', '喝水吃药': '🥤' };
    Object.keys(state.reminders).forEach(name => {
      const card = document.createElement('div'); card.className = 'reminder-card';
      card.innerHTML = '<span class="emoji">' + (icons[name] || '🔔') + '</span><span class="label">' + escapeHtml(name) + '</span>' +
        '<button class="switch ' + (state.reminders[name] ? 'on' : '') + '" data-rem="' + escapeHtml(name) + '"></button>';
      card.querySelector('button').onclick = () => { state.reminders[name] = !state.reminders[name]; save(); renderReminders(); toast(name + (state.reminders[name] ? ' 已开启' : ' 已关闭')); };
      box.appendChild(card);
    });
    const tip = document.createElement('p'); tip.className = 'form-tip'; tip.textContent = '提示：提醒需要添加到桌面并保持应用在后台运行；iOS 16.4+ 支持桌面 Web App 通知。';
    box.appendChild(tip);
  }

  /* ---------------- 我的 ---------------- */
  $$('.profile-body [data-action]').forEach(b => b.onclick = () => profileAction(b.dataset.action));
  ['pro-badge', 'btn-pro', 'profile-settings', 'profile-share'].forEach(id => {
    $('#' + id).onclick = () => toast('这是开源体验版，登录与订阅功能预留');
  });
  function profileAction(a) {
    switch (a) {
      case 'help': openSheet('使用帮助', ['① 点底部 ＋ 添加闹钟，选择公历/农历/弹性', '② 闹钟类型可选普通、轮班、定时、周期、年度、月度', '③ 首页可跳过某次响铃；日程页可标记加班/休假', '④  my页「添加到桌面」可获得全屏体验'], () => {}); break;
      case 'feedback': toast('欢迎到 GitHub 仓库提交 Issue 反馈'); break;
      case 'install': showInstallGuide(); break;
      case 'export': exportCalendar(); break;
      case 'rate': toast('开源项目暂未上架 App Store'); break;
      case 'holidays': toast('已内置 2026 年节假日与美国感恩节/退伍军人节数据'); break;
      case 'ringtone': toast('铃声可在添加闹钟页自由选择'); break;
      case 'version': toast('闹钟 PWA v1.0.0（2026-11-26）'); break;
      case 'test': askNotify(true); playRingtone(draft.ringtone); vibrate(); toast('已试听当前铃声并测试振动'); break;
      case 'reset': openSheet('确认清空本机数据？', ['确认清空', '再想想'], v => {
        if (v === '确认清空') { localStorage.removeItem(KEY); location.reload(); }
      }); break;
    }
  }
  function showInstallGuide() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const opts = ios
      ? ['第1步：用 Safari 打开本页', '第2步：点底部分享按钮（方框+向上箭头）', '第3步：选择「添加到主屏幕」', '第4步：点右上角「添加」，回到桌面打开即可全屏']
      : ['第1步：用 Chrome / Edge 打开本页', '第2步：点右上角 ⋮ 菜单', '第3步：选择「添加到主屏幕」或「安装应用」', '第4步：确认后回到桌面打开即可全屏'];
    if (installEvent) opts.unshift('✨ 一键安装（推荐）');
    openSheet('添加到桌面', opts, v => {
      if (v.startsWith('✨') && installEvent) { installEvent.prompt(); installEvent = null; }
    });
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; });

  /* ---------------- 底部导航 ---------------- */
  $('#tabbar').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]'); if (!b) return;
    if (b.dataset.tab === 'add') openEditor(null); else showPage(b.dataset.tab);
  });

  /* ---------------- 通知 / 铃声 ---------------- */
  function askNotify(force) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default' && (force || state.alarms.length)) Notification.requestPermission();
  }
  function notify(title, body) {
    if (state.muted) return;
    if ('serviceWorker' in navigator && Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then(reg => reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'alarm-' + Date.now() })).catch(() => {});
    } else if (Notification.permission === 'granted') new Notification(title, { body });
  }
  let audioCtx = null;
  function audio() {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function note(ctx, at, dur, type, from, to, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, at);
    if (to && to !== from) o.frequency.exponentialRampToValueAtTime(to, at + dur);
    g.gain.setValueAtTime(.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + Math.min(.03, dur / 3));
    g.gain.exponentialRampToValueAtTime(.0001, at + dur);
    o.connect(g).connect(ctx.destination);
    o.start(at); o.stop(at + dur + .02);
  }
  /* 内置经典铃声：优先播放 WAV 文件；加载失败时用 Web Audio 合成兜底 */
  let ringAudio = null;
  function playRingtone(name) {
    if (!name || name === '无铃声') return;
    const file = RINGTONE_FILES[name] || RINGTONE_FILES['系统默认'];
    try {
      if (!ringAudio) ringAudio = new Audio();
      ringAudio.pause();
      ringAudio.src = file;
      ringAudio.currentTime = 0;
      ringAudio.volume = 1;
      ringAudio.onerror = () => synthFallback(name);
      ringAudio.play().catch(() => synthFallback(name));
    } catch (e) { synthFallback(name); }
  }
  function synthFallback(name) {
    try {
      const ctx = audio(), t = ctx.currentTime + .03;
      if (name === '雷达' || name === '雷达.m4r' || name === '鸟鸣') {
        [0, .42, .84].forEach(d => { note(ctx, t + d, .30, 'sine', 1500, 620, .28); note(ctx, t + d + .04, .24, 'triangle', 760, 420, .1); });
      } else if (name === '闹铃') {
        [0, .22, .44, .66].forEach((d, i) => note(ctx, t + d, .14, 'square', i % 2 ? 660 : 880, i % 2 ? 660 : 880, .16));
      } else {
        [880, 1100, 880].forEach((d, i) => note(ctx, t + i * .28, .24, 'sine', [880, 1100, 880][i], [880, 1320, 880][i], .26));
      }
    } catch (e) { /* 浏览器不支持音频时忽略 */ }
  }
  function beep(ringtone) {
    if (state.muted) return;
    playRingtone(ringtone || '系统默认');
  }
  function vibrate() { if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]); }
  function fireAlarm(a, next) {
    beep(a.ringtone); vibrate(); notify(a.name || TYPES[a.type].label, next.toTimeString().slice(0, 5) + ' 该起床啦！');
    toast('⏰ ' + (a.name || TYPES[a.type].label) + ' 时间到！', 6000);
    if (a.type === 'once') { a.enabled = false; save(); }
  }

  /* 每秒刷新倒计时，并触发到点的闹钟 */
  let lastClock = '';
  setInterval(() => {
    const now = new Date();
    const clock = now.toTimeString().slice(0, 8);
    if (clock !== lastClock) {
      lastClock = clock;
      const line = $('#today-line');
      if (line && $('#page-home').classList.contains('active')) line.textContent = Cal.shortDate(now) + ' ' + Cal.weekdayCN(now) + ' ' + clock;
    }
    state.alarms.forEach(a => {
      if (!a.enabled) return;
      const next = nextOccurrence(a, new Date(now.getTime() - 15000));
      if (!next) return;
      const diff = now - next;
      const fid = a.id + '|' + Cal.key(next) + '|' + a.time;
      if (diff >= 0 && diff < 30000 && (!a.lastFired || a.lastFired !== fid)) {
        a.lastFired = fid; save(); fireAlarm(a, next);
      }
    });
  }, 1000);

  /* Service Worker 注册 */
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

  showPage('home');
})();
