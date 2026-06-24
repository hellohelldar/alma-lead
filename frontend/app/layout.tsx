import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

// Poppins — a friendly rounded geometric sans close to Alma's brand type.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Alma — Immigration Counsel",
  description:
    "Alma helps you understand your immigration options. Share a few details and our attorneys will reach out.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${poppins.variable} h-full`}>
      <body className="flex min-h-full flex-col antialiased">{children}</body>
    </html>
  );
}
