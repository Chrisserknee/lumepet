-- SQL to create server-side rate limiting table in Supabase
-- This prevents bypassing client-side generation limits
-- Copy and paste into Supabase SQL Editor

-- Step 1: Create rate_limits table for tracking generation usage
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address TEXT NOT NULL,
  fingerprint TEXT, -- Browser fingerprint (optional, for additional tracking)
  generation_count INTEGER DEFAULT 0,
  last_generation_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint on IP to prevent duplicates
  CONSTRAINT unique_ip UNIQUE (ip_address)
);

-- Step 2: Create indexes
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip ON rate_limits(ip_address);
CREATE INDEX IF NOT EXISTS idx_rate_limits_last_generation ON rate_limits(last_generation_at);

-- Step 3: Enable Row Level Security (RLS)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Step 4: Create policies
DROP POLICY IF EXISTS "Enable all operations for service role" ON rate_limits;
CREATE POLICY "Enable all operations for service role" ON rate_limits
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Block public access
DROP POLICY IF EXISTS "Block public access" ON rate_limits;
CREATE POLICY "Block public access" ON rate_limits
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Step 5: Create updated_at trigger
DROP TRIGGER IF EXISTS update_rate_limits_updated_at ON rate_limits;
CREATE TRIGGER update_rate_limits_updated_at
  BEFORE UPDATE ON rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Step 6: Grant permissions
GRANT ALL ON rate_limits TO service_role;

-- Step 7: Function to check and increment rate limit
CREATE OR REPLACE FUNCTION check_generation_limit(
  p_ip_address TEXT,
  p_max_free_generations INTEGER DEFAULT 2,
  p_reset_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  allowed BOOLEAN,
  current_count INTEGER,
  remaining INTEGER,
  reset_at TIMESTAMPTZ
) AS $$
DECLARE
  v_record RECORD;
  v_reset_time TIMESTAMPTZ;
BEGIN
  v_reset_time := NOW() - (p_reset_hours || ' hours')::INTERVAL;
  
  -- Try to get existing record
  SELECT * INTO v_record 
  FROM rate_limits 
  WHERE ip_address = p_ip_address;
  
  IF v_record IS NULL THEN
    -- New user, create record
    INSERT INTO rate_limits (ip_address, generation_count, last_generation_at)
    VALUES (p_ip_address, 1, NOW());
    
    RETURN QUERY SELECT 
      TRUE::BOOLEAN AS allowed,
      1::INTEGER AS current_count,
      (p_max_free_generations - 1)::INTEGER AS remaining,
      (NOW() + (p_reset_hours || ' hours')::INTERVAL)::TIMESTAMPTZ AS reset_at;
    RETURN;
  END IF;
  
  -- Check if we should reset (older than reset period)
  IF v_record.last_generation_at < v_reset_time THEN
    UPDATE rate_limits 
    SET generation_count = 1, last_generation_at = NOW(), updated_at = NOW()
    WHERE ip_address = p_ip_address;
    
    RETURN QUERY SELECT 
      TRUE::BOOLEAN AS allowed,
      1::INTEGER AS current_count,
      (p_max_free_generations - 1)::INTEGER AS remaining,
      (NOW() + (p_reset_hours || ' hours')::INTERVAL)::TIMESTAMPTZ AS reset_at;
    RETURN;
  END IF;
  
  -- Check if over limit
  IF v_record.generation_count >= p_max_free_generations THEN
    RETURN QUERY SELECT 
      FALSE::BOOLEAN AS allowed,
      v_record.generation_count::INTEGER AS current_count,
      0::INTEGER AS remaining,
      (v_record.last_generation_at + (p_reset_hours || ' hours')::INTERVAL)::TIMESTAMPTZ AS reset_at;
    RETURN;
  END IF;
  
  -- Increment counter
  UPDATE rate_limits 
  SET generation_count = generation_count + 1, last_generation_at = NOW(), updated_at = NOW()
  WHERE ip_address = p_ip_address;
  
  RETURN QUERY SELECT 
    TRUE::BOOLEAN AS allowed,
    (v_record.generation_count + 1)::INTEGER AS current_count,
    (p_max_free_generations - v_record.generation_count - 1)::INTEGER AS remaining,
    (NOW() + (p_reset_hours || ' hours')::INTERVAL)::TIMESTAMPTZ AS reset_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service_role
GRANT EXECUTE ON FUNCTION check_generation_limit TO service_role;



