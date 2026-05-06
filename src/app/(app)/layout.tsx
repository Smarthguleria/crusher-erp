import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import WorkspaceGate from '@/components/WorkspaceGate';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Auth check depends on cookies; never statically prerender.
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="shell">
      <Sidebar userEmail={user.email ?? ''} />
      <div className="main">
        <WorkspaceGate>{children}</WorkspaceGate>
      </div>
    </div>
  );
}
