-- SQL to create stats table for tracking portrait count
-- Copy and paste into Supabase SQL Editor

-- Step 1: Create stats table
CREATE TABLE IF NOT EXISTS stats (
  id TEXT PRIMARY KEY DEFAULT 'global',
  portraits_created INTEGER DEFAULT 335,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Insert initial row with starting count of 335
INSERT INTO stats (id, portraits_created) 
VALUES ('global', 335)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Enable Row Level Security
ALTER TABLE stats ENABLE ROW LEVEL SECURITY;

-- Step 4: Create policies
DROP POLICY IF EXISTS "Enable read for everyone" ON stats;
CREATE POLICY "Enable read for everyone" ON stats
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Enable update for service role" ON stats;
CREATE POLICY "Enable update for service role" ON stats
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Enable insert for service role" ON stats;
CREATE POLICY "Enable insert for service role" ON stats
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Step 5: Create function to increment portrait count
CREATE OR REPLACE FUNCTION increment_portrait_count()
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE stats 
  SET portraits_created = portraits_created + 1,
      updated_at = NOW()
  WHERE id = 'global'
  RETURNING portraits_created INTO new_count;
  
  RETURN new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service_role and anon (for reading)
GRANT EXECUTE ON FUNCTION increment_portrait_count TO service_role;
GRANT SELECT ON stats TO anon;
GRANT SELECT ON stats TO authenticated;
GRANT ALL ON stats TO service_role;



