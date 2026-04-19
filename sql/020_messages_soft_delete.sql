-- ============================================
-- Messages: soft delete (unsend) support
-- ============================================
-- deleted_at: timestamp when sender deleted their message
-- content: wiped to '' on delete for privacy (original text/URL unrecoverable)
-- row kept for audit + placeholder ("ข้อความถูกลบแล้ว")
-- ============================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ============================================
-- RPC: delete_my_message
-- ใช้ RPC เพื่อ enforce "เฉพาะ sender เท่านั้น" + กันไม่ให้ update policy อื่น
-- ที่ permissive เกินแอบเซ็ต deleted_at ได้จาก client
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

GRANT EXECUTE ON FUNCTION public.delete_my_message(UUID) TO authenticated;

-- ============================================
-- Rebuild get_my_conversations to surface deletion state in list preview
-- ============================================
DROP FUNCTION IF EXISTS public.get_my_conversations();

CREATE FUNCTION public.get_my_conversations()
RETURNS TABLE (
  id UUID,
  other_user_id UUID,
  other_display_name TEXT,
  other_avatar_url TEXT,
  last_message_content TEXT,
  last_message_type TEXT,
  last_message_deleted BOOLEAN,
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
  ),
  last_msgs AS (
    SELECT DISTINCT ON (conversation_id)
      conversation_id, content, type, deleted_at, created_at, sender_id
    FROM messages
    WHERE conversation_id IN (SELECT conversation_id FROM my_convs)
    ORDER BY conversation_id, created_at DESC
  ),
  unread AS (
    SELECT conversation_id, count(*)::INTEGER AS cnt
    FROM messages
    WHERE conversation_id IN (SELECT conversation_id FROM my_convs)
      AND sender_id <> auth.uid()
      AND read_at IS NULL
      AND deleted_at IS NULL
    GROUP BY conversation_id
  )
  SELECT
    o.conversation_id AS id,
    o.user_id AS other_user_id,
    o.display_name AS other_display_name,
    o.avatar_url AS other_avatar_url,
    lm.content AS last_message_content,
    lm.type AS last_message_type,
    (lm.deleted_at IS NOT NULL) AS last_message_deleted,
    lm.created_at AS last_message_at,
    lm.sender_id AS last_message_sender,
    COALESCE(u.cnt, 0) AS unread_count
  FROM others o
  LEFT JOIN last_msgs lm ON lm.conversation_id = o.conversation_id
  LEFT JOIN unread u ON u.conversation_id = o.conversation_id
  ORDER BY lm.created_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_conversations() TO authenticated;
