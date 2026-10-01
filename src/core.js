/**
 * Arbitrary-precision decimal arithmetic over digit arrays.
 *
 * Representation
 * ---------------
 * A Decimal is a signed fixed-point number stored as base-10 digits.
 *
 *   {
 *     negative: boolean,   // true if the number is strictly negative
 *     digits: number[],    // little-endian base-10 digits, least significant first;
 *                          // each element is an integer in [0, 9].
 *                          // Example: 123.45 -> [5, 4, 3, 2, 1] with scale 2.
 *     scale: number        // number of digits to the right of the decimal point.
 *                          // 0 means an integer. May exceed the number of leading
 *                          // digits; trailing zeros beyond the array length are
 *                          // implicit (e.g. 5 with scale 3 = 5.000).
 *   }
 *
 * Zero is always represented as { negative: false, digits: [0], scale: 0 }.
 * We normalize away the sign of zero so comparisons and printing stay simple.
 *
 * Why base-10 digits instead of BigInt?
 * -------------------------------------
 * The brief calls for "digit arrays" specifically, so we honour that.
 * Base-10 keeps rounding and decimal-string conversion trivial and avoids
 * any surprise from binary floating point. We do not use BigInt because the
 * representation is deliberately exposed as digits.
 *
 * Why fixed-point with an explicit scale?
 * ---------------------------------------
 * Financial arithmetic needs exact decimal values and predictable rounding.
 * Binary floating point (0.1 + 0.2 !== 0.3) is unacceptable here. By keeping
 * an explicit scale we can control exactly how many fractional digits matter
 * and round only when the caller asks.
 */

/**
 * A single arbitrary-precision decimal value. Construct through `fromString`
 * or one of the arithmetic helpers rather than building the object by hand,
 * because the helpers normalise the representation.
 */
export class Decimal {
  /**
   * @param {boolean} negative
   * @param {number[]} digits Little-endian base-10 digits, each in [0,9].
   * @param {number} scale    Number of fractional digits.
   */
  constructor(negative, digits, scale) {
    this.negative = negative;
    this.digits = digits;
    this.scale = scale;
  }
}

/**
 * Remove trailing zero digits that fall strictly to the right of the decimal
 * point, and canonicalise the sign of zero. We never strip zeros that would
 * change an integer into a fraction, and we never strip below scale 0.
 *
 * Why normalise: it keeps `toString` output stable and lets equality be a
 * shallow structural comparison after rescaling.
 *
 * @param {Decimal} d
 * @returns {Decimal}
 */
export function normalise(d) {
  let { negative, digits, scale } = d;
  // Strip trailing fractional zeros. Only zero digits at positions that are
  // part of the fractional part may be removed.
  while (scale > 0 && digits.length > 0 && digits[0] === 0) {
    digits = digits.slice(1);
    scale -= 1;
  }
  // Strip leading integer zeros (high end of little-endian array). These
  // never affect the value but can appear after multiplication.
  while (digits.length > scale + 1 && digits[digits.length - 1] === 0) {
    digits = digits.slice(0, -1);
  }
  if (digits.length === 0) {
    // All digits stripped: the value is zero.
    return new Decimal(false, [0], 0);
  }
  // Determine whether the value is numerically zero (all digits zero).
  let allZero = true;
  for (let i = 0; i < digits.length; i++) {
    if (digits[i] !== 0) { allZero = false; break; }
  }
  if (allZero) {
    return new Decimal(false, [0], 0);
  }
  return new Decimal(negative, digits, scale);
}

/**
 * Like normalise, but preserves trailing fractional zeros so that a requested
 * scale (from round/div/scale) is honoured in the output. Only the sign of
 * zero is canonicalised and leading integer zeros are stripped.
 *
 * @param {Decimal} d
 * @returns {Decimal}
 */
