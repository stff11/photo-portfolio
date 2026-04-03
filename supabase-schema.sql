-- Photography Portfolio Database Schema for Supabase

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Photos table
CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cloudinary_url TEXT NOT NULL,
  cloudinary_public_id TEXT NOT NULL,
  title TEXT,
  description TEXT,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tags table
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Photo-Tags junction table (many-to-many relationship)
CREATE TABLE photo_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  photo_id UUID REFERENCES photos(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(photo_id, tag_id)
);

-- Indexes for performance
CREATE INDEX idx_photo_tags_photo_id ON photo_tags(photo_id);
CREATE INDEX idx_photo_tags_tag_id ON photo_tags(tag_id);
CREATE INDEX idx_photos_created_at ON photos(created_at DESC);
CREATE INDEX idx_tags_name ON tags(name);

-- Enable Row Level Security
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_tags ENABLE ROW LEVEL SECURITY;

-- RLS Policies for photos table
-- Public read access
CREATE POLICY "Public read access for photos"
  ON photos
  FOR SELECT
  TO public
  USING (true);

-- Authenticated users can insert
CREATE POLICY "Authenticated users can insert photos"
  ON photos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update
CREATE POLICY "Authenticated users can update photos"
  ON photos
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Authenticated users can delete
CREATE POLICY "Authenticated users can delete photos"
  ON photos
  FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for tags table
-- Public read access
CREATE POLICY "Public read access for tags"
  ON tags
  FOR SELECT
  TO public
  USING (true);

-- Authenticated users can insert
CREATE POLICY "Authenticated users can insert tags"
  ON tags
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for photo_tags table
-- Public read access
CREATE POLICY "Public read access for photo_tags"
  ON photo_tags
  FOR SELECT
  TO public
  USING (true);

-- Authenticated users can insert
CREATE POLICY "Authenticated users can insert photo_tags"
  ON photo_tags
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can delete
CREATE POLICY "Authenticated users can delete photo_tags"
  ON photo_tags
  FOR DELETE
  TO authenticated
  USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on photos
CREATE TRIGGER update_photos_updated_at
  BEFORE UPDATE ON photos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Optional: Function to clean up unused tags
CREATE OR REPLACE FUNCTION cleanup_unused_tags()
RETURNS void AS $$
BEGIN
  DELETE FROM tags
  WHERE id NOT IN (
    SELECT DISTINCT tag_id FROM photo_tags
  );
END;
$$ LANGUAGE plpgsql;
