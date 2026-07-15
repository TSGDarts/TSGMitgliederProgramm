import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { site } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: `${site.clubName} ${site.section}`,
    template: `%s · ${site.clubName} ${site.section}`,
  },
  description: `Mitglieder- und Infoportal der ${site.fullName}.`,
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "TSG Dart",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#c8102e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Gespeichertes Design (hell/dunkel) vor dem ersten Anzeigen setzen */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}',
          }}
        />
        {children}
      </body>
    </html>
  );
}
