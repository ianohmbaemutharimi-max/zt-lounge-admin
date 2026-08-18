-- Team Invitations Table
-- Supports secure token-based invitation workflow for team member onboarding

-- Create invitations table
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_invitations_token_hash ON invitations(token_hash);
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_status ON invitations(status);
CREATE INDEX idx_invitations_expires_at ON invitations(expires_at);
CREATE INDEX idx_invitations_invited_by ON invitations(invited_by);
CREATE INDEX idx_invitations_profile_id ON invitations(profile_id);

-- Partial unique index to prevent duplicate pending invitations for same email + role
CREATE UNIQUE INDEX idx_invitations_pending_email_role 
  ON invitations(LOWER(email), role_id) 
  WHERE status = 'pending';

-- Enable RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can view all invitations
CREATE POLICY "Admins can view all invitations"
  ON invitations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role_id IN (
        SELECT id FROM roles WHERE name IN ('super_admin', 'admin')
      )
    )
  );

-- RLS Policy: Only super_admin and admin can create invitations
CREATE POLICY "Only admins can create invitations"
  ON invitations
  FOR INSERT
  WITH CHECK (
    auth.uid() = invited_by
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role_id IN (
        SELECT id FROM roles WHERE name IN ('super_admin', 'admin')
      )
    )
  );

-- RLS Policy: Only super_admin and admin can update invitations
CREATE POLICY "Only admins can update invitations"
  ON invitations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role_id IN (
        SELECT id FROM roles WHERE name IN ('super_admin', 'admin')
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role_id IN (
        SELECT id FROM roles WHERE name IN ('super_admin', 'admin')
      )
    )
  );

-- RLS Policy: Only super_admin and admin can delete invitations
CREATE POLICY "Only admins can delete invitations"
  ON invitations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role_id IN (
        SELECT id FROM roles WHERE name IN ('super_admin', 'admin')
      )
    )
  );

-- NOTE: Public token-based access is NOT implemented via RLS.
-- Token validation happens in the application layer only.
-- This prevents enumeration attacks on pending invitations.

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_invitations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invitations_updated_at_trigger
BEFORE UPDATE ON invitations
FOR EACH ROW
EXECUTE FUNCTION update_invitations_updated_at();
