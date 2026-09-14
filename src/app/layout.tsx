import type { Metadata, Viewport } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import "./social-polish.css";

const canonicalUrl = "https://vietnamsocial.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(canonicalUrl),
  title: "Vietnam Social — Bản đồ sống về cộng đồng Việt Nam",
  description:
    "Khám phá bài đăng địa phương, cộng đồng, hoạt động và những địa điểm đang có đời sống xã hội quanh bạn.",
  applicationName: "Vietnam Social",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Vietnam Social — Bản đồ sống về cộng đồng Việt Nam",
    description:
      "Khám phá đời sống xã hội theo địa điểm: bài đăng, cộng đồng, hoạt động và nơi chốn.",
    url: canonicalUrl,
    siteName: "Vietnam Social",
    locale: "vi_VN",
    type: "website",
  },
  // HCMC is still a pilot. Search indexing is enabled only after an explicit launch decision.
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
      <body>{children}</body>
    </html>
  );
}
