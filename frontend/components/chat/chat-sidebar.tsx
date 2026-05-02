"use client";

import {
  PanelLeftCloseIcon,
  PanelLeftIcon,
  PlusSignIcon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePrivy } from "@privy-io/react-auth";
import Image from "next/image";
import Link from "next/link";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

import { SidebarConnect } from "./sidebar-connect";

interface ChatSidebarProps {
  onNewChat: () => void;
}

function RecentsEmptyState() {
  const { ready, authenticated } = usePrivy();

  if (!ready) return null;

  if (!authenticated) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-sidebar-foreground/45">
        <HugeiconsIcon icon={Wallet01Icon} size={14} strokeWidth={1.5} />
        <span>Connect wallet to save history</span>
      </p>
    );
  }

  return (
    <p className="text-[13px] text-sidebar-foreground/45">
      No conversations yet. Ask Homie anything to get started.
    </p>
  );
}

function SidebarBrand() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Expand sidebar"
        className="group relative grid size-8 place-items-center rounded-md transition hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
      >
        <span className="relative size-6 transition-opacity duration-200 group-hover:opacity-0 group-focus-visible:opacity-0">
          <Image
            src="/homie/mainlogo.svg"
            alt="HeyHomie"
            fill
            priority
            className="object-contain"
          />
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 grid place-items-center text-sidebar-foreground/60 opacity-0 transition-opacity duration-200 group-hover:text-sidebar-foreground group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <HugeiconsIcon icon={PanelLeftIcon} size={22} strokeWidth={1.5} />
        </span>
      </button>
    );
  }

  return (
    <div className="flex w-full items-center justify-between gap-2">
      <Link
        href="/"
        aria-label="HeyHomieAI home"
        className="inline-flex items-center gap-2.5 rounded-md p-1 transition hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
      >
        <span className="relative inline-block size-6 shrink-0">
          <Image
            src="/homie/mainlogo.svg"
            alt="HeyHomie"
            fill
            priority
            className="object-contain"
          />
        </span>
      </Link>

      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Collapse sidebar"
        className="grid size-8 place-items-center rounded-md text-sidebar-foreground/55 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
      >
        <HugeiconsIcon icon={PanelLeftCloseIcon} size={22} strokeWidth={1.5} />
      </button>
    </div>
  );
}

export function ChatSidebar({ onNewChat }: ChatSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-2 pt-4 group-data-[collapsible=icon]:items-center">
        <SidebarBrand />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-2 group-data-[collapsible=icon]:items-center">
          <SidebarMenu className="group-data-[collapsible=icon]:items-center">
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={onNewChat}
                tooltip="New chat"
                className="gap-3 text-sidebar-foreground/85 hover:bg-sidebar-accent"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-sidebar-primary/15 text-sidebar-primary ring-1 ring-sidebar-primary/30 group-data-[collapsible=icon]:size-4 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:ring-0">
                  <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} />
                </span>
                <span>New chat</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup className="mt-2 group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel className="text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/35">
            Recents
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-2">
            <RecentsEmptyState />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2 group-data-[collapsible=icon]:items-center">
        <SidebarConnect />
      </SidebarFooter>
    </Sidebar>
  );
}