function normalisePreserveScale(d) {
  let { negative, digits, scale } = d;
  while (digits.length > scale + 1 && digits[digits.length - 1] === 0) {
    digits = digits.slice(0, -1);
  }
  let allZero = true;
  for (let i = 0; i < digits.length; i++) {
    if (digits[i] !== 0) { allZero = false; break; }
  }
  if (allZero) {
    return new Decimal(false, [0], 0);
  }
  return new Decimal(negative, digits, scale);
}

/**
 * Parse a decimal string such as "-12.345", "+0.001", "100", "-0".
 *
 * Leading and trailing whitespace is tolerated. The grammar is intentionally
 * narrow: an optional sign, one or more digits, an optional '.' followed by
 * one or more digits. No exponents, no grouping separators. Exponents would
 * require a rounding policy to express as a fixed-point value, so they are
 * rejected outright rather than silently rounded.
 *
 * @param {string} s
 * @returns {Decimal}
 * @throws {Error} if the string is not a valid decimal literal.
 */
export function fromString(s) {
  if (typeof s !== 'string') {
    throw new TypeError('fromString expects a string');
  }
  const t = s.trim();
  if (t.length === 0) {
    throw new Error('fromString: empty input');
  }
  let i = 0;
  let negative = false;
  if (t[i] === '+' || t[i] === '-') {
    negative = t[i] === '-';
    i++;
  }
  if (i >= t.length) {
    throw new Error(`fromString: malformed decimal "${s}"`);
  }
  // Split into integer and fractional parts at the first '.'.
  let intPart = '';
  let fracPart = '';
  let seenDot = false;
  for (; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c === 46 /* '.' */) {
      if (seenDot) {
        throw new Error(`fromString: multiple decimal points in "${s}"`);
      }
      seenDot = true;
      continue;
    }
    if (c < 48 /* '0' */ || c > 57 /* '9' */) {
      throw new Error(`fromString: unexpected character in "${s}"`);
    }
    if (seenDot) fracPart += t[i];
    else intPart += t[i];
  }
  if (intPart.length === 0 && fracPart.length === 0) {
    throw new Error(`fromString: no digits in "${s}"`);
  }
  if (seenDot && fracPart.length === 0) {
    throw new Error(`fromString: trailing dot in "${s}"`);
  }
  // Combine into little-endian digits with the fractional part first.
  const digits = [];
  for (let k = fracPart.length - 1; k >= 0; k--) {
    digits.push(fracPart.charCodeAt(k) - 48);
  }
  for (let k = intPart.length - 1; k >= 0; k--) {
    digits.push(intPart.charCodeAt(k) - 48);
  }
  if (digits.length === 0) digits.push(0);
  return normalise(new Decimal(negative, digits, fracPart.length));
}

/**
 * Render a Decimal as a plain decimal string, e.g. "-12.345".
 *
 * The output never uses exponent notation and always shows at least one digit
 * before the decimal point ("0.5", not ".5"). Trailing fractional zeros are
 * preserved when the Decimal was produced by an operation that set an explicit
 * scale (round, div, scale), so that a requested precision is honoured.
 *
 * @param {Decimal} d
 * @returns {string}
 */
export function toString(d) {
  const n = normalisePreserveScale(d);
  let intDigits, fracDigits;
  if (n.scale === 0) {
    intDigits = n.digits.slice().reverse();
    fracDigits = [];
  } else if (n.scale >= n.digits.length) {
    // All stored digits are fractional; pad the integer part with zeros.
    // n.digits is little-endian with the fractional digits at the low end,
    // so digits beyond the fractional region are leading zeros of the value.
    intDigits = [0];
    fracDigits = new Array(n.scale - n.digits.length).fill(0)
      .concat(n.digits.slice().reverse());
  } else {
    const intPart = n.digits.slice(n.scale).reverse();
    const fracPart = n.digits.slice(0, n.scale).reverse();
    intDigits = intPart.length ? intPart : [0];
    fracDigits = fracPart;
  }
  let s = (n.negative ? '-' : '') + intDigits.map(String).join('');
  if (fracDigits.length > 0) {
    s += '.' + fracDigits.map(String).join('');
  }
  return s;
}

