-- ============================================
-- Blocks: user blocks another user
-- ============================================
-- เมื่อ A block B:
-- - A ไม่เห็น B ในหน้า network (posts), chat list, conversations
-- - B ไม่เห็น A เช่นกัน (mutual hide)
-- - ทั้งสองสร้าง DM ใหม่หากันไม่ได้
-- - favorites ระหว่างกันถูกลบทั้งสองทิศทาง
-- ============================================

CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Blocks: view own" ON public.blocks;
CREATE POLICY "Blocks: view own"
  ON public.blocks FOR SELECT
  TO authenticated
  USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Blocks: insert own" ON public.blocks;
CREATE POLICY "Blocks: insert own"
  ON public.blocks FOR INSERT
  TO authenticated
  WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Blocks: delete own" ON public.blocks;
CREATE POLICY "Blocks: delete own"
  ON public.blocks FOR DELETE
  TO authenticated
  USING (blocker_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON public.blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON public.blocks(blocked_id);

-- ============================================
-- RPC: block_user — block + ลบ favorites ทั้งสองทิศทาง
-- ============================================
CREATE OR REPLACE FUNCTION public.block_user(target_id UUID)
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

  IF target_id = me THEN
    RAISE EXCEPTION 'cannot block self';
  END IF;

  -- เพิ่มลง blocks (idempotent)
  INSERT INTO public.blocks (blocker_id, blocked_id)
  VALUES (me, target_id)
  ON CONFLICT DO NOTHING;

  -- ลบ favorites ทั้งสองทิศทาง
  DELETE FROM public.favorites
  WHERE (user_id = me AND favorited_user_id = target_id)
     OR (user_id = target_id AND favorited_user_id = me);
END;
$$;

GRANT EXECUTE ON FUNCTION public.block_user(UUID) TO authenticated;

-- ============================================
-- RPC: unblock_user
-- ============================================
CREATE OR REPLACE FUNCTION public.unblock_user(target_id UUID)
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

  DELETE FROM public.blocks
  WHERE blocker_id = me AND blocked_id = target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unblock_user(UUID) TO authenticated;

-- ============================================
-- RPC: my_blocked_users — รายชื่อคนที่เราบล็อก (สำหรับหน้า settings)
-- ============================================
CREATE OR REPLACE FUNCTION public.my_blocked_users()
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  blocked_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.blocked_id AS user_id,
         p.display_name,
         p.avatar_url,
         b.created_at AS blocked_at
  FROM blocks b
  JOIN profiles p ON p.id = b.blocked_id
  WHERE b.blocker_id = auth.uid()
  ORDER BY b.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.my_blocked_users() TO authenticated;

-- ============================================
-- Update: get_my_conversations — filter ไม่ให้เห็น conv ที่อีกฝ่าย block หรือถูกเรา block
-- ============================================
CREATE OR REPLACE FUNCTION public.get_my_conversations()
RETURNS TABLE (
  id UUID,
  other_user_id UUID,
  other_display_name TEXT,
  other_avatar_url TEXT,
  last_message_content TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_sender UUID,
  unread_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_convs AS (
    SELECT conversation_id
    FROM conversation_participants
    WHERE user_id = auth.uid()
  ),
  others AS (
    SELECT cp.conversation_id, cp.user_id, p.display_name, p.avatar_url
    FROM conversation_participants cp
    JOIN profiles p ON p.id = cp.user_id
    WHERE cp.conversation_id IN (SELECT conversation_id FROM my_convs)
      AND cp.user_id <> auth.uid()
      -- ซ่อนถ้าเรา block อีกฝ่าย หรือ อีกฝ่าย block เรา
      AND NOT EXISTS (
        SELECT 1 FROM blocks
        WHERE (blocker_id = auth.uid() AND blocked_id = cp.user_id)
           OR (blocker_id = cp.user_id AND blocked_id = auth.uid())
      )
  ),
  last_msgs AS (
    SELECT DISTINCT ON (conversation_id)
      conversation_id, content, created_at, sender_id
    FROM messages
    WHERE conversation_id IN (SELECT conversation_id FROM others)
    ORDER BY conversation_id, created_at DESC
  ),
  unread AS (
    SELECT conversation_id, count(*)::INTEGER AS cnt
    FROM messages
    WHERE conversation_id IN (SELECT conversation_id FROM others)
      AND sender_id <> auth.uid()
      AND read_at IS NULL
    GROUP BY conversation_id
  )
  SELECT
    o.conversation_id AS id,
    o.user_id AS other_user_id,
    o.display_name AS other_display_name,
    o.avatar_url AS other_avatar_url,
    lm.content AS last_message_content,
    lm.created_at AS last_message_at,
    lm.sender_id AS last_message_sender,
    COALESCE(u.cnt, 0) AS unread_count
  FROM others o
  LEFT JOIN last_msgs lm ON lm.conversation_id = o.conversation_id
  LEFT JOIN unread u ON u.conversation_id = o.conversation_id
  ORDER BY lm.created_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_conversations() TO authenticated;

-- ============================================
-- Update: create_direct_conversation — กันการสร้าง DM ระหว่างคู่ที่ block กัน
-- ============================================
CREATE OR REPLACE FUNCTION public.create_direct_conversation(other_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := auth.uid();
  existing_conv UUID;
  new_conv UUID;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF other_user_id = me THEN
    RAISE EXCEPTION 'cannot create conversation with self';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = other_user_id) THEN
    RAISE EXCEPTION 'target user not found';
  END IF;

  -- เช็ค block ทั้งสองทิศทาง
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

-- ============================================
-- Update: Posts SELECT policy — ซ่อนโพสต์ของคนที่ block กัน
-- ============================================
DROP POLICY IF EXISTS "Posts: viewable by authenticated" ON public.posts;
CREATE POLICY "Posts: viewable by authenticated"
  ON public.posts FOR SELECT
  TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.blocks
      WHERE (blocker_id = auth.uid() AND blocked_id = posts.user_id)
         OR (blocker_id = posts.user_id AND blocked_id = auth.uid())
    )
  );

-- ============================================
-- Update: Profiles SELECT policy — ซ่อนโปรไฟล์ของคนที่ block กัน
-- ============================================
-- Note: profiles ถูกใช้ join กับ posts/conversations หลายที่ — ถ้าซ่อนทั้งหมดจะ break
-- ทางที่ปลอดภัย: เก็บนโยบายเดิมไว้ ดู profile โดยตรงทำได้
-- (ถ้าอยาก hard-hide จริงๆ ควรทำ app-level redirect ใน profile.js)
-- ============================================
