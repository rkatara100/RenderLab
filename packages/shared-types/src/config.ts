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

export interface RenderLabLongTaskConfig {
  enabled?: boolean;
}

export interface RenderLabNetworkConfig {
  enabled?: boolean;

  ignoreUrls?: Array<string | RegExp>;
}

export type PropCaptureMode = 'full' | 'redacted' | 'off';

export interface RenderLabSDKError {
  message: string;
  cause?: unknown;
}

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
  longTasks?: RenderLabLongTaskConfig;
  network?: RenderLabNetworkConfig;
  transport?: 'fetch' | 'beacon';
  onError?: (error: RenderLabSDKError) => void;
  enabled?: boolean;
}
