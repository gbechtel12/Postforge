import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type {
  Client,
  ImageProvider,
  LlmKeyMeta,
  LlmKeyValidateResult,
  LlmProvider,
  PlatformDefaultEntry,
  PlatformSlug,
} from '@/types'

type ApiKeyProvider = LlmProvider | ImageProvider

const API_KEY_PROVIDER_OPTIONS: { value: ApiKeyProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'ideogram', label: 'Ideogram' },
  { value: 'stabilityai', label: 'Stability AI' },
]

const PLATFORM_SLUGS: PlatformSlug[] = [
  'facebook',
  'instagram',
  'linkedin',
  'x',
  'tiktok',
]

const PLATFORM_LABELS: Record<PlatformSlug, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  x: 'X',
  tiktok: 'TikTok',
}

function providerLabel(p: string): string {
  return API_KEY_PROVIDER_OPTIONS.find((o) => o.value === p)?.label ?? p
}

function keyPlaceholder(provider: ApiKeyProvider): string {
  if (provider === 'openai') return 'sk-...'
  if (provider === 'anthropic') return 'sk-ant-...'
  return 'Paste API key'
}

function defaultPlatformForm(): Record<PlatformSlug, PlatformDefaultEntry> {
  const row = (): PlatformDefaultEntry => ({
    tone: '',
    hashtag_count: 0,
    include_cta: false,
  })
  return {
    facebook: row(),
    instagram: row(),
    linkedin: row(),
    x: row(),
    tiktok: row(),
  }
}

function clientToPlatformForm(client: Client): Record<PlatformSlug, PlatformDefaultEntry> {
  const base = defaultPlatformForm()
  const raw = client.platform_defaults
  if (!raw || typeof raw !== 'object') return base
  for (const slug of PLATFORM_SLUGS) {
    const entry = raw[slug]
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const o = entry as Record<string, unknown>
      base[slug] = {
        tone: typeof o.tone === 'string' ? o.tone : '',
        hashtag_count:
          typeof o.hashtag_count === 'number'
            ? Math.min(30, Math.max(0, o.hashtag_count))
            : 0,
        include_cta: Boolean(o.include_cta),
      }
    }
  }
  return base
}

function buildPlatformDefaults(
  form: Record<PlatformSlug, PlatformDefaultEntry>,
): Record<string, PlatformDefaultEntry> | null {
  const out: Record<string, PlatformDefaultEntry> = {}
  for (const slug of PLATFORM_SLUGS) {
    const e = form[slug]
    const tone = e.tone.trim()
    const hashtag = Math.min(30, Math.max(0, e.hashtag_count))
    if (tone || hashtag > 0 || e.include_cta) {
      out[slug] = { tone, hashtag_count: hashtag, include_cta: e.include_cta }
    }
  }
  return Object.keys(out).length ? out : null
}

function emptyToNull(s: string): string | null {
  const t = s.trim()
  return t === '' ? null : t
}

function clientPayload(
  name: string,
  industry: string,
  website: string,
  brandVoice: string,
  promptTemplate: string,
  primaryColor: string,
  secondaryColor: string,
  platformForm: Record<PlatformSlug, PlatformDefaultEntry>,
) {
  return {
    name: name.trim(),
    industry: emptyToNull(industry),
    website: emptyToNull(website),
    brand_voice: emptyToNull(brandVoice),
    prompt_template: emptyToNull(promptTemplate),
    primary_color: emptyToNull(primaryColor),
    secondary_color: emptyToNull(secondaryColor),
    platform_defaults: buildPlatformDefaults(platformForm),
  }
}

function logoPublicUrl(client: Client | null): string | null {
  if (!client) return null
  if (client.logo_url) return client.logo_url
  const path = client.logo_storage_path
  if (!path) return null
  const { data } = supabase.storage.from('logos').getPublicUrl(path)
  return data.publicUrl
}

