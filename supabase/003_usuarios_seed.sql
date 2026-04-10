-- Run this AFTER 003_usuarios.sql
-- Insert initial admin user (password: admin123 - change after first login)
INSERT INTO public.usuarios (username, password_hash, role)
VALUES ('admin', '$2b$10$8NqdoB/ColxVO8ua3zm5NemN4K5VcJmV/46WoHkzqehRKcVEP2tmG', 'admin')
ON CONFLICT (username) DO NOTHING;
