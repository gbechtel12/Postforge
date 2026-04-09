import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  isUnreachableBackendError,
  unreachableBackendMessage,
} from '@/lib/reachability'
import { useAuthStore } from '@/stores/authStore'

function timeOfDayGreeting(): 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

type RecentJobRow = {
  id: string
  days_requested: number
  status: string
  created_at: string
  clients: { name: string } | null
  platforms: { display_name: string } | null
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)

  const displayName =
    (user?.user_metadata?.full_name as string | undefined)?.trim() ||
    user?.email ||
    'there'

  const { data: jobs, isLoading, isError, error } = useQuery({
    queryKey: ['dashboard-recent-jobs', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<RecentJobRow[]> => {
      const { data, error } = await supabase
        .from('generation_jobs')
        .select('id, days_requested, status, created_at, clients(name), platforms(display_name)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(5)

      if (error) throw error
      return (data ?? []) as RecentJobRow[]
    },
  })

  const greeting = timeOfDayGreeting()

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Good {greeting}, {displayName}
        </h1>
        <p className="mt-1 text-gray-600">Here is a quick overview of your workspace.</p>
      </div>

      <Link
        to="/generate"
        className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
      >
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Start generating</h2>
          <p className="mt-1 text-sm text-gray-600">
            Create a new batch of posts for your clients.
          </p>
        </div>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700">
          <Sparkles className="h-6 w-6" aria-hidden />
        </span>
      </Link>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent jobs</h2>
          <p className="text-sm text-gray-500">Your last five generation jobs.</p>
        </div>

        <div className="p-6">
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading jobs…</p>
          ) : isError ? (
            <p className="text-sm text-red-600">
              {isUnreachableBackendError(error)
                ? unreachableBackendMessage()
                : 'Could not load jobs. Try again later.'}
            </p>
          ) : !jobs?.length ? (
            <p className="text-sm text-gray-600">
              No posts generated yet — get started above
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="pb-3 pr-4 font-medium">Client</th>
                    <th className="pb-3 pr-4 font-medium">Platform</th>
                    <th className="pb-3 pr-4 font-medium">Days</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="text-gray-900">
                  {jobs.map((job) => (
                    <tr key={job.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 pr-4">{job.clients?.name ?? '—'}</td>
                      <td className="py-3 pr-4">
                        {job.platforms?.display_name ?? '—'}
                      </td>
                      <td className="py-3 pr-4">{job.days_requested}</td>
                      <td className="py-3 pr-4 capitalize">{job.status}</td>
                      <td className="py-3 whitespace-nowrap text-gray-600">
                        {new Date(job.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
