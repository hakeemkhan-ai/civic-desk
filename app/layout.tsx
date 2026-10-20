import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import 'leaflet/dist/leaflet.css';
import '../client/styles.css';
import CivicDesk from '../client/CivicDesk';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Civic Desk · Hyderabad',
  description: 'An independent Hyderabad demonstration for reporting and following community issues.',
  icons: { icon: '/charminar.svg' },
};

export const viewport: Viewport = { themeColor: '#173d35' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Nonces are generated per request by the security proxy, so this layout must
  // render at request time for Next to nonce its bootstrap scripts.
  await headers();
  return (
    <html lang="en">
      <body>
        <CivicDesk>{children}</CivicDesk>
      </body>
    </html>
  );
}
