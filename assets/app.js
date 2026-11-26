/* 스틱맨 계산기 — 화면 동작 */
import { Calculator, moodFor, numberToKorean, numberToEnglish } from './calc.js';

/* 콘솔 오류 수집(테스트 확인용) */
const errorLog = [];
window.__consoleErrors = errorLog;
window.addEventListener('error', (e) => errorLog.push(e.message || 'error'));
window.addEventListener('unhandledrejection', (e) => {
  errorLog.push('unhandledrejection: ' + (e.reason && e.reason.message ? e.reason.message : e.reason));
});

/* ── 효과음 (Web Audio API, 외부 음원 없음) ───────────── */
const Sound = (() => {
  let ctx = null;
  let enabled = true;

  function ensure() {
    if (!enabled) return null;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (err) {
      return null;
    }
  }

  function blip({ freq = 660, to = null, type = 'triangle', dur = 0.09, gain = 0.07, delay = 0, vibrato = 0, vibRate = 6 }) {
    const ac = ensure();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), t0 + dur);
    if (vibrato) {
      const lfo = ac.createOscillator();
      const lg = ac.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = vibRate;
      lg.gain.value = vibrato;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.02);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  return {
    unlock() {
      ensure();
    },
    setEnabled(v) {
      enabled = Boolean(v);
      if (!enabled && ctx && ctx.state === 'running') ctx.suspend();
      if (enabled) ensure();
    },
    isEnabled() {
      return enabled;
    },
    click() {
      blip({ freq: 780, to: 560, dur: 0.07, gain: 0.06 });
    },
    op() {
      blip({ freq: 520, to: 470, type: 'sine', dur: 0.08, gain: 0.055 });
    },
    equals() {
      [523.25, 659.25, 783.99].forEach((f, i) => blip({ freq: f, dur: 0.24, gain: 0.055, delay: i * 0.065 }));
    },
    cheer() {
      [1046.5, 1318.5, 1567.98].forEach((f, i) => blip({ freq: f, dur: 0.18, gain: 0.04, delay: 0.16 + i * 0.055 }));
    },
    groan() {
      blip({ freq: 190, to: 132, type: 'square', dur: 0.4, gain: 0.03, vibrato: 7, vibRate: 11 });
    },
    cry() {
      blip({ freq: 640, to: 430, type: 'sine', dur: 0.42, gain: 0.05, vibrato: 26, vibRate: 7.5 });
      blip({ freq: 520, to: 350, type: 'sine', dur: 0.5, gain: 0.04, delay: 0.28, vibrato: 24, vibRate: 7 });
    },
    error() {
      blip({ freq: 330, to: 140, type: 'sawtooth', dur: 0.45, gain: 0.035, vibrato: 10, vibRate: 9 });
      blip({ freq: 165, to: 90, type: 'square', dur: 0.4, gain: 0.025, delay: 0.06 });
    },
  };
})();

/* ── 음성 읽기 (Web Speech API, 외부 음원 없음) ──────
 * 미지원 브라우저에서는 조용히 넘어간다(오류 없음).
 * 숫자를 빠르게 연속 입력하면 직전 발화를 끊고 새로 읽는다.
 */
