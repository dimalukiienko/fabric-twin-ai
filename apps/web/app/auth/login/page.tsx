"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function signInWithGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  }

  async function submit() {
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        setNotice("Check your email to confirm your account, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-black/10 p-6 shadow-sm dark:border-white/15">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">Fabric Twin AI</h1>
          <p className="text-sm text-neutral-500">
            {mode === "signin" ? "Sign in to continue" : "Create your account"}
          </p>
        </div>

        <button
          onClick={signInWithGoogle}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-black/15 px-4 py-2 text-sm font-medium transition hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Continue with Google
        </button>

        <div className="flex items-center gap-3 text-xs text-neutral-400">
          <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
          or
          <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-3"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-white/15"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-white/15"
          />

          {error && <p className="text-sm text-red-500">{error}</p>}
          {notice && <p className="text-sm text-green-600">{notice}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {loading
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : "Sign up"}
          </button>
        </form>

        <p className="text-center text-sm text-neutral-500">
          {mode === "signin" ? "No account?" : "Already have an account?"}{" "}
          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setNotice(null);
            }}
            className="font-medium text-blue-600 hover:underline"
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}
