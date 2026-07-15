import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

// Web-App-Manifest: macht die Website auf dem Handy "installierbar"
// (eigenes Icon + Vollbild ohne Browserleiste).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.clubName} ${site.section}`,
    short_name: "TSG Dart",
    description: `Mitglieder-App der ${site.fullName}`,
    start_url: "/mitglieder",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#c8102e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
