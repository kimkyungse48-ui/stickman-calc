/* 스틱맨 계산기 계산 엔진 테스트 케이스 (브라우저·Node 공용) */
import { Calculator, formatNumber, formatEntry, moodFor, numberToKorean } from '../assets/calc.js';

function run(keys) {
  const c = new Calculator();
  let snap = c.snapshot();
  for (const key of keys) snap = c.press(key);
  return { calc: c, snap };
}

export function cases() {
  const t = (name, fn) => ({ name, fn });
  return [
    t('처음엔 0', () => {
      const { snap } = run([]);
      return snap.display === '0' && snap.value === 0;
    }),
    t('0.1 + 0.2 = 0.3 (부동소수점 보정)', () => {
      const { snap } = run(['0', '.', '1', '+', '0', '.', '2', '=']);
      return snap.display === '0.3' && snap.value === 0.3;
    }),
    t('1.1 × 1.1 = 1.21', () => {
      const { snap } = run(['1', '.', '1', '×', '1', '.', '1', '=']);
      return snap.display === '1.21';
    }),
    t('0.1 × 3 = 0.3', () => {
      const { snap } = run(['0', '.', '1', '×', '3', '=']);
      return snap.display === '0.3';
    }),
    t('4.35 × 100 = 435', () => {
      const { snap } = run(['4', '.', '3', '5', '×', '1', '0', '0', '=']);
      return snap.display === '435';
    }),
    t('9 - 9 = 0 (음수 0 아님)', () => {
      const { snap } = run(['9', '-', '9', '=']);
      return snap.display === '0' && Object.is(snap.value, 0);
    }),
    t('5,623 + 98 = 5,721 (천 단위 콤마)', () => {
      const { snap } = run(['5', '6', '2', '3', '+', '9', '8', '=']);
      return snap.display === '5,721' && snap.expression === '5,623 + 98 =';
    }),
    t('입력 중 콤마 표시', () => {
      const { snap } = run(['1', '2', '3', '4', '5', '6', '7']);
      return snap.display === '1,234,567';
    }),
    t('연속 연산은 즉시 계산 (2 + 3 × 4 = 20)', () => {
      const { snap } = run(['2', '+', '3', '×', '4', '=']);
      return snap.display === '20';
    }),
    t('연산자만 바꿔도 값 유지 (5 + × 2 = 10)', () => {
      const { snap } = run(['5', '+', '×', '2', '=']);
      return snap.display === '10';
    }),
    t('계산 후 이어서 계산 (2+3= 뒤 +1)', () => {
      const { calc, snap } = run(['2', '+', '3', '=']);
      calc.press('+');
      calc.press('1');
      const after = calc.press('=');
      return snap.display === '5' && after.display === '6';
    }),
    t('10 ÷ 3 은 12자리로 다듬기', () => {
      const { snap } = run(['1', '0', '÷', '3', '=']);
      return snap.display === '3.33333333333';
    }),
    t('0으로 나누면 오류', () => {
      const { snap } = run(['1', '2', '÷', '0', '=']);
      return snap.isError && snap.error === 'div0' && snap.display === '오류' && snap.mood === 'crushed';
    }),
    t('오류 뒤 AC로 초기화', () => {
      const { calc, snap } = run(['1', '2', '÷', '0', '=']);
      const after = calc.press('AC');
      return snap.isError && after.display === '0' && !after.isError;
    }),
    t('오류 뒤 숫자를 누르면 새로 시작', () => {
      const { calc } = run(['1', '2', '÷', '0', '=']);
      return calc.press('7').display === '7';
    }),
    t('200 + 10% = 220', () => {
      const { calc, snap } = run(['2', '0', '0', '+', '1', '0', '%']);
      const after = calc.press('=');
      return snap.display === '20' && after.display === '220';
    }),
    t('200 × 10% = 20', () => {
      const { snap } = run(['2', '0', '0', '×', '1', '0', '%', '=']);
      return snap.display === '20';
    }),
    t('50 % = 0.5', () => {
      const { snap } = run(['5', '0', '%']);
      return snap.display === '0.5';
    }),
    t('백스페이스', () => {
      const { snap } = run(['1', '2', '3', '4', '⌫']);
      return snap.display === '123';
    }),
    t('소수점 두 번은 한 번만', () => {
      const { snap } = run(['1', '.', '.', '5']);
      return snap.raw === '1.5';
    }),
    t('소수점 뒤 0 유지 (7.50)', () => {
      const { snap } = run(['7', '.', '5', '0']);
      return snap.display === '7.50';
    }),
    t('큰 정수도 정확히 (9,999,999 × 9,999,999)', () => {
      const { snap } = run(['9', '9', '9', '9', '9', '9', '9', '×', '9', '9', '9', '9', '9', '9', '9', '=']);
      return snap.display === '99,999,980,000,001';
    }),
    t('음수 결과', () => {
      const { snap } = run(['5', '-', '1', '0', '=']);
      return snap.display === '-5';
    }),
    t('숫자 15자리까지만 입력', () => {
      const { snap } = run(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '1', '2', '3', '4', '5', '6', '7', '8']);
      return snap.raw.length === 15;
    }),
    t('표정 임계값 (moodFor)', () => {
      return (
        moodFor(999999) === 'normal' &&
        moodFor(1000000) === 'heavy' &&
        moodFor(99999999) === 'heavy' &&
        moodFor(100000000) === 'crushed' &&
        moodFor(-99999) === 'normal' &&
        moodFor(-100000) === 'crushed' &&
        moodFor(NaN, true) === 'crushed'
      );
    }),
    t('formatNumber 천 단위/소수', () => {
      return (
        formatNumber(1234567.891) === '1,234,567.891' &&
        formatNumber(-1234.5) === '-1,234.5' &&
        formatNumber(0) === '0' &&
        formatNumber(1e-8) === '0.00000001'
      );
    }),
    t('formatEntry 끝 소수점 유지', () => {
      return formatEntry('1234.') === '1,234.' && formatEntry('') === '0' && formatEntry('-45') === '-45';
    }),
    t('expression 줄 표시', () => {
      const { calc, snap } = run(['7', '×', '8']);
      return snap.expression === '7 ×' && calc.press('=').expression === '7 × 8 =';
    }),
    t('한국어 읽기: 0과 한 자리', () => {
      return numberToKorean(0) === '영' && numberToKorean(7) === '칠' && numberToKorean(9) === '구';
    }),
    t('한국어 읽기: 십·백·천은 일을 뺀다', () => {
      return numberToKorean(10) === '십' && numberToKorean(100) === '백' && numberToKorean(1000) === '천';
    }),
    t('한국어 읽기: 5,721', () => {
      return numberToKorean(5721) === '오천칠백이십일';
    }),
    t('한국어 읽기: 10,000은 만', () => {
      return numberToKorean(10000) === '만' && numberToKorean(20000) === '이만' && numberToKorean(1000000) === '백만';
    }),
    t('한국어 읽기: 123,456', () => {
      return numberToKorean(123456) === '십이만 삼천사백오십육';
    }),
    t('한국어 읽기: 1억과 억 단위', () => {
      return (
        numberToKorean(100000000) === '일억' &&
        numberToKorean(123456789) === '일억 이천삼백사십오만 육천칠백팔십구' &&
        numberToKorean(1000000000000) === '일조'
      );
    }),
    t('한국어 읽기: 소수는 한 자리씩', () => {
      return numberToKorean(3.14) === '삼점일사' && numberToKorean(0.5) === '영점오' && numberToKorean(10 / 4) === '이점오';
    }),
    t('한국어 읽기: 음수는 마이너스', () => {
      return (
        numberToKorean(-120) === '마이너스 백이십' &&
        numberToKorean(-50) === '마이너스 오십' &&
        numberToKorean(-0.5) === '마이너스 영점오'
      );
    }),
    t('한국어 읽기: 오류·무한대', () => {
      return (
        numberToKorean(NaN) === '오류' &&
        numberToKorean('오류') === '오류' &&
        numberToKorean(Infinity) === '무한대' &&
        numberToKorean('5,721') === '오천칠백이십일'
      );
    }),
    t('한국어 읽기: 계산 결과를 읽기', () => {
      const { snap } = run(['5', '6', '2', '3', '+', '9', '8', '=']);
      const minus = run(['5', '0', '-', '1', '0', '0', '=']).snap;
      const dec = run(['3', '.', '1', '4', '=']).snap;
      return (
        numberToKorean(snap.value) === '오천칠백이십일' &&
        numberToKorean(minus.value) === '마이너스 오십' &&
        numberToKorean(dec.value) === '삼점일사'
      );
    }),
  ];
}

export function runCases() {
  const results = [];
  for (const item of cases()) {
    let ok = false;
    let error = null;
    try {
      ok = Boolean(item.fn());
    } catch (err) {
      error = err && err.message ? err.message : String(err);
    }
    results.push({ name: item.name, ok, error });
  }
  const failed = results.filter((r) => !r.ok);
  return { results, passed: results.length - failed.length, failed: failed.length, total: results.length };
}
