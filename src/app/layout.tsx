import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NECHIMOTOS · Gestion de Matriculas',
  description: 'Plataforma interna de tramites de matricula, SOAT y RUNT.',
  robots: { index: false, follow: false, nocache: true },
  applicationName: 'NECHIMOTOS',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO" suppressHydrationWarning>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
