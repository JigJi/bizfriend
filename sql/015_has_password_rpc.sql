-- ============================================
-- RPC: i_have_password
-- ============================================
-- เช็คว่า user ปัจจุบันมีรหัสผ่านในระบบหรือไม่
-- ใช้ใน settings.html เพื่อสลับระหว่าง "ตั้งรหัสผ่าน" / "เปลี่ยนรหัสผ่าน"
--
-- เหตุผล: Supabase ไม่ได้เพิ่ม email identity ใน user.identities เมื่อ OAuth user
-- ตั้ง password ครั้งแรก ทำให้ client detect ไม่ได้ — เช็คจาก server แทน
-- ============================================

CREATE OR REPLACE FUNCTION public.i_have_password()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := auth.uid();
  pw text;
BEGIN
  IF me IS NULL THEN
    RETURN false;
  END IF;

  SELECT encrypted_password INTO pw FROM auth.users WHERE id = me;
  RETURN pw IS NOT NULL AND pw <> '';
END;
$$;

GRANT EXECUTE ON FUNCTION public.i_have_password() TO authenticated;
