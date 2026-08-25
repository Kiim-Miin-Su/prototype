/* ══════════════════════════════════════════════════════════════════════════
   money.js — 금액 표기·입력 유틸 (SSOT)
   ──────────────────────────────────────────────────────────────────────────
   대표 지시 (2026-08-25):
     "모든 금액은 천 단위 ',' 자동 기입하여 입출력 할 수 있게 유틸 함수로써 재사용"

   이 파일이 프로젝트에서 **금액을 문자열로 만드는 유일한 곳**이다.
   화면 코드에 toLocaleString() 이나 replace(/\B(?=(\d{3})+(?!\d))/g, ',') 가
   직접 나오면 그것은 이 파일을 안 쓴 것이다. (ARCHITECTURE.md §7 금지 목록)

   층 구분 (ARCHITECTURE.md §3)
     · 포맷터  MONEY.format / won / signed / compact
     · 파서    MONEY.parse / digits
     · 마스크  MONEY.mask / bindInput      ← 입력 중 실시간 콤마
     · 비교    MONEY.diff                  ← 기대값 vs 실입력값
   ══════════════════════════════════════════════════════════════════════════ */

const MONEY = (() => {

  /* ── 파서 ────────────────────────────────────────────────────────────── */

  /** 문자열에서 숫자만 남긴다. 선행 '-' 하나만 부호로 인정. */
  function digits(v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    const neg = /^\s*-/.test(s);
    const d = s.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');
    return d === '' ? '' : (neg ? '-' : '') + d;
  }

  /** "₩45,000" → 45000 · "" → null. 실패해도 던지지 않는다. */
  function parse(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null;
    const d = digits(v);
    if (d === '' || d === '-') return null;
    const n = Number(d);
    return Number.isFinite(n) ? n : null;
  }

  /* ── 포맷터 ──────────────────────────────────────────────────────────── */

  /** 45000 → "45,000". 부호는 그대로 둔다. */
  function group(n) {
    const v = parse(n);
    if (v === null) return '';
    const neg = v < 0;
    const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + s;
  }

  /**
   * 45000 → "₩45,000"
   * @param {object} [o]
   * @param {boolean} [o.symbol=true]  ₩ 붙이기
   * @param {boolean} [o.signed=false] 양수에도 + 붙이기
   * @param {string}  [o.empty='—']    값이 없을 때
   * @param {string}  [o.unit]         "/시간" 같은 꼬리
   */
  function format(n, o = {}) {
    const { symbol = true, signed = false, empty = '—', unit = '' } = o;
    const v = parse(n);
    if (v === null) return empty;
    const body = (symbol ? '₩' : '') + group(Math.abs(v));
    const sign = v < 0 ? '− ' : (signed && v > 0 ? '+ ' : '');
    return sign + body + unit;
  }

  /** 자주 쓰는 두 벌 — 화면에서 옵션 객체를 반복해 적지 않도록 */
  const won    = n => format(n);                                   // "₩45,000"
  const plain  = n => format(n, { symbol: false });                // "45,000"
  const signedWon = n => format(n, { signed: true });              // "+ ₩5,000" / "− ₩25,000"
  const rate   = n => format(n, { unit: '/시간' });                 // "₩45,000/시간"

  /** 큰 금액 요약 — 795358 → "약 79.5만" (대시보드 칩용) */
  function compact(n) {
    const v = parse(n);
    if (v === null) return '—';
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 100000000) return `${s}약 ${(a / 100000000).toFixed(1)}억`;
    if (a >= 10000)     return `${s}약 ${(a / 10000).toFixed(1)}만`;
    return format(v);
  }

  /* ── 입력 마스크 ─────────────────────────────────────────────────────── */

  /**
   * 입력 중 실시간 콤마. 커서 위치를 **자릿수 기준**으로 복원한다.
   * (문자 인덱스로 복원하면 콤마가 끼는 순간 커서가 한 칸씩 밀린다.)
   */
  function mask(el) {
    const raw = el.value;
    const caret = el.selectionStart ?? raw.length;
    const digitsBefore = raw.slice(0, caret).replace(/[^\d]/g, '').length;

    const next = group(digits(raw));
    if (next === raw) return parse(next);
    el.value = next;

    let seen = 0, pos = next.length;
    for (let i = 0; i < next.length; i++) {
      if (/\d/.test(next[i])) seen++;
      if (seen === digitsBefore) { pos = i + 1; break; }
      if (digitsBefore === 0) { pos = 0; break; }
    }
    el.setSelectionRange(pos, pos);
    return parse(next);
  }

  /**
   * <input> 하나를 금액 입력으로 만든다. 모든 금액 입력은 이 함수를 통과한다.
   * @param {HTMLInputElement} el
   * @param {object} o
   * @param {number} [o.expected]  기대값 — placeholder 로 들어간다
   * @param {(n:number|null)=>void} [o.onValue]
   * @param {boolean} [o.readonly]
   * @returns {{ get:()=>number|null, set:(n)=>void, destroy:()=>void }}
   */
  function bindInput(el, o = {}) {
    const { expected = null, onValue, readonly = false } = o;

    el.setAttribute('inputmode', 'numeric');
    el.setAttribute('autocomplete', 'off');
    el.classList.add('money-input');
    if (expected !== null) el.placeholder = plain(expected);
    if (readonly) { el.readOnly = true; el.classList.add('is-readonly'); }

    const onInput = () => { const n = mask(el); onValue && onValue(n); };
    const onBlur  = () => { const n = parse(el.value); el.value = n === null ? '' : group(n); };
    const onKey = e => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const step = e.shiftKey ? 10000 : 1000;
      const n = (parse(el.value) ?? expected ?? 0) + (e.key === 'ArrowUp' ? step : -step);
      el.value = group(Math.max(0, n));
      onValue && onValue(parse(el.value));
    };

    el.addEventListener('input', onInput);
    el.addEventListener('blur', onBlur);
    el.addEventListener('keydown', onKey);

    return {
      get: () => parse(el.value),
      set: n => { el.value = n === null || n === undefined ? '' : group(n); },
      destroy: () => {
        el.removeEventListener('input', onInput);
        el.removeEventListener('blur', onBlur);
        el.removeEventListener('keydown', onKey);
      },
    };
  }

  /* ── 비교 ────────────────────────────────────────────────────────────── */

  /**
   * 기대값과 실입력값의 관계. 회계 화면 두 곳이 같은 판정을 쓴다.
   *   · 입금 내역   — 들어와야 할 금액(expected) vs 실제 입금액(actual)
   *   · 법인카드 승인 — 직원 신청액(expected) vs 승인액(actual)
   * @returns {{state:'empty'|'match'|'over'|'short', delta:number, label:string, tone:string}}
   */
  function diff(expected, actual) {
    const e = parse(expected), a = parse(actual);
    if (a === null) return { state: 'empty', delta: 0, label: '미입력', tone: 'neutral' };
    if (e === null) return { state: 'match', delta: 0, label: '',      tone: 'neutral' };
    const delta = a - e;
    if (delta === 0) return { state: 'match', delta: 0, label: '일치', tone: 'green' };
    return delta > 0
      ? { state: 'over',  delta, label: `초과 ${format(delta, { signed: true })}`, tone: 'blue' }
      : { state: 'short', delta, label: `부족 ${format(delta)}`,                   tone: 'red' };
  }

  /** 합계 — null 은 0 으로 세지 않고 건너뛴다 (미입력과 0원을 구분) */
  function sum(list, pick = x => x) {
    return list.reduce((acc, x) => { const n = parse(pick(x)); return n === null ? acc : acc + n; }, 0);
  }

  return { digits, parse, group, format, won, plain, signedWon, rate, compact,
           mask, bindInput, diff, sum };
})();

if (typeof module !== 'undefined') module.exports = MONEY;
