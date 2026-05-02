"use client";

import { Wallet01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePrivy } from "@privy-io/react-auth";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

import { ConnectButton } from "./connect-button";

function shortAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function SidebarConnect() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { ready, authenticated, login, user } = usePrivy();

  if (collapsed) {
    const wallet = (user?.wallet as { address?: string } | undefined)?.address;
    const label = wallet ? shortAddress(wallet) : "Connect";
    return (
      <SidebarMenu className="items-center">
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => (authenticated ? null : login())}
            disabled={!ready}
            tooltip={authenticated ? label : "Connect wallet"}
            className="text-sidebar-foreground/85 hover:bg-sidebar-accent"
          >
            <HugeiconsIcon icon={Wallet01Icon} size={16} strokeWidth={1.5} />
            <span className="truncate">{authenticated ? label : "Connect"}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <div className="px-1 py-1">
      <ConnectButton variant="primary" className="w-full" />
    </div>
  );
}
