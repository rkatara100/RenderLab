'use client';

import { useState } from 'react';
import { useSettingsStore } from '../../../stores/useSettingsStore';
import { useUIStore } from '../../../stores/useUIStore';

interface RotateResponse {
  id: string;
  ingestKey: string;
  dashboardKey: string;
}

export default function SettingsPage(): React.JSX.Element {
  const { apiBaseUrl, apiKey, projectId, setApiBaseUrl, setApiKey } = useSettingsStore();
  const showToast = useUIStore((s) => s.showToast);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [rotatedIngestKey, setRotatedIngestKey] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const apiBaseUrlValue = form.get('apiBaseUrl');
    const apiKeyValue = form.get('apiKey');
    setApiBaseUrl(typeof apiBaseUrlValue === 'string' ? apiBaseUrlValue : '');
    setApiKey(typeof apiKeyValue === 'string' ? apiKeyValue : '');
    setSavedMessage('Saved.');
  };

  const handleRotate = async (): Promise<void> => {
    if (!projectId) {
      showToast({
        variant: 'error',
        message: 'No project id on file. Sign in with a dashboard key issued after this update, or create a new project.',
      });
      return;
    }
    if (
      !window.confirm(
        'Rotating immediately invalidates both the current ingest and dashboard keys. ' +
          'Your SDK will stop sending data until it is redeployed with the new ingest key. Continue?',
      )
    ) {
      return;
    }

    setRotating(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}/rotate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        showToast({ variant: 'error', message: body.error ?? `Rotation failed (${response.status}).` });
        return;
      }
      const rotated = (await response.json()) as RotateResponse;
      setApiKey(rotated.dashboardKey);
      setRotatedIngestKey(rotated.ingestKey);
      showToast({ variant: 'success', message: 'Keys rotated. Copy the new ingest key below.' });
    } catch {
      showToast({ variant: 'error', message: 'Could not reach the RenderLab API to rotate keys.' });
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>Settings</h1>
      </header>
      <p>
        RenderLab has no multi-user login yet (ARCHITECTURE.md §3.5) — the dashboard authenticates
        with your project&rsquo;s <strong>dashboard key</strong>, a different key from the one your
        app&rsquo;s SDK uses to send data. Paste it below; it&rsquo;s stored only in this browser.
      </p>
      <form onSubmit={handleSubmit} className="settings-form">
        <label htmlFor="apiBaseUrl">API base URL</label>
        <input id="apiBaseUrl" name="apiBaseUrl" type="url" defaultValue={apiBaseUrl} required />

        <label htmlFor="apiKey">Dashboard key</label>
        <input
          id="apiKey"
          name="apiKey"
          type="password"
          defaultValue={apiKey}
          autoComplete="off"
          required
        />

        <button type="submit">Save</button>
        {savedMessage ? (
          <p role="status" className="settings-form__status">
            {savedMessage}
          </p>
        ) : null}
      </form>

      <h2>Key rotation</h2>
      <p>
        If your ingest key has leaked (e.g. it was pasted somewhere public), rotate it here. This
        immediately invalidates both existing keys and issues new ones — your app&rsquo;s SDK will
        need to be redeployed with the new ingest key before it can send data again.
      </p>
      <button type="button" onClick={() => void handleRotate()} disabled={rotating || !projectId}>
        {rotating ? 'Rotating…' : 'Rotate keys'}
      </button>
      {!projectId ? (
        <p className="settings-form__status">
          No project id on file for this dashboard key — rotation is unavailable until you sign in
          via a project created after this update, or create a new project.
        </p>
      ) : null}
      {rotatedIngestKey ? (
        <p className="settings-form__status">
          New ingest key (shown once — update your app&rsquo;s SDK config now):{' '}
          <code>{rotatedIngestKey}</code>
        </p>
      ) : null}
    </div>
  );
}
