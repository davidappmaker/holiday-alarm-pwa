/* 日历工具：使用浏览器内置的中文农历格式化能力，零依赖 */
window.Cal = (function () {
  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function parts(date) {
    try {
      const f = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { dateStyle: 'full' });
      const out = {};
      f.formatToParts(date).forEach(p => { out[p.type] = p.value; });
      return out;
    } catch (e) { return {}; }
  }
  function lunarDay(date) { return parts(date).day || ''; }
  function lunarFull(date) { const p = parts(date); return (p.month || '') + (p.day || ''); }

  function nthWeekday(year, month, weekday, nth) {
    const d = new Date(year, month, 1);
    const offset = (weekday - d.getDay() + 7) % 7;
    return new Date(year, month, 1 + offset + (nth - 1) * 7);
  }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function key(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
  function holiday(date) {
    const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
    const fixed = {
      '01-01': '元旦', '02-17': '春节', '04-05': '清明节', '05-01': '劳动节',
      '06-19': '端午节', '09-25': '中秋节', '10-01': '国庆节',
      '11-11': 'Veterans Day', '12-25': 'Christmas Day'
    };
    const md = String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    if (fixed[md]) return fixed[md];
    if (m === 11 && sameDay(date, nthWeekday(y, 10, 4, 4))) return 'Thanksgiving Day';
    return '';
  }
  function buildMonth(year, month /* 0-based */) {
    const first = new Date(year, month, 1);
    const cells = [];
    for (let i = 0; i < first.getDay(); i++) cells.push(null);
    const last = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const date = new Date(year, month, d);
      cells.push({ date, day: d, lunar: lunarDay(date), holiday: holiday(date),
        weekend: date.getDay() === 0 || date.getDay() === 6, key: key(date) });
    }
    return cells;
  }
  function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
  function weekdayCN(date) { return WEEK[date.getDay()]; }
  function shortDate(date) { return (date.getMonth() + 1) + '-' + String(date.getDate()).padStart(2, '0'); }
  function fullDate(date) { return key(date) + ' ' + weekdayCN(date); }
  return { lunarDay, lunarFull, holiday, buildMonth, addDays, weekdayCN, shortDate, fullDate, key, sameDay };
})();
