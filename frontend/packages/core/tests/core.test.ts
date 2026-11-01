import { describe, expect, it } from 'vitest';
import { CORE_VERSION, getCoreStatus } from '../src/index';

describe('core package', () => {
  it('exposes the core version', () => {
    expect(CORE_VERSION).toBe('0.1.0');
  });

  it('returns valid core status', () => {
    const status = getCoreStatus();
    expect(status.ready).toBe(true);
    expect(typeof status.timestamp).toBe('string');
  });
});