const Speech = (() => {
  const synth = (() => {
    try {
      return window.speechSynthesis || null;
    } catch (err) {
      return null;
    }
  })();
  const Utterance = (() => {
    try {
      return window.SpeechSynthesisUtterance || null;
    } catch (err) {
      return null;
    }
  })();
  const supported = Boolean(synth && Utterance);
  let enabled = true;
  let voice = null;
  let lang = 'ko';
  let pending = 0;
  const log = [];
  const spoken = []; // 실제로 넘긴 발화(언어 포함) — 테스트 확인용

  function pickVoice() {
    if (!supported) return;
    try {
      const voices = synth.getVoices() || [];
      const exact = lang === 'en' ? /^en[-_]?us/i : /^ko[-_]?kr/i;
      const loose = lang === 'en' ? /^en/i : /^ko/i;
      voice = voices.find((v) => exact.test(v.lang)) || voices.find((v) => loose.test(v.lang)) || null;
    } catch (err) {
      voice = null;
    }
  }

  if (supported) {
    pickVoice();
    try {
      synth.addEventListener('voiceschanged', pickVoice);
    } catch (err) {
      try {
        synth.onvoiceschanged = pickVoice;
      } catch (err2) {
        /* 목소리 목록을 못 받아와도 기본 목소리로 읽는다 */
      }
    }
  }

  function utter(text, rate) {
    if (!supported) return;
    try {
      if (synth.speaking || synth.pending) synth.cancel();
      if (synth.paused) synth.resume();
      const u = new Utterance(text);
      u.lang = lang === 'en' ? 'en-US' : 'ko-KR';
      u.rate = rate;
      u.pitch = 1;
      u.volume = 1;
      if (voice) u.voice = voice;
      u.onerror = () => {};
      synth.speak(u);
    } catch (err) {
      /* 음성 차단·미지원 시 조용히 넘어간다 */
    }
  }

  return {
    supported,
    log,
    utterances: spoken,
    isEnabled() {
      return enabled;
    },
    getLang() {
      return lang;
    },
    setLang(next) {
      lang = next === 'en' ? 'en' : 'ko';
      pickVoice();
      return lang;
    },
    setEnabled(v) {
      enabled = Boolean(v);
      if (!enabled) {
        clearTimeout(pending);
        try {
          if (synth) synth.cancel();
        } catch (err) {
          /* 무시 */
        }
      }
      return enabled;
    },
    say(text, { rate = 1.12, delay = 0 } = {}) {
      clearTimeout(pending);
      if (!text || !enabled) return;
      log.push(text);
      if (log.length > 60) log.shift();
      spoken.push({ text, lang: lang === 'en' ? 'en-US' : 'ko-KR' });
      if (spoken.length > 40) spoken.shift();
      if (delay > 0) pending = window.setTimeout(() => utter(text, rate), delay);
      else utter(text, rate);
    },
  };
})();

/* 키마다 읽어 줄 말 (언어별) */
const KEY_SPEECH = {
  ko: {
    0: '영',
    1: '일',
    2: '이',
    3: '삼',
    4: '사',
    5: '오',
    6: '육',
    7: '칠',
    8: '팔',
    9: '구',
    '.': '점',
    '+': '더하기',
    '-': '빼기',
    '×': '곱하기',
    '÷': '나누기',
    '%': '퍼센트',
    AC: '초기화',
    '⌫': '지우기',
  },
  en: {
    0: 'zero',
    1: 'one',
    2: 'two',
    3: 'three',
    4: 'four',
    5: 'five',
    6: 'six',
    7: 'seven',
    8: 'eight',
    9: 'nine',
    '.': 'point',
    '+': 'plus',
    '-': 'minus',
    '×': 'times',
    '÷': 'divided by',
    '%': 'percent',
    AC: 'clear',
    '⌫': 'delete',
  },
};

/* 누른 키로 읽을 말과 속도. '='는 "equals + 결과"(한국어는 "이꼴"). */
function speechFor(key, snap, lang = Speech.getLang()) {
  const isEn = lang === 'en';
  if (key === '=') {
    if (snap.isError) return { text: isEn ? 'error' : '오류', rate: 1.05 };
    const words = isEn ? numberToEnglish(snap.value) : numberToKorean(snap.value);
    return { text: (isEn ? 'equals ' : '이꼴 ') + words, rate: 1.05 };
  }
  return { text: (KEY_SPEECH[isEn ? 'en' : 'ko'][key]) || '', rate: 1.18 };
}

/* ── 캐릭터 SVG ──────────────────────────────────────── */
function tear(x, y) {
  return `<g transform="translate(${x} ${y})"><path class="tear" d="M0 0 c3.4 5.6 5.6 9 5.6 11 a5.6 5.6 0 0 1 -11.2 0 c0 -2 2.2 -5.4 5.6 -11 z"/></g>`;
}
function sweat(x, y) {
  return `<g transform="translate(${x} ${y})"><path class="sweat" d="M0 0 c2.8 4.6 4.6 7.4 4.6 9 a4.6 4.6 0 0 1 -9.2 0 c0 -1.6 1.8 -4.4 4.6 -9 z"/></g>`;
}

