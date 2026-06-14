import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { validateProjectRoot } from './sites-registry';

export type CommandProgress = (message: string) => void;

function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  onLine?: CommandProgress,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: onLine ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: process.platform === 'win32',
    });
    if (onLine) {
      const handle = (buf: Buffer) => {
        for (const line of buf.toString().split(/\r?\n/)) {
          const t = line.trim();
          if (t) onLine(t);
        }
      };
      child.stdout?.on('data', handle);
      child.stderr?.on('data', handle);
    }
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code ?? 'unknown'}`));
    });
  });
}

export async function createLaravelProject(
  projectsDir: string,
  projectName: string,
  onProgress?: CommandProgress,
): Promise<string> {
  const safeName = projectName.trim().replace(/[^\w.-]/g, '');
  if (!safeName) throw new Error('Project name is required');

  const target = path.join(projectsDir, safeName);
  if (fs.existsSync(target)) {
    throw new Error(`Folder already exists: ${target}`);
  }

  fs.mkdirSync(projectsDir, { recursive: true });
  onProgress?.('Running composer create-project laravel/laravel…');
  await runCommand(
    'composer',
    ['create-project', 'laravel/laravel', safeName],
    projectsDir,
    onProgress,
  );

  return target;
}

export type NodeFrameworkKind = 'nextjs' | 'vite' | 'node';

function writeMinimalNodeServer(target: string, name: string): void {
  const index = `const http = require('http');
const port = process.env.PORT || 3000;
const host = process.env.HOST || '127.0.0.1';
http
  .createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>${name}</h1><p>Stacklet Node app is running on port ' + port + '.</p>');
  })
  .listen(port, host, () => console.log('listening on http://' + host + ':' + port));
`;
  fs.writeFileSync(path.join(target, 'index.js'), index, 'utf8');
  const pkgPath = path.join(target, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
    pkg.scripts = { ...(pkg.scripts ?? {}), dev: 'node index.js', start: 'node index.js' };
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  } catch {
    // leave package.json as npm init produced it
  }
}

/** Scaffold a new Node/React/Next.js project and return its folder. */
export async function createNodeProject(
  projectsDir: string,
  projectName: string,
  framework: NodeFrameworkKind,
  onProgress?: CommandProgress,
): Promise<string> {
  const safeName = projectName.trim().replace(/[^\w.-]/g, '');
  if (!safeName) throw new Error('Project name is required');

  const target = path.join(projectsDir, safeName);
  if (fs.existsSync(target)) throw new Error(`Folder already exists: ${target}`);
  fs.mkdirSync(projectsDir, { recursive: true });

  if (framework === 'nextjs') {
    onProgress?.('Running create-next-app (this can take a minute)…');
    await runCommand(
      'npx',
      [
        '--yes',
        'create-next-app@latest',
        safeName,
        '--ts',
        '--eslint',
        '--tailwind',
        '--app',
        '--src-dir',
        '--no-turbopack',
        '--use-npm',
        '--import-alias',
        '@/*',
      ],
      projectsDir,
      onProgress,
    );
  } else if (framework === 'vite') {
    onProgress?.('Scaffolding Vite (React + TypeScript)…');
    await runCommand(
      'npm',
      ['create', 'vite@latest', safeName, '--', '--template', 'react-ts'],
      projectsDir,
      onProgress,
    );
    onProgress?.('Installing dependencies (npm install)…');
    await runCommand('npm', ['install'], target, onProgress);
  } else {
    onProgress?.('Initializing Node project…');
    fs.mkdirSync(target, { recursive: true });
    await runCommand('npm', ['init', '-y'], target, onProgress);
    writeMinimalNodeServer(target, safeName);
  }

  if (!fs.existsSync(target)) {
    throw new Error(`Scaffolding did not create ${target}`);
  }
  return target;
}

/** Validate and return the project path (no copy — nginx serves the folder you pick). */
export function resolveExistingProjectPath(
  sourcePath: string,
  projectName?: string,
): { name: string; root: string } {
  const root = validateProjectRoot(sourcePath);
  const name = (projectName?.trim() || path.basename(root)).replace(/[^\w.-]/g, '');
  if (!name) throw new Error('Invalid project name');
  return { name, root };
}

/** Repo folder name from a git URL (strips .git, trailing slash, path/host). */
export function repoNameFromUrl(url: string): string {
  const cleaned = url.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  const lastSeg = cleaned.split(/[/:]/).pop() ?? '';
  return lastSeg;
}

/** Clone a repository into projectsDir and return its registration tuple. */
export async function cloneGitProject(
  projectsDir: string,
  url: string,
  projectName?: string,
): Promise<{ name: string; root: string }> {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) throw new Error('Repository URL is required');

  const derived = projectName?.trim() || repoNameFromUrl(trimmedUrl);
  const safeName = derived.replace(/[^\w.-]/g, '');
  if (!safeName) throw new Error('Could not determine a project name from the URL');

  const target = path.join(projectsDir, safeName);
  if (fs.existsSync(target)) {
    throw new Error(`Folder already exists: ${target}`);
  }

  fs.mkdirSync(projectsDir, { recursive: true });
  await runCommand('git', ['clone', trimmedUrl, safeName], projectsDir);
  return { name: safeName, root: target };
}
