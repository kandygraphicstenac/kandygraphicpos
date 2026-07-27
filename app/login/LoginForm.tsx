'use client';

import { useActionState } from 'react';
import { loginAction, type LoginState } from '@/app/_actions/auth';

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, formAction, isPending] = useActionState<LoginState, FormData>(
    loginAction,
    undefined,
  );

  // Action errors take precedence; fall back to URL-delivered initial errors.
  const displayError = state?.error ?? initialError;

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-[26px] font-semibold text-text tracking-tight">KGpos</h1>
          <p className="text-[13px] text-text-3 mt-1">Kandy Graphics — staff sign in</p>
        </div>

        <form
          action={formAction}
          className="bg-surface border border-border rounded-xl p-6 space-y-4 shadow-sm"
        >
          {displayError && (
            <p className="text-[13px] text-danger-fg bg-bg border border-danger-fg/20 rounded-lg px-3 py-2">
              {displayError}
            </p>
          )}

          <div>
            <label className="block text-[12px] text-text-2 mb-1.5" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              name="email"
              required
              autoComplete="email"
              autoFocus
              disabled={isPending}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-[13px] text-text
                         placeholder:text-text-3
                         focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
                         disabled:opacity-60 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[12px] text-text-2 mb-1.5" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              name="password"
              required
              autoComplete="current-password"
              disabled={isPending}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-[13px] text-text
                         focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
                         disabled:opacity-60 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full h-10 rounded-lg bg-accent text-accent-fg text-[14px] font-medium
                       disabled:opacity-60 hover:opacity-90 transition-opacity"
          >
            {isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
