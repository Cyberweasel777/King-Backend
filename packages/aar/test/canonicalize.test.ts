import { describe, it, expect } from 'vitest';
import { canonicalize } from '../src/canonicalize';

describe('canonicalize', () => {
  it('sorts keys alphabetically', () => {
    expect(canonicalize({ z: 1, a: 2, m: 3 })).toBe('{"a":2,"m":3,"z":1}');
  });

  it('sorts nested keys', () => {
    expect(canonicalize({ b: { d: 1, c: 2 }, a: 3 })).toBe('{"a":3,"b":{"c":2,"d":1}}');
  });

  it('preserves array order', () => {
    expect(canonicalize({ a: [3, 1, 2] })).toBe('{"a":[3,1,2]}');
  });

  it('produces no whitespace', () => {
    const result = canonicalize({ key: 'value', nested: { a: 1 } });
    expect(result).not.toMatch(/\s/);
  });

  it('is deterministic', () => {
    const obj = { z: { y: { x: 'deep' } }, a: [1, { c: 3, b: 2 }] };
    expect(canonicalize(obj)).toBe(canonicalize(obj));
  });

  it('handles null and primitives', () => {
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize('hello')).toBe('"hello"');
    expect(canonicalize(42)).toBe('42');
    expect(canonicalize(true)).toBe('true');
  });
});
