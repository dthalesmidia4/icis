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
      br_calendar_events: {
        Row: {
          created_at: string
          description: string | null
          event_date: string
          event_type: string
          id: string
          marketing_tips: string | null
          name: string
          priority: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_date: string
          event_type: string
          id?: string
          marketing_tips?: string | null
          name: string
          priority?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          event_date?: string
          event_type?: string
          id?: string
          marketing_tips?: string | null
          name?: string
          priority?: number
        }
        Relationships: []
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
          last_matched_at: string | null
          last_used_at: string | null
          pipeline_id: string
          recurrence_hint: string | null
          score: number
          source: string
          status_id: string
          tenant_id: string
          times_matched: number
          times_used: number
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
          last_matched_at?: string | null
          last_used_at?: string | null
          pipeline_id: string
          recurrence_hint?: string | null
          score?: number
          source?: string
          status_id: string
          tenant_id: string
          times_matched?: number
          times_used?: number
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
          last_matched_at?: string | null
          last_used_at?: string | null
          pipeline_id?: string
          recurrence_hint?: string | null
          score?: number
          source?: string
          status_id?: string
          tenant_id?: string
          times_matched?: number
          times_used?: number
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
      company_mascot_images: {
        Row: {
          company_id: string
          created_at: string
          file_name: string | null
          id: string
          image_url: string
          position: number
          tenant_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          file_name?: string | null
          id?: string
          image_url: string
          position?: number
          tenant_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          file_name?: string | null
          id?: string
          image_url?: string
          position?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_mascot_images_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "tenant_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_mascot_images_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_feedback_events: {
        Row: {
          channel: string | null
          client_id: string
          created_at: string
          demand_fingerprint: string | null
          demand_id: string | null
          demand_type: string | null
          event_type: Database["public"]["Enums"]["demand_feedback_event_type"]
          id: string
          publish_weekday: number | null
          tenant_id: string
          title: string | null
        }
        Insert: {
          channel?: string | null
          client_id: string
          created_at?: string
          demand_fingerprint?: string | null
          demand_id?: string | null
          demand_type?: string | null
          event_type: Database["public"]["Enums"]["demand_feedback_event_type"]
          id?: string
          publish_weekday?: number | null
          tenant_id: string
          title?: string | null
        }
        Update: {
          channel?: string | null
          client_id?: string
          created_at?: string
          demand_fingerprint?: string | null
          demand_id?: string | null
          demand_type?: string | null
          event_type?: Database["public"]["Enums"]["demand_feedback_event_type"]
          id?: string
          publish_weekday?: number | null
          tenant_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demand_feedback_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "tenant_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_feedback_events_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "demands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_feedback_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_fingerprints: {
        Row: {
          channel: string | null
          client_id: string
          created_at: string
          demand_id: string | null
          demand_type: string | null
          fingerprint: string
          id: string
          period_plan_id: string | null
          tenant_id: string
          title: string
          was_successful: boolean | null
        }
        Insert: {
          channel?: string | null
          client_id: string
          created_at?: string
          demand_id?: string | null
          demand_type?: string | null
          fingerprint: string
          id?: string
          period_plan_id?: string | null
          tenant_id: string
          title: string
          was_successful?: boolean | null
        }
        Update: {
          channel?: string | null
          client_id?: string
          created_at?: string
          demand_id?: string | null
          demand_type?: string | null
          fingerprint?: string
          id?: string
          period_plan_id?: string | null
          tenant_id?: string
          title?: string
          was_successful?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "demand_fingerprints_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "tenant_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_fingerprints_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "demands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_fingerprints_period_plan_id_fkey"
            columns: ["period_plan_id"]
            isOneToOne: false
            referencedRelation: "period_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_fingerprints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      demands: {
        Row: {
          additional_publish_dates: Json
          archived_at: string | null
          attachments: Json
          channel: string | null
          client_id: string
          created_at: string
          created_by: string | null
          delivery_date: string | null
          delivery_time: string | null
          demand_type: string | null
          description: string | null
          due_date: string | null
          due_time: string | null
          id: string
          instructions: string | null
          objective: string | null
          observations: string | null
          period_plan_id: string | null
          pipeline_id: string
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
          additional_publish_dates?: Json
          archived_at?: string | null
          attachments?: Json
          channel?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          delivery_date?: string | null
          delivery_time?: string | null
          demand_type?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          instructions?: string | null
          objective?: string | null
          observations?: string | null
          period_plan_id?: string | null
          pipeline_id: string
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
          additional_publish_dates?: Json
          archived_at?: string | null
          attachments?: Json
          channel?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          delivery_date?: string | null
          delivery_time?: string | null
          demand_type?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          instructions?: string | null
          objective?: string | null
          observations?: string | null
          period_plan_id?: string | null
          pipeline_id?: string
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
      generated_contents: {
        Row: {
          client_id: string
          content_type: string
          created_at: string
          created_by: string | null
          id: string
          image_urls: Json
          metadata: Json | null
          prompt: string | null
          tenant_id: string
          title: string | null
        }
        Insert: {
          client_id: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_urls?: Json
          metadata?: Json | null
          prompt?: string | null
          tenant_id: string
          title?: string | null
        }
        Update: {
          client_id?: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_urls?: Json
          metadata?: Json | null
          prompt?: string | null
          tenant_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_contents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "tenant_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_contents_tenant_id_fkey"
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
          production_line: Json | null
          rejected_plan: Json
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
          production_line?: Json | null
          rejected_plan?: Json
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
          production_line?: Json | null
          rejected_plan?: Json
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
          is_fixed: boolean
          is_initial: boolean
          name: string
          parent_status_id: string | null
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
          is_fixed?: boolean
          is_initial?: boolean
          name: string
          parent_status_id?: string | null
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
          is_fixed?: boolean
          is_initial?: boolean
          name?: string
          parent_status_id?: string | null
          pipeline_id?: string
          position?: number
          requires_fields?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_statuses_parent_status_id_fkey"
            columns: ["parent_status_id"]
            isOneToOne: false
            referencedRelation: "pipeline_statuses"
            referencedColumns: ["id"]
          },
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
          brand_font: string | null
          brand_primary_color: string | null
          brand_secondary_color: string | null
          cnpj_cpf: string
          created_at: string | null
          email: string
          fantasy_name: string | null
          has_mascot: boolean
          id: string
          logo_url: string | null
          mascot_description: string | null
          mascot_url: string | null
          name: string
          phone: string
          products_services: string
          sector: string
          size: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          brand_font?: string | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          cnpj_cpf: string
          created_at?: string | null
          email: string
          fantasy_name?: string | null
          has_mascot?: boolean
          id?: string
          logo_url?: string | null
          mascot_description?: string | null
          mascot_url?: string | null
          name: string
          phone: string
          products_services: string
          sector: string
          size: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          brand_font?: string | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          cnpj_cpf?: string
          created_at?: string | null
          email?: string
          fantasy_name?: string | null
          has_mascot?: boolean
          id?: string
          logo_url?: string | null
          mascot_description?: string | null
          mascot_url?: string | null
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
      user_column_permissions: {
        Row: {
          can_view: boolean
          created_at: string
          id: string
          status_id: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_view?: boolean
          created_at?: string
          id?: string
          status_id: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_view?: boolean
          created_at?: string
          id?: string
          status_id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_column_permissions_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "pipeline_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_column_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_hub_permissions: {
        Row: {
          can_access: boolean
          created_at: string
          hub_section: string
          id: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_access?: boolean
          created_at?: string
          hub_section: string
          id?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_access?: boolean
          created_at?: string
          hub_section?: string
          id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_hub_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_late_notification_settings: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_late_notification_settings_tenant_id_fkey"
            columns: ["tenant_id"]
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
      visual_identity_presets: {
        Row: {
          company_id: string
          created_at: string
          font_name: string | null
          highlight_color: string | null
          id: string
          is_active: boolean
          name: string
          primary_color: string | null
          secondary_color: string | null
          tenant_id: string
          text_color: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          font_name?: string | null
          highlight_color?: string | null
          id?: string
          is_active?: boolean
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          tenant_id: string
          text_color?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          font_name?: string | null
          highlight_color?: string | null
          id?: string
          is_active?: boolean
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          tenant_id?: string
          text_color?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visual_identity_presets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "tenant_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visual_identity_presets_tenant_id_fkey"
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
      generate_demand_fingerprint: {
        Args: { p_channel: string; p_demand_type: string; p_title: string }
        Returns: string
      }
      generate_invitation_code: { Args: never; Returns: string }
      get_client_demand_suggestions: {
        Args: { p_client_id: string; p_limit?: number }
        Returns: Json
      }
      get_contextual_planning_input: {
        Args: {
          p_client_id: string
          p_period_end: string
          p_period_start: string
        }
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
      record_demand_feedback: {
        Args: {
          p_demand_id: string
          p_event_type: Database["public"]["Enums"]["demand_feedback_event_type"]
        }
        Returns: Json
      }
      refresh_client_templates: { Args: { p_client_id: string }; Returns: Json }
      use_invitation: {
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
      demand_feedback_event_type:
        | "deleted"
        | "archived_without_publish"
        | "published"
        | "rescheduled"
        | "created"
        | "scheduled"
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
      demand_feedback_event_type: [
        "deleted",
        "archived_without_publish",
        "published",
        "rescheduled",
        "created",
        "scheduled",
      ],
    },
  },
} as const
