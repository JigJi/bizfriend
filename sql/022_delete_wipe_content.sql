-- ============================================
-- Revert delete_my_message: wipe content on delete (privacy)
-- ============================================
-- เปลี่ยน UX เป็น confirm-before-delete (ไม่มี undo) แล้ว ไม่ต้องเก็บ
-- content ไว้สำหรับ restore อีก — เคลียร์ทิ้งเพื่อ privacy
-- restore_my_message เก็บไว้ก็ได้ (ไม่ถูกเรียกแล้ว ไม่เสียหาย)
-- ============================================

CREATE OR REPLACE FUNCTION public.delete_my_message(message_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE messages
  SET deleted_at = NOW(),
      content = ''
  WHERE id = message_id
    AND sender_id = auth.uid()
    AND deleted_at IS NULL;
  RETURN FOUND;
END;
$$;
