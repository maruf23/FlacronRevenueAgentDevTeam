'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi, mapAuthUser, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function RegisterPage() {
  const loginStore = useAuthStore((s) => s.login);
  const router = useRouter();
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    workspaceName: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.register(form);
      loginStore({
        accessToken: res.access_token,
        user: mapAuthUser(res.user),
      });
      router.replace('/');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Registration failed',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-3 border border-border p-6"
      >
        <h1 className="text-xl font-semibold tracking-tight">Create account</h1>
        {(
          [
            ['email', 'Email', 'email'],
            ['password', 'Password', 'password'],
            ['firstName', 'First name', 'text'],
            ['lastName', 'Last name', 'text'],
            ['workspaceName', 'Workspace name', 'text'],
          ] as const
        ).map(([key, label, type]) => (
          <div key={key} className="space-y-1">
            <label className="text-xs font-medium" htmlFor={key}>
              {label}
            </label>
            <Input
              id={key}
              type={type}
              value={form[key]}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, [key]: e.target.value }))
              }
              required={key === 'email' || key === 'password' || key === 'workspaceName'}
            />
          </div>
        ))}
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
