import type { Metadata } from 'next';
import { Instrument_Serif, Inter } from 'next/font/google';
import './globals.css';

const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', variable: '--font-serif' });
const sans = Inter({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--font-sans' });

export const metadata: Metadata = { title: 'US Water Pros CRM', robots: { index: false, follow: false } };
// Render at request time so the build doesn't need Supabase env vars.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
