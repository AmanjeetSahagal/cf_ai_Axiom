"use client";

import { useEffect, useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { useRouter } from "next/navigation";

import { LogoMark } from "@/components/LogoMark";
import { api } from "@/lib/api";
import { getFirebaseAuthContext, hasFirebaseConfig } from "@/lib/firebase";

export default function LoginPage() {
  const [status, setStatus] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  async function exchangeFirebaseSession() {
    if (!hasFirebaseConfig) {
      setStatus("Firebase env vars are missing in frontend/.env.local.");
      return;
    }
    const { auth } = getFirebaseAuthContext();
    if (!auth.currentUser) {
      return;
    }
    setStatus("Exchanging Firebase session with Axiom...");
    try {
      const firebaseToken = await auth.currentUser.getIdToken(true);
      const result = await api.googleLogin(firebaseToken);
      localStorage.setItem("axiom-token", result.access_token);
      setStatus("Authenticated with Google. Redirecting...");
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `Firebase signed in, but Axiom token exchange failed: ${error.message}`
          : "Firebase signed in, but Axiom token exchange failed.",
      );
    }
  }

  useEffect(() => {
    if (!hasFirebaseConfig) {
      return;
    }
    const { auth } = getFirebaseAuthContext();
    if (auth.currentUser) {
      void exchangeFirebaseSession();
    }
  }, []);

  async function onGoogleSignIn() {
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      if (!hasFirebaseConfig) {
        setStatus("Firebase env vars are missing in frontend/.env.local.");
        return;
      }
      setStatus("Opening Google sign-in...");
      const { auth, provider } = getFirebaseAuthContext();
      const credential = await signInWithPopup(auth, provider);
      setStatus(`Google sign-in succeeded for ${credential.user.email || "your account"}. Finalizing Axiom session...`);
      await exchangeFirebaseSession();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-16">
      <section className="w-full rounded-[32px] border border-black/5 bg-white/85 p-8 shadow-panel">
        <LogoMark size="md" />
        <p className="mt-6 text-sm uppercase tracking-[0.3em] text-ember">Access</p>
        <h1 className="mt-3 font-display text-4xl text-ink">Continue with Google</h1>
        <p className="mt-4 text-slate-600">
          Sign in with your Google account through Firebase Auth. Axiom will provision your local user record automatically.
        </p>
        <button
          className="btn-primary mt-8 w-full"
          type="button"
          onClick={onGoogleSignIn}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Signing In..." : "Sign in with Google"}
        </button>
        <p className="mt-4 text-sm text-slate-500">{status}</p>
      </section>
    </main>
  );
}
