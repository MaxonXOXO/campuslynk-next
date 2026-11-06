import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Noto_Sans_Malayalam } from "next/font/google";
import { ThemeProvider, TooltipProvider, Toaster, cn } from "@academic-suite/ui";
import "./globals.css";
import { SessionProvider } from "@/lib/auth/session-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const fontMalayalam = Noto_Sans_Malayalam({
  subsets: ["malayalam"],
  variable: "--font-malayalam",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Academic Suite",
  description: "Multi-tenant Academic Management System (CampusLynk / Carmel LINX)",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased font-sans",
        inter.variable,
        fontMono.variable,
        fontMalayalam.variable
      )}
    >
      <body suppressHydrationWarning className="min-h-screen bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            <SessionProvider>{children}</SessionProvider>
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
