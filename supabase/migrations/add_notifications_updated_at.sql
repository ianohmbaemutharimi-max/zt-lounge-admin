-- Migration: Add updated_at field to notifications table
-- Reason: The notifications table was missing the updated_at timestamp field
--         that the repository layer expects for CRUD operations.
-- This field tracks when notification records are last modified.

ALTER TABLE notifications ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
