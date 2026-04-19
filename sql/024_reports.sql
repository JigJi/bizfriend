-- ============================================
-- Reports: user สามารถรายงานโพสต์/ผู้ใช้ที่ไม่เหมาะสม
-- ============================================
-- เก็บ reports ไว้ใน DB — ไว้สร้าง admin review panel ภายหลัง
-- RLS: reporter ดู reports ของตัวเองได้ (ไว้ track status), คนอื่นดูไม่ได้
-- Unique constraint: กัน duplicate (reporter + target + post + reason)
-- ============================================

CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam','harassment','inappropriate','impersonation','other')),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','actioned','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

-- Dedup: คนเดียวกัน report post เดียวกัน reason เดียวกัน = ครั้งเดียว
CREATE UNIQUE INDEX IF NOT EXISTS reports_dedup
  ON public.reports (reporter_id, reported_user_id, COALESCE(post_id, '00000000-0000-0000-0000-000000000000'::UUID), reason);

CREATE INDEX IF NOT EXISTS reports_reported_user_idx ON public.reports (reported_user_id, status);
CREATE INDEX IF NOT EXISTS reports_status_idx ON public.reports (status, created_at DESC);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Reporter อ่าน reports ที่ตัวเอง submit ได้ (เพื่อเช็ค status)
DROP POLICY IF EXISTS "Reports: reporter view own" ON public.reports;
CREATE POLICY "Reports: reporter view own"
  ON public.reports FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());

-- Insert ไม่ได้ตรง ไปใช้ RPC (เพื่อ enforce check ตัวเองไม่ได้)

-- ============================================
-- RPC: report_user
-- ============================================
CREATE OR REPLACE FUNCTION public.report_user(
  target_user_id UUID,
  post_id_param UUID,
  reason_param TEXT,
  details_param TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF target_user_id IS NULL OR target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot report self or null target';
  END IF;
  IF reason_param NOT IN ('spam','harassment','inappropriate','impersonation','other') THEN
    RAISE EXCEPTION 'invalid reason';
  END IF;

  INSERT INTO public.reports (reporter_id, reported_user_id, post_id, reason, details)
  VALUES (auth.uid(), target_user_id, post_id_param, reason_param, details_param)
  ON CONFLICT DO NOTHING;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_user(UUID, UUID, TEXT, TEXT) TO authenticated;
