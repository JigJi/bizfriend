-- ============================================
-- Storage Buckets
-- ============================================

-- สร้าง bucket สำหรับเก็บรูป
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),
  ('covers', 'covers', true),
  ('photos', 'photos', true),
  ('chat-images', 'chat-images', true);

-- ========== Storage Policies ==========

-- Avatars: ทุกคนดูได้, อัปโหลด/ลบได้แค่ของตัวเอง
CREATE POLICY "Avatars: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Avatars: upload own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Avatars: delete own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Covers
CREATE POLICY "Covers: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'covers');

CREATE POLICY "Covers: upload own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Covers: delete own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'covers' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Photos
CREATE POLICY "Photos storage: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'photos');

CREATE POLICY "Photos storage: upload own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Photos storage: delete own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Chat Images
CREATE POLICY "Chat images: read by authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'chat-images');

CREATE POLICY "Chat images: upload own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-images' AND (storage.foldername(name))[1] = auth.uid()::text);
