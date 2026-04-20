"use client";

import { usePathname, useRouter } from "next/navigation";
import { signOut as firebaseSignOut } from "firebase/auth";
import { ReactNode, useState } from "react";

import { SiteHeader } from "@/components/SiteHeader";
import { getFirebaseAuthContext, hasFirebaseConfig } from "@/lib/firebase";

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function onSignOut() {
    setIsSigningOut(true);
    try {
      window.localStorage.removeItem("axiom-token");
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
      <SiteHeader signedIn onSignOut={() => void onSignOut()} isSigningOut={isSigningOut} />
      {children}
    </div>
  );
}
