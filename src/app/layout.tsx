import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pet Renaissance | Turn Your Pet Into a Masterpiece",
  description: "Transform your beloved pet into a stunning Renaissance oil painting portrait. Upload a photo and watch the magic happen.",
  keywords: ["pet portrait", "renaissance art", "pet painting", "oil painting", "pet masterpiece"],
  openGraph: {
    title: "Pet Renaissance | Turn Your Pet Into a Masterpiece",
    description: "Transform your beloved pet into a stunning Renaissance oil painting portrait.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-renaissance antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
