-- ============================================
-- Fix: handle_new_user() ให้รองรับ anonymous users (signInAnonymously)
-- ============================================
-- ปัญหา: anonymous user ไม่มี email และไม่มี raw_user_meta_data
-- → COALESCE returns NULL → ละเมิด NOT NULL constraint บน profiles.display_name
-- → trigger fail → auth.users insert rollback → 500 error
--
-- แก้: ใช้ NEW.is_anonymous เพื่อ default เป็น 'Guest' + fallback สุดท้าย
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    CASE
      WHEN NEW.is_anonymous THEN 'Guest'
      ELSE COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
        NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
        NULLIF(NEW.raw_user_meta_data->>'name', ''),
        NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
        'ผู้ใช้ใหม่'
      )
    END,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''),
      NULLIF(NEW.raw_user_meta_data->>'picture', ''),
      ''
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
