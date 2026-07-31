CREATE OR REPLACE FUNCTION public.validate_demand_stage_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_resolved text;
  v_should_check boolean := false;
BEGIN
  IF NEW.assigned_to IS NULL OR NEW.current_function_key IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_should_check := true;
  ELSIF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     OR NEW.current_function_key IS DISTINCT FROM OLD.current_function_key
     OR NEW.demand_type_key IS DISTINCT FROM OLD.demand_type_key THEN
    v_should_check := true;
  END IF;

  IF NOT v_should_check THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.collaborator_function_assignments
    WHERE tenant_id = NEW.tenant_id
      AND user_id = NEW.assigned_to
      AND function_key = NEW.current_function_key
      AND allowed = true
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.current_function_key IN ('aguardando_cliente', 'enviar_cliente') THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('O responsável selecionado não possui a função obrigatória %s.', NEW.current_function_key);
  END IF;

  v_resolved := public.resolve_function_for_assignee(
    NEW.tenant_id,
    NEW.assigned_to,
    NEW.demand_type_key,
    NEW.current_function_key
  );

  IF v_resolved IS NOT NULL THEN
    NEW.current_function_key := v_resolved;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validate_demand_stage_assignment_trigger ON public.demands;
CREATE TRIGGER validate_demand_stage_assignment_trigger
BEFORE INSERT OR UPDATE OF assigned_to, current_function_key, demand_type_key
ON public.demands
FOR EACH ROW
EXECUTE FUNCTION public.validate_demand_stage_assignment();