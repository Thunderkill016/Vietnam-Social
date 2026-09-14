import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "Vietnam Social — Một cuộc hẹn ở ngay gần bạn",
  description:
    "Khám phá hoạt động trong vài giờ tới quanh Gò Vấp, Phú Nhuận và Tân Bình.",
  applicationName: "Vietnam Social",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#d8f36a",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
