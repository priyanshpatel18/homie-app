"use client";

import {
  PanelLeftCloseIcon,
  PanelLeftIcon,
  PlusSignIcon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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

interface ChatSidebarProps {
  onNewChat: () => void;
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
      <SidebarHeader className="px-3 py-3">
        <SidebarBrand />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={onNewChat}
                tooltip="New chat"
                className="gap-3 text-sidebar-foreground/85 hover:bg-sidebar-accent"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-sidebar-primary/15 text-sidebar-primary ring-1 ring-sidebar-primary/30">
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
            <p className="flex items-center gap-2 text-[13px] text-sidebar-foreground/45">
              <HugeiconsIcon icon={Wallet01Icon} size={14} strokeWidth={1.5} />
              <span>Connect wallet to save history</span>
            </p>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Connect Wallet"
              className="gap-2.5 rounded-xl border border-sidebar-border bg-sidebar-accent/40 hover:border-sidebar-foreground/20 hover:bg-sidebar-accent"
            >
              <HugeiconsIcon icon={Wallet01Icon} size={16} strokeWidth={1.5} />
              <span>Connect Wallet</span>
              <span className="ml-auto font-mono text-[11px] text-sidebar-foreground/35 group-data-[collapsible=icon]:hidden">
                ↕
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
