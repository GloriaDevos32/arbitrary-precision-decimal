import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Decimal, add, sub, mul, div, round, scale, compare, fromString, toString,
  eq, lt, gt, lte, gte, isZero, negate, abs
} from '../src/core.js';

test('fromString parses integers and decimals', () => {
  assert.strictEqual(toString(fromString('0')), '0');
  assert.strictEqual(toString(fromString('123')), '123');
  assert.strictEqual(toString(fromString('-123')), '-123');
  assert.strictEqual(toString(fromString('0.5')), '0.5');
  assert.strictEqual(toString(fromString('-0.5')), '-0.5');
  assert.strictEqual(toString(fromString('12.345')), '12.345');
  assert.strictEqual(toString(fromString('+12.345')), '12.345');
});

test('fromString rejects malformed input', () => {
  assert.throws(() => fromString(''), Error);
  assert.throws(() => fromString('1.2.3'), Error);
  assert.throws(() => fromString('abc'), Error);
  assert.throws(() => fromString('1e5'), Error);
  assert.throws(() => fromString('.'), Error);
  assert.throws(() => fromString('12.'), Error);
  assert.throws(() => fromString('--1'), Error);
});

test('fromString canonicalises negative zero', () => {
  const z = fromString('-0');
  assert.strictEqual(z.negative, false);
  assert.strictEqual(toString(z), '0');
});

test('add is exact across scales', () => {
  assert.strictEqual(toString(add(fromString('0.1'), fromString('0.2'))), '0.3');
  assert.strictEqual(toString(add(fromString('1.25'), fromString('2.75'))), '4');
  assert.strictEqual(toString(add(fromString('-1.5'), fromString('2.5'))), '1');
  assert.strictEqual(toString(add(fromString('-1.5'), fromString('-2.5'))), '-4');
  assert.strictEqual(toString(add(fromString('100'), fromString('0.001'))), '100.001');
});

test('sub subtracts exactly', () => {
  assert.strictEqual(toString(sub(fromString('1'), fromString('0.1'))), '0.9');
  assert.strictEqual(toString(sub(fromString('0.3'), fromString('0.1'))), '0.2');
  assert.strictEqual(toString(sub(fromString('5'), fromString('5'))), '0');
  assert.strictEqual(toString(sub(fromString('2.5'), fromString('3.5'))), '-1');
});

test('mul is exact and scales correctly', () => {
  assert.strictEqual(toString(mul(fromString('2'), fromString('3'))), '6');
  assert.strictEqual(toString(mul(fromString('0.1'), fromString('0.2'))), '0.02');
  assert.strictEqual(toString(mul(fromString('12.5'), fromString('4'))), '50');
  assert.strictEqual(toString(mul(fromString('-2.5'), fromString('4'))), '-10');
  assert.strictEqual(toString(mul(fromString('-2.5'), fromString('-4'))), '10');
});

test('div rounds half away from zero', () => {
  assert.strictEqual(toString(div(fromString('1'), fromString('3'), 2)), '0.33');
  assert.strictEqual(toString(div(fromString('1'), fromString('3'), 4)), '0.3333');
  assert.strictEqual(toString(div(fromString('2'), fromString('3'), 2)), '0.67');
  assert.strictEqual(toString(div(fromString('1'), fromString('2'), 0)), '1');
  assert.strictEqual(toString(div(fromString('-1'), fromString('2'), 0)), '-1');
  assert.strictEqual(toString(div(fromString('5'), fromString('2'), 2)), '2.50');
});

test('div by zero throws', () => {
  assert.throws(() => div(fromString('1'), fromString('0'), 2), Error);
});

test('div rejects negative precision', () => {
  assert.throws(() => div(fromString('1'), fromString('2'), -1), Error);
});

test('round truncates and rounds half away from zero', () => {
  assert.strictEqual(toString(round(fromString('1.234'), 2)), '1.23');
  assert.strictEqual(toString(round(fromString('1.235'), 2)), '1.24');
  assert.strictEqual(toString(round(fromString('1.25'), 1)), '1.3');
  assert.strictEqual(toString(round(fromString('-1.25'), 1)), '-1.3');
  assert.strictEqual(toString(round(fromString('2.5'), 0)), '3');
  assert.strictEqual(toString(round(fromString('1.001'), 2)), '1.00');
  assert.strictEqual(toString(round(fromString('0.999'), 2)), '1.00');
});

test('round to higher scale pads with zeros', () => {
  assert.strictEqual(toString(round(fromString('1.5'), 3)), '1.500');
  assert.strictEqual(toString(round(fromString('1'), 2)), '1.00');
});

test('compare handles signs and scales', () => {
  assert.strictEqual(compare(fromString('1'), fromString('2')), -1);
  assert.strictEqual(compare(fromString('2'), fromString('1')), 1);
  assert.strictEqual(compare(fromString('1'), fromString('1')), 0);
  assert.strictEqual(compare(fromString('-1'), fromString('1')), -1);
  assert.strictEqual(compare(fromString('-2'), fromString('-1')), -1);
  assert.strictEqual(compare(fromString('0.1'), fromString('0.09')), 1);
  assert.strictEqual(compare(fromString('0.10'), fromString('0.1')), 0);
});

test('comparison helpers work', () => {
  assert.ok(eq(fromString('0.1'), fromString('0.10')));
  assert.ok(lt(fromString('0.09'), fromString('0.1')));
  assert.ok(gt(fromString('0.1'), fromString('0.09')));
  assert.ok(lte(fromString('1'), fromString('1')));
  assert.ok(gte(fromString('1'), fromString('1')));
});

test('isZero detects zero regardless of representation', () => {
  assert.ok(isZero(fromString('0')));
  assert.ok(isZero(fromString('-0')));
  assert.ok(isZero(sub(fromString('1'), fromString('1'))));
  assert.ok(!isZero(fromString('0.001')));
});

test('negate flips sign', () => {
  assert.strictEqual(toString(negate(fromString('5'))), '-5');
  assert.strictEqual(toString(negate(fromString('-5'))), '5');
  assert.strictEqual(toString(negate(fromString('0'))), '0');
});

test('abs returns magnitude', () => {
  assert.strictEqual(toString(abs(fromString('-5'))), '5');
  assert.strictEqual(toString(abs(fromString('5'))), '5');
  assert.strictEqual(toString(abs(fromString('0'))), '0');
});

test('scale sets the fractional digit count', () => {
  assert.strictEqual(toString(scale(fromString('1.2345'), 2)), '1.23');
  assert.strictEqual(toString(scale(fromString('1.5'), 3)), '1.500');
});
