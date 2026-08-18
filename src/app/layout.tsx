import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZT Lounge Admin",
  description: "Admin control center for ZT Lounge Meru — bookings, menu, CMS and analytics.",
  icons: { icon: "/images/logo/zt-lounge-logo.png" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-ink text-stone-100 antialiased">
        <Providers>
          <AuthProvider>
            {children}
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
