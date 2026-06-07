import { Client } from "@langchain/langgraph-sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// URL of the running `langgraph dev` server (see apps/agent).
const apiUrl = process.env.LANGGRAPH_API_URL ?? "http://localhost:2024";
const assistantId = process.env.LANGGRAPH_ASSISTANT_ID ?? "agent";

type ChatRequest = {
  message?: string;
  sessionId?: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "Missing 'message'" }, { status: 400 });
  }

  const client = new Client({ apiUrl });

  try {
    // Resolve the chat session: reuse the caller's, or create a new one
    // backed by a fresh LangGraph thread. RLS guarantees the session row,
    // when present, belongs to the current user.
    let sessionId = body.sessionId;
    let threadId: string;

    if (sessionId) {
      const { data: session } = await supabase
        .from("chat_sessions")
        .select("id, thread_id")
        .eq("id", sessionId)
        .single();

      if (!session) {
        return NextResponse.json({ error: "Unknown session" }, { status: 404 });
      }
      threadId = session.thread_id ?? (await client.threads.create()).thread_id;
    } else {
      threadId = (await client.threads.create()).thread_id;
      const { data: session, error } = await supabase
        .from("chat_sessions")
        .insert({
          user_id: user.id,
          thread_id: threadId,
          title: message.slice(0, 60),
        })
        .select("id")
        .single();

      if (error || !session) {
        throw new Error(error?.message ?? "Failed to create session");
      }
      sessionId = session.id;
    }

    // Persist the user's message before running the agent.
    await supabase
      .from("messages")
      .insert({ session_id: sessionId, role: "user", content: message });

    // Run the agent to completion and read the final state.
    const state = await client.runs.wait(threadId, assistantId, {
      input: { messages: [{ role: "human", content: message }] },
    });

    const messages = (state as { messages?: Array<{ type?: string; content?: unknown }> })
      .messages;
    const last = messages?.[messages.length - 1];
    const reply = contentToText(last?.content);

    // Persist the assistant reply and bump the session's recency.
    await supabase
      .from("messages")
      .insert({ session_id: sessionId, role: "assistant", content: reply });
    await supabase
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sessionId);

    return NextResponse.json({ sessionId, threadId, reply });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Agent request failed: ${detail}` },
      { status: 502 },
    );
  }
}

// LangChain message content can be a string or a list of content blocks.
function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) =>
        typeof block === "string"
          ? block
          : typeof (block as { text?: unknown })?.text === "string"
            ? (block as { text: string }).text
            : "",
      )
      .join("");
  }
  return "";
}
