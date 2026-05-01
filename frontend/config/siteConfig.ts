import { Metadata } from "next";

const { title, description, ogImage, baseURL, socials } = {
  title: "HeyHomieAI",
  description:
    "HeyHomieAI is the crypto-savvy friend in your pocket. We explain the move, simulate the outcome, and only then help you act.",
  baseURL: "https://heyhomie.fun",
  ogImage: "https://heyhomie.fun/open-graph.png",
  socials: {
    xHandle: "HeyHomieAI",
    xUrl: "https://x.com/HeyHomieAI",
    githubOrg: "HeyHomieAI",
    linkedinUrl: "https://www.linkedin.com/company/heyhomieai/",
  },
};

export const siteConfig: Metadata = {
  title: {
    default: title,
    template: `%s | ${socials.xHandle}`,
  },
  description,
  metadataBase: new URL(baseURL),
  openGraph: {
    title,
    description,
    images: [ogImage],
    url: baseURL,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [ogImage],
    creator: `@${socials.xHandle}`,
  },
  icons: {
    icon: "/favicon.ico",
  },
  applicationName: title,
  alternates: {
    canonical: baseURL,
  },
  keywords: [
    "Solana",
    "DeFi",
    "Investing",
    "Risk",
    "Jupiter",
    "Kamino",
    "HeyHomieAI",
  ],
};