function stickmanCrew() {
  return `
  <g class="figure figure--boy">
    <path class="line" d="M82 121 L80 147"/>
    <path class="line" d="M102 121 L104 147"/>
    <rect class="shirt" x="72" y="92" width="40" height="30" rx="4"/>
    <path class="line" d="M74 98 C 62 76 55 44 52 10"/>
    <path class="line" d="M110 98 C 122 76 129 44 132 10"/>
    <circle class="hand" cx="52" cy="7" r="7"/>
    <circle class="hand" cx="132" cy="7" r="7"/>
    <circle class="head" cx="92" cy="58" r="31"/>
    <path class="hair" d="M61 54 A31 31 0 0 1 123 54 Q123 42 106 37 Q92 33 78 37 Q61 42 61 54 Z"/>
    <g class="face face--idle">
      <g class="eyes">
        <ellipse class="eye" cx="82" cy="62" rx="3.1" ry="3.8"/>
        <ellipse class="eye" cx="102" cy="62" rx="3.1" ry="3.8"/>
      </g>
      <path class="mouth" d="M86 73 q6 5 12 0"/>
      <circle class="cheek" cx="68" cy="71" r="4.6"/>
      <circle class="cheek" cx="116" cy="71" r="4.6"/>
    </g>
    <g class="face face--heavy">
      <path class="line" d="M75 60 l10 5 -10 5"/>
      <path class="line" d="M109 60 l-10 5 10 5"/>
      <path class="mouth" d="M84 77 q3.2 -3.4 6 0 t6 0 t6 0"/>
    </g>
    <g class="face face--cry">
      <path class="line" d="M75 65 q6 -7 12 0"/>
      <path class="line" d="M97 65 q6 -7 12 0"/>
      <path class="mouth-open" d="M86 74 q9 -4 18 0 q0 14 -9 14 q-9 0 -9 -14 z"/>
      <path class="mouth" d="M90 84 q4 3 8 0"/>
    </g>
    <g class="face face--happy">
      <path class="line" d="M75 63 q6 -6 12 0"/>
      <path class="line" d="M97 63 q6 -6 12 0"/>
      <path class="mouth" d="M84 72 q8 11 16 0"/>
      <circle class="cheek" cx="68" cy="71" r="4.6"/>
      <circle class="cheek" cx="116" cy="71" r="4.6"/>
    </g>
    <g class="tears">${tear(72, 73)}${tear(112, 73)}</g>
    <g class="sweat-group">${sweat(122, 38)}${sweat(60, 48)}${sweat(114, 24)}</g>
  </g>

  <g class="figure figure--girl">
    <path class="line" d="M296 126 L294 149"/>
    <path class="line" d="M320 126 L322 149"/>
    <path class="shirt" d="M308 88 L282 126 L334 126 Z"/>
    <path class="line" d="M290 94 C 278 74 272 44 269 10"/>
    <path class="line" d="M326 94 C 338 74 344 44 347 10"/>
    <circle class="hand" cx="269" cy="7" r="7"/>
    <circle class="hand" cx="347" cy="7" r="7"/>
    <path class="hair" d="M278 62 a30 30 0 0 1 60 0 v26 q-13 -10 -30 -10 q-17 0 -30 10 z"/>
    <circle class="head" cx="308" cy="58" r="26"/>
    <path class="hair" d="M283 54 q25 -20 50 0 q-5 -19 -25 -19 q-20 0 -25 19 z"/>
    <g class="face face--idle">
      <g class="eyes">
        <ellipse class="eye" cx="299" cy="62" rx="2.9" ry="3.5"/>
        <ellipse class="eye" cx="317" cy="62" rx="2.9" ry="3.5"/>
      </g>
      <path class="mouth" d="M303 72 q5 4 10 0"/>
      <circle class="cheek" cx="288" cy="70" r="4.2"/>
      <circle class="cheek" cx="328" cy="70" r="4.2"/>
    </g>
    <g class="face face--heavy">
      <path class="line" d="M293 60 l9 5 -9 5"/>
      <path class="line" d="M323 60 l-9 5 9 5"/>
      <path class="mouth" d="M300 76 q3 -3 5.4 0 t5.4 0 t5.4 0"/>
    </g>
    <g class="face face--cry">
      <path class="line" d="M293 65 q6 -7 12 0"/>
      <path class="line" d="M311 65 q6 -7 12 0"/>
      <path class="mouth-open" d="M301 74 q7 -4 14 0 q0 12 -7 12 q-7 0 -7 -12 z"/>
      <path class="mouth" d="M304 84 q4 3 8 0"/>
    </g>
    <g class="face face--happy">
      <path class="line" d="M293 63 q6 -6 12 0"/>
      <path class="line" d="M311 63 q6 -6 12 0"/>
      <path class="mouth" d="M301 72 q7 9 14 0"/>
      <circle class="cheek" cx="288" cy="70" r="4.2"/>
      <circle class="cheek" cx="328" cy="70" r="4.2"/>
    </g>
    <g class="tears">${tear(290, 73)}${tear(326, 73)}</g>
    <g class="sweat-group">${sweat(342, 36)}${sweat(284, 44)}${sweat(336, 22)}</g>
  </g>`;
}

