export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_name: string
          key_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_name: string
          key_value: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          key_name?: string
          key_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      cards: {
        Row: {
          attachments: Json | null
          column_name: string | null
          created_at: string
          delivery_date: string
          description: string | null
          file_location: string | null
          id: string
          instrucoes: string | null
          objetivo: string | null
          observations: string | null
          period_plan_id: string | null
          plan_id: string | null
          publication_dates: Json | null
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          attachments?: Json | null
          column_name?: string | null
          created_at?: string
          delivery_date: string
          description?: string | null
          file_location?: string | null
          id?: string
          instrucoes?: string | null
          objetivo?: string | null
          observations?: string | null
          period_plan_id?: string | null
          plan_id?: string | null
          publication_dates?: Json | null
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          attachments?: Json | null
          column_name?: string | null
          created_at?: string
          delivery_date?: string
          description?: string | null
          file_location?: string | null
          id?: string
          instrucoes?: string | null
          objetivo?: string | null
          observations?: string | null
          period_plan_id?: string | null
          plan_id?: string | null
          publication_dates?: Json | null
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_period_plan_id_fkey"
            columns: ["period_plan_id"]
            isOneToOne: false
            referencedRelation: "period_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "marketing_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_demand_template_stats: {
        Row: {
          last_matched_at: string | null
          last_used_at: string | null
          template_id: string
          times_matched: number
          times_used: number
        }
        Insert: {
          last_matched_at?: string | null
          last_used_at?: string | null
          template_id: string
          times_matched?: number
          times_used?: number
        }
        Update: {
          last_matched_at?: string | null
          last_used_at?: string | null
          template_id?: string
          times_matched?: number
          times_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_demand_template_stats_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: true
            referencedRelation: "client_demand_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      client_demand_templates: {
        Row: {
          channel: string | null
          client_id: string
          created_at: string
          default_due_offset_days: number | null
          default_publish_weekday: number | null
          demand_type: string | null
          id: string
          instructions_template: string | null
          pipeline_id: string
          recurrence_hint: string | null
          score: number
          source: string
          status_id: string
          tenant_id: string
          title_template: string
          updated_at: string
        }
        Insert: {
          channel?: string | null
          client_id: string
          created_at?: string
          default_due_offset_days?: number | null
          default_publish_weekday?: number | null
          demand_type?: string | null
          id?: string
          instructions_template?: string | null
          pipeline_id: string
          recurrence_hint?: string | null
          score?: number
          source?: string
          status_id: string
          tenant_id: string
          title_template: string
          updated_at?: string
        }
        Update: {
          channel?: string | null
          client_id?: string
          created_at?: string
          default_due_offset_days?: number | null
          default_publish_weekday?: number | null
          demand_type?: string | null
          id?: string
          instructions_template?: string | null
          pipeline_id?: string
          recurrence_hint?: string | null
          score?: number
          source?: string
          status_id?: string
          tenant_id?: string
          title_template?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_demand_templates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "tenant_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_demand_templates_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_demand_templates_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "pipeline_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_demand_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          cnpj_cpf: string
          created_at: string
          email: string
          id: string
          name: string
          phone: string
          products_services: string
          sector: string
          size: string
          updated_at: string
        }
        Insert: {
          cnpj_cpf: string
          created_at?: string
          email: string
          id?: string
          name: string
          phone: string
          products_services: string
          sector: string
          size: string
          updated_at?: string
        }
        Update: {
          cnpj_cpf?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string
          products_services?: string
          sector?: string
          size?: string
          updated_at?: string
        }
        Relationships: []
      }
      demands: {
        Row: {
          attachments: Json
          channel: string | null
          client_id: string
          column_name: string | null
          created_at: string
          created_by: string | null
          delivery_date: string | null
          demand_type: string | null
          description: string | null
          due_date: string | null
          file_location: string | null
          id: string
          instrucoes: string | null
          instructions: string | null
          objective: string | null
          objetivo: string | null
          observations: string | null
          period_plan_id: string | null
          pipeline_id: string
          plan_id: string | null
          publication_dates: Json | null
          publish_date: string | null
          publish_time: string | null
          source: string
          status_id: string
          template_id: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          attachments?: Json
          channel?: string | null
          client_id: string
          column_name?: string | null
          created_at?: string
          created_by?: string | null
          delivery_date?: string | null
          demand_type?: string | null
          description?: string | null
          due_date?: string | null
          file_location?: string | null
          id?: string
          instrucoes?: string | null
          instructions?: string | null
          objective?: string | null
          objetivo?: string | null
          observations?: string | null
          period_plan_id?: string | null
          pipeline_id: string
          plan_id?: string | null
          publication_dates?: Json | null
          publish_date?: string | null
          publish_time?: string | null
          source?: string
          status_id: string
          template_id?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          attachments?: Json
          channel?: string | null
          client_id?: string
          column_name?: string | null
          created_at?: string
          created_by?: string | null
          delivery_date?: string | null
          demand_type?: string | null
          description?: string | null
          due_date?: string | null
          file_location?: string | null
          id?: string
          instrucoes?: string | null
          instructions?: string | null
          objective?: string | null
          objetivo?: string | null
          observations?: string | null
          period_plan_id?: string | null
          pipeline_id?: string
          plan_id?: string | null
          publication_dates?: Json | null
          publish_date?: string | null
          publish_time?: string | null
          source?: string
          status_id?: string
          template_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "demands_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "tenant_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demands_period_plan_id_fkey"
            columns: ["period_plan_id"]
            isOneToOne: false
            referencedRelation: "period_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demands_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demands_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "marketing_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demands_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "pipeline_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          code: string
          created_at: string
          created_by: string
          email: string | null
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          updated_at: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          email?: string | null
          expires_at: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          updated_at?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          email?: string | null
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          updated_at?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_plans: {
        Row: {
          approved: boolean
          approved_at: string | null
          company_id: string
          created_at: string
          id: string
          periodo_data_fim: string | null
          periodo_data_inicio: string | null
          periodo_status: string | null
          periodo_titulo: string | null
          plan_content: string | null
          plan_data: Json
          selected_month: string | null
          strategy_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved?: boolean
          approved_at?: string | null
          company_id: string
          created_at?: string
          id?: string
          periodo_data_fim?: string | null
          periodo_data_inicio?: string | null
          periodo_status?: string | null
          periodo_titulo?: string | null
          plan_content?: string | null
          plan_data: Json
          selected_month?: string | null
          strategy_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved?: boolean
          approved_at?: string | null
          company_id?: string
          created_at?: string
          id?: string
          periodo_data_fim?: string | null
          periodo_data_inicio?: string | null
          periodo_status?: string | null
          periodo_titulo?: string | null
          plan_content?: string | null
          plan_data?: Json
          selected_month?: string | null
          strategy_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_plans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "tenant_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_plans_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      period_plans: {
        Row: {
          budget: string | null
          client_acquisition: string | null
          company_id: string
          created_at: string
          default_plan: Json
          final_plan: Json | null
          id: string
          objective: string
          observations: string | null
          operational_status: string
          optional_package: Json | null
          package_accepted: boolean | null
          paid_traffic_budget: string | null
          period_end: string
          period_start: string
          period_title: string
          primary_mode: string | null
          priority_channel: string
          status: string
          strategy_id: string | null
          tenant_id: string
          ultra_plan: Json
          updated_at: string
        }
        Insert: {
          budget?: string | null
          client_acquisition?: string | null
          company_id: string
          created_at?: string
          default_plan?: Json
          final_plan?: Json | null
          id?: string
          objective: string
          observations?: string | null
          operational_status?: string
          optional_package?: Json | null
          package_accepted?: boolean | null
          paid_traffic_budget?: string | null
          period_end: string
          period_start: string
          period_title: string
          primary_mode?: string | null
          priority_channel: string
          status?: string
          strategy_id?: string | null
          tenant_id: string
          ultra_plan?: Json
          updated_at?: string
        }
        Update: {
          budget?: string | null
          client_acquisition?: string | null
          company_id?: string
          created_at?: string
          default_plan?: Json
          final_plan?: Json | null
          id?: string
          objective?: string
          observations?: string | null
          operational_status?: string
          optional_package?: Json | null
          package_accepted?: boolean | null
          paid_traffic_budget?: string | null
          period_end?: string
          period_start?: string
          period_title?: string
          primary_mode?: string | null
          priority_channel?: string
          status?: string
          strategy_id?: string | null
          tenant_id?: string
          ultra_plan?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "period_plans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "tenant_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_plans_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_statuses: {
        Row: {
          color: string
          created_at: string
          id: string
          is_final: boolean
          is_initial: boolean
          name: string
          pipeline_id: string
          position: number
          requires_fields: Json
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_final?: boolean
          is_initial?: boolean
          name: string
          pipeline_id: string
          position?: number
          requires_fields?: Json
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_final?: boolean
          is_initial?: boolean
          name?: string
          pipeline_id?: string
          position?: number
          requires_fields?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_statuses_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          position: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          position?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          position?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string
          id: string
          settings: Json | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name: string
          id: string
          settings?: Json | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string
          id?: string
          settings?: Json | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      question_sessions: {
        Row: {
          answers: Json
          company_id: string
          created_at: string
          id: string
          questions: Json
          status: string
          strategy_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          answers?: Json
          company_id: string
          created_at?: string
          id?: string
          questions?: Json
          status?: string
          strategy_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          answers?: Json
          company_id?: string
          created_at?: string
          id?: string
          questions?: Json
          status?: string
          strategy_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      strategies: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string | null
          observations: string | null
          period_end: string | null
          period_start: string | null
          status: string | null
          strategy_text: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name?: string | null
          observations?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string | null
          strategy_text: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string | null
          observations?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string | null
          strategy_text?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "tenant_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      system_prompts: {
        Row: {
          created_at: string
          id: string
          prompt_content: string
          prompt_key: string
          prompt_title: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          prompt_content: string
          prompt_key: string
          prompt_title: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          prompt_content?: string
          prompt_key?: string
          prompt_title?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenant_companies: {
        Row: {
          cnpj_cpf: string
          created_at: string | null
          email: string
          fantasy_name: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string
          products_services: string
          sector: string
          size: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          cnpj_cpf: string
          created_at?: string | null
          email: string
          fantasy_name?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone: string
          products_services: string
          sector: string
          size: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          cnpj_cpf?: string
          created_at?: string | null
          email?: string
          fantasy_name?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string
          products_services?: string
          sector?: string
          size?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_companies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          cnpj_cpf: string | null
          created_at: string | null
          email: string | null
          hierarchy_level: number | null
          hierarchy_path: string | null
          id: string
          metadata: Json | null
          name: string
          parent_id: string | null
          phone: string | null
          settings: Json | null
          slug: string
          status: string | null
          tenant_type: string
          updated_at: string | null
        }
        Insert: {
          cnpj_cpf?: string | null
          created_at?: string | null
          email?: string | null
          hierarchy_level?: number | null
          hierarchy_path?: string | null
          id?: string
          metadata?: Json | null
          name: string
          parent_id?: string | null
          phone?: string | null
          settings?: Json | null
          slug: string
          status?: string | null
          tenant_type: string
          updated_at?: string | null
        }
        Update: {
          cnpj_cpf?: string | null
          created_at?: string | null
          email?: string | null
          hierarchy_level?: number | null
          hierarchy_path?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          parent_id?: string | null
          phone?: string | null
          settings?: Json | null
          slug?: string
          status?: string | null
          tenant_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_create_demands: { Args: { _tenant_id: string }; Returns: boolean }
      can_create_tenant: { Args: { _user_id: string }; Returns: boolean }
      create_demand_from_template: {
        Args: {
          p_channel?: string
          p_client_id: string
          p_demand_type?: string
          p_description?: string
          p_due_date?: string
          p_period_plan_id?: string
          p_pipeline_id?: string
          p_publish_date?: string
          p_status_id?: string
          p_template_id?: string
          p_title?: string
        }
        Returns: Json
      }
      debug_tenant_creation: { Args: { _user_id: string }; Returns: Json }
      generate_invitation_code: { Args: never; Returns: string }
      get_client_demand_suggestions: {
        Args: { p_client_id: string; p_limit?: number }
        Returns: Json
      }
      get_tenant_descendants: {
        Args: { _tenant_id: string }
        Returns: {
          id: string
          level: number
          name: string
          tenant_type: string
        }[]
      }
      get_tenant_hierarchy: {
        Args: { _tenant_id: string }
        Returns: {
          id: string
          level: number
          name: string
          tenant_type: string
        }[]
      }
      get_user_role_in_tenant: {
        Args: { _tenant_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_tenant: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      initialize_default_pipeline: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      is_agency_admin: { Args: { _tenant_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      refresh_client_templates: { Args: { p_client_id: string }; Returns: Json }
      use_invitation: {
        Args: { _code: string; _user_id: string }
        Returns: Json
      }
      use_invitation_v2: {
        Args: { _code: string; _user_id: string }
        Returns: Json
      }
      user_has_tenant_access: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "agency_admin"
        | "agency_user"
        | "client_admin"
        | "client_user"
        | "subclient_user"
        | "agency_manager"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "agency_admin",
        "agency_user",
        "client_admin",
        "client_user",
        "subclient_user",
        "agency_manager",
      ],
    },
  },
} as const
