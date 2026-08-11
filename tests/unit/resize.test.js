// tests/unit/resize.test.js - pure drag math for the pane dividers.
const { nextSize } = require('../../app/resize.js');

const cfg = { invert: false, min: 140, max: 420 };

test('grows and shrinks with pointer delta', () => {
  expect(nextSize(220, 50, cfg)).toBe(270);
  expect(nextSize(220, -50, cfg)).toBe(170);
});
test('clamps to min and max', () => {
  expect(nextSize(220, -500, cfg)).toBe(140);
  expect(nextSize(220, 500, cfg)).toBe(420);
});
test('inverted dividers grow against the delta (console, comments)', () => {
  const inv = { invert: true, min: 60, max: 600 };
  expect(nextSize(220, -50, inv)).toBe(270); // drag up = bigger console
  expect(nextSize(220, 50, inv)).toBe(170);
});
test('rounds fractional deltas', () => {
  expect(nextSize(220, 10.6, cfg)).toBe(231);
});
