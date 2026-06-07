"use client";

import { useRef, useState } from "react";
import { LogOut, MessageSquare, Plus, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import SceneGraph from "@/app/components/SceneGraph";
import type { LineGraph } from "@/lib/types/line-graph";
import type { SimulationResult } from "@/lib/types/simulation";
import type { ChangeComparison } from "@/lib/types/improvement";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Session = {
  id: string;
  title: string | null;
  updated_at: string;
};

const WELCOME: Message = {
  role: "assistant",
  content:
    "Hi! Describe your production line — the steps parts go through and how " +
    "many machines at each — and I'll lay it out as a flow on the right.",
};

export default function ChatApp({
  userEmail,
  initialSessions,
}: {
  userEmail: string;
  initialSessions: Session[];
}) {
  const supabase = createClient();

  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [lineGraph, setLineGraph] = useState<LineGraph | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [comparison, setComparison] = useState<ChangeComparison | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }

  async function loadSessions() {
    const { data } = await supabase
      .from("chat_sessions")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false });
    setSessions(data ?? []);
  }

  async function openSession(id: string) {
    const [{ data: msgs }, { data: graphRow }] = await Promise.all([
      supabase
        .from("messages")
        .select("role, content")
        .eq("session_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("line_graphs")
        .select("graph")
        .eq("session_id", id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setSessionId(id);
    setMessages(msgs && msgs.length > 0 ? (msgs as Message[]) : [WELCOME]);
    setLineGraph((graphRow?.graph as LineGraph) ?? null);
    setSimulation(null); // metrics are transient — re-run to see them again
    setComparison(null);
    scrollToBottom();
  }

  function newChat() {
    setSessionId(undefined);
    setMessages([WELCOME]);
    setLineGraph(null);
    setSimulation(null);
    setComparison(null);
    setInput("");
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);
    scrollToBottom();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Request failed");

      setSessionId(data.sessionId);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply || "(no response)" },
      ]);
      // A committed/rebuilt line supersedes any pending proposal.
      if (data.graph) {
        setLineGraph(data.graph as LineGraph);
        setComparison(null);
      }
      // A fresh what-if proposal takes over the scene.
      if (data.comparison) setComparison(data.comparison as ChangeComparison);
      // Show fresh metrics; if the line was rebuilt without a re-sim, the old
      // metrics are stale, so clear them.
      if (data.simulation) setSimulation(data.simulation as SimulationResult);
      else if (data.graph) setSimulation(null);
      loadSessions();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ ${detail}` },
      ]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }

  const activeTitle =
    sessions.find((s) => s.id === sessionId)?.title ?? "New chat";

  return (
    <SidebarProvider className="h-svh">
      <Sidebar>
        <SidebarHeader>
          <Button
            onClick={newChat}
            variant="outline"
            className="w-full justify-start gap-2"
          >
            <Plus className="size-4" />
            New chat
          </Button>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Chats</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {sessions.length === 0 && (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    No conversations yet.
                  </p>
                )}
                {sessions.map((s) => (
                  <SidebarMenuItem key={s.id}>
                    <SidebarMenuButton
                      isActive={s.id === sessionId}
                      onClick={() => openSession(s.id)}
                    >
                      <MessageSquare className="size-4" />
                      <span className="truncate">
                        {s.title || "Untitled chat"}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="truncate px-2 py-1 text-xs text-muted-foreground">
                {userEmail}
              </div>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <form action="/auth/signout" method="post">
                <SidebarMenuButton type="submit">
                  <LogOut className="size-4" />
                  Sign out
                </SidebarMenuButton>
              </form>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="flex h-svh flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <span className="truncate text-sm font-medium">{activeTitle}</span>
        </header>

        <ResizablePanelGroup orientation="horizontal" className="flex-1">
          <ResizablePanel
            defaultSize="50%"
            minSize="30%"
            className="flex h-full flex-col"
          >
            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-2xl space-y-4 p-4">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={m.role === "user" ? "text-right" : "text-left"}
                  >
                    <span
                      className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {m.content}
                    </span>
                  </div>
                ))}
                {loading && (
                  <div className="text-left">
                    <span className="inline-block rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground">
                      thinking…
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t p-4">
              <div className="mx-auto flex max-w-2xl gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Describe your line: cut → weld → paint → pack…"
                />
                <Button onClick={send} disabled={loading} size="icon">
                  <Send className="size-4" />
                </Button>
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize="50%" minSize="20%">
            <SceneGraph
              graph={lineGraph}
              simulation={simulation}
              comparison={comparison}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </SidebarInset>
    </SidebarProvider>
  );
}
