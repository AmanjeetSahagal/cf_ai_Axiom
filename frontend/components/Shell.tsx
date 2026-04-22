"use client";

import { useRouter } from "next/navigation";
import { signOut as firebaseSignOut } from "firebase/auth";
import { ReactNode, useEffect, useState } from "react";

import { SiteHeader } from "@/components/SiteHeader";
import { getFirebaseAuthContext, hasFirebaseConfig } from "@/lib/firebase";

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    setAuthenticated(Boolean(window.localStorage.getItem("axiom-token")));
  }, []);

  async function onSignOut() {
    setIsSigningOut(true);
    try {
      window.localStorage.removeItem("axiom-token");
      setAuthenticated(false);
      if (hasFirebaseConfig) {
        const { auth } = getFirebaseAuthContext();
        await firebaseSignOut(auth);
      }
      router.push("/");
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <SiteHeader signedIn={authenticated} onSignOut={() => void onSignOut()} isSigningOut={isSigningOut} />
      {children}
    </div>
  );
}