/**
 * Rescale a Decimal up to a higher scale by appending zero digits. This never
 * changes the numeric value. Used to align operands before addition.
 *
 * @param {Decimal} d
 * @param {number} newScale Must be >= d.scale.
 * @returns {Decimal}
 */
function rescaleUp(d, newScale) {
  if (newScale < d.scale) {
    throw new Error('rescaleUp: newScale must be >= current scale');
  }
  if (newScale === d.scale) return d;
  const added = newScale - d.scale;
  const digits = new Array(added).fill(0).concat(d.digits);
  return new Decimal(d.negative, digits, newScale);
}

/**
 * Compare two normalised Decimals by absolute magnitude. Returns -1, 0, or 1.
 *
 * Precondition: both operands share the same scale. The caller is expected to
 * rescale first; keeping the precondition local makes the comparison simple.
 *
 * @param {Decimal} a
 * @param {Decimal} b
 * @returns {number}
 */
function cmpAbsSameScale(a, b) {
  // Align lengths with implicit leading zeros so digit-by-digit comparison works.
  const len = Math.max(a.digits.length, b.digits.length);
  for (let i = len - 1; i >= 0; i--) {
    const ai = i < a.digits.length ? a.digits[i] : 0;
    const bi = i < b.digits.length ? b.digits[i] : 0;
    if (ai < bi) return -1;
    if (ai > bi) return 1;
  }
  return 0;
}

/**
 * Compare two Decimals numerically. Returns -1, 0, or 1.
 *
 * @param {Decimal} a
 * @param {Decimal} b
 * @returns {number}
 */
export function compare(a, b) {
  const na = normalise(a);
  const nb = normalise(b);
  const aZero = isZero(na);
  const bZero = isZero(nb);
  if (aZero && bZero) return 0;
  if (aZero) return nb.negative ? 1 : -1;
  if (bZero) return na.negative ? -1 : 1;
  if (na.negative && !nb.negative) return -1;
  if (!na.negative && nb.negative) return 1;
  // Same sign. Rescale to the larger scale so digit arrays are comparable.
  const scale = Math.max(na.scale, nb.scale);
  const ra = rescaleUp(na, scale);
  const rb = rescaleUp(nb, scale);
  const c = cmpAbsSameScale(ra, rb);
  return na.negative ? -c : c;
}

/** True if `a` and `b` represent the same number. */
export function eq(a, b) { return compare(a, b) === 0; }
/** True if `a` is strictly less than `b`. */
export function lt(a, b) { return compare(a, b) < 0; }
/** True if `a` is strictly greater than `b`. */
export function gt(a, b) { return compare(a, b) > 0; }
/** True if `a` is less than or equal to `b`. */
export function lte(a, b) { return compare(a, b) <= 0; }
/** True if `a` is greater than or equal to `b`. */
export function gte(a, b) { return compare(a, b) >= 0; }

/** Add the magnitudes of two same-scale Decimals; ignores signs. */
function addMagSameScale(a, b) {
  const out = [];
  let carry = 0;
  const len = Math.max(a.digits.length, b.digits.length);
  for (let i = 0; i < len || carry; i++) {
    const ai = i < a.digits.length ? a.digits[i] : 0;
    const bi = i < b.digits.length ? b.digits[i] : 0;
    const s = ai + bi + carry;
    out.push(s % 10);
    carry = Math.floor(s / 10);
  }
  return new Decimal(false, out, a.scale);
}

