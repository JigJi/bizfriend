-- ============================================
-- RPC: get_my_conversations
-- ============================================
-- รวม 3 query (myParts + otherParts + lastMessages) ให้เหลือ round trip เดียว
-- ลดเวลาโหลดหน้า chat ~60%
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
  ),
  last_msgs AS (
    SELECT DISTINCT ON (conversation_id)
      conversation_id, content, created_at, sender_id
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