/* 절미: 핑크 ㅈ 몸통 */
function jeolmiBody() {
  return `<path class="jeolmi" d="M-46 -50 h92 a14 14 0 0 1 0 28 h-24 l26 36 a14 14 0 0 1 -24 14 l-24 -33 -24 33 a14 14 0 0 1 -24 -14 l26 -36 h-24 a14 14 0 0 1 0 -28 z"/>`;
}

function jeolmiFaces() {
  return `
    <g class="face face--idle">
      <g class="eyes">
        <ellipse class="eye" cx="-17" cy="-38" rx="3.2" ry="3.9"/>
        <ellipse class="eye" cx="17" cy="-38" rx="3.2" ry="3.9"/>
      </g>
      <path class="mouth" d="M-8 -30 q8 6 16 0"/>
      <circle class="cheek" cx="-32" cy="-32" r="4.6"/>
      <circle class="cheek" cx="32" cy="-32" r="4.6"/>
    </g>
    <g class="face face--heavy">
      <path class="line" d="M-26 -39 l9 5 -9 5"/>
      <path class="line" d="M26 -39 l-9 5 9 5"/>
      <path class="mouth" d="M-10 -28 q3.6 -3.6 6.8 0 t6.8 0 t6.8 0"/>
    </g>
    <g class="face face--cry">
      <path class="line" d="M-26 -36 q6 -7 12 0"/>
      <path class="line" d="M14 -36 q6 -7 12 0"/>
      <path class="mouth-open" d="M-10 -29 q10 -4 20 0 q0 15 -10 15 q-10 0 -10 -15 z"/>
    </g>
    <g class="face face--happy">
      <path class="line" d="M-26 -38 q6 -6 12 0"/>
      <path class="line" d="M14 -38 q6 -6 12 0"/>
      <path class="mouth" d="M-10 -31 q10 12 20 0"/>
      <circle class="cheek" cx="-32" cy="-32" r="4.6"/>
      <circle class="cheek" cx="32" cy="-32" r="4.6"/>
    </g>
    <g class="tears">${tear(-17, -26)}${tear(17, -26)}</g>
    <g class="sweat-group">${sweat(34, -52)}${sweat(46, -34)}${sweat(-38, -54)}</g>`;
}

function jeolmiCrew() {
  return `
  <g class="figure figure--jeolmi-a">
    <g transform="translate(104 112)">
      <path class="line arm" d="M-40 -52 C -46 -74 -52 -92 -56 -106"/>
      <path class="line arm" d="M40 -52 C 46 -74 52 -92 56 -106"/>
      <circle class="hand" cx="-56" cy="-108" r="7"/>
      <circle class="hand" cx="56" cy="-108" r="7"/>
      ${jeolmiBody()}
      ${jeolmiFaces()}
    </g>
  </g>
  <g class="figure figure--jeolmi-b">
    <g transform="translate(296 112)">
      <path class="line arm" d="M-40 -52 C -46 -74 -52 -92 -56 -106"/>
      <path class="line arm" d="M40 -52 C 46 -74 52 -92 56 -106"/>
      <circle class="hand" cx="-56" cy="-108" r="7"/>
      <circle class="hand" cx="56" cy="-108" r="7"/>
      ${jeolmiBody()}
      ${jeolmiFaces()}
    </g>
  </g>`;
}


