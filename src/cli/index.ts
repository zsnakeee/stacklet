#!/usr/bin/env node
/**
 * Stacklet CLI — mirrors engine actions.
 */

import { Command } from 'commander';
import type { BundledServiceId } from '../bundled/types';
import { Orchestrator } from '../engine/orchestrator';
import { BRAND } from '../shared/brand';
import { getConfigPath, getDataDir } from '../shared/paths';

const SERVICE_IDS: BundledServiceId[] = [
  'nginx',
  'php',
  'mysql',
  'postgres',
  'nodejs',
  'redis',
  'phpmyadmin',
];

const program = new Command();

program
  .name(BRAND.cliName)
  .description(`${BRAND.name} — local dev environment manager`)
  .version('0.1.0');

program
  .command('init')
  .description('Create config and data directories')
  .action(async () => {
    const engine = Orchestrator.createInitialized();
    console.log(`Initialized at ${getDataDir()}`);
    console.log(`Config: ${getConfigPath()}`);
    await printStatus(engine);
  });

program
  .command('sites')
  .description('List registered projects')
  .action(() => {
    const engine = Orchestrator.createInitialized();
    const sites = engine.getSites();
    if (sites.length === 0) {
      console.log(`No sites. Run: ${BRAND.cliName} sites-link <path> or ${BRAND.cliName} sites-new <name>`);
      return;
    }
    for (const s of sites) {
      console.log(`${s.hostname}\t${s.doc_root}\t[${s.framework}]`);
    }
  });

program
  .command('sites-link <path>')
  .description('Register an existing project folder (no copy)')
  .option('-n, --name <name>', 'Site name (default: folder name)')
  .action(async (projectPath: string, opts: { name?: string }) => {
    const engine = Orchestrator.createInitialized();
    await engine.linkExistingSite(projectPath, opts.name);
    const sites = engine.getSites();
    const added = sites[sites.length - 1];
    console.log(`Linked: ${added?.hostname ?? projectPath}`);
  });

program
  .command('sites-remove <name>')
  .description(`Remove a project from ${BRAND.name} (files on disk are kept)`)
  .action(async (name: string) => {
    const engine = Orchestrator.createInitialized();
    await engine.removeSite(name);
    console.log(`Removed site: ${name}`);
  });

program
  .command('sites-new <name>')
  .description(`Create a new Laravel project under ${BRAND.dataDirName}/projects`)
  .action(async (name: string) => {
    const engine = Orchestrator.createInitialized();
    await engine.createLaravelSite(name);
    console.log(`Created Laravel project: ${name}`);
    await printStatus(engine);
  });

program
  .command('apply')
  .description('Render configs, certs, and sync hosts file')
  .action(async () => {
    const engine = Orchestrator.createInitialized();
    await engine.apply();
    console.log('Applied configuration.');
    console.log(`Generated: ${engine.getDataDir()}\\generated`);
  });

program
  .command('start [services...]')
  .description('Start services (nginx, php-fpm, mysql, postgres, redis)')
  .action(async (services: string[]) => {
    const engine = Orchestrator.createInitialized();
    await engine.start(services.length ? services : undefined);
    await printStatus(engine);
  });

program
  .command('stop [services...]')
  .description('Stop services')
  .action(async (services: string[]) => {
    const engine = Orchestrator.createInitialized();
    await engine.stop(services.length ? services : undefined);
    await printStatus(engine);
  });

program
  .command('status')
  .description('Show sites and service status')
  .action(async () => {
    const engine = Orchestrator.createInitialized();
    await printStatus(engine);
  });

program
  .command('catalog-refresh')
  .description('Fetch latest versions from upstream APIs')
  .action(async () => {
    const engine = Orchestrator.createInitialized();
    await engine.refreshCatalog();
    await printBundled(engine);
  });

