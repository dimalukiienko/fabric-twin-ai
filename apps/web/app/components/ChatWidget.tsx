"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
  content: "Hi! Ask me what time it is anywhere.",
};

export default function ChatWidget() {
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [sessions, setSessions] = useState<Session[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  const loadSessions = useCallback(async () => {
    const { data } = await supabase
      .from("chat_sessions")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false });
    setSessions(data ?? []);
  }, [supabase]);

  function toggleOpen() {
    setOpen((wasOpen) => {
      if (!wasOpen) loadSessions();
      return !wasOpen;
    });
  }

  async function openSession(id: string) {
    const { data } = await supabase
      .from("messages")
      .select("role, content")
      .eq("session_id", id)
      .order("created_at", { ascending: true });

    setSessionId(id);
    setMessages(
      data && data.length > 0 ? (data as Message[]) : [WELCOME],
    );
    setView("chat");
  }

  function newChat() {
    setSessionId(undefined);
    setMessages([WELCOME]);
    setView("chat");
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

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
      loadSessions();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ ${detail}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[28rem] w-80 flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl dark:border-white/15 dark:bg-neutral-900">
          <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
            <span className="text-sm font-semibold">Time Assistant</span>
            <div className="flex items-center gap-2 text-neutral-400">
              <button
                onClick={newChat}
                className="hover:text-neutral-600 dark:hover:text-neutral-200"
                aria-label="New chat"
                title="New chat"
              >
                ＋
              </button>
              <button
                onClick={() => setView(view === "history" ? "chat" : "history")}
                className="hover:text-neutral-600 dark:hover:text-neutral-200"
                aria-label="Chat history"
                title="History"
              >
                🕘
              </button>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="hover:text-neutral-600 dark:hover:text-neutral-200"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  ⎋
                </button>
              </form>
              <button
                onClick={() => setOpen(false)}
                className="hover:text-neutral-600 dark:hover:text-neutral-200"
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>
          </div>

          {view === "history" ? (
            <div className="flex-1 overflow-y-auto p-2">
              {sessions.length === 0 ? (
                <p className="p-4 text-center text-sm text-neutral-400">
                  No conversations yet.
                </p>
              ) : (
                sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => openSession(s.id)}
                    className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10 ${
                      s.id === sessionId ? "bg-black/5 dark:bg-white/10" : ""
                    }`}
                  >
                    {s.title || "Untitled chat"}
                  </button>
                ))
              )}
            </div>
          ) : (
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={m.role === "user" ? "text-right" : "text-left"}
                >
                  <span
                    className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                      m.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-black/5 text-neutral-800 dark:bg-white/10 dark:text-neutral-100"
                    }`}
                  >
                    {m.content}
                  </span>
                </div>
              ))}
              {loading && (
                <div className="text-left">
                  <span className="inline-block rounded-2xl bg-black/5 px-3 py-2 text-sm text-neutral-500 dark:bg-white/10">
                    thinking…
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 border-t border-black/10 p-3 dark:border-white/10">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="What time is it in Tokyo?"
              className="flex-1 rounded-full border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-white/15"
            />
            <button
              onClick={send}
              disabled={loading}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      )}

      <button
        onClick={toggleOpen}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-2xl text-white shadow-lg transition hover:bg-blue-700"
        aria-label="Toggle chat"
      >
        {open ? "✕" : "💬"}
      </button>
    </div>
  );
}
