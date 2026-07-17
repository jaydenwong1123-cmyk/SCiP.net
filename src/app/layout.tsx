import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SCiP.net // Secure Terminal",
  description: "SCP Foundation roleplay member terminal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
