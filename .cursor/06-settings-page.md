# Agent 6 — Settings Page (LLM Keys + Client Profiles)

## Your job
Build the Settings page. This is the onboarding-critical page — users
must configure their API keys and at least one client before they can
generate anything. Get this right and the whole app unlocks.

## Files to create/update

### `apps/web/src/pages/SettingsPage.tsx`

Two-tab layout: "API Keys" and "Clients".

---

## Tab 1: API Keys

**Purpose:** Users add their own LLM/image generation API keys here.
The app uses these keys for generation — PostForge never uses its own.

**UI layout:**
```
API Keys
────────────────────────────────────────
  Current keys
  ┌──────────────┬──────────┬──────────────────────┐
  │ Provider     │ Status   │ Actions              │
  ├──────────────┼──────────┼──────────────────────┤
  │ Anthropic    │ ● Active │ [Validate] [Remove]  │
  │ OpenAI       │ ● Active │ [Validate] [Remove]  │
  └──────────────┴──────────┴──────────────────────┘

  Add a key
  ┌─────────────────────┐  ┌──────────────────────────┐
  │ Provider ▼          │  │ API Key ················  │
  └─────────────────────┘  └──────────────────────────┘
  [Add key]
```

**Providers in dropdown:**
- OpenAI (captions + images via DALL-E)
- Anthropic (captions)
- Google Gemini (captions)
- Ideogram (images)
- Stability AI (images)

**Data fetching:**
```typescript
// GET /llm-keys — list existing keys
useQuery(['llm-keys'], () => api.get('/llm-keys'))
```

**Add key:**
```typescript
// POST /llm-keys
api.post('/llm-keys', { provider, api_key })
// On success: invalidate ['llm-keys'] query, clear the form
```

**Validate:**
```typescript
// POST /llm-keys/:provider/validate
// Show result inline next to the row:
// ✓ Valid  or  ✗ Invalid — check your key
```

**Remove:**
```typescript
// DELETE /llm-keys/:provider
// Confirm with a simple window.confirm() before deleting
// On success: invalidate ['llm-keys'] query
```

**API key input:**
- Use `type="password"` so the key is masked
- Add a show/hide toggle button (eye icon from lucide-react)
- Show placeholder: "sk-..." for OpenAI, "sk-ant-..." for Anthropic

---

## Tab 2: Clients

**Purpose:** Each client has their own brand voice, colors, logo, and
prompt template. Posts generated for a client always use their settings.

**UI layout:**

Left panel: client list
```
Clients                          [+ New client]
────────────────────────
  ● Bech Creative        >
  ● West Middlesex FD    >
  ● Olympic Fun Center   >
```

Right panel: selected client form (or empty state if none selected)
```
Client name *         [                    ]
Industry              [                    ]
Website               [                    ]
Brand voice           [                    ]
                      [                    ]
Prompt template       [                    ]
                      [                    ]
                      [                    ]
Primary color    [#   ]   Secondary color  [#   ]
Logo             [Upload logo]
                 (shows preview if logo_url exists)

[Save changes]   [Delete client]
```

**Data fetching:**
```typescript
// GET /clients
useQuery(['clients'], () => api.get<Client[]>('/clients'))
```

**Create new:**
- Clicking "+ New client" clears the form and sets a "creating" state
- On submit: `api.post('/clients', formData)` → invalidate ['clients']
- Auto-select the new client after creation

**Update:**
- Form is pre-filled when a client is selected
- "Save changes": `api.patch('/clients/:id', formData)` → invalidate ['clients']

**Delete:**
- Confirm first
- `api.delete('/clients/:id')` → invalidate ['clients']
- Select the first remaining client after delete

**Logo upload:**
- `<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp">`
- On file select: upload to Supabase Storage directly from frontend:
  ```typescript
  const { data, error } = await supabase.storage
    .from('logos')
    .upload(`${userId}/${clientId}/${file.name}`, file, { upsert: true })
  // Then get public URL and update client record
  const { data: { publicUrl } } = supabase.storage
    .from('logos').getPublicUrl(data.path)
  await api.patch(`/clients/${clientId}`, { logo_storage_path: data.path })
  ```
- Show logo preview as a 64x64 rounded image after upload

**Platform defaults (advanced — collapsible section):**
A simple form per platform the user cares about:
- Tone (text input)
- Hashtag count (number input, 0-30)
- Include CTA (checkbox)

Store as JSON in `platform_defaults` field.

---

## Shared requirements

**React Query setup:**
- Use `useQuery` for all GET requests
- Use `useMutation` for POST/PATCH/DELETE
- Always invalidate relevant queries on mutation success
- Show loading spinners during fetches
- Show error messages if requests fail

**Form handling:**
- Use controlled components with `useState` — no form library needed
- Validate required fields before submitting
- Disable submit button while mutation is in flight
- Show success toast/message after save (a simple "Saved!" text that
  fades out after 2 seconds is fine)

**API client:**
The api client is at `src/lib/api.ts`. Use it for all requests.
The supabase client is at `src/lib/supabase.ts`. Use it for Storage only.

---

## Acceptance criteria
- [ ] User can add API keys for any provider
- [ ] API key input is masked (type=password) with show/hide toggle
- [ ] Validate button shows success/failure inline
- [ ] Remove key works with confirmation
- [ ] User can create multiple clients
- [ ] Selecting a client loads their data into the form
- [ ] Saving a client updates it without losing the selection
- [ ] Logo upload works and shows preview
- [ ] Platform defaults section is present (collapsible ok)
- [ ] No TypeScript errors
- [ ] All mutations invalidate the correct queries