program
  .command('install <service> <version>')
  .description('Download and install a bundled service')
  .action(async (service: string, version: string) => {
    const id = parseServiceId(service);
    const engine = Orchestrator.createInitialized();
    await engine.installBundled(id, version, (p) => {
      writeProgress(p);
    });
    console.log('\nInstalled.');
    await printBundled(engine);
  });

program
  .command('update <service> <version>')
  .description('Update an installed service to a new version')
  .action(async (service: string, version: string) => {
    const id = parseServiceId(service);
    const engine = Orchestrator.createInitialized();
    await engine.updateBundled(id, version, (p) => {
      writeProgress(p);
    });
    console.log('\nUpdated.');
    await printBundled(engine);
  });

program
  .command('uninstall <service>')
  .description('Remove a service and delete its files')
  .action(async (service: string) => {
    const id = parseServiceId(service);
    const engine = Orchestrator.createInitialized();
    await engine.uninstallBundled(id, (p) => {
      writeProgress(p);
    });
    console.log('\nUninstalled.');
    await printBundled(engine);
  });

program
  .command('services')
  .description('List bundled services, versions, and install status')
  .action(async () => {
    const engine = Orchestrator.createInitialized();
    await printBundled(engine);
  });

const logs = program.command('logs').description('Log viewer');

logs
  .command('list')
  .description('List log sources')
  .action(() => {
    const engine = Orchestrator.createInitialized();
    const sources = engine.logs.listSources();
    if (sources.length === 0) {
      console.log('No log sources yet. Apply config and start services.');
      return;
    }
    for (const s of sources) {
      console.log(`${s.id}\t${s.label}`);
    }
  });

logs
  .command('tail <id>')
  .description('Print last lines of a log source')
  .option('-n, --lines <count>', 'line count', '50')
  .action((id: string, opts: { lines: string }) => {
    const engine = Orchestrator.createInitialized();
    const lines = engine.logs.readTail(id, Number(opts.lines));
    for (const line of lines) {
      console.log(line);
    }
  });

function parseServiceId(service: string): BundledServiceId {
  const id = service as BundledServiceId;
  if (!SERVICE_IDS.includes(id)) {
    throw new Error(`service must be one of: ${SERVICE_IDS.join(', ')}`);
  }
  return id;
}

function writeProgress(p: {
  percent: number;
  message: string;
  phase: string;
}): void {
  if (
    p.phase === 'download' ||
    p.phase === 'extract' ||
    p.phase === 'configure' ||
    p.phase === 'uninstall'
  ) {
    process.stdout.write(`\r[${p.percent}%] ${p.message}`.padEnd(64));
  }
}

async function printBundled(engine: Orchestrator): Promise<void> {
  const list = await engine.getBundledServices();
  for (const svc of list) {
    const state = svc.installed ? `installed ${svc.installedVersion}` : 'not installed';
    const update = svc.hasUpdate ? ` (update → ${svc.latestVersion})` : '';
    console.log(`${svc.name} (${svc.id}): ${state}${update}`);
    if (!svc.installed && svc.versions.length > 0) {
      console.log(`  versions: ${svc.versions.map((v) => v.version).join(', ')}`);
    }
  }
}

async function printStatus(engine: Orchestrator): Promise<void> {
  const st = await engine.status();
  console.log(`Projects dir: ${st.projectsDir}`);
  console.log(`Web server: ${st.webServer}`);
  console.log('Sites:');
  if (st.sites.length === 0) {
    console.log('  (none)');
  } else {
    for (const s of st.sites) {
      console.log(`  ${s.hostname} → ${s.doc_root}`);
    }
  }
  console.log('Services:');
  for (const svc of st.services) {
    const extra = svc.pid ? ` pid=${svc.pid}` : svc.message ? ` (${svc.message})` : '';
    console.log(`  ${svc.name}: ${svc.state}${extra}`);
  }
  console.log('Bundled:');
  for (const svc of st.bundledServices ?? []) {
    console.log(
      `  ${svc.name}: ${svc.installed ? `v${svc.installedVersion}` : 'not installed'}`,
    );
  }
}

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
