import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KallpaModulo',
  description: 'Motor de ajedrez KallpaModulo — Interfaz Web',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-base text-slate-100 min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
