/**
 * Student registration number format (strict):
 *   <course code>/<exactly 6 digits>/<2-digit year>
 *   e.g. CT207/119148/24
 *
 * Course code: 2-3 letters followed by exactly 3 digits (CT207).
 * Stored normalized to UPPERCASE with no surrounding spaces.
 */
const STUDENT_REG_REGEX = /^[A-Z]{2,3}\d{3}\/\d{6}\/\d{2}$/;

const STUDENT_REG_HINT = 'Format: CT207/119148/24 — course code, exactly 6 digits, then your year of study (e.g. 24)';

const isValidStudentReg = (value) =>
  STUDENT_REG_REGEX.test(String(value || '').trim().toUpperCase());

const normalizeStudentReg = (value) =>
  String(value || '').trim().toUpperCase();

module.exports = { STUDENT_REG_REGEX, STUDENT_REG_HINT, isValidStudentReg, normalizeStudentReg };
