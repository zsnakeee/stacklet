import { describe, expect, it } from 'vitest';
import { killProcessTree } from '../kill-process-tree';

describe('killProcessTree', () => {
  it('does not throw for invalid pids', () => {
    expect(() => killProcessTree(0)).not.toThrow();
    expect(() => killProcessTree(-1)).not.toThrow();
    expect(() => killProcessTree(Number.NaN)).not.toThrow();
  });

  it('does not throw for non-existent pid', () => {
    expect(() => killProcessTree(4_194_304)).not.toThrow();
  });
});
