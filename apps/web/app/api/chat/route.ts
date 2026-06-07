import { Client } from "@langchain/langgraph-sdk";
import { NextResponse } from "next/server";

// URL of the running `langgraph dev` server (see apps/agent).
const apiUrl = process.env.LANGGRAPH_API_URL ?? "http://localhost:2024";
const assistantId = process.env.LANGGRAPH_ASSISTANT_ID ?? "agent";

type ChatRequest = {
  message?: string;
  threadId?: string;
};

export async function POST(request: Request) {
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
    // Reuse the caller's thread so the agent keeps conversation context.
    const threadId = body.threadId ?? (await client.threads.create()).thread_id;

    // Run the agent to completion and read the final state.
    const state = await client.runs.wait(threadId, assistantId, {
      input: { messages: [{ role: "human", content: message }] },
    });

    const messages = (state as { messages?: Array<{ type?: string; content?: unknown }> })
      .messages;
    const last = messages?.[messages.length - 1];

    return NextResponse.json({ threadId, reply: contentToText(last?.content) });
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
