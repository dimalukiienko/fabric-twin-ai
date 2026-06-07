import ChatApp from "./components/ChatApp";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: sessions } = await supabase
    .from("chat_sessions")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false });

  return <ChatApp userEmail={user?.email ?? ""} initialSessions={sessions ?? []} />;
}
