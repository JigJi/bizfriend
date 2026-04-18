-- ============================================
-- bizfriend Database Schema
-- Supabase (PostgreSQL)
-- ============================================

-- 1. Profiles (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  bio TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  cover_url TEXT DEFAULT '',
  age SMALLINT,
  weight SMALLINT,
  height SMALLINT,
  role TEXT CHECK (role IN ('รุก', 'รับ', 'โบ้ท', 'ไบ', 'ชายแท้')),
  province TEXT DEFAULT '',
  education TEXT DEFAULT '',
  work TEXT DEFAULT '',
  languages TEXT DEFAULT '',
  looking_for TEXT[] DEFAULT '{}',
  show_personal_info BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Photos
CREATE TABLE public.photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Interests
CREATE TABLE public.interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  UNIQUE(user_id, name)
);

-- 4. Social Links
CREATE TABLE public.social_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  username TEXT NOT NULL,
  url TEXT DEFAULT '',
  UNIQUE(user_id, platform)
);

-- 5. Posts (หาเพื่อน)
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  tag TEXT CHECK (tag IN ('หาเพื่อน', 'หาแฟน', 'หาคนคุย', 'หาเพื่อนเที่ยว')),
  province TEXT DEFAULT '',
  show_personal_info BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Friends
CREATE TABLE public.friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, friend_id)
);

-- 7. Conversations
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Conversation Participants
CREATE TABLE public.conversation_participants (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

-- 9. Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  type TEXT DEFAULT 'text' CHECK (type IN ('text', 'image')),
  image_url TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_posts_user ON public.posts(user_id);
CREATE INDEX idx_posts_created ON public.posts(created_at DESC);
CREATE INDEX idx_posts_tag ON public.posts(tag);
CREATE INDEX idx_messages_conv ON public.messages(conversation_id, created_at);
CREATE INDEX idx_messages_unread ON public.messages(conversation_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_friends_user ON public.friends(user_id, status);
CREATE INDEX idx_friends_friend ON public.friends(friend_id, status);
CREATE INDEX idx_photos_user ON public.photos(user_id, sort_order);
CREATE INDEX idx_conv_participants ON public.conversation_participants(user_id);

-- ============================================
-- Auto-create profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- Auto-update updated_at
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
