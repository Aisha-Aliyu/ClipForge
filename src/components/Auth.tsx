// src/components/Auth.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Initialize current session user
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    })();

    // Subscribe to auth changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  async function handleSignUp(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
    }, { emailRedirectTo: window.location.origin });
    setLoading(false);
    if (error) setMessage(error.message);
    else setMessage("Check your email for confirmation (if enabled).");
  }

  async function handleSignIn(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setMessage(error.message);
    else setMessage("Signed in!");
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setMessage("Signed out");
  }

  if (user) {
    return (
      <div className="w-full max-w-md bg-white dark:bg-neutral-900 p-4 rounded-md shadow">
        <p className="text-sm text-gray-600 dark:text-gray-300">Signed in as</p>
        <p className="font-medium">{user.email ?? user.user_metadata?.full_name ?? user.id}</p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleSignOut}
            className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded"
          >
            Sign out
          </button>
        </div>
        {message && <p className="mt-2 text-xs text-gray-500">{message}</p>}
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-white dark:bg-neutral-900 p-6 rounded-md shadow">
      <h3 className="text-lg font-semibold mb-3">Sign in / Sign up</h3>
      <form className="flex flex-col gap-3" onSubmit={handleSignIn}>
        <input
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="px-3 py-2 border rounded"
        />
        <input
          type="password"
          placeholder="password (min 6 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="px-3 py-2 border rounded"
        />

        <div className="flex gap-2">
          <button
            onClick={handleSignIn}
            type="button"
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded"
            disabled={loading}
          >
            Sign in
          </button>

          <button
            onClick={handleSignUp}
            type="button"
            className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
            disabled={loading}
          >
            Sign up
          </button>
        </div>

        {message && <p className="text-sm text-gray-500 mt-2">{message}</p>}
      </form>
    </div>
  );
}