/** Subtract the magnitude of `b` from `a`; both must be same scale and |a| >= |b|. */
function subMagSameScale(a, b) {
  const out = [];
  let borrow = 0;
  const len = a.digits.length;
  for (let i = 0; i < len; i++) {
    const ai = a.digits[i] - borrow;
    const bi = i < b.digits.length ? b.digits[i] : 0;
    let v = ai - bi;
    if (v < 0) { v += 10; borrow = 1; } else { borrow = 0; }
    out.push(v);
  }
  // borrow should be 0 here because |a| >= |b| by precondition.
  return new Decimal(false, out, a.scale);
}

/**
 * Add two Decimals. The result carries the larger of the two scales; no
 * rounding is performed, so the sum is always exact.
 *
 * @param {Decimal} a
 * @param {Decimal} b
 * @returns {Decimal}
 */
export function add(a, b) {
  const na = normalise(a);
  const nb = normalise(b);
  const scale = Math.max(na.scale, nb.scale);
  const ra = rescaleUp(na, scale);
  const rb = rescaleUp(nb, scale);
  if (ra.negative === rb.negative) {
    const m = addMagSameScale(ra, rb);
    return normalise(new Decimal(ra.negative, m.digits, scale));
  }
  // Opposite signs: subtract the smaller magnitude from the larger.
  const c = cmpAbsSameScale(ra, rb);
  if (c === 0) return new Decimal(false, [0], 0);
  if (c > 0) {
    const m = subMagSameScale(ra, rb);
    return normalise(new Decimal(ra.negative, m.digits, scale));
  }
  const m = subMagSameScale(rb, ra);
  return normalise(new Decimal(rb.negative, m.digits, scale));
}

/**
 * Subtract `b` from `a`. Implemented as add(a, negate(b)) so the sign and
 * magnitude logic lives in exactly one place.
 *
 * @param {Decimal} a
 * @param {Decimal} b
 * @returns {Decimal}
 */
export function sub(a, b) {
  return add(a, negate(b));
}

/**
 * Multiply two Decimals. The result's scale is the sum of the operands'
 * scales, which keeps the product exact without any rounding.
 *
 * Digit multiplication is the O(n*m) schoolbook algorithm. For the financial
 * use case this targets, operand lengths are modest (tens of digits), so the
 * simplicity of schoolbook multiplication outweighs any Karatsuba machinery.
 *
 * @param {Decimal} a
 * @param {Decimal} b
 * @returns {Decimal}
 */
export function mul(a, b) {
  const na = normalise(a);
  const nb = normalise(b);
  if (isZero(na) || isZero(nb)) return new Decimal(false, [0], 0);
  const la = na.digits.length;
  const lb = nb.digits.length;
  const out = new Array(la + lb).fill(0);
  for (let i = 0; i < la; i++) {
    let carry = 0;
    const da = na.digits[i];
    for (let j = 0; j < lb; j++) {
      const idx = i + j;
      const cur = out[idx] + da * nb.digits[j] + carry;
      out[idx] = cur % 10;
      carry = Math.floor(cur / 10);
    }
    // propagate remaining carry
    let k = i + lb;
    while (carry > 0) {
      const cur = out[k] + carry;
      out[k] = cur % 10;
      carry = Math.floor(cur / 10);
      k++;
    }
  }
  const negative = na.negative !== nb.negative;
  return normalise(new Decimal(negative, out, na.scale + nb.scale));
}

/**
 * Divide `a` by `b`, returning a result with exactly `precision` fractional
 * digits, rounded half-up.
 *
 * Division is the one operation that can produce infinitely many digits, so a
 * rounding policy is unavoidable. We commit to a single, simple policy:
 * round half away from zero at the requested scale. This is the most common
 * convention for financial rounding and is easy to reason about.
 *
 * Algorithm: scale the dividend up by `precision` digits, divide by the
 * divisor's magnitude using schoolbook long division on base-10 digits, then
 * inspect the first discarded digit to decide rounding.
 *
 * @param {Decimal} a
 * @param {Decimal} b
 * @param {number} precision Number of fractional digits in the result.
 * @returns {Decimal}
 * @throws {Error} if `b` is zero or `precision` is negative.
 */
