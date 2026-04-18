-- ============================================
-- Fix: handle_new_user() ให้รองรับ Google OAuth
-- ============================================
-- ปัญหาเดิม: trigger ดึงเฉพาะ raw_user_meta_data->>'display_name'
-- ซึ่ง Google OAuth ไม่ได้ส่งมา (Google ส่งเป็น full_name / name)
-- ผลคือ user ที่สมัครด้วย Google จะได้ display_name ว่าง
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      split_part(NEW.email, '@', 1)
    ),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''),
      NULLIF(NEW.raw_user_meta_data->>'picture', ''),
      ''
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
