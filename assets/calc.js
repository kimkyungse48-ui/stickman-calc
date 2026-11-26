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

/* ── 한국어 수 읽기 (음성 읽기용) ──────────────────────
 * 0 → 영, 5,721 → 오천칠백이십일, 10,000 → 만,
 * 123,456 → 십이만 삼천사백오십육, 1억 → 일억
 * 소수는 한 자리씩(3.14 → 삼점일사), 음수는 앞에 '마이너스 '.
 */
const DIGIT_WORD = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const PLACE_WORD = ['', '십', '백', '천'];
const BIG_UNIT = ['', '만', '억', '조', '경', '해', '자', '양', '구', '간', '정', '재', '극'];

/* 네 자리 묶음 하나를 읽는다. 맨 앞의 '일'은 십·백·천 앞에서 생략한다(일천 → 천). */
function readGroup(digits) {
  const padded = String(digits).padStart(4, '0');
  let out = '';
  for (let i = 0; i < 4; i += 1) {
    const d = Number(padded[i]);
    if (d === 0) continue;
    const place = PLACE_WORD[3 - i];
    if (!(d === 1 && place && out === '')) out += DIGIT_WORD[d];
    out += place;
  }
  return out;
}

/* 정수부 문자열을 네 자리씩 끊어 읽는다. 단위 사이는 띄어 쓴다. */
function readInteger(digits) {
  let s = String(digits).replace(/^0+/, '');
  if (s === '') return '영';
  const groups = [];
  while (s.length > 0) {
    groups.push(s.slice(-4));
    s = s.slice(0, -4);
  }
  groups.reverse();
  if (groups.length > BIG_UNIT.length) return null; // 단위를 넘는 아주 큰 수
  const n = groups.length;
  const parts = [];
  for (let i = 0; i < n; i += 1) {
    const value = Number(groups[i]);
    if (value === 0) continue;
    const unitIndex = n - 1 - i;
    let text = readGroup(groups[i]);
    // 10,000 은 '일만'이 아니라 '만' — 만 단위가 맨 앞일 때만 '일'을 뺀다.
    if (value === 1 && unitIndex === 1 && i === 0) text = '';
    parts.push(text + BIG_UNIT[unitIndex]);
  }
  return parts.length ? parts.join(' ') : '영';
}

/* 1e+21 같은 지수 표기를 보통 소수 문자열로 펼친다. */
function expandExponential(s) {
  const m = /^(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(s);
  if (!m) return s;
  const intPart = m[1];
  const fracPart = m[2] || '';
  const exp = Number(m[3]);
  const digits = intPart + fracPart;
  const point = intPart.length + exp;
  if (point <= 0) return '0.' + '0'.repeat(-point) + digits;
  if (point >= digits.length) return digits + '0'.repeat(point - digits.length);
  return digits.slice(0, point) + '.' + digits.slice(point);
}

/* 값(숫자 또는 표시 문자열)을 한국어 읽기 문자열로 바꾼다. */
export function numberToKorean(value) {
  if (value === null || value === undefined || value === '') return '영';
  if (typeof value === 'string') {
    const t = value.replace(/[,\s]/g, '');
    if (t === '오류') return '오류';
    if (t === '∞' || t === '무한대') return '무한대';
    value = t;
  }
  const num = Number(value);
  if (Number.isNaN(num)) return '오류';
  if (!Number.isFinite(num)) return '무한대';
  if (num === 0) return '영';

  const sign = num < 0 ? '마이너스 ' : '';
  const abs = Math.abs(num);
  if (abs < 1e-12) return sign + '아주 작은 수';

  const [intDigits, fracDigits] = expandExponential(String(abs)).split('.');
  const intText = readInteger(intDigits);
  if (intText === null) return sign + '아주 큰 수';
  if (!fracDigits) return sign + intText;
  const fracText = [...fracDigits].map((d) => DIGIT_WORD[Number(d)]).join('');
  return sign + intText + '점' + fracText;
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