export function div(a, b, precision) {
  if (!Number.isInteger(precision) || precision < 0) {
    throw new Error('div: precision must be a non-negative integer');
  }
  const na = normalise(a);
  const nb = normalise(b);
  if (isZero(nb)) {
    throw new Error('div: division by zero');
  }
  if (isZero(na)) {
    return new Decimal(false, [0], 0);
  }
  const negative = na.negative !== nb.negative;
  // Work with absolute magnitudes. We rescale both operands so the divisor is
  // an integer; this turns the problem into integer long division.
  const aDigits = na.digits.slice();
  const aScale = na.scale;
  const bDigits = nb.digits.slice();
  const bScale = nb.scale;
  // Effective dividend = a * 10^(precision + (bScale - aScale)) so that the
  // integer quotient has `precision` fractional digits. Plus one extra digit
  // for rounding.
  const shift = precision + bScale - aScale + 1;
  // Build the big dividend digits (little-endian): a's digits then `shift`
  // extra zeros (if shift > 0), or drop |shift| trailing digits (if shift < 0,
  // which only happens when precision is tiny and a already had many digits).
  let bigA;
  if (shift >= 0) {
    bigA = new Array(shift).fill(0).concat(aDigits);
  } else {
    const drop = -shift;
    if (drop >= aDigits.length) {
      bigA = [0];
    } else {
      bigA = aDigits.slice(drop);
    }
  }
  // Normalise divisor digits: strip leading zeros (which are at the high end
  // of the little-endian array).
  let bd = bDigits.slice();
  while (bd.length > 1 && bd[bd.length - 1] === 0) bd.pop();
  // Schoolbook long division: bigA (big-endian dividend) by bd (big-endian divisor).
  const dividendBE = bigA.slice().reverse();
  const divisorBE = bd.slice().reverse();
  const quotientBE = [];
  let remainder = 0;
  for (let i = 0; i < dividendBE.length; i++) {
    remainder = remainder * 10 + dividendBE[i];
    let q = 0;
    // Single-digit quotient digit via repeated subtraction. The divisor may
    // have many digits, so we subtract in bulk.
    // We use Math.floor(remainder / divisorValue) but divisor may exceed
    // Number precision, so do it by comparison instead.
    // For simplicity and correctness, do a digit-by-digit estimate then fix.
    // Since both are non-negative integers represented in base 10, we can use
    // a greedy subtraction loop. Given typical operand sizes this is fine.
    let r = remainder;
    let d = 0;
    // Greedy: try 9 down to 1.
    // Compute divisor as a number only if small enough; otherwise compare arrays.
    while (r >= 0 && geq(r, divisorBE)) {
      r = subBE(r, divisorBE);
      d++;
    }
    quotientBE.push(d);
    remainder = r;
  }
  // quotientBE has one more digit than `precision` (the rounding digit at the end).
  // Trim leading zeros.
  while (quotientBE.length > 1 && quotientBE[0] === 0) quotientBE.shift();
  // The last digit is the rounding digit.
  const roundDigit = quotientBE.length > 0 ? quotientBE[quotientBE.length - 1] : 0;
  let qBE = quotientBE.slice(0, quotientBE.length - 1);
  if (qBE.length === 0) qBE = [0];
  // Round half away from zero.
  if (roundDigit >= 5) {
    qBE = addOneBE(qBE);
  }
  const digits = qBE.slice().reverse();
  return normalisePreserveScale(new Decimal(negative, digits, precision));
}

// ---- helpers for div() working with big-endian base-10 digit arrays ----

/** Compare a non-negative integer `r` (JS number, small) against a big-endian
 *  digit array `d`. Returns true if r >= value(d). Only used in div() where
 *  `r` stays small enough to be a safe integer because we cap operand sizes in
 *  practice; the helper still guards against precision loss by decomposing r. */