type Tab = 'keys' | 'clients'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('keys')

  const llmKeysQuery = useQuery({
    queryKey: ['llm-keys'],
    queryFn: () => api.get<LlmKeyMeta[]>('/llm-keys'),
  })

  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<Client[]>('/clients'),
  })

  const [keysFlash, setKeysFlash] = useState<string | null>(null)
  const [clientsFlash, setClientsFlash] = useState<string | null>(null)

  const showFlash = useCallback((setter: (s: string | null) => void, msg: string) => {
    setter(msg)
    window.setTimeout(() => setter(null), 2000)
  }, [])

  // ── API Keys tab state
  const [addProvider, setAddProvider] = useState<ApiKeyProvider>('openai')
  const [newKey, setNewKey] = useState('')
  const [showNewKey, setShowNewKey] = useState(false)
  const [validatingProvider, setValidatingProvider] = useState<ApiKeyProvider | null>(null)
  const [validateByProvider, setValidateByProvider] = useState<
    Partial<Record<ApiKeyProvider, { ok: boolean; detail?: string }>>
  >({})

  const addKeyMutation = useMutation({
    mutationFn: (body: { provider: ApiKeyProvider; api_key: string }) =>
      api.post<LlmKeyMeta>('/llm-keys', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-keys'] })
      setNewKey('')
      showFlash(setKeysFlash, 'Key saved')
    },
  })

  const removeKeyMutation = useMutation({
    mutationFn: (provider: ApiKeyProvider) => api.delete(`/llm-keys/${provider}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-keys'] })
      showFlash(setKeysFlash, 'Key removed')
    },
  })

  const validateMutation = useMutation({
    mutationFn: (provider: ApiKeyProvider) =>
      api.post<LlmKeyValidateResult>(`/llm-keys/${provider}/validate`),
    onMutate: (provider) => {
      setValidatingProvider(provider)
    },
    onSettled: () => setValidatingProvider(null),
    onSuccess: (data, provider) => {
      setValidateByProvider((prev) => ({
        ...prev,
        [provider]: {
          ok: data.valid,
          detail: data.error ?? undefined,
        },
      }))
    },
    onError: (err: Error, provider) => {
      setValidateByProvider((prev) => ({
        ...prev,
        [provider]: { ok: false, detail: err.message },
      }))
    },
  })

  // ── Clients tab state
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [hydratedKey, setHydratedKey] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [website, setWebsite] = useState('')
  const [brandVoice, setBrandVoice] = useState('')
  const [promptTemplate, setPromptTemplate] = useState('')
  const [primaryColor, setPrimaryColor] = useState('')
  const [secondaryColor, setSecondaryColor] = useState('')
  const [platformForm, setPlatformForm] = useState(defaultPlatformForm)
  const [platformAdvancedOpen, setPlatformAdvancedOpen] = useState(false)
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)

  const clients = clientsQuery.data ?? []

  const resetClientForm = useCallback(() => {
    setName('')
    setIndustry('')
    setWebsite('')
    setBrandVoice('')
    setPromptTemplate('')
    setPrimaryColor('')
    setSecondaryColor('')
    setPlatformForm(defaultPlatformForm())
    setLogoUploadError(null)
  }, [])

  const applyClientToForm = useCallback((c: Client) => {
    setName(c.name)
    setIndustry(c.industry ?? '')
    setWebsite(c.website ?? '')
    setBrandVoice(c.brand_voice ?? '')
    setPromptTemplate(c.prompt_template ?? '')
    setPrimaryColor(c.primary_color ?? '')
    setSecondaryColor(c.secondary_color ?? '')
    setPlatformForm(clientToPlatformForm(c))
    setLogoUploadError(null)
  }, [])

  useEffect(() => {
    if (isCreating) {
      setHydratedKey('__new__')
      return
    }
    if (!selectedClientId) return
    if (hydratedKey === selectedClientId) return
    const c = clients.find((x) => x.id === selectedClientId)
    if (!c) return
    applyClientToForm(c)
    setHydratedKey(selectedClientId)
  }, [isCreating, selectedClientId, clients, hydratedKey, applyClientToForm])

  const selectedClient =
    selectedClientId && !isCreating ? clients.find((c) => c.id === selectedClientId) ?? null : null

  const startNewClient = () => {
    setIsCreating(true)
    setSelectedClientId(null)
    setHydratedKey('__new__')
    resetClientForm()
  }

  const selectClient = (id: string) => {
    setIsCreating(false)
    setSelectedClientId(id)
  }

  const saveClientMutation = useMutation({
    mutationFn: async (payload: ReturnType<typeof clientPayload>) => {
      if (isCreating) {
        return api.post<Client>('/clients', payload)
      }
      if (!selectedClientId) throw new Error('No client selected')
      return api.patch<Client>(`/clients/${selectedClientId}`, payload)
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      showFlash(setClientsFlash, 'Saved!')
      if (isCreating) {
        setIsCreating(false)
        setSelectedClientId(data.id)
        setHydratedKey(data.id)
        applyClientToForm(data)
      } else {
        setHydratedKey(selectedClientId)
        applyClientToForm(data)
      }
    },
  })

  const deleteClientMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/clients/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['clients'] })
      await queryClient.refetchQueries({ queryKey: ['clients'] })
      const remaining =
        (queryClient.getQueryData(['clients']) as Client[] | undefined) ?? []
      if (remaining.length > 0) {
        const next = remaining[0]
        setIsCreating(false)
        setSelectedClientId(next.id)
        setHydratedKey(null)
      } else {
        setSelectedClientId(null)
        setIsCreating(false)
        setHydratedKey('__new__')
        resetClientForm()
      }
      showFlash(setClientsFlash, 'Client removed')
    },
  })

  const handleSaveClient = () => {
    if (!name.trim()) return
    const payload = clientPayload(
      name,
      industry,
      website,
      brandVoice,
      promptTemplate,
      primaryColor,
      secondaryColor,
      platformForm,
    )
    saveClientMutation.mutate(payload)
  }

  const handleDeleteClient = () => {
    if (isCreating) return
    if (!selectedClientId) return
    if (!window.confirm('Delete this client? They will be hidden from lists.')) return
    deleteClientMutation.mutate(selectedClientId)
  }

  const handleLogoFile = async (file: File | null) => {
    setLogoUploadError(null)
    if (!file || isCreating || !selectedClientId) return
    if (file.size > 5 * 1024 * 1024) {
      setLogoUploadError('Logo must be 5MB or smaller.')
      return
    }
    setLogoUploading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const path = `${user.id}/${selectedClientId}/${file.name}`
      const { data, error } = await supabase.storage.from('logos').upload(path, file, {
        upsert: true,
      })
      if (error) throw error
      await api.patch(`/clients/${selectedClientId}`, { logo_storage_path: data.path })
      await queryClient.invalidateQueries({ queryKey: ['clients'] })
      showFlash(setClientsFlash, 'Logo updated')
    } catch (e) {
      setLogoUploadError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setLogoUploading(false)
    }
  }

  const updatePlatformRow = (
    slug: PlatformSlug,
    patch: Partial<PlatformDefaultEntry>,
  ) => {
    setPlatformForm((prev) => ({
      ...prev,
      [slug]: { ...prev[slug], ...patch },
    }))
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
      <p className="mt-1 text-sm text-gray-600">
        Add your API keys and client profiles so you can generate content.
      </p>

      <div className="mt-6 flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab('keys')}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'keys'
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          API Keys
        </button>
        <button
          type="button"
          onClick={() => setTab('clients')}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'clients'
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Clients
        </button>
      </div>

      {tab === 'keys' && (
        <div className="mt-6 space-y-8">
          {keysFlash && (
            <p className="text-sm font-medium text-green-700" role="status">
              {keysFlash}
            </p>
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium text-gray-900">Current keys</h2>
            {llmKeysQuery.isLoading && (
              <div className="mt-6 flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-brand-500" aria-hidden />
              </div>
            )}
            {llmKeysQuery.isError && (
              <p className="mt-4 text-sm text-red-600">
                {(llmKeysQuery.error as Error).message}
              </p>
            )}
            {llmKeysQuery.data && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500">
                      <th className="py-2 pr-4 font-medium">Provider</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {llmKeysQuery.data.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-6 text-gray-500">
                          No keys yet. Add one below.
                        </td>
                      </tr>
                    ) : (
                      llmKeysQuery.data.map((row) => (
                        <tr key={row.id} className="border-b border-gray-100">
                          <td className="py-3 pr-4 font-medium text-gray-900">
                            {providerLabel(row.provider)}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={
                                row.is_active ? 'text-green-700' : 'text-gray-400'
                              }
                            >
                              ● {row.is_active ? 'Active' : 'Inactive'}
                            </span>
                            {validateByProvider[row.provider as ApiKeyProvider] && (
                              <span className="ml-3 text-xs">
                                {validateByProvider[row.provider as ApiKeyProvider]!.ok ? (
                                  <span className="text-green-600">✓ Valid</span>
                                ) : (
                                  <span className="text-red-600">
                                    ✗ Invalid —{' '}
                                    {validateByProvider[row.provider as ApiKeyProvider]!.detail ??
                                      'check your key'}
                                  </span>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="py-3">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={validatingProvider === row.provider}
                                onClick={() => {
                                  setValidateByProvider((p) => {
                                    const next = { ...p }
                                    delete next[row.provider as ApiKeyProvider]
                                    return next
                                  })
                                  validateMutation.mutate(row.provider as ApiKeyProvider)
                                }}
                                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                              >
                                {validatingProvider === row.provider ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  'Validate'
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={removeKeyMutation.isPending}
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      `Remove ${providerLabel(row.provider)} key?`,
                                    )
                                  )
                                    return
                                  removeKeyMutation.mutate(row.provider as ApiKeyProvider)
                                }}
                                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium text-gray-900">Add a key</h2>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
              <label className="block flex-1 text-sm">
                <span className="text-gray-600">Provider</span>
                <select
                  value={addProvider}
                  onChange={(e) =>
                    setAddProvider(e.target.value as ApiKeyProvider)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {API_KEY_PROVIDER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block flex-[2] text-sm">
                <span className="text-gray-600">API key</span>
                <div className="relative mt-1">
                  <input
                    type={showNewKey ? 'text' : 'password'}
                    autoComplete="off"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder={keyPlaceholder(addProvider)}
                    className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-10 text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewKey((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    aria-label={showNewKey ? 'Hide key' : 'Show key'}
                  >
                    {showNewKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </label>
            </div>
            {addKeyMutation.isError && (
              <p className="mt-2 text-sm text-red-600">
                {(addKeyMutation.error as Error).message}
              </p>
            )}
            <button
              type="button"
              disabled={!newKey.trim() || addKeyMutation.isPending}
              onClick={() =>
                addKeyMutation.mutate({
                  provider: addProvider,
                  api_key: newKey.trim(),
                })
              }
              className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {addKeyMutation.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </span>
              ) : (
                'Add key'
              )}
            </button>
          </section>
        </div>
      )}

      {tab === 'clients' && (
        <div className="mt-6 flex flex-col gap-6 lg:flex-row">
          <aside className="lg:w-72">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-medium text-gray-900">Clients</h2>
              <button
                type="button"
                onClick={startNewClient}
                className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
              >
                <Plus className="h-3.5 w-3.5" />
                New client
              </button>
            </div>
            {clientsQuery.isLoading && (
              <div className="mt-6 flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
              </div>
            )}
            {clientsQuery.isError && (
              <p className="mt-4 text-sm text-red-600">
                {(clientsQuery.error as Error).message}
              </p>
            )}
            {clientsQuery.data && (
              <ul className="mt-4 space-y-1 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
                {clients.length === 0 ? (
                  <li className="px-3 py-4 text-sm text-gray-500">No clients yet.</li>
                ) : (
                  clients.map((c) => {
                    const active =
                      !isCreating && selectedClientId === c.id
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => selectClient(c.id)}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                            active
                              ? 'bg-brand-50 font-medium text-brand-800'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className="text-brand-500">●</span>
                            {c.name}
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                        </button>
                      </li>
                    )
                  })
                )}
              </ul>
            )}
          </aside>

          <section className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            {clientsFlash && (
              <p className="mb-4 text-sm font-medium text-green-700" role="status">
                {clientsFlash}
              </p>
            )}

            {!isCreating && !selectedClientId && clients.length > 0 && (
              <p className="text-sm text-gray-500">
                Select a client or create a new one.
              </p>
            )}

            {(isCreating || selectedClientId) && (
              <div className="space-y-4">
                <label className="block text-sm">
                  <span className="text-gray-600">
                    Client name <span className="text-red-500">*</span>
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">Industry</span>
                  <input
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">Website</span>
                  <input
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">Brand voice</span>
                  <textarea
                    value={brandVoice}
                    onChange={(e) => setBrandVoice(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">Prompt template</span>
                  <textarea
                    value={promptTemplate}
                    onChange={(e) => setPromptTemplate(e.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </label>

                <div className="flex flex-col gap-4 sm:flex-row">
                  <label className="block flex-1 text-sm">
                    <span className="text-gray-600">Primary color</span>
                    <div className="mt-1 flex gap-2">
                      <input
                        type="color"
                        value={primaryColor || '#1A73E8'}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="h-10 w-14 cursor-pointer rounded border border-gray-300"
                      />
                      <input
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        placeholder="#1A73E8"
                        className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                  </label>
                  <label className="block flex-1 text-sm">
                    <span className="text-gray-600">Secondary color</span>
                    <div className="mt-1 flex gap-2">
                      <input
                        type="color"
                        value={secondaryColor || '#F5A623'}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="h-10 w-14 cursor-pointer rounded border border-gray-300"
                      />
                      <input
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        placeholder="#F5A623"
                        className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                  </label>
                </div>

                <div>
                  <span className="text-sm text-gray-600">Logo</span>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    {selectedClient &&
                      (logoPublicUrl(selectedClient) ?? selectedClient.logo_url) && (
                        <img
                          src={
                            logoPublicUrl(selectedClient) ?? selectedClient.logo_url ?? ''
                          }
                          alt=""
                          className="h-16 w-16 rounded-lg border border-gray-200 object-cover"
                        />
                      )}
                    <label
                      className={
                        isCreating || !selectedClientId
                          ? 'cursor-not-allowed opacity-50'
                          : 'cursor-pointer'
                      }
                    >
                      <span className="inline-flex rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                        {logoUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Upload logo'
                        )}
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        disabled={isCreating || !selectedClientId || logoUploading}
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          void handleLogoFile(f ?? null)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </div>
                  {(isCreating || !selectedClientId) && (
                    <p className="mt-1 text-xs text-gray-500">
                      Save the client first to upload a logo.
                    </p>
                  )}
                  {logoUploadError && (
                    <p className="mt-1 text-sm text-red-600">{logoUploadError}</p>
                  )}
                </div>

                <div className="rounded-lg border border-gray-200">
                  <button
                    type="button"
                    onClick={() => setPlatformAdvancedOpen((o) => !o)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-900 hover:bg-gray-50"
                  >
                    Platform defaults (advanced)
                    {platformAdvancedOpen ? (
                      <ChevronUp className="h-4 w-4 text-gray-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    )}
                  </button>
                  {platformAdvancedOpen && (
                    <div className="space-y-4 border-t border-gray-200 p-4">
                      {PLATFORM_SLUGS.map((slug) => (
                        <div
                          key={slug}
                          className="rounded-lg bg-gray-50 p-3 text-sm"
                        >
                          <p className="font-medium text-gray-900">
                            {PLATFORM_LABELS[slug]}
                          </p>
                          <div className="mt-2 grid gap-3 sm:grid-cols-3">
                            <label className="block">
                              <span className="text-xs text-gray-600">Tone</span>
                              <input
                                value={platformForm[slug].tone}
                                onChange={(e) =>
                                  updatePlatformRow(slug, { tone: e.target.value })
                                }
                                className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-900"
                              />
                            </label>
                            <label className="block">
                              <span className="text-xs text-gray-600">
                                Hashtag count (0–30)
                              </span>
                              <input
                                type="number"
                                min={0}
                                max={30}
                                value={platformForm[slug].hashtag_count}
                                onChange={(e) =>
                                  updatePlatformRow(slug, {
                                    hashtag_count: Number(e.target.value) || 0,
                                  })
                                }
                                className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-900"
                              />
                            </label>
                            <label className="flex items-end gap-2 pb-1">
                              <input
                                type="checkbox"
                                checked={platformForm[slug].include_cta}
                                onChange={(e) =>
                                  updatePlatformRow(slug, {
                                    include_cta: e.target.checked,
                                  })
                                }
                                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                              />
                              <span className="text-xs text-gray-600">Include CTA</span>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    disabled={!name.trim() || saveClientMutation.isPending}
                    onClick={handleSaveClient}
                    className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                  >
                    {saveClientMutation.isPending ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving…
                      </span>
                    ) : isCreating ? (
                      'Create client'
                    ) : (
                      'Save changes'
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={isCreating || !selectedClientId || deleteClientMutation.isPending}
                    onClick={handleDeleteClient}
                    className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete client
                  </button>
                </div>
                {saveClientMutation.isError && (
                  <p className="text-sm text-red-600">
                    {(saveClientMutation.error as Error).message}
                  </p>
                )}
              </div>
            )}

            {!isCreating && !selectedClientId && clients.length === 0 && !clientsQuery.isLoading && (
              <p className="text-sm text-gray-500">
                Create your first client to get started.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
