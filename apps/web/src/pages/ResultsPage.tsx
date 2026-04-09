import { useMemo } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FileJson, FileSpreadsheet, RefreshCw } from 'lucide-react'
import PostCard from '@/components/posts/PostCard'
import { api } from '@/lib/api'
import type { Client, ExportBatch, GeneratedPost, GenerationJobStatus, Platform, PostListResponse } from '@/types'

interface LocationState {
  clientName?: string
  platformName?: string
  daysRequested?: number
}

export default function ResultsPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const location = useLocation()
  const queryClient = useQueryClient()
  const nav = (location.state as LocationState | null) ?? {}

  const {
    data: status,
    isLoading: statusLoading,
    isError: statusIsError,
    error: statusError,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ['generate', jobId, 'status'],
    queryFn: () => api.get<GenerationJobStatus>(`/generate/${jobId}/status`),
    enabled: !!jobId,
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s === 'pending' || s === 'processing' ? 2000 : false
    },
  })

  const isRunning = status?.status === 'pending' || status?.status === 'processing'

  const {
    data: postsRes,
    isLoading: postsLoading,
    refetch: refetchPosts,
  } = useQuery({
    queryKey: ['posts', { job_id: jobId }],
    queryFn: () => api.get<PostListResponse>(`/posts?job_id=${jobId}&limit=100`),
    enabled: !!jobId,
    refetchInterval: isRunning ? 2000 : false,
  })

  const { data: platforms = [] } = useQuery({
    queryKey: ['platforms'],
    queryFn: () => api.get<Platform[]>('/platforms'),
  })

  const posts = postsRes?.data ?? []
  const sortedPosts = useMemo(
    () => [...posts].sort((a, b) => a.day_number - b.day_number),
    [posts]
  )

  const firstPost = sortedPosts[0]

  const { data: clientRow } = useQuery({
    queryKey: ['clients', firstPost?.client_id],
    queryFn: () => api.get<Client>(`/clients/${firstPost!.client_id}`),
    enabled: !!firstPost?.client_id && !nav.clientName,
  })

  const clientTitle = nav.clientName ?? clientRow?.name ?? '…'
  const platformTitle =
    nav.platformName ?? platforms.find((p) => p.id === firstPost?.platform_id)?.display_name ?? '…'
  const daysCount = nav.daysRequested ?? status?.posts_total ?? sortedPosts.length

  const title = `Results — ${clientTitle} × ${platformTitle} × ${daysCount} day${daysCount === 1 ? '' : 's'}`

  const refetchAll = () => {
    void refetchStatus()
    void refetchPosts()
  }

  const handleExport = async (format: 'csv' | 'json') => {
    if (!jobId) return
    try {
      const batch = await api.post<ExportBatch>('/export', {
        job_id: jobId,
        format,
        status_filter: 'all',
      })
      if (batch.download_url) {
        window.open(batch.download_url, '_blank')
      } else {
        window.alert('Export is not ready yet — no download URL returned.')
      }
    } catch (e) {
      window.alert((e as Error)?.message ?? 'Export failed.')
    }
  }

  const onPostUpdate = () => {
    void queryClient.invalidateQueries({ queryKey: ['posts', { job_id: jobId }] })
  }

  if (!jobId) {
    return (
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-gray-600">Missing job id.</p>
        <Link to="/generate" className="mt-4 inline-block text-brand-600 hover:underline">
          Back to Generate
        </Link>
      </div>
    )
  }

  if (statusLoading && !status) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        <p className="mt-4 text-sm text-gray-600">Loading job…</p>
      </div>
    )
  }

  if (statusIsError) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-medium text-red-800">
          {(statusError as Error)?.message ?? 'Could not load this job.'}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => void refetchStatus()}
            className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
          <Link
            to="/generate"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Generate
          </Link>
        </div>
      </div>
    )
  }

  if (status?.status === 'error') {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-lg font-semibold text-amber-900">Generation failed</h1>
        <p className="mt-2 text-sm text-amber-800">
          {status.error_message ?? 'Something went wrong while generating posts.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void refetchStatus()}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
          >
            <RefreshCw className="h-4 w-4" />
            Retry status
          </button>
          <Link
            to="/generate"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Generate
          </Link>
        </div>
      </div>
    )
  }

  if (status?.status === 'cancelled') {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">Job cancelled</h1>
        <p className="mt-2 text-sm text-gray-600">This generation job was cancelled.</p>
        <Link
          to="/generate"
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Generate
        </Link>
      </div>
    )
  }

  if (isRunning) {
    const total = Math.max(status?.posts_total ?? 1, 1)
    const done = status?.posts_complete ?? 0
    const pct = Math.min(100, Math.round((done / total) * 100))

    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          <Link
            to="/generate"
            className="inline-flex items-center gap-2 self-start text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Generate
          </Link>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
            <p className="mt-6 text-lg font-medium text-gray-900">
              Generating your posts… ({done}/{total} complete)
            </p>
            <div className="mt-6 h-3 w-full max-w-md overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-500 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-4 text-sm text-gray-600">
              Posts appear below as soon as they are ready. This page updates every few seconds.
            </p>
          </div>
        </div>

        {sortedPosts.length > 0 && (
          <div className="mt-10 space-y-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">So far</h2>
            {sortedPosts.map((post) => (
              <PostCard key={post.id} post={post} onUpdate={onPostUpdate} />
            ))}
          </div>
        )}
      </div>
    )
  }

  if (status?.status === 'complete' && sortedPosts.length === 0 && postsLoading) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        <p className="mt-4 text-sm text-gray-600">Loading posts…</p>
      </div>
    )
  }

  if (status?.status === 'complete' && sortedPosts.length === 0 && !postsLoading) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        <p className="mt-4 text-gray-600">Something went wrong — no posts were generated.</p>
        <Link
          to="/generate"
          className="mt-6 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          ← Back to Generate
        </Link>
      </div>
    )
  }

  if (status?.status === 'complete') {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="text-xl font-bold text-gray-900 lg:text-2xl">{title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleExport('csv')}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => void handleExport('json')}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
            >
              <FileJson className="h-4 w-4" />
              Export JSON
            </button>
            <Link
              to="/generate"
              className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Generate
            </Link>
          </div>
        </div>

        <div className="space-y-10">
          {sortedPosts.map((post: GeneratedPost) => (
            <div key={post.id}>
              <PostCard post={post} onUpdate={onPostUpdate} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-gray-600">Unexpected job state.</p>
      <button
        type="button"
        onClick={() => void refetchAll()}
        className="mt-4 text-sm font-medium text-brand-600 hover:underline"
      >
        Refresh
      </button>
    </div>
  )
}
