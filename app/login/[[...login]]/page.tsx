import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignIn forceRedirectUrl="/dashboard" />
    </main>
  );
}