/* 깔려서 납작해진 모습 (crushed 전용) */
function squashedStick() {
  return `
  <g class="squashed squashed--boy">
    <path class="line" d="M74 90 L54 100"/>
    <path class="line" d="M110 90 L130 100"/>
    <ellipse class="shirt" cx="92" cy="84" rx="31" ry="12"/>
    <path class="line" d="M64 82 C 56 78 48 72 40 66"/>
    <path class="line" d="M120 82 C 128 78 136 72 144 66"/>
    <circle class="hand" cx="38" cy="64" r="6"/>
    <circle class="hand" cx="146" cy="64" r="6"/>
    <ellipse class="head" cx="92" cy="62" rx="38" ry="15"/>
    <path class="hair" d="M56 59 q5 -13 36 -13 q31 0 36 13 q-18 -6 -36 -6 q-18 0 -36 6 z"/>
    <path class="line" d="M74 62 q5 -5 10 0"/>
    <path class="line" d="M100 62 q5 -5 10 0"/>
    <ellipse class="mouth-open" cx="92" cy="69" rx="8" ry="5.5"/>
    <g class="tears">${tear(70, 66)}${tear(114, 66)}</g>
    <path class="line splat" d="M40 88 l-9 3 M41 92 l-8 6 M144 88 l9 3 M143 92 l8 6"/>
  </g>

  <g class="squashed squashed--girl">
    <path class="line" d="M291 90 L271 100"/>
    <path class="line" d="M325 90 L345 100"/>
    <ellipse class="shirt" cx="308" cy="84" rx="29" ry="12"/>
    <path class="line" d="M281 82 C 273 78 265 72 257 66"/>
    <path class="line" d="M335 82 C 343 78 351 72 359 66"/>
    <circle class="hand" cx="255" cy="64" r="6"/>
    <circle class="hand" cx="361" cy="64" r="6"/>
    <ellipse class="hair" cx="308" cy="62" rx="40" ry="18"/>
    <ellipse class="head" cx="308" cy="63" rx="34" ry="13"/>
    <path class="hair" d="M276 60 q7 -12 32 -12 q25 0 32 12 q-16 -6 -32 -6 q-16 0 -32 6 z"/>
    <path class="line" d="M292 63 q5 -5 10 0"/>
    <path class="line" d="M314 63 q5 -5 10 0"/>
    <ellipse class="mouth-open" cx="308" cy="70" rx="7" ry="5"/>
    <g class="tears">${tear(288, 67)}${tear(328, 67)}</g>
    <path class="line splat" d="M258 88 l-9 3 M259 92 l-8 6 M358 88 l9 3 M357 92 l8 6"/>
  </g>`;
}

/* 깔린 절미 (crushed 전용) */
function squashedJeolmi() {
  const one = (x) => `
  <g class="squashed">
    <path class="line arm" d="M${x - 30} 60 C ${x - 36} 56 ${x - 40} 50 ${x - 44} 44"/>
    <path class="line arm" d="M${x + 30} 60 C ${x + 36} 56 ${x + 40} 50 ${x + 44} 44"/>
    <circle class="hand" cx="${x - 44}" cy="42" r="6"/>
    <circle class="hand" cx="${x + 44}" cy="42" r="6"/>
    <path class="line jeolmi-leg" d="M${x - 16} 88 C ${x - 28} 94 ${x - 38} 98 ${x - 50} 100"/>
    <path class="line jeolmi-leg" d="M${x + 16} 88 C ${x + 28} 94 ${x + 38} 98 ${x + 50} 100"/>
    <rect class="jeolmi" x="${x - 50}" y="60" width="100" height="28" rx="14"/>
    <path class="line" d="M${x - 20} 70 q5 -5 10 0"/>
    <path class="line" d="M${x + 10} 70 q5 -5 10 0"/>
    <ellipse class="mouth-open" cx="${x}" cy="77" rx="7" ry="5"/>
    <g class="tears">${tear(x - 24, 74)}${tear(x + 24, 74)}</g>
  </g>`;
  return one(104) + one(296);
}

/* ── 화면 요소 ───────────────────────────────────────── */
const calcEl = document.getElementById('calc');
const displayEl = document.getElementById('display');
const valueEl = document.getElementById('value');
const exprEl = document.getElementById('expr');
const bubbleEl = document.getElementById('bubble');
const bubbleTextEl = document.getElementById('bubbleText');
const crewEl = document.getElementById('crew');
const crewWrap = document.querySelector('.crew-wrap');
const modeToggle = document.getElementById('modeToggle');
const langToggle = document.getElementById('langToggle');
const soundToggle = document.getElementById('soundToggle');
const speechToggle = document.getElementById('speechToggle');
const keypad = document.getElementById('keypad');

