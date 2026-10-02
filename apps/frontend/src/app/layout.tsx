import type { Metadata } from 'next';
import { Montserrat, JetBrains_Mono } from 'next/font/google';
import { ReactQueryProvider } from '@/providers/react-query-provider';
import { AppProviders } from '@/providers/app-providers';
import './globals.css';

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: {
    default: 'Flacron Lead Agent',
    template: '%s · Flacron Lead Agent',
  },
  description:
    'Lead generation. AI qualification. Smart conversion. Find it. Qualify it. Close it.',
  applicationName: 'Flacron Lead Agent',
  icons: {
    icon: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${montserrat.variable} ${jetbrainsMono.variable} font-sans`}
        suppressHydrationWarning
      >
        <ReactQueryProvider>
          <AppProviders>{children}</AppProviders>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
