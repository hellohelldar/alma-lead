"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Alert from "@/components/Alert";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { ApiError, login } from "@/lib/api";
import { isAuthenticated, setToken } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) router.replace("/leads");
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await login(email.trim(), password);
      setToken(res.access_token);
      router.replace("/leads");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail || "Invalid email or password.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-base font-bold text-white">
              A
            </span>
            <span className="text-xl font-semibold tracking-tight text-slate-900">
              Alma
            </span>
          </Link>
          <h1 className="mt-6 text-2xl font-semibold text-slate-900">
            Attorney sign in
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Access the internal lead console.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {error && <Alert tone="error">{error}</Alert>}

            <Input
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="attorney@alma.com"
              autoComplete="email"
              autoFocus
            />
            <Input
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />

            <Button type="submit" loading={submitting} className="w-full">
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/" className="font-medium text-indigo-600 hover:text-indigo-700">
            ← Back to the intake form
          </Link>
        </p>
      </div>
    </div>
  );
}
