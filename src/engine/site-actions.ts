import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { validateProjectRoot } from './sites-registry';

function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
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
): Promise<string> {
  const safeName = projectName.trim().replace(/[^\w.-]/g, '');
  if (!safeName) throw new Error('Project name is required');

  const target = path.join(projectsDir, safeName);
  if (fs.existsSync(target)) {
    throw new Error(`Folder already exists: ${target}`);
  }

  fs.mkdirSync(projectsDir, { recursive: true });
  await runCommand('composer', ['create-project', 'laravel/laravel', safeName], projectsDir);

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
