import fs from 'fs';
import path from 'path';
import { isNodeFramework, type Site } from '../../config/types';
import { getLogsDir } from '../../shared/paths';

export interface DevServerSpawnSpec {
  /** node.exe to run. */
  binary: string;
  args: string[];
  cwd: string;
  stderrLog: string;
  env: Record<string, string>;
}

function readScripts(root: string): Record<string, string> {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

/** The npm script to run: explicit override → "dev" → "start" → "dev". */
export function defaultDevScript(site: Site): string {
  const override = site.dev_server?.script?.trim();
  if (override) return override;
  const scripts = readScripts(site.root);
  if (scripts.dev) return 'dev';
  if (scripts.start) return 'start';
  return 'dev';
}

/**
 * Build the spawn spec for a site's Node dev server. We run the framework's dev
 * binary directly via node.exe (no shell) so we can force host+port; for plain
 * Node sites we fall back to the project's npm script with PORT/HOST in the env.
 */
export function buildDevServerSpawn(site: Site, port: number, nodeDir: string): DevServerSpawnSpec {
  const node = path.join(nodeDir, 'node.exe');
  const stderrLog = path.join(getLogsDir(), 'sites', site.name, 'dev-server.stderr.log');
  fs.mkdirSync(path.dirname(stderrLog), { recursive: true });

  const env: Record<string, string> = {
    PORT: String(port),
    HOST: '127.0.0.1',
    HOSTNAME: '127.0.0.1',
    BROWSER: 'none',
    FORCE_COLOR: '0',
  };

  const nextBin = path.join(site.root, 'node_modules', 'next', 'dist', 'bin', 'next');
  const viteBin = path.join(site.root, 'node_modules', 'vite', 'bin', 'vite.js');

  let args: string[];
  if (site.framework === 'nextjs' && fs.existsSync(nextBin)) {
    args = [nextBin, 'dev', '-H', '127.0.0.1', '-p', String(port)];
  } else if (site.framework === 'vite' && fs.existsSync(viteBin)) {
    args = [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'];
  } else {
    // Generic Node project (or deps not installed yet): run its npm script.
    const npmCli = path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    args = [npmCli, 'run', defaultDevScript(site)];
  }

  return { binary: node, args, cwd: site.root, stderrLog, env };
}

export function shouldRunDevServer(site: Site): boolean {
  return (
    isNodeFramework(site.framework) &&
    site.enabled !== false &&
    site.dev_server?.enabled === true &&
    typeof site.dev_server.port === 'number' &&
    fs.existsSync(path.join(site.root, 'package.json'))
  );
}
