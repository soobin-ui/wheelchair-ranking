// 휠체어 레이싱 랭킹 — 입력 화면(admin.html)과 보드(board.html)가 함께 쓰는 데이터·순위 계산
// 저장: 노트북 브라우저 localStorage (인터넷·서버 없음). 두 창 사이 실시간 전달은 storage 이벤트 + BroadcastChannel + postMessage.
const WR = (() => {
  const KEY = 'wr_records_v1', SKEY = 'wr_settings_v1';
  const pad = n => String(n).padStart(2, '0');
  // 기록 표시 자리수: 지금까지 입력된 기록 중 소수점이 가장 긴 자리수(0~3)에 맞춰 모두 같은 모양으로
  let DP = 0;
  const fmt = (sec, d = DP) => {
    const ms = Math.round(sec * 1000), m = Math.floor(ms / 60000), rest = ms - m * 60000;
    return pad(m) + ':' + pad(Math.floor(rest / 1000)) + (d > 0 ? '.' + String(rest % 1000).padStart(3, '0').slice(0, d) : '');
  };
  // 1위와 차이: +0:02.15
  const gap = (sec, d = DP) => { const t = fmt(sec, d); return '+' + (t[0] === '0' ? t.slice(1) : t); };
  // 초 단위 차이: 2.15초
  const secs = (sec, d = DP) => (Math.round(sec * 1000) / 1000).toFixed(d) + '초';
  // 입력값 읽기: 1:32.45 / 01:32.45 / 1분32.45초 / 92.45(초) 모두 허용
  function parseTime(str) {
    let t = String(str || '').trim().replace(/\s+/g, '').replace(/[，,]/g, '.').replace(/[：;]/g, ':').replace(/분/g, ':').replace(/초$/, '');
    if (!t) return { err: '기록을 넣어주세요' };
    if (/^\d{1,2}\.\d{1,2}\.\d{1,3}$/.test(t)) t = t.replace('.', ':');   // 1.32.45 → 1:32.45
    let m = t.match(/^(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/), sec, dec;
    if (m) {
      if (+m[2] > 59) return { err: '초는 59까지예요. 예) 1:32.45' };
      sec = +m[1] * 60 + +m[2]; dec = m[3] || '';
    } else if ((m = t.match(/^(\d{1,4})(?:\.(\d{1,3}))?$/))) {
      sec = +m[1]; dec = m[2] || '';
    } else return { err: '기록 모양을 확인해주세요. 예) 1:32.45' };
    sec = Math.round((sec + (dec ? +('0.' + dec) : 0)) * 1000) / 1000;
    if (sec <= 0) return { err: '기록이 0이에요. 다시 확인해주세요' };
    return { sec, dp: dec.length };
  }
  const dayKey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const norm = s => (s || '').replace(/\s+/g, '').toLowerCase();
  const personKey = r => norm(r.nick) + '|' + norm(r.org);
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const dayLabel = ts => { const d = new Date(ts); return pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' ' + WD[d.getDay()]; };

  function load() {
    let rs = []; try { rs = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) {}
    DP = rs.reduce((d, r) => Math.max(d, r.dp || 0), 0);
    return rs;
  }
  const dp = () => DP;
  function settings() {
    let s = {}; try { s = JSON.parse(localStorage.getItem(SKEY)) || {}; } catch (e) {}
    return Object.assign({ rotate: 15, page: 'auto' }, s);
  }

  let bc = null; try { bc = new BroadcastChannel('wr'); } catch (e) {}
  const listeners = [];
  function emit(msg) {
    if (bc) try { bc.postMessage(msg); } catch (e) {}
    if (window.__boardWin && !window.__boardWin.closed) try { window.__boardWin.postMessage(msg, '*'); } catch (e) {}
  }
  function on(fn) { listeners.push(fn); }
  const fire = m => listeners.forEach(f => f(m));
  if (bc) bc.onmessage = e => fire(e.data);
  window.addEventListener('message', e => { if (e.data && e.data.__wr) fire(e.data); });
  window.addEventListener('storage', e => { if (e.key === KEY) fire({ __wr: 1, type: 'records' }); if (e.key === SKEY) fire({ __wr: 1, type: 'settings' }); });

  function save(rs, extra) { localStorage.setItem(KEY, JSON.stringify(rs)); emit(Object.assign({ __wr: 1, type: 'records' }, extra || {})); }
  function saveSettings(s) { localStorage.setItem(SKEY, JSON.stringify(s)); emit({ __wr: 1, type: 'settings' }); }

  // 한 사람(닉네임+소속)은 가장 빠른 기록 1개만. 같은 기록이면 먼저 세운 사람이 위.
  function rank(rs) {
    const best = new Map();
    for (const r of [...rs].sort((a, b) => a.ts - b.ts)) {
      const k = personKey(r), b = best.get(k);
      if (!b) best.set(k, Object.assign({}, r, { tries: 1 }));
      else { b.tries++; if (r.sec < b.sec) Object.assign(b, r, { tries: b.tries }); }
    }
    return [...best.values()].sort((a, b) => a.sec - b.sec || a.ts - b.ts);
  }
  const today = () => dayKey(Date.now());
  const todayRecs = rs => rs.filter(r => dayKey(r.ts) === today());
  function placeOf(list, rec) { const i = list.findIndex(x => personKey(x) === personKey(rec)); return i < 0 ? null : i + 1; }

  const BAD = ['시발', '씨발', 'ㅅㅂ', '병신', 'ㅂㅅ', '개새', '좆', '존나', 'ㅈㄴ', 'fuck', 'shit', '애미', '느금', '섹스', 'sex'];
  const isBad = s => BAD.some(w => norm(s).includes(w));

  return { KEY, pad, fmt, gap, secs, parseTime, dp, dayKey, dayLabel, load, save, settings, saveSettings, rank, today, todayRecs, placeOf, personKey, on, emit, isBad };
})();
