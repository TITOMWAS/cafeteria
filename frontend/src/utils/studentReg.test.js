import { describe, it } from 'vitest';
import assert from 'node:assert';
// Student registration numbers must follow the strict institutional format:
//   CT207/119148/24 — course code (2-3 letters + 3 digits) / exactly 6 digits / 2-digit year
const STUDENT_REG_REGEX = /^[A-Z]{2,3}\d{3}\/\d{6}\/\d{2}$/;
const isValidStudentReg = (v) => STUDENT_REG_REGEX.test(String(v || '').trim().toUpperCase());

describe('student registration number format', () => {
  it('accepts the canonical example', () => {
    assert.equal(isValidStudentReg('CT207/119148/24'), true);
  });
  it('is case-insensitive on input', () => {
    assert.equal(isValidStudentReg('ct207/119148/24'), true);
  });
  it('rejects wrong digit counts in the middle segment', () => {
    assert.equal(isValidStudentReg('CT207/11914/24'), false);   // 5 digits
    assert.equal(isValidStudentReg('CT207/1191488/24'), false); // 7 digits
  });
  it('requires a 2-digit year', () => {
    assert.equal(isValidStudentReg('CT207/119148/2024'), false);
    assert.equal(isValidStudentReg('CT207/119148/A4'), false);
  });
  it('requires the course code to end with exactly 3 digits', () => {
    assert.equal(isValidStudentReg('CT2/119148/24'), false);
    assert.equal(isValidStudentReg('207/119148/24'), false);
    assert.equal(isValidStudentReg('ABCD12/119148/24'), false);
  });
  it('requires slash separators', () => {
    assert.equal(isValidStudentReg('CT207-119148-24'), false);
    assert.equal(isValidStudentReg('CT207 119148 24'), false);
  });
  it('rejects empty and malformed input', () => {
    assert.equal(isValidStudentReg(''), false);
    assert.equal(isValidStudentReg(null), false);
    assert.equal(isValidStudentReg('STUDENT001'), false);
  });
});
