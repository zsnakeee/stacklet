/**
 * Phase 0 spike — de-risk privileged ops + local HTTPS for app.test
 *
 * Flow:
 *   1. Generate local CA + *.test leaf cert (if missing)
 *   2. Launch elevated helper (UAC) and install CA into Windows trust store
 *   3. Add app.test → 127.0.0.1 via helper (hosts file)
 *   4. Serve a demo page over HTTPS on port 8443
 *
 * Usage (Windows, after `npm run build`):
 *   npm run spike
 *
 * Then open: https://app.test:8443
 */

import https from 'https';
import fs from 'fs';
import { ensureDevCerts } from '../engine/tls';
import { HelperService } from '../engine/helper-service';

const SPIKE_HOST = 'app.test';
const SPIKE_PORT = 8443;

const DEMO_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>dev-mgr Phase 0</title></head>
<body>
  <h1>dev-mgr Phase 0 spike</h1>
  <p>If you see this over HTTPS at <code>${SPIKE_HOST}</code>, local TLS and DNS are working.</p>
</body>
</html>`;

async function main(): Promise<void> {
  if (process.platform !== 'win32') {
    console.error('Phase 0 spike is Windows-only.');
    process.exit(1);
  }

  console.log('[spike] generating certificates...');
  const certs = ensureDevCerts();
  console.log(`[spike] CA: ${certs.caCertPath}`);

  const helper = new HelperService();

  console.log('[spike] starting privileged helper (UAC prompt may appear)...');
  await helper.ensureReady();

  console.log('[spike] installing CA into trust store...');
  try {
    await helper.certInstall(certs.caCertPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('already') || message.includes('exists')) {
      console.log('[spike] CA already trusted (or duplicate install skipped)');
    } else {
      throw err;
    }
  }

  console.log(`[spike] mapping ${SPIKE_HOST} → 127.0.0.1 in hosts file...`);
  await helper.hostsAdd(SPIKE_HOST);

  const leafCert = fs.readFileSync(certs.leafCertPath);
  const leafKey = fs.readFileSync(certs.leafKeyPath);

  const server = https.createServer(
    { cert: leafCert, key: leafKey },
    (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(DEMO_HTML);
    },
  );

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(SPIKE_PORT, '127.0.0.1', () => resolve());
  });

  const url = `https://${SPIKE_HOST}:${SPIKE_PORT}`;
  console.log(`[spike] ready — open ${url}`);
  console.log('[spike] press Ctrl+C to stop');

  const shutdown = (): void => {
    server.close();
    helper.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[spike] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
