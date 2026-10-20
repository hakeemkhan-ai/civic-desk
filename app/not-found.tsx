import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="empty">
      <h1>Page not found</h1>
      <Link href="/">Go to community reports</Link>
    </div>
  );
}
