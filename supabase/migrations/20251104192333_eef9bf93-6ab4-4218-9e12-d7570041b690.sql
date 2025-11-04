-- Fix search_path for all functions to ensure they're immutable
-- This addresses the security linter warning about mutable search paths

-- Re-create has_role function with explicit schema references
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Re-create user_has_tenant_access function with explicit schema references
CREATE OR REPLACE FUNCTION public.user_has_tenant_access(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
    
    UNION
    
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND tenant_id = _tenant_id
    
    UNION
    
    SELECT 1 FROM public.user_roles ur
    JOIN public.tenants t ON t.id = _tenant_id
    WHERE ur.user_id = _user_id 
      AND (ur.tenant_id = t.parent_id OR ur.tenant_id IN (
        SELECT parent_id FROM public.tenants WHERE id = t.parent_id
      ))
      AND ur.role IN ('agency_admin', 'agency_user')
  )
$$;

-- Re-create get_user_tenant function with explicit schema references
CREATE OR REPLACE FUNCTION public.get_user_tenant(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT tenant_id 
  FROM public.profiles 
  WHERE id = _user_id
  LIMIT 1
$$;

-- Re-create get_tenant_hierarchy function with explicit schema references
CREATE OR REPLACE FUNCTION public.get_tenant_hierarchy(_tenant_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  tenant_type TEXT,
  level INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE hierarchy AS (
    SELECT t.id, t.name, t.tenant_type, t.parent_id, 1 as level
    FROM public.tenants t
    WHERE t.id = _tenant_id
    
    UNION ALL
    
    SELECT t.id, t.name, t.tenant_type, t.parent_id, h.level + 1
    FROM public.tenants t
    JOIN hierarchy h ON h.parent_id = t.id
  )
  SELECT h.id, h.name, h.tenant_type, h.level
  FROM hierarchy h
  ORDER BY h.level DESC;
END;
$$;

-- Re-create get_tenant_descendants function with explicit schema references
CREATE OR REPLACE FUNCTION public.get_tenant_descendants(_tenant_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  tenant_type TEXT,
  level INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE descendants AS (
    SELECT t.id, t.name, t.tenant_type, t.parent_id, 1 as level
    FROM public.tenants t
    WHERE t.id = _tenant_id
    
    UNION ALL
    
    SELECT t.id, t.name, t.tenant_type, t.parent_id, d.level + 1
    FROM public.tenants t
    JOIN descendants d ON t.parent_id = d.id
  )
  SELECT d.id, d.name, d.tenant_type, d.level
  FROM descendants d
  WHERE d.id != _tenant_id
  ORDER BY d.level;
END;
$$;

-- Re-create update_tenant_hierarchy trigger function with explicit schema
CREATE OR REPLACE FUNCTION public.update_tenant_hierarchy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.hierarchy_path := NEW.id::text;
    NEW.hierarchy_level := 1;
  ELSE
    SELECT 
      hierarchy_path || '/' || NEW.id::text,
      hierarchy_level + 1
    INTO NEW.hierarchy_path, NEW.hierarchy_level
    FROM public.tenants
    WHERE id = NEW.parent_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Re-create handle_new_user trigger function with explicit schema
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;