import type { SessionSummary } from '@renderlab/shared-types';

export interface SessionPickerProps {
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  onChange: (sessionId: string | null) => void;
}

export function SessionPicker({
  sessions,
  selectedSessionId,
  onChange,
}: SessionPickerProps): React.JSX.Element {
  return (
    <select
      aria-label="Session"
      value={selectedSessionId ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      {sessions.map((session) => (
        <option key={session.id} value={session.id}>
          {session.isLive ? '🟢 ' : ''}
          {session.url ?? session.id} — {new Date(session.startedAt).toLocaleString()}
        </option>
      ))}
    </select>
  );
}
