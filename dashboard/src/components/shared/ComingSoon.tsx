export function ComingSoon({ title, phase }: { title: string; phase: string }): React.JSX.Element {
  return (
    <div className="page">
      <header className="page__header">
        <h1>{title}</h1>
      </header>
      <p className="coming-soon">
        {phase} builds this view. Route and nav entry exist now so the shell is fully navigable.
      </p>
    </div>
  );
}
