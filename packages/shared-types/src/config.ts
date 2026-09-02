export interface RenderLabBatchConfig {
  maxSize?: number;
  flushIntervalMs?: number;
  maxQueueBytes?: number;
}

export interface RenderLabIgnoreConfig {
  componentNames?: Array<string | RegExp>;
  propKeys?: string[];
}

export interface RenderLabReplayConfig {
  enabled: boolean;
  captureStateHooks?: boolean;
}

export type PropCaptureMode = 'full' | 'redacted' | 'off';

export interface RenderLabSDKError {
  message: string;
  cause?: unknown;
}

/**
 * Public SDK configuration. See ARCHITECTURE.md section 4.1 for defaults and
 * the reasoning behind each field (e.g. why props are redacted by default,
 * why sampling differs between dev and prod).
 */
export interface RenderLabConfig {
  apiKey: string;
  environment?: string;
  endpoint?: string;
  sampleRate?: number;
  batch?: RenderLabBatchConfig;
  ignore?: RenderLabIgnoreConfig;
  capturePropValues?: PropCaptureMode;
  maxPropDepth?: number;
  maxPropStringLength?: number;
  replay?: RenderLabReplayConfig;
  transport?: 'fetch' | 'beacon';
  onError?: (error: RenderLabSDKError) => void;
  enabled?: boolean;
}
