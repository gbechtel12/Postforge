# Agent 7 — Generator Page + Results Page

## Your job
Build the two pages that are the core user-facing feature of PostForge:
the generation form and the results view where users review, edit,
and export their posts.

---

## File 1: `apps/web/src/pages/GeneratorPage.tsx`

This is where users configure and kick off a generation job.

**UI layout:**
```
Generate posts
──────────────────────────────────────────────

  Client                    Platform
  ┌─────────────────────┐   ┌─────────────────────┐
  │ Bech Creative     ▼ │   │ Instagram           ▼│
  └─────────────────────┘   └─────────────────────┘

  Number of days: 7
  ●───────────────────○  (slider 1-30)

  LLM Provider              Image generation
  ┌─────────────────────┐   ┌─────────────────────┐
  │ Anthropic (Claude)▼ │   │ None (prompts only) ▼│
  └─────────────────────┘   └─────────────────────┘

  ┌─── Tone overrides (optional) ─────────────────┐
  │ Formality    ○ Casual  ● Balanced  ○ Formal   │
  │ Promotional  ━━●━━━━━━━━━━━━━━━━━  30%        │
  └───────────────────────────────────────────────┘

  [Generate 7 posts  →]
```

**Data needed:**
```typescript
// Fetch clients
useQuery(['clients'], () => api.get<Client[]>('/clients'))

// Fetch platforms
useQuery(['platforms'], () => api.get<Platform[]>('/platforms'))
```

**Validation before submit:**
- Client must be selected
- Platform must be selected
- Days must be 1-30
- LLM provider must be selected
- If user has no LLM keys, show warning: "You haven't added any API keys yet. [Go to Settings →]"

**On submit:**
```typescript
const mutation = useMutation({
  mutationFn: () => api.post<GenerationJob>('/generate', {
    client_id: selectedClientId,
    platform_id: selectedPlatformId,
    days_requested: days,
    llm_provider: llmProvider,
    image_provider: imageProvider || null,
    tone_overrides: toneOverrides
  }),
  onSuccess: (job) => {
    navigate(`/results/${job.id}`)
  }
})
```

After clicking Generate, show a loading state on the button:
"Queuing generation..." → then navigate to results page.

**LLM provider options:**
Only show providers the user has keys for. Fetch from `GET /llm-keys`
and filter the dropdown to active keys only.

---

## File 2: `apps/web/src/pages/ResultsPage.tsx`

This is the results view for a completed generation job.

**Route:** `/results/:jobId`

**Behavior:**
1. On mount, fetch job status: `GET /generate/:jobId/status`
2. If status is `pending` or `processing`: show a live progress view
   - Poll every 2 seconds using `useInterval` or `refetchInterval`
   - Show: "Generating your posts... (3/7 complete)"
   - Animated progress bar
   - Show posts as they appear (fetch posts list and update as count grows)
3. If status is `complete`: show the full results grid
4. If status is `error`: show error state with retry option

**Results grid (when complete):**
```
Results — Bech Creative × Instagram × 7 days
[Export CSV] [Export JSON]                    [← Back to Generate]

Day 1   ┌─────────────────────────────────────────┐
        │ [Image preview or image prompt box]      │
        │                                          │
        │ Caption text here...                     │
        │ #hashtag1 #hashtag2                      │
        │                                          │
        │ [Copy caption] [Regen caption] [Regen image] [✓ Approve]
        └─────────────────────────────────────────┘

Day 2   ┌─────────────────────────────────────────┐
        │ ...                                      │
        └─────────────────────────────────────────┘
```

**Post card component** (`src/components/posts/PostCard.tsx`):

Create this as a separate component. Props:
```typescript
interface PostCardProps {
  post: GeneratedPost
  onUpdate: () => void  // callback to refetch posts after mutation
}
```

Features:
- Show image if `image_url` exists, otherwise show image prompt in a
  styled code/quote block with a "Copy prompt" button
- Caption is editable inline — click to edit, click away or press Enter to save
  via `PATCH /posts/:id`
- "Regen caption" button → `POST /posts/:id/regenerate-caption`
  - Show loading state on button while in flight
  - Accepts optional `tone_hint` — show a small text input that appears
    when you click "Regen caption" to optionally add a direction hint
- "Regen image" button → `POST /posts/:id/regenerate-image`
  - Show loading state
- "Approve" button → `PATCH /posts/:id { status: 'approved' }`
  - Toggle — if already approved, show "Approved ✓" in green, click to unapprove
- Version badge — show "v{version}" if version > 1

**Export buttons:**
```typescript
// CSV
const handleExportCsv = async () => {
  const batch = await api.post<ExportBatch>('/export', {
    job_id: jobId,
    format: 'csv',
    status_filter: 'all'
  })
  window.open(batch.download_url, '_blank')
}

// JSON — same pattern
```

**Empty/loading states:**
- While polling: animated spinner + progress text
- If 0 posts returned despite complete status: "Something went wrong — no posts were generated"
- Individual post image loading: skeleton placeholder

---

## Shared component: `src/components/posts/PostCard.tsx`

Extract the post card as described above. It will be reused if you ever
add a post history/browse view.

---

## Acceptance criteria
- [ ] Generator form validates before submitting
- [ ] Only providers with active keys appear in LLM dropdown
- [ ] Clicking Generate navigates to `/results/:jobId`
- [ ] Results page polls for progress while job is running
- [ ] Posts appear in cards as generation completes
- [ ] Caption is editable inline
- [ ] Regen caption and regen image both work
- [ ] Approve toggle works
- [ ] Copy caption works (clipboard API)
- [ ] Export CSV downloads the file
- [ ] Back button returns to generator
- [ ] No TypeScript errors