const calculator = new Calculator();
let mode = 'stickman';
let cheerTimer = 0;

const STORE = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (err) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      /* 저장 실패는 무시 */
    }
  },
};

/* ── 렌더 ───────────────────────────────────────────── */
function renderCrew() {
  crewEl.innerHTML =
    mode === 'jeolmi' ? jeolmiCrew() + squashedJeolmi() : stickmanCrew() + squashedStick();
}

function bubbleFor(snap) {
  if (snap.isError) return '으앙… 엉엉';
  if (snap.mood === 'crushed') return snap.length > 16 ? '까… 깔렸어' : '으앙 엉엉';
  if (snap.mood === 'heavy') return '낑… 낑…';
  return '';
}

function render(snap) {
  valueEl.textContent = snap.display;
  exprEl.textContent = snap.expression || '\u00A0';

  const len = snap.display.length;
  displayEl.classList.toggle('len-9', len >= 9 && len < 12);
  displayEl.classList.toggle('len-12', len >= 12 && len < 16);
  displayEl.classList.toggle('len-16', len >= 16);

  calcEl.classList.toggle('is-heavy', snap.mood === 'heavy');
  calcEl.classList.toggle('is-crushed', snap.mood === 'crushed');
  displayEl.classList.toggle('is-error', snap.isError);

  if (!calcEl.classList.contains('is-cheer')) {
    bubbleTextEl.textContent = bubbleFor(snap);
  }
}

function bump() {
  crewWrap.classList.remove('bump');
  void crewWrap.offsetWidth;
  crewWrap.classList.add('bump');
}

function cheer() {
  calcEl.classList.add('is-cheer');
  bubbleTextEl.textContent = '야호!';
  clearTimeout(cheerTimer);
  cheerTimer = window.setTimeout(() => {
    calcEl.classList.remove('is-cheer');
    const cur = calculator.snapshot();
    bubbleTextEl.textContent = bubbleFor(cur);
  }, 1100);
}

/* ── 입력 처리 ───────────────────────────────────────── */
function press(key, { silent = false } = {}) {
  Sound.unlock();
  const before = calculator.snapshot();
  const snap = calculator.press(key);

  if (!silent) {
    if (key === '=') {
      if (snap.isError) {
        Sound.error();
      } else if (snap.mood === 'crushed') {
        Sound.equals();
        Sound.cry();
      } else if (snap.mood === 'heavy') {
        Sound.equals();
        Sound.groan();
      } else {
        Sound.equals();
        Sound.cheer();
      }
    } else if (['+', '-', '×', '÷', '%'].includes(key)) {
      Sound.op();
    } else {
      Sound.click();
    }
    if (key === '=' && !snap.isError && snap.mood === 'normal' && before.raw !== snap.raw) {
      cheer();
    }
    // 효과음과 겹치지 않게 '='는 살짝 늦게, 나머지는 바로 읽는다.
    const say = speechFor(key, snap, Speech.getLang());
    if (say.text) Speech.say(say.text, { rate: say.rate, delay: key === '=' ? 160 : 0 });
    if (navigator.vibrate) navigator.vibrate(8);
  }

  if (key !== '=') calcEl.classList.remove('is-cheer');
  render(snap);
  bump();
  return snap;
}

function pressKeyVisual(key) {
  const btn = keypad.querySelector(`[data-key="${key === '*' ? '×' : key === '/' ? '÷' : key}"]`);
  if (!btn) return;
  btn.classList.add('is-pressed');
  window.setTimeout(() => btn.classList.remove('is-pressed'), 110);
}

keypad.addEventListener('click', (event) => {
  const btn = event.target.closest('.key');
  if (!btn) return;
  press(btn.dataset.key);
});

/* 물리 키보드 */
window.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  let key = event.key;
  if (key === 'Enter' || key === '=') key = '=';
  else if (key === '*' || key === 'x' || key === 'X') key = '×';
  else if (key === '/') key = '÷';
  else if (key === 'Backspace') key = '⌫';
  else if (key === 'Escape' || key === 'Delete') key = 'AC';
  else if (!/^[0-9.]$/.test(key) && !['+', '-', '%'].includes(key)) return;

  event.preventDefault();
  pressKeyVisual(key);
  press(key);
});

