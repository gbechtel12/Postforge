-- Seed: platform registry
-- Run after migrations via: supabase db seed
-- Or included in supabase/seed.sql

INSERT INTO platforms (id, slug, display_name, max_caption_chars, aspect_ratio, formatting_rules)
VALUES
  (gen_random_uuid(), 'facebook',  'Facebook',  63206, '1.91:1',
   '{"hashtag_position":"bottom","max_hashtags":10,"line_break_before_cta":true,"emoji_friendly":true}'::jsonb),

  (gen_random_uuid(), 'instagram', 'Instagram', 2200,  '1:1',
   '{"hashtag_position":"bottom","max_hashtags":30,"line_break_before_cta":true,"emoji_friendly":true}'::jsonb),

  (gen_random_uuid(), 'linkedin',  'LinkedIn',  3000,  '1.91:1',
   '{"hashtag_position":"bottom","max_hashtags":5,"line_break_before_cta":true,"emoji_friendly":false}'::jsonb),

  (gen_random_uuid(), 'x',         'X (Twitter)', 280, '16:9',
   '{"hashtag_position":"inline","max_hashtags":2,"line_break_before_cta":false,"emoji_friendly":true}'::jsonb),

  (gen_random_uuid(), 'tiktok',    'TikTok',    2200,  '9:16',
   '{"hashtag_position":"bottom","max_hashtags":5,"line_break_before_cta":false,"emoji_friendly":true}'::jsonb)

ON CONFLICT (slug) DO NOTHING;
