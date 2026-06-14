import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KallpaModulo',
  description: 'Motor de ajedrez KallpaModulo — Interfaz Web',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html:
          `(function(){try{var t=localStorage.getItem('theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})()` }} />
      </head>
      <body className="bg-base text-fg min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
