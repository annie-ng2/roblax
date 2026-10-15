import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext", "vietnamese"] });

export const metadata: Metadata = {
  title: "Xếp hình",
  description: "Trò chơi xếp khối trên bảng 10×10: kéo khối vào bảng, lấp đầy hàng hoặc cột để xoá.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1026",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className={geistSans.variable}>{children}</body>
    </html>
  );
}
