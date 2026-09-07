'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSettingsStore } from '../../../stores/useSettingsStore';

interface CreateProjectResponse {
  id: string;
  ingestKey: string;
  dashboardKey: string;
}

export default function SignupPage(): React.JSX.Element {
  const { apiBaseUrl, setApiBaseUrl, setApiKey, setProjectId } = useSettingsStore();
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdKeys, setCreatedKeys] = useState<CreateProjectResponse | null>(null);
  const [copiedKey, setCopiedKey] = useState<'ingest' | 'dashboard' | null>(null);

  const copyKey = (key: 'ingest' | 'dashboard', value: string): void => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage(null);

    const form = new FormData(e.currentTarget);
    const nameValue = form.get('name');
    const emailValue = form.get('email');
    const apiBaseUrlValue = form.get('apiBaseUrl');
    const name = typeof nameValue === 'string' ? nameValue : '';
    const email = typeof emailValue === 'string' ? emailValue : '';
    const baseUrl = typeof apiBaseUrlValue === 'string' ? apiBaseUrlValue : apiBaseUrl;

    try {
      const response = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setErrorMessage(body.error ?? `Request failed with status ${response.status}.`);
        setStatus('error');
        return;
      }

      const project = (await response.json()) as CreateProjectResponse;
      setApiBaseUrl(baseUrl);
      setApiKey(project.dashboardKey);
      setProjectId(project.id);
      setCreatedKeys(project);
      setStatus('idle');
    } catch {
      setErrorMessage('Could not reach the RenderLab API. Check the API base URL.');
      setStatus('error');
    }
  };

  if (createdKeys) {
    return (
      <div className="page">
        <header className="page__header">
          <h1>You&rsquo;re all set</h1>
        </header>
        <p>Two keys, two different jobs — copy both now, they&rsquo;re shown only once:</p>
        <p>
          <strong>Ingest key</strong> — give this to your app&rsquo;s RenderLab SDK. It can only send
          data in, never read it back.
        </p>
        <p className="settings-form__status">
          <code>{createdKeys.ingestKey}</code>{' '}
          <button type="button" onClick={() => copyKey('ingest', createdKeys.ingestKey)}>
            {copiedKey === 'ingest' ? 'Copied' : 'Copy'}
          </button>
        </p>
        <p>
          <strong>Dashboard key</strong> — what this dashboard uses to read your data. Already saved
          to Settings in this browser; never put this one in your app&rsquo;s code.
        </p>
        <p className="settings-form__status">
          <code>{createdKeys.dashboardKey}</code>{' '}
          <button type="button" onClick={() => copyKey('dashboard', createdKeys.dashboardKey)}>
            {copiedKey === 'dashboard' ? 'Copied' : 'Copy'}
          </button>
        </p>
        <p>
          Pass the ingest key to the SDK&rsquo;s <code>init({'{'} apiKey {'}'})</code>, or head to{' '}
          <Link href="/settings">Settings</Link> to confirm the dashboard key is there.
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page__header">
        <h1>Create a project</h1>
      </header>
      <p>Get an API key for your app&rsquo;s RenderLab SDK.</p>
      <form onSubmit={(e) => void handleSubmit(e)} className="settings-form">
        <label htmlFor="name">Project name</label>
        <input id="name" name="name" type="text" required maxLength={200} />

        <label htmlFor="email">Owner email</label>
        <input id="email" name="email" type="email" required maxLength={320} />

        <label htmlFor="apiBaseUrl">API base URL</label>
        <input id="apiBaseUrl" name="apiBaseUrl" type="url" defaultValue={apiBaseUrl} required />

        <button type="submit" disabled={status === 'loading'}>
          {status === 'loading' ? 'Creating…' : 'Create project'}
        </button>
        {errorMessage ? (
          <p role="alert" className="settings-form__status">
            {errorMessage}
          </p>
        ) : null}
      </form>
    </div>
  );
}
