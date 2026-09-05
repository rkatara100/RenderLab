import type { PropCaptureMode, RenderLabConfig, RenderLabSDKError } from '@renderlab/shared-types';

export interface ResolvedConfig {
  apiKey: string;
  environment: string;
  endpoint: string;
  sampleRate: number;
  batch: { maxSize: number; flushIntervalMs: number; maxQueueBytes: number };
  ignore: { componentNames: Array<string | RegExp>; propKeys: string[] };
  capturePropValues: PropCaptureMode;
  maxPropDepth: number;
  maxPropStringLength: number;
  replay: { enabled: boolean; captureStateHooks: boolean };
  longTasks: { enabled: boolean };
  network: { enabled: boolean; ignoreUrls: Array<string | RegExp> };
  transport: 'fetch' | 'beacon';
  onError: (error: RenderLabSDKError) => void;
  enabled: boolean;
}

const DEFAULT_ENDPOINT = 'https://renderlab-production.up.railway.app';

export function resolveConfig(config: RenderLabConfig): ResolvedConfig {
  if (!config.apiKey) {
    throw new Error('RenderLab: config.apiKey is required');
  }
  const isDev = (config.environment ?? 'production') !== 'production';

  return {
    apiKey: config.apiKey,
    environment: config.environment ?? 'production',
    endpoint: config.endpoint ?? DEFAULT_ENDPOINT,
    sampleRate: config.sampleRate ?? (isDev ? 1 : 0.1),
    batch: {
      maxSize: config.batch?.maxSize ?? 250,
      flushIntervalMs: config.batch?.flushIntervalMs ?? 2000,
      maxQueueBytes: config.batch?.maxQueueBytes ?? 500_000,
    },
    ignore: {
      componentNames: config.ignore?.componentNames ?? [],
      propKeys: config.ignore?.propKeys ?? ['children'],
    },
    capturePropValues: config.capturePropValues ?? 'redacted',
    maxPropDepth: config.maxPropDepth ?? 1,
    maxPropStringLength: config.maxPropStringLength ?? 200,
    replay: {
      enabled: config.replay?.enabled ?? false,
      captureStateHooks: config.replay?.captureStateHooks ?? false,
    },
    longTasks: {
      enabled: config.longTasks?.enabled ?? true,
    },
    network: {
      enabled: config.network?.enabled ?? true,
      ignoreUrls: config.network?.ignoreUrls ?? [],
    },
    transport: config.transport ?? 'fetch',
    onError: config.onError ?? (() => {}),
    enabled: config.enabled ?? true,
  };
}
