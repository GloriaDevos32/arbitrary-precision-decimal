# Arbitrary Precision Decimal

Arbitrary-precision decimal arithmetic over base-10 digit arrays, for exact financial calculations. No third-party dependencies; ships as ESM.

```js
import { fromString, add, sub, mul, div, round, toString } from './src/index.js';

const a = fromString('0.1');
const b = fromString('0.2');
console.log(toString(add(a, b)));            // '0.3'
console.log(toString(div(fromString('1'), fromString('3'), 4))); // '0.3333'
console.log(toString(round(fromString('1.235'), 2))); // '1.24'
```

Exports: `Decimal` (class), `fromString`, `toString`, `add`, `sub`, `mul`, `div`, `round`, `scale`, `compare`, `eq`, `lt`, `gt`, `lte`, `gte`, `isZero`, `negate`, `abs`. All live in `src/core.js` and are re-exported from `src/index.js`.

## Why this exists

Binary floating point cannot represent 0.1 exactly, so `0.1 + 0.2` prints `0.30000000000000004`. That is unacceptable for money. This library stores every value as an array of base-10 digits plus a scale, so `0.1` stays `0.1`. Addition, subtraction, and multiplication are always exact; the caller controls precision explicitly for division and rounding.

The trade-off: this is slower than native floats and far slower than native BigInt. It exists for correctness in narrow financial contexts, not for performance.

## The awkward edge

Division is the only operation that cannot be exact in general (1 / 3 has no finite decimal expansion). `div(a, b, precision)` takes a non-negative integer precision and rounds half away from zero. The policy is deliberately fixed: if you need banker's rounding, this library is not the right tool. `round` and `scale` use the same policy.

`fromString` accepts only plain decimal literals — an optional sign, digits, an optional dot, more digits. No exponents. An exponent like `1e-5` would require choosing a scale to materialise it at, which is a rounding decision the parser refuses to make silently.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

