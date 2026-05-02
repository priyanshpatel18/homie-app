"use client";

import * as React from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AmbientGrid } from "./ambient-grid";
import { ChatSidebar } from "./chat-sidebar";
import { ChatView } from "./chat-view";

const SIDEBAR_STYLE = {
  "--sidebar-width": "16.75rem",
  "--sidebar-width-icon": "4.25rem",
} as React.CSSProperties;

export function ChatShell() {
  const [convoKey, setConvoKey] = React.useState(0);

  return (
    <TooltipProvider delay={150}>
      <SidebarProvider style={SIDEBAR_STYLE}>
        <ChatSidebar onNewChat={() => setConvoKey((k) => k + 1)} />
        <SidebarInset className="relative bg-transparent">
          <AmbientGrid />
          <ChatView key={convoKey} />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