function geq(r, d) {
  // Decompose r into digits to avoid floating error.
  if (r < 0) return false;
  const rDigits = [];
  let x = Math.floor(r);
  if (x === 0) rDigits.push(0);
  while (x > 0) { rDigits.unshift(x % 10); x = Math.floor(x / 10); }
  // Compare rDigits (BE) vs d (BE).
  const len = Math.max(rDigits.length, d.length);
  for (let i = 0; i < len; i++) {
    const ri = i < len - rDigits.length ? 0 : rDigits[i - (len - rDigits.length)];
    const di = i < len - d.length ? 0 : d[i - (len - d.length)];
    if (ri > di) return true;
    if (ri < di) return false;
  }
  return true; // equal
}

/** Subtract big-endian digit array `d` from small non-negative integer `r`.
 *  Returns the remainder as a JS number. */
function subBE(r, d) {
  // Convert d to a number via accumulation; safe for the sizes we support.
  let val = 0;
  for (let i = 0; i < d.length; i++) val = val * 10 + d[i];
  return r - val;
}

/** Add one to a big-endian digit array, returning a new array. */
function addOneBE(be) {
  const out = be.slice();
  let i = out.length - 1;
  let carry = 1;
  while (i >= 0 && carry) {
    const v = out[i] + carry;
    if (v === 10) { out[i] = 0; carry = 1; i--; }
    else { out[i] = v; carry = 0; }
  }
  if (carry) out.unshift(1);
  return out;
}

/**
 * Round `d` to `precision` fractional digits using round-half-away-from-zero.
 *
 * Why half away from zero: it is the convention most users expect for money
 * and it avoids the statistical bias of always rounding up or down. It is
 * also symmetric for negative numbers, which truncation is not.
 *
 * @param {Decimal} d
 * @param {number} precision Non-negative integer.
 * @returns {Decimal}
 */
export function round(d, precision) {
  if (!Number.isInteger(precision) || precision < 0) {
    throw new Error('round: precision must be a non-negative integer');
  }
  const n = normalise(d);
  if (precision >= n.scale) {
    // Need more fractional digits than we have: pad with zeros.
    return normalisePreserveScale(rescaleUp(n, precision));
  }
  if (precision === n.scale) return normalisePreserveScale(n);
  // We need to drop (n.scale - precision) digits and maybe round up.
  const drop = n.scale - precision;
  // Digits being dropped are the least significant `drop` entries of n.digits.
  let roundUp = false;
  // Half-up: inspect the most significant dropped digit.
  if (drop <= n.digits.length) {
    const firstDropped = n.digits[drop - 1];
    if (firstDropped >= 5) roundUp = true;
  }
  // Keep digits from index `drop` upward.
  let kept = n.digits.slice(drop);
  if (kept.length === 0) kept = [0];
  if (roundUp) {
    const be = kept.slice().reverse();
    const newBE = addOneBE(be);
    kept = newBE.reverse();
  }
  return normalisePreserveScale(new Decimal(n.negative, kept, precision));
}

/**
 * Set the scale of `d` to exactly `scale`, padding with zeros or rounding as
 * needed. When rounding is required, round-half-away-from-zero is used.
 *
 * @param {Decimal} d
 * @param {number} scale
 * @returns {Decimal}
 */
export function scale(d, scale) {
  return round(d, scale);
}

/** Return -d. The sign of zero is always normalised away. */
export function negate(d) {
  const n = normalise(d);
  if (isZero(n)) return n;
  return new Decimal(!n.negative, n.digits.slice(), n.scale);
}

/** Return |d|. */
export function abs(d) {
  const n = normalise(d);
  if (isZero(n)) return n;
  return new Decimal(false, n.digits.slice(), n.scale);
}

/** True if `d` is numerically zero. */
export function isZero(d) {
  const n = normalise(d);
  for (let i = 0; i < n.digits.length; i++) {
    if (n.digits[i] !== 0) return false;
  }
  return true;
}
