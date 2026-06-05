import type { ServiceVersionEntry } from '../types';

const DIST = 'https://nodejs.org/dist';

/** Baseline Node.js Windows x64 builds (current + LTS lines). */
export const NODEJS_STATIC_VERSIONS: ServiceVersionEntry[] = [
  {
    version: '26.2.0',
    label: 'Node.js 26.2.0 (Current)',
    url: `${DIST}/v26.2.0/node-v26.2.0-win-x64.zip`,
    sizeBytes: 35_000_000,
    rootFolder: 'node-v26.2.0-win-x64',
  },
  {
    version: '24.12.0',
    label: 'Node.js 24.12.0 (LTS)',
    url: `${DIST}/v24.12.0/node-v24.12.0-win-x64.zip`,
    sizeBytes: 34_000_000,
    rootFolder: 'node-v24.12.0-win-x64',
  },
  {
    version: '22.14.0',
    label: 'Node.js 22.14.0 (LTS)',
    url: `${DIST}/v22.14.0/node-v22.14.0-win-x64.zip`,
    sizeBytes: 33_000_000,
    rootFolder: 'node-v22.14.0-win-x64',
  },
  {
    version: '20.18.2',
    label: 'Node.js 20.18.2 (LTS)',
    url: `${DIST}/v20.18.2/node-v20.18.2-win-x64.zip`,
    sizeBytes: 32_000_000,
    rootFolder: 'node-v20.18.2-win-x64',
  },
];
