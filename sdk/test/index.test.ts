import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SDK_VERSION } from '../src/index.js';

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')) as {
  version: string;
};

describe('@renderlab/sdk', () => {
  it('SDK_VERSION matches package.json so telemetry reports the real release', () => {
    expect(SDK_VERSION).toBe(pkg.version);
  });
});
