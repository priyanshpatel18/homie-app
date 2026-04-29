import type { MetadataRoute } from "next";

const { appName, description } = {
  appName: "Homie",
  description:
    "The crypto-savvy friend in your pocket. We explain the move, simulate the outcome, and only then help you act.",
};

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appName,
    short_name: appName,
    description: description,
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#00F666",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
      {
        src: "/homie/mainlogo.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}