import { fetchApiHealth } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const health = await fetchApiHealth();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-slate-50 text-slate-900">
      <div className="max-w-xl w-full bg-white border border-slate-200 rounded-xl shadow-sm p-8 space-y-6">
        <header className="border-b border-slate-100 pb-4">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Academic Suite</h1>
          <p className="text-sm text-slate-500 mt-1">Multi-tenant Academic Management Platform</p>
        </header>

        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">System Status</h2>
          <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 border border-slate-200">
            <div>
              <p className="text-sm font-medium text-slate-700">API Health (`/api/v1/health`)</p>
            </div>
            <div className="flex items-center space-x-2">
              <span
                className={`inline-block w-2.5 h-2.5 rounded-full ${
                  health.ok && health.status === 'ok' ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span className="font-mono text-sm font-semibold uppercase">
                {health.status}
              </span>
            </div>
          </div>

          {health.timestamp && (
            <p className="text-xs text-slate-400 text-right">
              Server timestamp: <span className="font-mono">{health.timestamp}</span>
            </p>
          )}

          {health.error && (
            <p className="text-xs text-rose-500 bg-rose-50 border border-rose-200 rounded p-2 font-mono">
              Notice: {health.error}
            </p>
          )}
        </section>

        <footer className="pt-4 border-t border-slate-100 text-xs text-slate-400 flex justify-between items-center">
          <span>Sprint 0 &bull; Step 1 Skeleton</span>
          <span>Next.js App Router &bull; Server Component</span>
        </footer>
      </div>
    </main>
  );
}

