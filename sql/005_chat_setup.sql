-- ============================================
-- Chat: fix RLS recursion + tighten + enable realtime
-- ============================================

-- ============================================
-- 1) Helper function (SECURITY DEFINER bypasses RLS during the check)
--    ใช้แทน EXISTS subquery ที่ recursive
-- ============================================
CREATE OR REPLACE FUNCTION public.is_conversation_participant(conv_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = conv_id
      AND user_id = auth.uid()
  );
$$;

-- ============================================
-- 2) Drop policies เก่าที่ recursive / หลวม
-- ============================================
DROP POLICY IF EXISTS "Conversations: view own"          ON public.conversations;
DROP POLICY IF EXISTS "Conv participants: view own"      ON public.conversation_participants;
DROP POLICY IF EXISTS "Conv participants: insert"        ON public.conversation_participants;
DROP POLICY IF EXISTS "Messages: view own conversations" ON public.messages;
DROP POLICY IF EXISTS "Messages: send in own conversations" ON public.messages;
DROP POLICY IF EXISTS "Messages: mark as read"           ON public.messages;

-- ============================================
-- 3) Conversations
-- ============================================
CREATE POLICY "Conversations: view own"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (public.is_conversation_participant(id));

-- ============================================
-- 4) Conversation Participants
-- ============================================
-- ดู participant ของ conversation ที่ตัวเองอยู่ (รวมทั้งของ "อีกฝ่าย" ด้วย)
CREATE POLICY "Conv participants: view own"
  ON public.conversation_participants FOR SELECT
  TO authenticated
  USING (public.is_conversation_participant(conversation_id));

-- เพิ่มได้แค่ตัวเอง (ไม่ใช่ใครก็ได้แอบเพิ่มตัวเองเข้า conv คนอื่น)
-- Note: app จะสร้าง 1-on-1 chat โดย client เป็นคน insert ทั้ง 2 row
-- ดังนั้น user ต้องสามารถ insert ทั้ง row ของตัวเอง + row ของอีกฝ่าย
-- เราเลยอนุญาตให้ insert row ที่:
--   (a) เป็น user_id ของตัวเอง  หรือ
--   (b) อีกฝ่ายใน conversation ที่ตัวเองเป็น participant อยู่แล้ว
CREATE POLICY "Conv participants: insert self or for own conv"
  ON public.conversation_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_conversation_participant(conversation_id)
  );

-- ============================================
-- 5) Messages
-- ============================================
CREATE POLICY "Messages: view own conversations"
  ON public.messages FOR SELECT
  TO authenticated
  USING (public.is_conversation_participant(conversation_id));

CREATE POLICY "Messages: send in own conversations"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND public.is_conversation_participant(conversation_id)
  );

-- mark as read — อยู่ใน conv เดียวกันก็แก้ read_at ได้ (ของข้อความฝั่งตรงข้าม)
CREATE POLICY "Messages: mark as read"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (public.is_conversation_participant(conversation_id))
  WITH CHECK (public.is_conversation_participant(conversation_id));

-- ============================================
-- 6) Enable Realtime publication
--    ให้ Supabase Realtime ส่ง event ของตารางพวกนี้
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversation_participants'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants';
  END IF;
END $$;
