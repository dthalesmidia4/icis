-- Rename publication_date column to delivery_date in cards table
ALTER TABLE public.cards RENAME COLUMN publication_date TO delivery_date;