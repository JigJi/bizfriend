-- ============================================
-- Storage: UPDATE policies
-- ============================================
-- supabase.storage.upload(..., { upsert: true }) ใช้ INSERT ... ON CONFLICT DO UPDATE
-- ต้องมี UPDATE policy ถึงจะเขียนทับไฟล์เดิมได้ (เช่น avatar.png เดิม)
-- ============================================

CREATE POLICY "Avatars: update own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Covers: update own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'covers' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Photos storage: update own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);