/* 모드 전환 */
function setMode(next, { save = true } = {}) {
  mode = next === 'jeolmi' ? 'jeolmi' : 'stickman';
  calcEl.dataset.mode = mode;
  modeToggle.setAttribute('aria-checked', String(mode === 'jeolmi'));
  modeToggle.setAttribute(
    'aria-label',
    `캐릭터 모드 전환: ${mode === 'jeolmi' ? '절미 (누르면 스틱맨)' : '스틱맨 (누르면 절미)'}`,
  );
  renderCrew();
  if (save) STORE.set('stickman-calc-mode', mode);
}

modeToggle.addEventListener('click', () => {
  Sound.unlock();
  Sound.click();
  setMode(mode === 'stickman' ? 'jeolmi' : 'stickman');
  if (navigator.vibrate) navigator.vibrate(6);
});

/* 효과음 토글 */
function setSound(on, { save = true } = {}) {
  Sound.setEnabled(on);
  soundToggle.setAttribute('aria-pressed', String(on));
  soundToggle.setAttribute('aria-label', on ? '효과음 끄기' : '효과음 켜기');
  if (save) STORE.set('stickman-calc-sound', on ? 'on' : 'off');
  if (on) Sound.click();
}

soundToggle.addEventListener('click', () => {
  setSound(soundToggle.getAttribute('aria-pressed') !== 'true');
});

/* 음성 읽기 토글 (효과음과 따로 동작) */
function setSpeech(on, { save = true, announce = true } = {}) {
  Speech.setEnabled(on);
  speechToggle.setAttribute('aria-pressed', String(on));
  speechToggle.setAttribute('aria-label', on ? '음성 읽기 끄기' : '음성 읽기 켜기');
  if (save) STORE.set('stickman-calc-speech', on ? 'on' : 'off');
  if (on && announce) Speech.say(Speech.getLang() === 'en' ? 'Voice on' : '음성 읽기 켜짐', { rate: 1.05 });
}

speechToggle.addEventListener('click', () => {
  const on = speechToggle.getAttribute('aria-pressed') !== 'true';
  Sound.unlock();
  Sound.click();
  setSpeech(on);
  if (navigator.vibrate) navigator.vibrate(6);
});

/* 음성 언어 전환 (한국어 ↔ English) */
function setSpeechLang(next, { save = true, announce = true } = {}) {
  const value = next === 'en' ? 'en' : 'ko';
  Speech.setLang(value);
  calcEl.dataset.lang = value;
  document.documentElement.lang = value;
  langToggle.setAttribute('aria-checked', String(value === 'en'));
  langToggle.setAttribute(
    'aria-label',
    value === 'en' ? '음성 언어 전환: English (누르면 한국어)' : '음성 언어 전환: 한국어 (누르면 English)',
  );
  if (save) STORE.set('stickman-calc-lang', value);
  if (announce && Speech.isEnabled()) {
    Speech.say(value === 'en' ? 'English' : '한국어', { rate: 1.05 });
  }
  return value;
}

langToggle.addEventListener('click', () => {
  Sound.unlock();
  Sound.click();
  setSpeechLang(Speech.getLang() === 'ko' ? 'en' : 'ko');
  if (navigator.vibrate) navigator.vibrate(6);
});

/* ── PWA ────────────────────────────────────────────── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

/* ── 시작 ───────────────────────────────────────────── */
setMode(STORE.get('stickman-calc-mode', 'stickman'), { save: false });
setSound(STORE.get('stickman-calc-sound', 'on') === 'on', { save: false });
setSpeechLang(STORE.get('stickman-calc-lang', 'ko'), { save: false, announce: false });
setSpeech(STORE.get('stickman-calc-speech', 'on') === 'on', { save: false, announce: false });
render(calculator.snapshot());

/* 테스트용 훅 */
window.__stickman = {
  press,
  snapshot: () => calculator.snapshot(),
  calc: calculator,
  setMode,
  getMode: () => mode,
  moodFor,
  numberToKorean,
  numberToEnglish,
  speechFor,
  speechLog: Speech.log,
  utterances: Speech.utterances,
  speechSupported: Speech.supported,
  isSpeechOn: () => Speech.isEnabled(),
  setSpeech,
  getLang: () => Speech.getLang(),
  setSpeechLang,
};

document.documentElement.dataset.ready = 'true';
