import fs from 'fs';
import https from 'https';
import http from 'http';
import path from 'path';
import { URL } from 'url';
import { ensureDir } from '../shared/paths';

export async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<void> {
  ensureDir(path.dirname(destPath));

  const fetch = (targetUrl: string, redirects = 0): Promise<void> => {
    if (redirects > 8) {
      throw new Error('too many redirects');
    }

    return new Promise((resolve, reject) => {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === 'https:' ? https : http;

      const request = client.get(targetUrl, (response) => {
        const status = response.statusCode ?? 0;

        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          const next = new URL(response.headers.location, targetUrl).toString();
          fetch(next, redirects + 1).then(resolve).catch(reject);
          return;
        }

        if (status < 200 || status >= 300) {
          reject(new Error(`download failed: HTTP ${status} for ${targetUrl}`));
          response.resume();
          return;
        }

        const total = Number(response.headers['content-length'] ?? 0) || null;
        let loaded = 0;
        const file = fs.createWriteStream(destPath);

        response.on('data', (chunk: Buffer) => {
          loaded += chunk.length;
          onProgress?.(loaded, total);
        });

        response.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve());
        });
        file.on('error', (err) => {
          fs.unlink(destPath, () => reject(err));
        });
      });

      request.on('error', reject);
    });
  };

  await fetch(url);
}
