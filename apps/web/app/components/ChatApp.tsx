"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { LogOut, MessageSquare, Plus, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
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

function ChatComposer({
  value,
  onChange,
  onSend,
  loading,
  centered = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  loading: boolean;
  centered?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    resizeTextarea(textareaRef);
  }, [value]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  return (
    <div
      className={`mx-auto w-full max-w-2xl animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ${
        centered ? "px-4" : ""
      }`}
    >
      <div
        className={`relative rounded-lg border border-input bg-background transition-all duration-200 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30 ${
          loading ? "opacity-70" : ""
        }`}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your line: cut -> weld -> paint -> pack..."
          rows={1}
          disabled={loading}
          className="block max-h-48 min-h-11 w-full min-w-0 resize-none overflow-y-auto bg-transparent py-2.5 pr-12 pl-3 text-base leading-6 transition-[height] duration-150 outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed md:text-sm"
        />
        <Button
          onClick={onSend}
          disabled={loading || value.trim().length === 0}
          size="icon"
          className="absolute right-1.5 bottom-1.5 size-8 transition-transform duration-150 hover:scale-105 active:scale-95"
          aria-label="Send message"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function resizeTextarea(ref: RefObject<HTMLTextAreaElement | null>) {
  const textarea = ref.current;
  if (!textarea) return;

  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 192)}px`;
}

export default function ChatApp({
  userEmail,
  initialSessions,
}: {
  userEmail: string;
  initialSessions: Session[];
}) {
  const supabase = createClient();

  const [messages, setMessages] = useState<Message[]>([]);
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
    setMessages((msgs as Message[] | null) ?? []);
    setLineGraph((graphRow?.graph as LineGraph) ?? null);
    setSimulation(null); // metrics are transient — re-run to see them again
    setComparison(null);
    scrollToBottom();
  }

  function newChat() {
    setSessionId(undefined);
    setMessages([]);
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
  const hasScene = Boolean(comparison?.variant_graph ?? lineGraph);
  const isEmptyChat = messages.length === 0 && !loading;
  const composer = (
    <ChatComposer
      value={input}
      onChange={setInput}
      onSend={send}
      loading={loading}
    />
  );

  const chatPanel = (
    <div className="flex h-full flex-col">
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto ${isEmptyChat ? "flex items-center" : ""}`}
      >
        {isEmptyChat ? (
          <div className="w-full -translate-y-10 animate-in fade-in-0 zoom-in-95 duration-300">
            <ChatComposer
              value={input}
              onChange={setInput}
              onSend={send}
              loading={loading}
              centered
            />
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4 p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ${
                  m.role === "user" ? "text-right" : "text-left"
                }`}
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
              <div className="animate-in fade-in-0 slide-in-from-bottom-1 text-left duration-200">
                <span className="inline-block rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground">
                  thinking...
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {!isEmptyChat && (
        <div className="shrink-0 border-t p-4">
          {composer}
        </div>
      )}
    </div>
  );

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

        {hasScene ? (
          <ResizablePanelGroup
            orientation="horizontal"
            className="flex-1 animate-in fade-in-0 duration-300"
          >
            <ResizablePanel defaultSize={50} minSize={30}>
              {chatPanel}
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={50} minSize={20}>
              <SceneGraph
                graph={lineGraph}
                simulation={simulation}
                comparison={comparison}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <main className="flex-1">{chatPanel}</main>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
