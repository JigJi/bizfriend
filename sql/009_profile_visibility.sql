-- ============================================
-- Profile visibility (Client-side enforcement MVP)
-- ============================================
-- public  = คนอื่นเห็นทุกอย่าง (default)
-- limited = ซ่อนรูป/โพสต์/social/ข้อมูลพื้นฐาน
-- private = โชว์แค่ชื่อ + avatar + placeholder
-- ============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_visibility TEXT DEFAULT 'public'
    CHECK (profile_visibility IN ('public', 'limited', 'private'));
