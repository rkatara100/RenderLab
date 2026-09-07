import Link from 'next/link';

export default function NotFound(): React.JSX.Element {
  return (
    <div style={{ padding: '4rem 2rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h1>Page not found</h1>
      <p>That route doesn&rsquo;t exist.</p>
      <Link href="/tree">Back to Component Tree</Link>
    </div>
  );
}
