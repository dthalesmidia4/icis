-- Add plan_content column to marketing_plans table to store AI-generated plan text
ALTER TABLE public.marketing_plans 
ADD COLUMN IF NOT EXISTS plan_content TEXT;