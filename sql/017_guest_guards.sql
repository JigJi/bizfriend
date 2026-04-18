-- ============================================
-- Guest (anonymous) user guards
-- ============================================
-- Anonymous users (signInAnonymously) มี role 'authenticated' แต่ JWT มี is_anonymous=true
-- ป้องกัน guest ทำ write actions ผ่าน RLS ระดับ DB (belt-and-suspenders นอกจาก UI guards)
--
-- Helper: (auth.jwt() ->> 'is_anonymous')::boolean = true → คือ guest
-- ============================================

-- ========== Posts: guest โพสต์ไม่ได้ ==========
DROP POLICY IF EXISTS "Posts: insert own" ON public.posts;
CREATE POLICY "Posts: insert own"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

-- ========== Messages: guest ส่งข้อความไม่ได้ ==========
DROP POLICY IF EXISTS "Messages: send in own conversations" ON public.messages;
CREATE POLICY "Messages: send in own conversations"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
    )
  );

-- ========== Favorites: guest กดหัวใจไม่ได้ ==========
DROP POLICY IF EXISTS "Favorites: insert own" ON public.favorites;
CREATE POLICY "Favorites: insert own"
  ON public.favorites FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

-- ========== Blocks: guest บล็อกไม่ได้ (ไม่จำเป็น เพราะ guest ทำอะไร user หลักไม่ได้อยู่แล้ว) ==========
DROP POLICY IF EXISTS "Blocks: insert own" ON public.blocks;
CREATE POLICY "Blocks: insert own"
  ON public.blocks FOR INSERT
  TO authenticated
  WITH CHECK (
    blocker_id = auth.uid()
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

-- ========== Photos: guest อัปโหลดรูปไม่ได้ ==========
DROP POLICY IF EXISTS "Photos: insert own" ON public.photos;
CREATE POLICY "Photos: insert own"
  ON public.photos FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

-- ========== Interests / Social Links: guest แก้โปรไฟล์ไม่ได้ ==========
DROP POLICY IF EXISTS "Interests: manage own" ON public.interests;
CREATE POLICY "Interests: manage own"
  ON public.interests FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

DROP POLICY IF EXISTS "Social links: manage own" ON public.social_links;
CREATE POLICY "Social links: manage own"
  ON public.social_links FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

-- ========== Profiles: guest แก้ profile ไม่ได้ ==========
-- (จริงๆ guest ไม่ควรมี profile row อยู่แล้ว แต่กันไว้เผื่อ)
DROP POLICY IF EXISTS "Profiles: editable by owner" ON public.profiles;
CREATE POLICY "Profiles: editable by owner"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

-- ========== create_direct_conversation RPC: ปฏิเสธ guest ==========
CREATE OR REPLACE FUNCTION public.create_direct_conversation(other_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := auth.uid();
  is_anon boolean := COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false);
  existing_conv UUID;
  new_conv UUID;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF is_anon THEN
    RAISE EXCEPTION 'guest_must_register';
  END IF;

  IF other_user_id = me THEN
    RAISE EXCEPTION 'cannot create conversation with self';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = other_user_id) THEN
    RAISE EXCEPTION 'target user not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = me AND blocked_id = other_user_id)
       OR (blocker_id = other_user_id AND blocked_id = me)
  ) THEN
    RAISE EXCEPTION 'blocked';
  END IF;

  SELECT cp1.conversation_id INTO existing_conv
  FROM public.conversation_participants cp1
  JOIN public.conversation_participants cp2
    ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = me
    AND cp2.user_id = other_user_id
    AND (
      SELECT count(*)
      FROM public.conversation_participants cp3
      WHERE cp3.conversation_id = cp1.conversation_id
    ) = 2
  LIMIT 1;

  IF existing_conv IS NOT NULL THEN
    RETURN existing_conv;
  END IF;

  INSERT INTO public.conversations DEFAULT VALUES
  RETURNING id INTO new_conv;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (new_conv, me);

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (new_conv, other_user_id);

  RETURN new_conv;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_direct_conversation(UUID) TO authenticated;
