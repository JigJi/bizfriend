-- ============================================
-- RPC: delete_my_account
-- ============================================
-- ให้ผู้ใช้ลบบัญชีตัวเองได้จาก client (ไม่ต้องใช้ service_role)
-- ลบจาก auth.users → cascade ไปที่ profiles + ทุก table ที่มี FK ON DELETE CASCADE
-- ============================================

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := auth.uid();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  DELETE FROM auth.users WHERE id = me;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
