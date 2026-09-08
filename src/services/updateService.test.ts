import { describe, it, expect } from 'vitest';
import { isNewerVersion } from './updateService';

describe('updateService isNewerVersion', () => {
  it('detects newer version with date and time format', () => {
    expect(isNewerVersion('1.20260908.1200', '1.20260908.0945')).toBe(true);
    expect(isNewerVersion('1.20260909.0800', '1.20260908.0945')).toBe(true);
    expect(isNewerVersion('2.0.0', '1.20260908.0945')).toBe(true);
  });

  it('detects older or equal version', () => {
    expect(isNewerVersion('1.20260908.0945', '1.20260908.0945')).toBe(false);
    expect(isNewerVersion('1.20260908.0800', '1.20260908.0945')).toBe(false);
    expect(isNewerVersion('1.20260907.1500', '1.20260908.0945')).toBe(false);
  });

  it('handles "v" prefix gracefully', () => {
    expect(isNewerVersion('v1.20260908.1200', '1.20260908.0945')).toBe(true);
    expect(isNewerVersion('v1.20260908.0800', 'v1.20260908.0945')).toBe(false);
  });
});
