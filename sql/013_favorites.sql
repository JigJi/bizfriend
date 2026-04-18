-- ============================================
-- Favorites: user favorites other users
-- ============================================

CREATE TABLE IF NOT EXISTS public.favorites (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  favorited_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, favorited_user_id),
  CHECK (user_id <> favorited_user_id)
);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

-- User เห็นแค่ favorites ของตัวเอง
DROP POLICY IF EXISTS "Favorites: view own" ON public.favorites;
CREATE POLICY "Favorites: view own"
  ON public.favorites FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Favorites: insert own" ON public.favorites;
CREATE POLICY "Favorites: insert own"
  ON public.favorites FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Favorites: delete own" ON public.favorites;
CREATE POLICY "Favorites: delete own"
  ON public.favorites FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_favorites_user ON public.favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_favorited ON public.favorites(favorited_user_id);
