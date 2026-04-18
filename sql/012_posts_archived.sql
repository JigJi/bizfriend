-- ============================================
-- Posts: archived_at (single active post per user)
-- ============================================
-- NULL = active, NOT NULL = archived (ไม่โชว์ใน feed แต่ยังอยู่ใน profile history)
-- ============================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;

-- Index ช่วย query feed (WHERE archived_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_posts_active
  ON public.posts (created_at DESC)
  WHERE archived_at IS NULL;
