-- =====================================================
-- MULTI-TENANT HIERARCHICAL ARCHITECTURE MIGRATION
-- =====================================================

-- 1. CREATE ENUM FOR USER ROLES
CREATE TYPE public.app_role AS ENUM (
  'super_admin',
  'agency_admin',
  'agency_user',
  'client_admin',
  'client_user',
  'subclient_user'
);

-- 2. CREATE TENANTS TABLE (Central Hierarchical Structure)
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('agency', 'client', 'subclient')),
  parent_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  
  -- Context data
  cnpj_cpf TEXT,
  email TEXT,
  phone TEXT,
  
  -- Settings and metadata
  settings JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Status control
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  
  -- Materialized hierarchy for performance
  hierarchy_path TEXT,
  hierarchy_level INTEGER DEFAULT 1,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure valid hierarchy
  CONSTRAINT valid_hierarchy CHECK (
    (tenant_type = 'agency' AND parent_id IS NULL) OR
    (tenant_type = 'client' AND parent_id IS NOT NULL) OR
    (tenant_type = 'subclient' AND parent_id IS NOT NULL)
  )
);

-- 3. CREATE PROFILES TABLE
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. CREATE USER_ROLES TABLE (Security: separate from profiles)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, tenant_id, role)
);

-- 5. CREATE TENANT_COMPANIES TABLE (Refactored from companies)
CREATE TABLE public.tenant_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  
  -- Original migrated data
  name TEXT NOT NULL,
  cnpj_cpf TEXT NOT NULL,
  sector TEXT NOT NULL,
  size TEXT NOT NULL,
  products_services TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  selected_month TEXT NOT NULL,
  
  -- Control
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(tenant_id, cnpj_cpf)
);

-- 6. ADD TENANT_ID TO EXISTING TABLES
ALTER TABLE public.strategies ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.marketing_plans ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.cards ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- 7. CREATE INDEXES FOR PERFORMANCE
-- Tenants indexes
CREATE INDEX idx_tenants_type ON tenants(tenant_type);
CREATE INDEX idx_tenants_parent ON tenants(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status) WHERE status = 'active';

-- Profiles indexes
CREATE INDEX idx_profiles_tenant ON profiles(tenant_id);

-- User roles indexes
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_tenant ON user_roles(tenant_id);
CREATE INDEX idx_user_roles_role ON user_roles(role);

-- Tenant companies indexes
CREATE INDEX idx_tenant_companies_tenant ON tenant_companies(tenant_id);

-- Updated table indexes
CREATE INDEX idx_strategies_tenant ON strategies(tenant_id);
CREATE INDEX idx_strategies_tenant_company ON strategies(tenant_id, company_id);
CREATE INDEX idx_marketing_plans_tenant ON marketing_plans(tenant_id);
CREATE INDEX idx_marketing_plans_tenant_company ON marketing_plans(tenant_id, company_id);
CREATE INDEX idx_cards_tenant ON cards(tenant_id);
CREATE INDEX idx_cards_tenant_plan ON cards(tenant_id, plan_id);

-- 8. CREATE SECURITY DEFINER FUNCTIONS (Avoid RLS recursion)

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to check tenant access with hierarchy support
CREATE OR REPLACE FUNCTION public.user_has_tenant_access(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Super admin has access to everything
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
    
    UNION
    
    -- Direct tenant access
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND tenant_id = _tenant_id
    
    UNION
    
    -- Access via hierarchy (agency accesses clients and subclients)
    SELECT 1 FROM public.user_roles ur
    JOIN public.tenants t ON t.id = _tenant_id
    WHERE ur.user_id = _user_id 
      AND (ur.tenant_id = t.parent_id OR ur.tenant_id IN (
        SELECT parent_id FROM tenants WHERE id = t.parent_id
      ))
      AND ur.role IN ('agency_admin', 'agency_user')
  )
$$;

