import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  Client,
  GenerationJob,
  ImageProvider,
  LlmKeyMeta,
  LlmProvider,
  Platform,
  ToneFormality,
  ToneOverrides,
} from '@/types'

const LLM_PROVIDERS: LlmProvider[] = ['openai', 'anthropic', 'gemini']
const IMAGE_PROVIDERS: ImageProvider[] = ['openai', 'ideogram', 'stabilityai']

function isLlmProvider(p: string): p is LlmProvider {
  return (LLM_PROVIDERS as string[]).includes(p)
}

function isImageProvider(p: string): p is ImageProvider {
  return (IMAGE_PROVIDERS as string[]).includes(p)
}

function labelForLlm(p: LlmProvider): string {
  switch (p) {
    case 'anthropic':
      return 'Anthropic (Claude)'
    case 'openai':
      return 'OpenAI (GPT)'
    case 'gemini':
      return 'Google (Gemini)'
    default:
      return p
  }
}

function labelForImage(p: ImageProvider): string {
  switch (p) {
    case 'openai':
      return 'OpenAI (images)'
    case 'ideogram':
      return 'Ideogram'
    case 'stabilityai':
      return 'Stability AI'
    default:
      return p
  }
}

export default function GeneratorPage() {
  const navigate = useNavigate()
  const [clientId, setClientId] = useState('')
  const [platformId, setPlatformId] = useState('')
  const [days, setDays] = useState(7)
  const [llmProvider, setLlmProvider] = useState<LlmProvider | ''>('')
  const [imageProvider, setImageProvider] = useState<ImageProvider | null>(null)
  const [formality, setFormality] = useState<ToneFormality>('balanced')
  const [promotionalPct, setPromotionalPct] = useState(30)
  const [validationError, setValidationError] = useState<string | null>(null)

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<Client[]>('/clients'),
  })

  const { data: platforms = [] } = useQuery({
    queryKey: ['platforms'],
    queryFn: () => api.get<Platform[]>('/platforms'),
  })

  const { data: llmKeys = [] } = useQuery({
    queryKey: ['llm-keys'],
    queryFn: () => api.get<LlmKeyMeta[]>('/llm-keys'),
  })

  const activeLlmProviders = useMemo(() => {
    const set = new Set<LlmProvider>()
    for (const k of llmKeys) {
      if (k.is_active && isLlmProvider(k.provider)) set.add(k.provider)
    }
    return LLM_PROVIDERS.filter((p) => set.has(p))
  }, [llmKeys])

  const activeImageProviders = useMemo(() => {
    const set = new Set<ImageProvider>()
    for (const k of llmKeys) {
      if (k.is_active && isImageProvider(k.provider)) set.add(k.provider)
    }
    return IMAGE_PROVIDERS.filter((p) => set.has(p))
  }, [llmKeys])

  const hasAnyLlmKey = activeLlmProviders.length > 0

  useEffect(() => {
    if (llmProvider && !activeLlmProviders.includes(llmProvider)) {
      setLlmProvider(activeLlmProviders[0] ?? '')
    } else if (!llmProvider && activeLlmProviders.length === 1) {
      setLlmProvider(activeLlmProviders[0])
    }
  }, [activeLlmProviders, llmProvider])

  useEffect(() => {
    if (imageProvider && !activeImageProviders.includes(imageProvider)) {
      setImageProvider(null)
    }
  }, [activeImageProviders, imageProvider])

  const generateMutation = useMutation({
    mutationFn: () => {
      const toneOverrides: ToneOverrides = {
        formality,
        promotional_ratio: Math.round((promotionalPct / 100) * 1000) / 1000,
      }
      return api.post<GenerationJob>('/generate', {
        client_id: clientId,
        platform_id: platformId,
        days_requested: days,
        llm_provider: llmProvider,
        image_provider: imageProvider || null,
        tone_overrides: toneOverrides,
      })
    },
    onSuccess: (job) => {
      const clientName = clients.find((c) => c.id === clientId)?.name
      const platformName = platforms.find((p) => p.id === platformId)?.display_name
      navigate(`/results/${job.id}`, {
        state: {
          clientName,
          platformName,
          daysRequested: days,
        },
      })
    },
  })

  const validate = (): boolean => {
    if (!clientId) {
      setValidationError('Select a client.')
      return false
    }
    if (!platformId) {
      setValidationError('Select a platform.')
      return false
    }
    if (days < 1 || days > 30) {
      setValidationError('Number of days must be between 1 and 30.')
      return false
    }
    if (!llmProvider) {
      setValidationError('Select an LLM provider.')
      return false
    }
    if (!hasAnyLlmKey) {
      setValidationError('Add an API key in Settings before generating.')
      return false
    }
    setValidationError(null)
    return true
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    generateMutation.mutate()
  }

  const sliderPercent = Math.round(((days - 1) / 29) * 100)

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Generate posts</h1>
      <div className="mb-8 h-px bg-gray-200" />

      {!hasAnyLlmKey && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          You haven&apos;t added any API keys yet.{' '}
          <Link to="/settings" className="font-semibold text-brand-600 underline hover:text-brand-700">
            Go to Settings →
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Client</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Platform</label>
            <select
              value={platformId}
              onChange={(e) => setPlatformId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="">Select platform…</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Number of days: {days}</label>
          </div>
          <input
            type="range"
            min={1}
            max={30}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ backgroundSize: `${sliderPercent}% 100%` }}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-brand-600"
          />
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>1</span>
            <span>30</span>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">LLM Provider</label>
            <select
              value={llmProvider}
              onChange={(e) => setLlmProvider(e.target.value as LlmProvider)}
              disabled={!hasAnyLlmKey}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-gray-100"
            >
              <option value="">
                {hasAnyLlmKey ? 'Select provider…' : 'No keys configured'}
              </option>
              {activeLlmProviders.map((p) => (
                <option key={p} value={p}>
                  {labelForLlm(p)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Image generation</label>
            <select
              value={imageProvider ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setImageProvider(v === '' ? null : (v as ImageProvider))
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="">None (prompts only)</option>
              {activeImageProviders.map((p) => (
                <option key={p} value={p}>
                  {labelForImage(p)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <legend className="px-1 text-sm font-medium text-gray-700">Tone overrides (optional)</legend>
          <div className="mt-2 space-y-4">
            <div>
              <p className="mb-2 text-sm text-gray-600">Formality</p>
              <div className="flex flex-wrap gap-4">
                {(
                  [
                    ['casual', 'Casual'],
                    ['balanced', 'Balanced'],
                    ['formal', 'Formal'],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="formality"
                      value={value}
                      checked={formality === value}
                      onChange={() => setFormality(value)}
                      className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span className="font-medium text-gray-700">Promotional</span>
                <span className="text-gray-600">{promotionalPct}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={promotionalPct}
                onChange={(e) => setPromotionalPct(Number(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-brand-600"
              />
            </div>
          </div>
        </fieldset>

        {validationError && (
          <p className="text-sm font-medium text-red-600" role="alert">
            {validationError}
          </p>
        )}
        {generateMutation.isError && (
          <p className="text-sm font-medium text-red-600" role="alert">
            {(generateMutation.error as Error)?.message ?? 'Generation failed.'}
          </p>
        )}

        <button
          type="submit"
          disabled={generateMutation.isPending || !hasAnyLlmKey}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {generateMutation.isPending ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Queuing generation...
            </>
          ) : (
            <>
              Generate {days} posts<span aria-hidden> →</span>
            </>
          )}
        </button>
      </form>
    </div>
  )
}
