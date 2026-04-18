-- ============================================
-- RPC: create_direct_conversation
-- ============================================
-- ปัญหาเดิม: ถ้าให้ client สร้าง conversation + insert participants เอง
-- จะติด RLS ตอน .select() หลัง insert (เพราะยังไม่ใช่ participant ณ จุดนั้น)
--
-- แก้โดยใช้ SECURITY DEFINER function ทำทุกอย่างใน transaction เดียว
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

  -- หา 1-on-1 conversation ที่มีทั้งเราและเขา (และมีแค่ 2 participants)
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

  -- สร้างใหม่
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
