-- ============================================
-- Posts: updated_at column + auto-update trigger
-- ============================================
-- NULL by default → ถ้า NOT NULL แปลว่าเคยแก้ไข
-- ============================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NULL;

DROP TRIGGER IF EXISTS posts_updated_at ON public.posts;
CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
