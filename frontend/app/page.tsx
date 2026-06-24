"use client";

import { useState } from "react";
import Link from "next/link";
import Alert from "@/components/Alert";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { ApiError, createLead } from "@/lib/api";

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const ACCEPTED_EXT = [".pdf", ".doc", ".docx"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormErrors {
  first_name?: string;
  last_name?: string;
  email?: string;
  resume?: string;
}

export default function HomePage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [resume, setResume] = useState<File | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function validateFile(file: File | null): string | undefined {
    if (!file) return "Please attach your resume or CV.";
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    const typeOk =
      ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXT.includes(ext);
    if (!typeOk) return "File must be a PDF, DOC, or DOCX.";
    if (file.size > MAX_SIZE) return "File must be 10MB or smaller.";
    return undefined;
  }

  function validate(): FormErrors {
    const next: FormErrors = {};
    if (!firstName.trim()) next.first_name = "First name is required.";
    if (!lastName.trim()) next.last_name = "Last name is required.";
    if (!email.trim()) next.email = "Email is required.";
    else if (!EMAIL_RE.test(email.trim()))
      next.email = "Enter a valid email address.";
    const fileErr = validateFile(resume);
    if (fileErr) next.resume = fileErr;
    return next;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      await createLead({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        resume: resume as File,
      });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setApiError(err.detail);
      } else {
        setApiError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="bg-sage">
          <div className="mx-auto max-w-3xl px-6 py-16 text-center sm:py-24">
            <p className="text-sm font-semibold uppercase tracking-wide text-leaf">
              Immigration counsel, made approachable
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              Get a clear path forward{" "}
              <span className="text-leaf">on your visa.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-forest/80">
              Share a few details and your resume. One of our licensed
              attorneys will review your situation and reach out with the
              options available to you — no obligation.
            </p>
          </div>
        </section>

        <section className="mx-auto -mt-10 max-w-xl px-6 pb-20">
          <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-line sm:p-10">
            {submitted ? (
              <SuccessState
                onReset={() => {
                  setFirstName("");
                  setLastName("");
                  setEmail("");
                  setResume(null);
                  setErrors({});
                  setSubmitted(false);
                }}
              />
            ) : (
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div>
                  <h2 className="text-xl font-semibold text-ink">
                    Tell us about yourself
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    All fields are required. Your information stays
                    confidential.
                  </p>
                </div>

                {apiError && <Alert tone="error">{apiError}</Alert>}

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Input
                    id="first_name"
                    label="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jane"
                    autoComplete="given-name"
                    error={errors.first_name}
                  />
                  <Input
                    id="last_name"
                    label="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                    autoComplete="family-name"
                    error={errors.last_name}
                  />
                </div>

                <Input
                  id="email"
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  autoComplete="email"
                  error={errors.email}
                />

                <div>
                  <label
                    htmlFor="resume"
                    className="mb-1.5 block text-sm font-medium text-ink"
                  >
                    Resume / CV
                  </label>
                  <input
                    id="resume"
                    name="resume"
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setResume(file);
                      setErrors((prev) => ({
                        ...prev,
                        resume: validateFile(file),
                      }));
                    }}
                    className="block w-full cursor-pointer rounded-xl text-sm text-muted ring-1 ring-inset ring-line file:mr-4 file:cursor-pointer file:border-0 file:bg-sage-soft file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-forest hover:file:bg-sage"
                    aria-invalid={Boolean(errors.resume)}
                  />
                  <p className="mt-1.5 text-xs text-muted">
                    PDF, DOC, or DOCX · up to 10MB
                  </p>
                  {errors.resume && (
                    <p className="mt-1.5 text-sm text-red-600">
                      {errors.resume}
                    </p>
                  )}
                </div>

                <Button type="submit" loading={submitting} className="w-full">
                  {submitting ? "Submitting…" : "Submit"}
                </Button>
              </form>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function SuccessState({ onReset }: { onReset: () => void }) {
  return (
    <div className="py-6 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage">
        <svg
          className="h-7 w-7 text-forest"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
          />
        </svg>
      </div>
      <h2 className="mt-5 text-2xl font-semibold text-ink">
        Thanks — we&apos;ll be in touch
      </h2>
      <p className="mx-auto mt-3 max-w-sm text-muted">
        We&apos;ve received your details. One of our attorneys will review your
        information and reach out to you by email shortly.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-6 text-sm font-medium text-leaf hover:text-forest"
      >
        Submit another inquiry
      </button>
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="border-b border-line bg-cream-header/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center">
          <span className="font-logo text-2xl font-bold lowercase tracking-tight text-forest">
            alma
          </span>
        </Link>
        <Link
          href="/login"
          className="text-sm font-medium text-forest hover:text-forest-dark"
        >
          Attorney login
        </Link>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-line bg-cream-header">
      <div className="mx-auto max-w-5xl px-6 py-6 text-center text-sm text-muted">
        © {new Date().getFullYear()} Alma. This is not legal advice.
      </div>
    </footer>
  );
}
