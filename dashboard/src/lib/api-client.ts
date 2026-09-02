import { useSettingsStore } from '../stores/useSettingsStore';

export class ApiError extends Error {
  readonly status: number | undefined;
  readonly isNetworkError: boolean;

  constructor(message: string, options: { status?: number; isNetworkError?: boolean } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.isNetworkError = options.isNetworkError ?? false;
  }
}

/**
 * Every dashboard read goes through this. Distinguishes "no key configured"
 * (points the user at Settings), a network failure (offline/API
 * unreachable), and an HTTP error status — each renders a different message
 * in ErrorState rather than one generic "something went wrong".
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiBaseUrl, apiKey } = useSettingsStore.getState();
  if (!apiKey) {
    throw new ApiError('No API key configured. Add one in Settings to load data.');
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${apiKey}` },
    });
  } catch {
    throw new ApiError(
      'Could not reach the RenderLab API. Check your connection or API base URL.',
      {
        isNetworkError: true,
      },
    );
  }

  if (response.status === 401) {
    throw new ApiError('That API key was rejected. Check it in Settings.', { status: 401 });
  }
  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}.`, {
      status: response.status,
    });
  }
  return (await response.json()) as T;
}
