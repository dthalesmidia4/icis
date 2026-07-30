ALTER TABLE public.client_touchpoints DROP CONSTRAINT IF EXISTS client_touchpoints_type_check;
ALTER TABLE public.client_touchpoints ADD CONSTRAINT client_touchpoints_type_check
  CHECK (touchpoint_type = ANY (ARRAY['solicitacao','visita','reuniao','ligacao','mensagem','treinamento','entrega','feedback','outro']));