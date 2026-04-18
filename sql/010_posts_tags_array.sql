-- ============================================
-- Posts: tag (TEXT) → tags (TEXT[])
-- ============================================
-- Multi-select: post เลือก tag ได้ 0..N ตัว
-- ============================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Migrate ข้อมูลเก่า: ถ้ามี tag เดิม → ใส่ใน tags[]
UPDATE public.posts
SET tags = ARRAY[tag]
WHERE tag IS NOT NULL AND tag <> '' AND (tags IS NULL OR array_length(tags, 1) IS NULL);

-- Drop column เก่า
ALTER TABLE public.posts DROP COLUMN IF EXISTS tag;

-- Index สำหรับ filter ด้วย contains (เช่น tags @> ARRAY['หาเพื่อน'])
CREATE INDEX IF NOT EXISTS idx_posts_tags ON public.posts USING GIN (tags);
