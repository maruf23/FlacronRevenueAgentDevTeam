'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi, mapAuthUser, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type RegisterForm = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  workspaceName: string;
};

const EMPTY_FORM: RegisterForm = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  workspaceName: '',
};

const FIELDS = [
  {
    key: 'email',
    label: 'Email',
    type: 'email',
    autoComplete: 'email',
    required: true,
  },
  {
    key: 'password',
    label: 'Password',
    type: 'password',
    autoComplete: 'new-password',
    required: true,
    hint: 'Use at least 8 characters.',
  },
  {
    key: 'firstName',
    label: 'First name',
    type: 'text',
    autoComplete: 'given-name',
    required: false,
  },
  {
    key: 'lastName',
    label: 'Last name',
    type: 'text',
    autoComplete: 'family-name',
    required: false,
  },
  {
    key: 'workspaceName',
    label: 'Workspace name',
    type: 'text',
    autoComplete: 'organization',
    required: true,
  },
] as const;

function validate(form: RegisterForm): Partial<Record<keyof RegisterForm, string>> {
  const errors: Partial<Record<keyof RegisterForm, string>> = {};
  const email = form.email.trim();

  if (!email) {
    errors.email = 'Email is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!form.password) {
    errors.password = 'Password is required.';
  } else if (form.password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }

  const workspaceName = form.workspaceName.trim();
  if (!workspaceName) {
    errors.workspaceName = 'Workspace name is required.';
  } else if (workspaceName.length < 2) {
    errors.workspaceName = 'Workspace name must be at least 2 characters.';
  }

  return errors;
}

export default function RegisterPage() {
  const loginStore = useAuthStore((s) => s.login);
  const router = useRouter();
  const [form, setForm] = useState<RegisterForm>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof RegisterForm, string>>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const nextErrors = validate(form);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      const res = await authApi.register({
        email: form.email.trim(),
        password: form.password,
        workspaceName: form.workspaceName.trim(),
        ...(form.firstName.trim() ? { firstName: form.firstName.trim() } : {}),
        ...(form.lastName.trim() ? { lastName: form.lastName.trim() } : {}),
      });
      loginStore({
        accessToken: res.access_token,
        user: mapAuthUser(res.user),
      });
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={onSubmit}
        noValidate
        className="w-full max-w-sm space-y-3 border border-border p-6"
      >
        <h1 className="text-xl font-semibold tracking-tight">Create account</h1>
        {FIELDS.map((field) => {
          const fieldError = fieldErrors[field.key];
          const hint = 'hint' in field ? field.hint : undefined;
          const describedBy = fieldError
            ? `${field.key}-error`
            : hint
              ? `${field.key}-hint`
              : undefined;

          return (
            <div key={field.key} className="space-y-1">
              <label className="text-xs font-medium" htmlFor={field.key}>
                {field.label}
              </label>
              <Input
                id={field.key}
                type={field.type}
                autoComplete={field.autoComplete}
                value={form[field.key]}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={describedBy}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm((prev) => ({ ...prev, [field.key]: value }));
                  setFieldErrors((prev) => {
                    if (!prev[field.key]) return prev;
                    const next = { ...prev };
                    delete next[field.key];
                    return next;
                  });
                }}
                required={field.required}
              />
              {fieldError ? (
                <p id={`${field.key}-error`} className="text-sm text-destructive">
                  {fieldError}
                </p>
              ) : hint ? (
                <p id={`${field.key}-hint`} className="text-xs text-muted-foreground">
                  {hint}
                </p>
              ) : null}
            </div>
          );
        })}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating…' : 'Register'}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Have an account?{' '}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
