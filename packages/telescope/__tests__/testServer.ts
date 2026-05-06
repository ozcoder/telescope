import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'timers/promises';

import { expect } from 'vitest';

import { cleanupTestDirectory, retrieveHAR } from './helpers.js';
import { launchTest } from '../src/index.js';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export function fixturesDir(name: string): string {
  return join(projectRoot, 'tests', name);
}

/**
 * Launches a test, asserts success, retrieves the HAR, and cleans up the test
 * directory after the callback finishes (even on failure).
 */
export async function withHAR(
  options: LaunchOptions,
  callback: (har: HarData) => void,
): Promise<void> {
  const result = await launchTest(options);
  expect(result.success).toBe(true);

  const testId = (result as SuccessfulTestResult).testId;
  try {
    const har = retrieveHAR(testId);
    expect(har).not.toBeNull();
    callback(har!);
  } finally {
    cleanupTestDirectory(testId);
  }
}

/**
 * Creates a static-file HTTP server that serves the given files from
 * the specified fixtures directory. Call `listen()` to start it.
 */
export function createStaticServer(
  fixturesDirPath: string,
  delay?: number
): Server {
  return createServer(async (req, res) => {
    if (req.url.startsWith('/')) {
      if (req.url === '/' || req.url === '/index.html') {
        try {
          const filePath = join(fixturesDirPath, 'index.html');
          const data = await readFile(filePath);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(data);
        } catch {
          res.writeHead(404);
          res.end('Not found');
        }
        return;
      }

      // Parse the URL
      const urlObject = new URL(`http://localhost${req.url}`);
      const filePath = join(fixturesDirPath, urlObject.pathname);

      try {
        const data = await readFile(filePath);
        const mimeTypes: Record<string, string> = {
          avif: 'image/avif',
          css: 'text/css',
          gif: 'image/gif',
          html: 'text/html',
          jpg: 'image/jpeg',
          js: 'text/javascript',
          jxl: 'image/jpeg-xl',
          png: 'image/png',
          webp: 'image/webp'
        };
        const ext = filePath.split('.').pop() ?? '';
        const contentType = mimeTypes[ext] ?? 'application/octet-stream';

        if (delay) {
          await sleep(delay); // Pause for delay milliseconds
        }

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    } else{
      res.writeHead(404);
      res.end('Not found');
    }
  });
}

export async function listenServer(srv: Server): Promise<string> {
  await new Promise<void>(resolve => srv.listen(0, '127.0.0.1', resolve));
  const addr = srv.address() as AddressInfo;
  return `http://127.0.0.1:${addr.port}`;
}

export async function shutdownServer(srv: Server): Promise<void> {
  await new Promise<void>(resolve => srv.close(() => resolve()));
}

