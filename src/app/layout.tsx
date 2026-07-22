import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Worksheet Maker - Notebook Edition",
  description: "Create premium quizzes and worksheets with 3D Neumorphic Notebook aesthetics",
  icons: {
    icon: "/images/sayuna_logo.png",
    shortcut: "/images/sayuna_logo.png",
    apple: "/images/sayuna_logo.png",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
