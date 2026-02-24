import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getUserPermissions } from '@/app/lib/permissions';
import { canAccessPath } from '@/app/lib/route-permissions';

interface Props {
    pathname: string;
    children: React.ReactNode;
}

/**
 * Server component that checks if the current user has permission to access a given path.
 * If not, redirects to /dashboard with an "access denied" indicator.
 */
export default async function PermissionGuard({ pathname, children }: Props) {
    const session = await auth();

    if (!session?.user) {
        redirect('/login');
    }

    const user = session.user as { role: string; permissions?: string | null };
    const perms = getUserPermissions(user);

    if (!canAccessPath(pathname, perms)) {
        redirect('/dashboard?denied=1');
    }

    return <>{children}</>;
}
