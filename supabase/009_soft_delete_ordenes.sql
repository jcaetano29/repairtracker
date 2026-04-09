-- ============================================================
-- MIGRATION 009: Add soft delete columns to ordenes table
-- Purpose: Support soft deletes for audit trail
-- ============================================================

-- Add deleted_at and deleted_by columns to ordenes table
ALTER TABLE ordenes
ADD COLUMN deleted_at TIMESTAMPTZ,
ADD COLUMN deleted_by UUID REFERENCES usuarios(id);

-- Create index on deleted_at for queries filtering soft-deleted records
CREATE INDEX idx_ordenes_deleted_at ON ordenes(deleted_at);

-- Add comment explaining soft delete pattern
COMMENT ON COLUMN ordenes.deleted_at IS 'Timestamp when order was soft-deleted (NULL if not deleted)';
COMMENT ON COLUMN ordenes.deleted_by IS 'User ID who performed the soft delete (NULL if not deleted)';
