import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cloneGitProject, repoNameFromUrl } from '../site-actions';

describe('repoNameFromUrl', () => {
  it('derives the repo name from common URL forms', () => {
    expect(repoNameFromUrl('https://github.com/user/repo.git')).toBe('repo');
    expect(repoNameFromUrl('git@github.com:user/repo.git')).toBe('repo');
    expect(repoNameFromUrl('https://github.com/user/repo')).toBe('repo');
    expect(repoNameFromUrl('https://example.com/a/b/my-app/')).toBe('my-app');
  });
});

describe('cloneGitProject', () => {
  it('rejects an empty URL', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devmgr-'));
    await expect(cloneGitProject(dir, '   ')).rejects.toThrow(/URL is required/);
  });
  it('rejects when the target folder already exists', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devmgr-'));
    fs.mkdirSync(path.join(dir, 'repo'));
    await expect(
      cloneGitProject(dir, 'https://github.com/user/repo.git'),
    ).rejects.toThrow(/already exists/);
  });
});
