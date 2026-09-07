import Link from 'next/link';

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

const MISSING_KEY_PATTERN = /no api key configured/i;
const REJECTED_KEY_PATTERN = /was rejected/i;

export function ErrorState({ message, onRetry }: ErrorStateProps): React.JSX.Element {
  const isMissingKey = MISSING_KEY_PATTERN.test(message);
  const isRejectedKey = REJECTED_KEY_PATTERN.test(message);

  return (
    <div className="state-panel state-panel--error" role="alert">
      <p className="state-panel__title">
        {isMissingKey || isRejectedKey ? 'No data to show yet' : 'Something went wrong'}
      </p>
      <p className="state-panel__description">{message}</p>
      <div className="state-panel__actions">
        {isMissingKey ? (
          <>
            <Link href="/signup">Create a project</Link>
            <Link href="/settings">I already have a key</Link>
          </>
        ) : null}
        {isRejectedKey ? <Link href="/settings">Update key in Settings</Link> : null}
        {onRetry ? (
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}
