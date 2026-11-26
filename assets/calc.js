/* 스틱맨 계산기 — 계산 엔진
 * eval 없이 문자열 상태 머신으로 연산한다.
 * - 연속 연산(2 + 3 × 4 → 20), 소수점 오차 보정(0.1 + 0.2 → 0.3)
 * - % 처리, 백스페이스, 0으로 나누기 방어
 */

export const MAX_DIGITS = 15;

/* 부동소수점 찌꺼기를 지운다.
 * 1) 정수에 사실상 붙어 있으면 정수로 (4.35 × 100 = 435)
 * 2) 아니면 12자리 유효숫자로 반올림 (0.1 + 0.2 = 0.3)
 */
export function normalize(n) {
  if (!Number.isFinite(n)) return n;
  if (n === 0) return 0;
  const abs = Math.abs(n);
  const nearest = Math.round(n);
  if (Math.abs(n - nearest) <= Math.max(abs * 1e-12, 1e-12)) {
    return nearest === 0 ? 0 : nearest;
  }
  const r = Number(n.toPrecision(12));
  return Object.is(r, -0) ? 0 : r;
}

/* 화면 표시용 숫자 문자열: 천 단위 콤마. */
export function formatNumber(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '오류';
  if (!Number.isFinite(n)) return '∞';
  if (Object.is(n, -0)) n = 0;
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) {
    return n.toExponential(6).replace(/\.?0+e/, 'e');
  }
  const sign = n < 0 ? '-' : '';
  let s = String(Math.abs(n));
  if (s.includes('e')) {
    s = Math.abs(n).toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
  }
  const [int, frac] = s.split('.');
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + intFmt + (frac !== undefined ? '.' + frac : '');
}

