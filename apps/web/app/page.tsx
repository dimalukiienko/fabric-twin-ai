import ChatWidget from "./components/ChatWidget";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-3xl font-bold">Fabric Twin AI</h1>
      <p className="text-neutral-500">
        Tap the chat bubble in the corner and ask the agent for the time.
      </p>
      {user?.email && (
        <p className="text-sm text-neutral-400">Signed in as {user.email}</p>
      )}
      <ChatWidget />
    </main>
  );
}
