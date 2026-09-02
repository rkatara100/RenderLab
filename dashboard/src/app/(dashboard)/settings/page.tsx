'use client';

import { useState } from 'react';
import { useSettingsStore } from '../../../stores/useSettingsStore';

export default function SettingsPage(): React.JSX.Element {
  const { apiBaseUrl, apiKey, setApiBaseUrl, setApiKey } = useSettingsStore();
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const apiBaseUrlValue = form.get('apiBaseUrl');
    const apiKeyValue = form.get('apiKey');
    setApiBaseUrl(typeof apiBaseUrlValue === 'string' ? apiBaseUrlValue : '');
    setApiKey(typeof apiKeyValue === 'string' ? apiKeyValue : '');
    setSavedMessage('Saved.');
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>Settings</h1>
      </header>
      <p>
        RenderLab has no multi-user login yet (ARCHITECTURE.md §3.5) — the dashboard authenticates
        to the API with the same project API key your app&rsquo;s SDK uses. Paste it below;
        it&rsquo;s stored only in this browser.
      </p>
      <form onSubmit={handleSubmit} className="settings-form">
        <label htmlFor="apiBaseUrl">API base URL</label>
        <input id="apiBaseUrl" name="apiBaseUrl" type="url" defaultValue={apiBaseUrl} required />

        <label htmlFor="apiKey">Project API key</label>
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
    </div>
  );
}
