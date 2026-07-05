import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <SignUp forceRedirectUrl="/onboarding" />
      <p className="max-w-sm text-center text-xs text-ink-soft">
        By signing up you agree to Listero&apos;s{" "}
        <Link href="/terms" className="underline underline-offset-2 hover:text-ink">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
          Privacy Policy
        </Link>
        .
      </p>
    </main>
  );
}
