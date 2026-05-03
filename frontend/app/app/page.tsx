import { AppShell } from "@/components/app/app-shell";
import { isAppTab, type AppTab } from "@/components/app/tabs";

export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const initialTab: AppTab = isAppTab(raw) ? raw : "home";
  return <AppShell initialTab={initialTab} />;
}
