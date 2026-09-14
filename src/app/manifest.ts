import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vietnam Social",
    short_name: "Vietnam Social",
    description: "Hoạt động gần bạn trong vài giờ tới",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#d8f36a",
    lang: "vi",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
