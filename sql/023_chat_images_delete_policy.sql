-- ============================================
-- chat-images: allow owner to DELETE own files
-- ============================================
-- สำหรับ storage cleanup เมื่อ user ลบข้อความรูป (unsend)
-- Path pattern: {user_id}/{conv_id}/{timestamp}.{ext}
-- → check folder แรก = auth.uid() เหมือน INSERT policy
-- ============================================

CREATE POLICY "chat-images: delete own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
