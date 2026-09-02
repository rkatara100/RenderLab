export function LoadingState({ label = 'Loading…' }: { label?: string }): React.JSX.Element {
  return (
    <div className="state-panel state-panel--loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}
