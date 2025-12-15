import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { ErrorBoundary } from "@/components/error-boundary";
import { VantaBackground } from "@/components/vanta-background";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DeFidle - Daily DeFi Quiz",
  description: "A daily DeFi quiz to test your knowledge of protocols, chains, TVL, and more!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${nunito.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <VantaBackground />
          <ErrorBoundary>{children}</ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
