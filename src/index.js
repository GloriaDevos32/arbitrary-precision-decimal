/**
 * Arbitrary Precision Decimal — public API.
 *
 * The module re-exports the core operations and the Decimal class so consumers
 * can import everything from a single entry point:
 *
 *   import { Decimal, add, sub, mul, div, round, scale, compare, fromString, toString } from 'apdec';
 */
export { Decimal } from './core.js';
export { add, sub, mul, div, round, scale, compare, fromString, toString, eq, lt, gt, lte, gte, isZero, negate, abs } from './core.js';
