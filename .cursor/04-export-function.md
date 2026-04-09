# Agent 4 — Export Edge Function

## Your job
Implement the export Edge Function that packages generated posts into
CSV, JSON, or ZIP format for download.

## Output file
`supabase/functions/export/index.ts`

## Pattern reference
Read `supabase/functions/clients/index.ts` for base structure.
Read `supabase/functions/_shared/` for all helpers.

---

## Routes

### POST /export

**Request body:**
```typescript
{
  job_id: string           // uuid — required
  format: 'csv' | 'json' | 'zip'
  include_images?: boolean // default true, ZIP only
  status_filter?: 'all' | 'approved' // default 'all'
}
```

**Steps:**
1. Validate required fields
2. Verify job exists and belongs to user
3. Verify job status is `complete` — return 400 if not
4. Fetch posts filtered by job_id + user_id, apply status_filter if `approved`
5. For `csv` and `json` — process synchronously, return 200
6. For `zip` — create export_batches record, process async, return 202

**CSV format:**
Each post becomes one row:
```
day_number,platform,caption,image_prompt,image_url,status
1,Instagram,"Your caption here","Image prompt here","https://...",approved
```
Use proper CSV escaping (wrap fields in quotes, escape internal quotes).

Return as `Content-Type: text/csv` with header:
`Content-Disposition: attachment; filename="postforge-export-{jobId}.csv"`

Also create an `export_batches` record for tracking.

**JSON format:**
Return the posts array directly with all fields.
Also create an `export_batches` record.

**ZIP format:**
1. Create `export_batches` record with status `processing`
2. Return 202 with the batch record immediately
3. Use `EdgeRuntime.waitUntil()` for background processing:
   - For each post, create a text file: `day-{N}-{platform}.txt`
     containing the caption on line 1, then image prompt below a divider
   - If `include_images` is true and post has `image_url`:
     fetch the image and include as `day-{N}-{platform}.jpg`
   - Bundle into a ZIP using the `fflate` library (available via esm.sh):
     ```typescript
     import { zipSync, strToU8 } from 'https://esm.sh/fflate@0.8.2'
     ```
   - Upload the ZIP to Supabase Storage at:
     `exports/{userId}/{jobId}/{batchId}.zip`
   - Update `export_batches` with `storage_path` and status `complete`

### GET /export/:batchId/download

**Steps:**
1. Requires auth
2. Fetch export_batches record, verify it belongs to user
3. Verify status is `complete` — return 404 if not ready
4. Generate a signed URL from Supabase Storage (15 minute expiry):
   ```typescript
   const { data } = await supabase.storage
     .from('exports')
     .createSignedUrl(batch.storage_path, 900) // 900 seconds = 15 min
   ```
5. Return:
   ```typescript
   {
     download_url: string,
     expires_at: string // ISO timestamp 15 min from now
   }
   ```

---

## Storage bucket setup note
Add a comment at the top of the file noting that the `exports` storage
bucket must exist. It should be created in the migration or seed:
```sql
-- Note: run this in Supabase dashboard or migration
INSERT INTO storage.buckets (id, name, public)
VALUES ('exports', 'exports', false);
```

---

## Acceptance criteria
- [ ] CSV export returns valid CSV with proper escaping
- [ ] JSON export returns posts array matching OpenAPI schema
- [ ] ZIP returns 202 immediately, processes in background
- [ ] Signed download URL expires in 15 minutes
- [ ] export_batches record created for all three formats
- [ ] Status filter works — `approved` only returns approved posts
- [ ] 400 returned if job is not yet complete
- [ ] 404 returned if ZIP not ready when download URL requested