/* 입력 중인 문자열을 콤마 포맷 (끝의 소수점/0 유지) */
export function formatEntry(raw) {
  if (raw === undefined || raw === null || raw === '') return '0';
  let body = String(raw);
  const neg = body.startsWith('-');
  if (neg) body = body.slice(1);
  if (body.includes('e') || body.includes('E')) {
    return (neg ? '-' : '') + formatNumber(Math.abs(Number(raw)));
  }
  if (body === '') body = '0';
  const [int, frac] = body.split('.');
  const intFmt = (int || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + intFmt + (body.includes('.') ? '.' + (frac ?? '') : '');
}

/* 숫자의 크기로 캐릭터 표정을 정한다.
 * normal  : 평소
 * heavy   : 1,000,000 이상(7자리) — 낑낑
 * crushed : 1억 이상 또는 10자리, -100,000 이하, 오류 — 깔려서 엉엉
 */
export function moodFor(value, isError = false) {
  if (isError || typeof value !== 'number' || Number.isNaN(value)) return 'crushed';
  const abs = Math.abs(value);
  if (abs === 0) return 'normal';
  const digits = Math.floor(Math.log10(abs)) + 1;
  if (abs >= 1e8 || digits >= 10 || value <= -100000) return 'crushed';
  if (abs >= 1e6 || digits >= 7) return 'heavy';
  return 'normal';
}

const OPS = ['+', '-', '×', '÷'];

export class Calculator {
  constructor() {
    this.reset();
  }

  reset() {
    this.current = '0'; // 입력 중이거나 결과인 숫자 문자열
    this.stored = null; // 왼쪽 피연산자
    this.op = null; // 대기 중인 연산자
    this.overwrite = true; // 다음 숫자 입력이 현재 값을 대체
    this.error = null; // 'div0' | 'overflow'
    this.expression = '';
    this.lastKey = null;
    return this.snapshot();
  }

  currentValue() {
    const n = Number(this.current);
    return Number.isNaN(n) ? 0 : n;
  }

  displayText() {
    if (this.error) return '오류';
    return formatEntry(this.current);
  }

  snapshot() {
    const value = this.error ? NaN : this.currentValue();
    return {
      display: this.displayText(),
      raw: this.current,
      expression: this.expression,
      value,
      isError: Boolean(this.error),
      error: this.error,
      pendingOp: this.op,
      mood: moodFor(value, Boolean(this.error)),
      length: this.displayText().length,
    };
  }

  press(key) {
    const k = String(key);
    if (k === 'AC') {
      this.reset();
      return this.snapshot();
    }
    if (this.error) {
      if (/^[0-9.]$/.test(k)) this.reset();
      else return this.snapshot();
    }
    switch (k) {
      case '⌫':
        this.backspace();
        break;
      case '.':
        this.dot();
        break;
      case '%':
        this.percent();
        break;
      case '+':
      case '-':
      case '×':
      case '÷':
        this.setOperator(k);
        break;
      case '=':
        this.equals();
        break;
      default:
        if (/^[0-9]$/.test(k)) this.digit(k);
        break;
    }
    this.lastKey = k;
    return this.snapshot();
  }

  digit(d) {
    if (this.overwrite) {
      this.current = d;
      this.overwrite = false;
      if (this.op === null) this.expression = '';
      return;
    }
    if (this.current === '0') {
      this.current = d;
      return;
    }
    if (this.current === '-0') {
      this.current = '-' + d;
      return;
    }
    const digitCount = this.current.replace(/[-.]/g, '').length;
    if (digitCount >= MAX_DIGITS) return;
    this.current += d;
  }

  dot() {
    if (this.overwrite) {
      this.current = '0.';
      this.overwrite = false;
      if (this.op === null) this.expression = '';
      return;
    }
    if (!this.current.includes('.')) this.current += '.';
  }

  backspace() {
    if (this.overwrite) {
      this.current = '0';
      this.expression = this.op ? `${formatNumber(this.stored)} ${this.op}` : '';
      return;
    }
    let s = this.current.slice(0, -1);
    if (s === '' || s === '-') {
      s = '0';
      this.overwrite = true;
    }
    this.current = s;
  }

  setOperator(op) {
    if (!OPS.includes(op)) return;
    // 연산자만 바꿔 누른 경우
    if (this.op !== null && this.overwrite) {
      this.op = op;
      this.expression = `${formatNumber(this.stored)} ${op}`;
      return;
    }
    const right = this.currentValue();
    if (this.op !== null && this.stored !== null) {
      const a = this.stored;
      const prevOp = this.op;
      const r = this.apply(a, prevOp, right);
      if (this.error) return;
      this.stored = r;
      this.current = this.rawFromNumber(r);
    } else {
      this.stored = right;
    }
    this.op = op;
    this.overwrite = true;
    this.expression = `${formatNumber(this.stored)} ${op}`;
  }

  apply(a, op, b) {
    switch (op) {
      case '+':
        return normalize(a + b);
      case '-':
        return normalize(a - b);
      case '×':
        return normalize(a * b);
      case '÷':
        if (b === 0) {
          this.error = 'div0';
          return NaN;
        }
        return normalize(a / b);
      default:
        return normalize(b);
    }
  }

  setError(kind) {
    this.error = kind;
    this.stored = null;
    this.op = null;
    this.overwrite = true;
  }

  rawFromNumber(n) {
    if (!Number.isFinite(n)) return '0';
    if (Object.is(n, -0)) return '0';
    return String(n);
  }

  percent() {
    const cur = this.currentValue();
    const base = this.stored !== null ? this.stored : null;
    let v;
    if (this.op !== null && base !== null) {
      v = this.op === '+' || this.op === '-' ? (base * cur) / 100 : cur / 100;
    } else {
      v = cur / 100;
    }
    v = normalize(v);
    this.current = this.rawFromNumber(v);
    this.overwrite = false;
    if (this.op !== null && base !== null) {
      this.expression = `${formatNumber(base)} ${this.op} ${formatNumber(v)}`;
    } else {
      this.expression = `${formatNumber(cur)}%`;
    }
  }

  equals() {
    const right = this.currentValue();
    if (this.op !== null && this.stored !== null) {
      const a = this.stored;
      const op = this.op;
      const expr = `${formatNumber(a)} ${op} ${formatNumber(right)} =`;
      const r = this.apply(a, op, right);
      this.expression = expr;
      if (this.error) return;
      if (!Number.isFinite(r)) {
        this.expression = `${formatNumber(a)} ${op} ${formatNumber(right)} =`;
        this.setError('overflow');
        return;
      }
      this.current = this.rawFromNumber(r);
      this.stored = null;
      this.op = null;
      this.overwrite = true;
    } else {
      this.expression = `${formatNumber(right)} =`;
      this.overwrite = true;
    }
  }
}
