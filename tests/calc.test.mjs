#!/usr/bin/env node
/* 계산 엔진 단위 테스트: node tests/calc.test.mjs */
import { runCases } from './cases.js';

const { results, passed, total } = runCases();

for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.error ? '  (' + r.error + ')' : ''}`);
}

console.log(`\n${passed}/${total} 통과`);
if (passed !== total) {
  process.exit(1);
}
