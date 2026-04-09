# Agent 5 — Auth Flow + App Shell UI

## Your job
Implement a fully working login/register page and the main app shell
(navigation sidebar). After this agent runs, a user should be able to
sign up, log in, see the app layout, and navigate between pages.

## Files to create/update

### 1. `apps/web/src/pages/LoginPage.tsx`

Build a clean, professional login/register page.

**Requirements:**
- Toggle between "Sign in" and "Create account" modes
- Fields: email (always), password (always), full_name (register only)
- On sign in: call `supabase.auth.signInWithPassword({ email, password })`
- On register: call `supabase.auth.signUp({ email, password, options: { data: { full_name } } })`
- On success: navigate to `/dashboard` using `useNavigate()`
- Show inline error message below the form on failure
- Show loading spinner on the submit button while request is in flight
- If already logged in, redirect to `/dashboard` immediately

**Styling:**
- Centered card layout, max-width 400px
- PostForge logo/wordmark at the top (text-based is fine for now)
- Clean Tailwind styling — white card, subtle shadow, good spacing
- Submit button full width, brand color (use `bg-blue-600 hover:bg-blue-700`)
- Error message in red below the button

**Auth store integration:**
The auth store is at `src/stores/authStore.ts`. The `supabase` client is
at `src/lib/supabase.ts`. After successful auth, `authStore` will
automatically pick up the session via the `onAuthStateChange` listener
already wired in the store — no manual store update needed.

---

### 2. `apps/web/src/components/ui/AppShell.tsx`

Replace the stub with a real app layout.

**Layout structure:**
```
┌─────────────┬────────────────────────────┐
│   Sidebar   │                            │
│  (240px)    │     <Outlet /> (main)      │
│             │                            │
│  PostForge  │                            │
│  ─────────  │                            │
│  Dashboard  │                            │
│  Generate   │                            │
│  Settings   │                            │
│             │                            │
│  ─────────  │                            │
│  [Sign out] │                            │
└─────────────┴────────────────────────────┘
```

**Requirements:**
- Fixed sidebar, scrollable main content area
- Active route highlighted in sidebar (use `NavLink` from react-router-dom)
- Sign out button calls `useAuthStore().signOut()` then navigates to `/login`
- Show user email at the bottom of the sidebar above sign out
- Mobile: sidebar collapses to a hamburger menu (bonus — ok to skip for now)

**Nav items:**
```typescript
const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
  { to: '/generate', label: 'Generate', icon: 'Sparkles' },
  { to: '/settings', label: 'Settings', icon: 'Settings' },
]
```

Use `lucide-react` for icons — it's already installed.

**Styling:**
- Sidebar: white background, right border `border-gray-200`
- Active nav item: `bg-blue-50 text-blue-700 font-medium`
- Inactive nav item: `text-gray-600 hover:bg-gray-50`
- Full height: `min-h-screen`

---

### 3. `apps/web/src/pages/DashboardPage.tsx`

Replace the stub with a minimal but real dashboard.

**Show:**
- Welcome message: "Good [morning/afternoon/evening], [user name or email]"
- A "Start generating" CTA card that links to `/generate`
- A recent jobs section (query `generation_jobs` ordered by `created_at DESC`, limit 5)
  - If no jobs yet: show empty state "No posts generated yet — get started above"
  - If jobs exist: show a simple table with columns: Client, Platform, Days, Status, Created

**Data fetching:**
Use React Query. The api client is at `src/lib/api.ts`.
- `GET /generate/{jobId}/status` is not needed here — just list jobs from the API
- Actually: query Supabase directly for simplicity on the dashboard:
  ```typescript
  const { data } = await supabase
    .from('generation_jobs')
    .select('*, clients(name), platforms(display_name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5)
  ```

---

## Acceptance criteria
- [ ] User can sign up with email + password
- [ ] User can sign in with existing credentials
- [ ] Wrong password shows error message inline
- [ ] Successful auth redirects to `/dashboard`
- [ ] Unauthenticated access to protected routes redirects to `/login`
- [ ] App shell renders with working navigation
- [ ] Active route is visually highlighted in sidebar
- [ ] Sign out works and redirects to `/login`
- [ ] Dashboard shows empty state or recent jobs
- [ ] No TypeScript errors