-- Function to get user's primary tenant
CREATE OR REPLACE FUNCTION public.get_user_tenant(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id 
  FROM public.profiles 
  WHERE id = _user_id
  LIMIT 1
$$;

-- Function to get tenant hierarchy (ancestors)
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
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE hierarchy AS (
    SELECT t.id, t.name, t.tenant_type, t.parent_id, 1 as level
    FROM tenants t
    WHERE t.id = _tenant_id
    
    UNION ALL
    
    SELECT t.id, t.name, t.tenant_type, t.parent_id, h.level + 1
    FROM tenants t
    JOIN hierarchy h ON h.parent_id = t.id
  )
  SELECT h.id, h.name, h.tenant_type, h.level
  FROM hierarchy h
  ORDER BY h.level DESC;
END;
$$;

-- Function to get tenant descendants (children)
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
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE descendants AS (
    SELECT t.id, t.name, t.tenant_type, t.parent_id, 1 as level
    FROM tenants t
    WHERE t.id = _tenant_id
    
    UNION ALL
    
    SELECT t.id, t.name, t.tenant_type, t.parent_id, d.level + 1
    FROM tenants t
    JOIN descendants d ON t.parent_id = d.id
  )
  SELECT d.id, d.name, d.tenant_type, d.level
  FROM descendants d
  WHERE d.id != _tenant_id
  ORDER BY d.level;
END;
$$;

-- 9. CREATE TRIGGERS

-- Trigger to auto-update hierarchy_path and hierarchy_level
CREATE OR REPLACE FUNCTION update_tenant_hierarchy()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_tenant_hierarchy
  BEFORE INSERT OR UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_hierarchy();

-- Trigger for tenants updated_at
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for profiles updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for tenant_companies updated_at
CREATE TRIGGER update_tenant_companies_updated_at
  BEFORE UPDATE ON public.tenant_companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 10. ENABLE ROW LEVEL SECURITY

-- Enable RLS on tenants
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Enable RLS on tenant_companies
ALTER TABLE public.tenant_companies ENABLE ROW LEVEL SECURITY;

-- Enable RLS on strategies (if not already enabled)
ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;

-- Enable RLS on marketing_plans (if not already enabled)
ALTER TABLE public.marketing_plans ENABLE ROW LEVEL SECURITY;

-- Enable RLS on cards (if not already enabled)
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

-- 11. CREATE RLS POLICIES

-- Tenants policies
CREATE POLICY "super_admin_all_tenants" ON public.tenants
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "users_see_their_tenants" ON public.tenants
FOR SELECT TO authenticated
USING (
  public.user_has_tenant_access(auth.uid(), id) OR
  parent_id IN (
    SELECT tenant_id FROM public.user_roles 
    WHERE user_id = auth.uid()
  )
);

-- Profiles policies
CREATE POLICY "users_view_own_profile" ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "users_update_own_profile" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY "users_insert_own_profile" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());

-- User roles policies
CREATE POLICY "users_view_own_roles" ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "admins_manage_roles" ON public.user_roles
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin') OR
  public.has_role(auth.uid(), 'agency_admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin') OR
  public.has_role(auth.uid(), 'agency_admin')
);

-- Tenant companies policies
CREATE POLICY "tenant_isolation_companies" ON public.tenant_companies
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin') OR
  public.user_has_tenant_access(auth.uid(), tenant_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin') OR
  public.user_has_tenant_access(auth.uid(), tenant_id)
);

-- Drop old policies on strategies, marketing_plans, cards
DROP POLICY IF EXISTS "Allow all operations on strategies" ON public.strategies;
DROP POLICY IF EXISTS "Allow all operations on marketing_plans" ON public.marketing_plans;
DROP POLICY IF EXISTS "Allow all operations on cards" ON public.cards;

-- Strategies policies with tenant isolation
CREATE POLICY "tenant_isolation_strategies" ON public.strategies
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin') OR
  public.user_has_tenant_access(auth.uid(), tenant_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin') OR
  public.user_has_tenant_access(auth.uid(), tenant_id)
);

-- Marketing plans policies with tenant isolation
CREATE POLICY "tenant_isolation_plans" ON public.marketing_plans
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin') OR
  public.user_has_tenant_access(auth.uid(), tenant_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin') OR
  public.user_has_tenant_access(auth.uid(), tenant_id)
);

-- Cards policies with tenant isolation
CREATE POLICY "tenant_isolation_cards" ON public.cards
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin') OR
  public.user_has_tenant_access(auth.uid(), tenant_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin') OR
  public.user_has_tenant_access(auth.uid(), tenant_id)
);

-- 12. DATA MIGRATION

-- Create default agency tenant
INSERT INTO public.tenants (id, tenant_type, name, slug, status)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'agency',
  'Agência Principal',
  'agencia-principal',
  'active'
);

-- Migrate existing companies to tenant_companies
INSERT INTO public.tenant_companies (
  tenant_id, name, cnpj_cpf, sector, size, 
  products_services, email, phone, selected_month, created_at, updated_at
)
SELECT 
  '00000000-0000-0000-0000-000000000001'::uuid,
  name, cnpj_cpf, sector, size,
  products_services, email, phone, selected_month, created_at, updated_at
FROM public.companies;

-- Update strategies with default tenant_id
UPDATE public.strategies
SET tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE tenant_id IS NULL;

-- Update marketing_plans with default tenant_id
UPDATE public.marketing_plans
SET tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE tenant_id IS NULL;

-- Update cards with default tenant_id
UPDATE public.cards
SET tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE tenant_id IS NULL;

-- Make tenant_id NOT NULL after migration
ALTER TABLE public.strategies ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.marketing_plans ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.cards ALTER COLUMN tenant_id SET NOT NULL;