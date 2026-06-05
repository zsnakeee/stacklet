import path from 'path';
import { describe, expect, it } from 'vitest';
import { buildPhpCgiSpawn, PHP_CGI_SPAWN_ENV } from '../php-cgi';

describe('buildPhpCgiSpawn', () => {
  it('binds php-cgi to FastCGI port 9000', () => {
    const bin = 'C:\\devmgr\\services\\php\\8.5.6\\php-cgi.exe';
    const spawn = buildPhpCgiSpawn(bin);
    expect(spawn.args).toContain('-b');
    expect(spawn.args[spawn.args.length - 1]).toBe('127.0.0.1:9000');
    expect(spawn.args).toContain('display_errors=0');
    expect(spawn.args).toContain('log_errors=1');
    expect(spawn.args).toContain('error_reporting=24575');
    if (process.platform === 'win32') {
      expect(spawn.args.some((a) => a.startsWith('opcache.file_cache='))).toBe(true);
      expect(spawn.args).toContain('opcache.file_cache_fallback=1');
    }
    expect(spawn.cwd).toBe(path.dirname(bin));
    expect(spawn.env).toEqual(PHP_CGI_SPAWN_ENV);
  });

  it('rejects plain php.exe', () => {
    expect(() => buildPhpCgiSpawn('C:\\php\\8.5.6\\php.exe')).toThrow(/php-cgi/i);
  });
});
