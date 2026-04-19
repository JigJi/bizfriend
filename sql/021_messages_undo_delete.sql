-- ============================================
-- Messages: keep content after delete + add restore RPC (undo window)
-- ============================================
-- เดิม delete_my_message เคลียร์ content ทำให้ undo ไม่ได้
-- เปลี่ยนเป็นแค่ set deleted_at — client ตรวจ deleted_at แล้วซ่อน content เอง
-- เพิ่ม restore_my_message เพื่อ undo ได้ภายใน window (enforce by client timer)
-- ============================================

CREATE OR REPLACE FUNCTION public.delete_my_message(message_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE messages
  SET deleted_at = NOW()
  WHERE id = message_id
    AND sender_id = auth.uid()
    AND deleted_at IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_my_message(message_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE messages
  SET deleted_at = NULL
  WHERE id = message_id
    AND sender_id = auth.uid()
    AND deleted_at IS NOT NULL;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_my_message(UUID) TO authenticated;
