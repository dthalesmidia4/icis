
ALTER TABLE public.seedance_pricing DROP CONSTRAINT IF EXISTS seedance_pricing_model_key_check;
ALTER TABLE public.seedance_pricing ADD CONSTRAINT seedance_pricing_model_key_check
  CHECK (model_key IN ('lite','pro','pro_fast','v15_pro','v2','v2_fast','v2_mini'));
