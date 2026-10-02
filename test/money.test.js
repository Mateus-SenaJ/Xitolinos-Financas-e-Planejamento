'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMoneyToCents, formatCents, sumCents } = require('../src/domain/money');

test('parses localized monetary values into integer cents', () => {
  assert.equal(parseMoneyToCents('R$ 1.234,56'), 123456);
  assert.equal(parseMoneyToCents('0,05'), 5);
  assert.equal(parseMoneyToCents(-12.34), -1234);
});

test('rejects invalid monetary values', () => {
  assert.throws(() => parseMoneyToCents('12,345'), TypeError);
  assert.throws(() => parseMoneyToCents(Number.NaN), TypeError);
});

test('formats and sums integer cents without decimal accumulation', () => {
  assert.equal(sumCents([3334, 3333, 3333]), 10000);
  assert.equal(formatCents(103030), 'R$ 1.030,30');
});