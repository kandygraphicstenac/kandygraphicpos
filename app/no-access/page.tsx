import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasAnyModuleAccess, landingPathFor, ROLE_LABELS } from '@/lib/permissions';

export const metadata = { title: 'No modules assigned — KGpos' };

/**
 * Landing page for a signed-in user whose role has no modules yet (SALES,
 * ACCOUNT). Reachable by every authenticated role, so it can never be part of
 * a redirect loop — and a role that later gains access is bounced to its real
 * landing page instead of being stranded here.
 */
export default async function NoAccessPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (hasAnyModuleAccess(user.role)) redirect(landingPathFor(user.role));

  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-surface border border-border rounded-2xl p-8 text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-border flex items-center justify-center mb-4">
          <svg className="w-5 h-5 text-text-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="4" y="9" width="12" height="8" rx="2" />
            <path d="M7 9V6.5a3 3 0 016 0V9" strokeLinecap="round" />
          </svg>
        </div>

        <h1 className="text-[17px] font-semibold">No modules assigned yet</h1>

        <p className="text-[13px] text-text-2 mt-2 leading-relaxed">
          You&rsquo;re signed in as <span className="font-medium text-text">{user.name}</span>
          {' '}({ROLE_LABELS[user.role]}), but this role doesn&rsquo;t have access to any
          part of the system yet.
        </p>

        <p className="text-[12px] text-text-3 mt-4">
          Ask the owner to grant access or change your role in Settings → Staff.
        </p>
      </div>
    </div>
  );
}
