import ChatWidget from "./components/ChatWidget";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-3xl font-bold">Fabric Twin AI</h1>
      <p className="text-neutral-500">
        Tap the chat bubble in the corner and ask the agent for the time.
      </p>
      <ChatWidget />
    </main>
  );
}
