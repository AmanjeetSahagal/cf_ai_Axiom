"use client";

import { useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { getFirebaseAuthContext, hasFirebaseConfig } from "@/lib/firebase";

export default function LoginPage() {
  const [status, setStatus] = useState<string>("");
  const router = useRouter();

  async function onGoogleSignIn() {
    if (!hasFirebaseConfig) {
      setStatus("Firebase env vars are missing in frontend/.env.local.");
      return;
    }
    setStatus("Opening Google sign-in...");
    try {
      const { auth, provider } = getFirebaseAuthContext();
      const credential = await signInWithPopup(auth, provider);
      const firebaseToken = await credential.user.getIdToken();
      const result = await api.googleLogin(firebaseToken);
      localStorage.setItem("axiom-token", result.access_token);
      setStatus("Authenticated with Google. Redirecting...");
      router.push("/runs");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-16">
      <section className="w-full rounded-[32px] border border-black/5 bg-white/85 p-8 shadow-panel">
        <p className="text-sm uppercase tracking-[0.3em] text-ember">Access</p>
        <h1 className="mt-3 font-display text-4xl text-ink">Continue with Google</h1>
        <p className="mt-4 text-slate-600">
          Sign in with your Google account through Firebase Auth. Axiom will provision your local user record automatically.
        </p>
        <button
          className="btn-primary mt-8 w-full"
          type="button"
          onClick={onGoogleSignIn}
        >
          Sign in with Google
        </button>
        <p className="mt-4 text-sm text-slate-500">{status}</p>
      </section>
    </main>
  );
}
