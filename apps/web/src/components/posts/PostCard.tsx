import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Check, Copy, ImageIcon, Loader2, Pencil, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import type { GeneratedPost } from '@/types'

export interface PostCardProps {
  post: GeneratedPost
  onUpdate: () => void
}

export default function PostCard({ post, onUpdate }: PostCardProps) {
  const [editing, setEditing] = useState(false)
  const [draftCaption, setDraftCaption] = useState(post.caption)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [showRegenCaptionHint, setShowRegenCaptionHint] = useState(false)
  const [toneHint, setToneHint] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) setDraftCaption(post.caption)
  }, [post.caption, editing])

  useEffect(() => {
    setImageLoaded(false)
  }, [post.image_url])

  const patchMutation = useMutation({
    mutationFn: (body: { caption?: string; status?: GeneratedPost['status'] }) =>
      api.patch<GeneratedPost>(`/posts/${post.id}`, body),
    onSuccess: () => {
      onUpdate()
    },
  })

  const regenCaptionMutation = useMutation({
    mutationFn: (tone_hint?: string) =>
      api.post<GeneratedPost>(`/posts/${post.id}/regenerate-caption`, {
        ...(tone_hint?.trim() ? { tone_hint: tone_hint.trim() } : {}),
      }),
    onSuccess: () => {
      setShowRegenCaptionHint(false)
      setToneHint('')
      onUpdate()
    },
  })

  const regenImageMutation = useMutation({
    mutationFn: () => api.post<GeneratedPost>(`/posts/${post.id}/regenerate-image`, {}),
    onSuccess: () => onUpdate(),
  })

  const saveCaption = () => {
    const next = draftCaption.trim()
    if (next === post.caption.trim()) {
      setEditing(false)
      return
    }
    patchMutation.mutate(
      { caption: draftCaption },
      {
        onSettled: () => setEditing(false),
      }
    )
  }

  const toggleApprove = () => {
    const next = post.status === 'approved' ? 'generated' : 'approved'
    patchMutation.mutate({ status: next })
  }

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(post.caption)
    } catch {
      // ignore
    }
  }

  const copyPrompt = async () => {
    if (!post.image_prompt) return
    try {
      await navigator.clipboard.writeText(post.image_prompt)
    } catch {
      // ignore
    }
  }

  const startEdit = () => {
    setEditing(true)
    setDraftCaption(post.caption)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.select()
    })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      saveCaption()
    }
    if (e.key === 'Escape') {
      setDraftCaption(post.caption)
      setEditing(false)
    }
  }

  const isApproved = post.status === 'approved'

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-gray-900">Day {post.day_number}</span>
        {post.version > 1 && (
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
            v{post.version}
          </span>
        )}
      </div>

      <div className="relative mb-4 min-h-[160px] overflow-hidden rounded-lg bg-gray-100">
        {post.image_url ? (
          <>
            {!imageLoaded && (
              <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-gray-200 to-gray-100" />
            )}
            <img
              src={post.image_url}
              alt=""
              className={`max-h-72 w-full object-cover ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImageLoaded(true)}
            />
          </>
        ) : (
          <div className="flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              <ImageIcon className="h-4 w-4" />
              Image prompt
            </div>
            {post.image_prompt ? (
              <>
                <pre className="whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-3 font-mono text-sm text-gray-800">
                  {post.image_prompt}
                </pre>
                <button
                  type="button"
                  onClick={copyPrompt}
                  className="self-start text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  Copy prompt
                </button>
              </>
            ) : (
              <p className="text-sm text-gray-500">No image or prompt yet.</p>
            )}
          </div>
        )}
      </div>

      <div className="mb-4">
        {editing ? (
          <textarea
            ref={textareaRef}
            value={draftCaption}
            onChange={(e) => setDraftCaption(e.target.value)}
            onBlur={saveCaption}
            onKeyDown={onKeyDown}
            rows={5}
            className="w-full resize-y rounded-lg border border-brand-300 p-3 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="group w-full rounded-lg border border-transparent p-2 text-left text-sm text-gray-800 hover:border-gray-200 hover:bg-gray-50"
          >
            <span className="block whitespace-pre-wrap">{post.caption || '— No caption —'}</span>
            <span className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400 group-hover:text-brand-600">
              <Pencil className="h-3 w-3" />
              Click to edit
            </span>
          </button>
        )}
      </div>

      {showRegenCaptionHint && (
        <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Optional direction for the LLM (tone hint)
          </label>
          <input
            type="text"
            value={toneHint}
            onChange={(e) => setToneHint(e.target.value)}
            placeholder='e.g. "more conversational"'
            className="mb-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
          <button
            type="button"
            onClick={() => {
              setShowRegenCaptionHint(false)
              setToneHint('')
            }}
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyCaption}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Copy className="h-4 w-4" />
          Copy caption
        </button>
        {!showRegenCaptionHint ? (
          <button
            type="button"
            onClick={() => setShowRegenCaptionHint(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Regen caption
          </button>
        ) : (
          <button
            type="button"
            disabled={regenCaptionMutation.isPending}
            onClick={() => regenCaptionMutation.mutate(toneHint.trim() || undefined)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {regenCaptionMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Run regen
          </button>
        )}
        <button
          type="button"
          disabled={regenImageMutation.isPending}
          onClick={() => regenImageMutation.mutate()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {regenImageMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Regen image
        </button>
        <button
          type="button"
          onClick={toggleApprove}
          disabled={patchMutation.isPending}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 ${
            isApproved
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          {isApproved ? (
            <>
              <Check className="h-4 w-4" />
              Approved ✓
            </>
          ) : (
            <>
              <Check className="h-4 w-4 opacity-40" />✓ Approve
            </>
          )}
        </button>
      </div>
    </div>
  )
}
