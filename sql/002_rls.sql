-- ============================================
-- Row Level Security Policies
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ========== Profiles ==========
-- ทุกคนดูโปรไฟล์ได้ (logged in)
CREATE POLICY "Profiles: viewable by authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- แก้ได้แค่ของตัวเอง
CREATE POLICY "Profiles: editable by owner"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- ========== Photos ==========
CREATE POLICY "Photos: viewable by authenticated"
  ON public.photos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Photos: insert own"
  ON public.photos FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Photos: delete own"
  ON public.photos FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ========== Interests ==========
CREATE POLICY "Interests: viewable by authenticated"
  ON public.interests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Interests: manage own"
  ON public.interests FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);

-- ========== Social Links ==========
CREATE POLICY "Social links: viewable by authenticated"
  ON public.social_links FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Social links: manage own"
  ON public.social_links FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);

-- ========== Posts ==========
-- ทุกคนดูโพสต์ได้
CREATE POLICY "Posts: viewable by authenticated"
  ON public.posts FOR SELECT
  TO authenticated
  USING (true);

-- สร้าง/แก้/ลบ ได้แค่ของตัวเอง
CREATE POLICY "Posts: insert own"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Posts: update own"
  ON public.posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Posts: delete own"
  ON public.posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ========== Friends ==========
-- ดูได้ถ้าเป็นคู่กัน
CREATE POLICY "Friends: view own"
  ON public.friends FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- ส่งคำขอได้
CREATE POLICY "Friends: send request"
  ON public.friends FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- อัปเดตได้ถ้าเป็นฝ่ายรับ (accept/block)
CREATE POLICY "Friends: respond to request"
  ON public.friends FOR UPDATE
  TO authenticated
  USING (auth.uid() = friend_id);

-- ลบได้ถ้าเป็นคู่กัน (unfriend)
CREATE POLICY "Friends: delete own"
  ON public.friends FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- ========== Conversations ==========
-- ดูได้ถ้าเป็น participant
CREATE POLICY "Conversations: view own"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = id AND user_id = auth.uid()
    )
  );

-- สร้างได้
CREATE POLICY "Conversations: create"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ========== Conversation Participants ==========
CREATE POLICY "Conv participants: view own"
  ON public.conversation_participants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversation_id AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Conv participants: insert"
  ON public.conversation_participants FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ========== Messages ==========
-- ดูได้ถ้าอยู่ใน conversation
CREATE POLICY "Messages: view own conversations"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
    )
  );

-- ส่งข้อความได้ถ้าอยู่ใน conversation
CREATE POLICY "Messages: send in own conversations"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
    )
  );

-- อัปเดต read_at ได้ (mark as read)
CREATE POLICY "Messages: mark as read"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
    )
  );
