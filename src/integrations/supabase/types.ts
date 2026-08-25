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
      avulso_drafts: {
        Row: {
          client_id: string
          content_type: string
          created_at: string
          id: string
          state: Json
          tenant_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          content_type: string
          created_at?: string
          id?: string
          state?: Json
          tenant_id: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          content_type?: string
          created_at?: string
          id?: string
          state?: Json
          tenant_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avulso_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "tenant_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avulso_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bills_payable: {
        Row: {
          amount: number | null
          attachment_name: string | null
          attachment_url: string | null
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          is_recurring: boolean
          name: string
          observations: string | null
          paid_at: string | null
          parent_bill_id: string | null
          payment_method: string | null
          recurrence_months: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          attachment_name?: string | null
          attachment_url?: string | null
          created_at?: string
          created_by?: string | null
          due_date: string
          id?: string
          is_recurring?: boolean
          name: string
          observations?: string | null
          paid_at?: string | null
          parent_bill_id?: string | null
          payment_method?: string | null
          recurrence_months?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          attachment_name?: string | null
          attachment_url?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          is_recurring?: boolean
          name?: string
          observations?: string | null
          paid_at?: string | null
          parent_bill_id?: string | null
          payment_method?: string | null
          recurrence_months?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_payable_parent_bill_id_fkey"
            columns: ["parent_bill_id"]
            isOneToOne: false
            referencedRelation: "bills_payable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_payable_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      client_social_accounts: {
        Row: {
          access_token: string
          account_label: string | null
          client_id: string
          created_at: string
          created_by: string | null
          fb_page_id: string | null
          id: string
          ig_user_id: string | null
          is_active: boolean
          notes: string | null
          platform: string
          tenant_id: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          account_label?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          fb_page_id?: string | null
          id?: string
          ig_user_id?: string | null
          is_active?: boolean
          notes?: string | null
          platform: string
          tenant_id: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          account_label?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          fb_page_id?: string | null
          id?: string
          ig_user_id?: string | null
          is_active?: boolean
          notes?: string | null
          platform?: string
          tenant_id?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_social_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "tenant_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_stage_routing_preferences: {
        Row: {
          active: boolean
          client_id: string
          created_at: string
          function_key: string
          id: string
          priority: number
          tenant_id: string
          updated_at: string
          user_id: string
          work_area: Database["public"]["Enums"]["work_area"]
        }
        Insert: {
          active?: boolean
          client_id: string
          created_at?: string
          function_key: string
          id?: string
          priority?: number
          tenant_id: string
          updated_at?: string
          user_id: string
          work_area: Database["public"]["Enums"]["work_area"]
        }
        Update: {
          active?: boolean
          client_id?: string
          created_at?: string
          function_key?: string
          id?: string
          priority?: number
          tenant_id?: string
          updated_at?: string
          user_id?: string
          work_area?: Database["public"]["Enums"]["work_area"]
        }
        Relationships: [
          {
            foreignKeyName: "client_stage_routing_preferences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "tenant_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_stage_routing_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_touchpoints: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          demand_id: string | null
          id: string
          occurred_at: string
          source: string
          subclient_id: string | null
          summary: string | null
          tenant_id: string
          touchpoint_type: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          demand_id?: string | null
          id?: string
          occurred_at?: string
          source?: string
          subclient_id?: string | null
          summary?: string | null
          tenant_id: string
          touchpoint_type: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          demand_id?: string | null
          id?: string
          occurred_at?: string
          source?: string
          subclient_id?: string | null
          summary?: string | null
          tenant_id?: string
          touchpoint_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_touchpoints_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "tenant_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_touchpoints_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "demands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_touchpoints_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "v_demand_stage_misalignment"
            referencedColumns: ["demand_id"]
          },
          {
            foreignKeyName: "client_touchpoints_subclient_id_fkey"
            columns: ["subclient_id"]
            isOneToOne: false
            referencedRelation: "systems_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_touchpoints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborator_function_assignments: {
        Row: {
          allowed: boolean
          created_at: string
          function_key: string
          id: string
          tenant_id: string
          updated_at: string
          user_id: string
          work_area: Database["public"]["Enums"]["work_area"]
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          function_key: string
          id?: string
          tenant_id: string
          updated_at?: string
          user_id: string
          work_area?: Database["public"]["Enums"]["work_area"]
        }
        Update: {
          allowed?: boolean
          created_at?: string
          function_key?: string
          id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
          work_area?: Database["public"]["Enums"]["work_area"]
        }
        Relationships: []
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
      demand_change_request_items: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          is_completed: boolean
          position: number
          request_id: string
          tenant_id: string
          text: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          position?: number
          request_id: string
          tenant_id: string
          text: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          position?: number
          request_id?: string
          tenant_id?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "demand_change_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "demand_change_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_change_requests: {
        Row: {
          created_at: string
          demand_id: string
          id: string
          notes: string | null
          requested_by: string | null
          resolved_at: string | null
          source_function_key: string | null
          status: string
          target_function_key: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          demand_id: string
          id?: string
          notes?: string | null
          requested_by?: string | null
          resolved_at?: string | null
          source_function_key?: string | null
          status?: string
          target_function_key?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          demand_id?: string
          id?: string
          notes?: string | null
          requested_by?: string | null
          resolved_at?: string | null
          source_function_key?: string | null
          status?: string
          target_function_key?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "demand_change_requests_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "demands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_change_requests_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "v_demand_stage_misalignment"
            referencedColumns: ["demand_id"]
          },
        ]
      }
      demand_execution_items: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          execution_run_id: string
          id: string
          is_completed: boolean
          position: number
          tenant_id: string
          text: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          execution_run_id: string
          id?: string
          is_completed?: boolean
          position?: number
          tenant_id: string
          text: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          execution_run_id?: string
          id?: string
          is_completed?: boolean
          position?: number
          tenant_id?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "demand_execution_items_execution_run_id_fkey"
            columns: ["execution_run_id"]
            isOneToOne: false
            referencedRelation: "demand_execution_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_execution_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_execution_runs: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          demand_id: string
          demand_type_key: string | null
          function_key: string | null
          id: string
          metadata: Json
          pass_number: number
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          demand_id: string
          demand_type_key?: string | null
          function_key?: string | null
          id?: string
          metadata?: Json
          pass_number?: number
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          demand_id?: string
          demand_type_key?: string | null
          function_key?: string | null
          id?: string
          metadata?: Json
          pass_number?: number
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "demand_execution_runs_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "demands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_execution_runs_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "v_demand_stage_misalignment"
            referencedColumns: ["demand_id"]
          },
          {
            foreignKeyName: "demand_execution_runs_tenant_id_fkey"
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
            foreignKeyName: "demand_feedback_events_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "v_demand_stage_misalignment"
            referencedColumns: ["demand_id"]
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
            foreignKeyName: "demand_fingerprints_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "v_demand_stage_misalignment"
            referencedColumns: ["demand_id"]
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
      demand_flow_history: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          demand_id: string
          from_function_key: string | null
          from_user_id: string | null
          id: string
          metadata: Json
          tenant_id: string
          to_function_key: string | null
          to_user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          created_by?: string | null
          demand_id: string
          from_function_key?: string | null
          from_user_id?: string | null
          id?: string
          metadata?: Json
          tenant_id: string
          to_function_key?: string | null
          to_user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          demand_id?: string
          from_function_key?: string | null
          from_user_id?: string | null
          id?: string
          metadata?: Json
          tenant_id?: string
          to_function_key?: string | null
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demand_flow_history_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "demands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_flow_history_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "v_demand_stage_misalignment"
            referencedColumns: ["demand_id"]
          },
        ]
      }
      demand_stage_duration_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          demand_id: string
          duration_min: number
          function_key: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          demand_id: string
          duration_min: number
          function_key: string
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          demand_id?: string
          duration_min?: number
          function_key?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "demand_stage_duration_overrides_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "demands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_stage_duration_overrides_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "v_demand_stage_misalignment"
            referencedColumns: ["demand_id"]
          },
          {
            foreignKeyName: "demand_stage_duration_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_type_flow_rules: {
        Row: {
          created_at: string
          demand_type_key: string
          demand_type_name: string
          function_key: string
          id: string
          requirement: string
          tenant_id: string
          updated_at: string
          work_area: Database["public"]["Enums"]["work_area"]
        }
        Insert: {
          created_at?: string
          demand_type_key: string
          demand_type_name: string
          function_key: string
          id?: string
          requirement?: string
          tenant_id: string
          updated_at?: string
          work_area?: Database["public"]["Enums"]["work_area"]
        }
        Update: {
          created_at?: string
          demand_type_key?: string
          demand_type_name?: string
          function_key?: string
          id?: string
          requirement?: string
          tenant_id?: string
          updated_at?: string
          work_area?: Database["public"]["Enums"]["work_area"]
        }
        Relationships: [
          {
            foreignKeyName: "demand_type_flow_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      demands: {
        Row: {
          ad_plan: Json | null
          additional_assignees: string[]
          additional_publish_dates: Json
          archived_at: string | null
          assigned_to: string | null
          attachments: Json
          channel: string | null
          classifications: string[]
          client_id: string
          client_last_resend_at: string | null
          client_resend_count: number
          client_wait_started_at: string | null
          content_brief: Json | null
          created_at: string
          created_by: string | null
          current_function_key: string | null
          daily_completed_dates: Json
          daily_completed_occurrences: number
          daily_end_date: string | null
          daily_exclude_holidays: boolean
          daily_exclude_weekends: boolean
          daily_next_date: string | null
          daily_start_date: string | null
          daily_time: string | null
          daily_total_occurrences: number | null
          delivery_date: string | null
          delivery_time: string | null
          demand_type: string | null
          demand_type_key: string | null
          description: string | null
          due_date: string | null
          due_time: string | null
          id: string
          image_aspect_ratio: string | null
          instructions: string | null
          is_daily_card: boolean
          is_draft: boolean
          objective: string | null
          observations: string | null
          origin: string
          origin_note: string | null
          period_plan_id: string | null
          pipeline_id: string
          post_caption: string | null
          publish_date: string | null
          publish_time: string | null
          reference_attachments: Json
          rejected_attachments: Json
          released_at: string | null
          released_by: string | null
          reorder_meta: Json | null
          source: string
          status_id: string
          subclient_id: string | null
          subclient_ids: string[]
          template_id: string | null
          tenant_id: string
          title: string
          updated_at: string
          work_area: Database["public"]["Enums"]["work_area"]
        }
        Insert: {
          ad_plan?: Json | null
          additional_assignees?: string[]
          additional_publish_dates?: Json
          archived_at?: string | null
          assigned_to?: string | null
          attachments?: Json
          channel?: string | null
          classifications?: string[]
          client_id: string
          client_last_resend_at?: string | null
          client_resend_count?: number
          client_wait_started_at?: string | null
          content_brief?: Json | null
          created_at?: string
          created_by?: string | null
          current_function_key?: string | null
          daily_completed_dates?: Json
          daily_completed_occurrences?: number
          daily_end_date?: string | null
          daily_exclude_holidays?: boolean
          daily_exclude_weekends?: boolean
          daily_next_date?: string | null
          daily_start_date?: string | null
          daily_time?: string | null
          daily_total_occurrences?: number | null
          delivery_date?: string | null
          delivery_time?: string | null
          demand_type?: string | null
          demand_type_key?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          image_aspect_ratio?: string | null
          instructions?: string | null
          is_daily_card?: boolean
          is_draft?: boolean
          objective?: string | null
          observations?: string | null
          origin?: string
          origin_note?: string | null
          period_plan_id?: string | null
          pipeline_id: string
          post_caption?: string | null
          publish_date?: string | null
          publish_time?: string | null
          reference_attachments?: Json
          rejected_attachments?: Json
          released_at?: string | null
          released_by?: string | null
          reorder_meta?: Json | null
          source?: string
          status_id: string
          subclient_id?: string | null
          subclient_ids?: string[]
          template_id?: string | null
          tenant_id: string
          title: string
          updated_at?: string
          work_area?: Database["public"]["Enums"]["work_area"]
        }
        Update: {
          ad_plan?: Json | null
          additional_assignees?: string[]
          additional_publish_dates?: Json
          archived_at?: string | null
          assigned_to?: string | null
          attachments?: Json
          channel?: string | null
          classifications?: string[]
          client_id?: string
          client_last_resend_at?: string | null
          client_resend_count?: number
          client_wait_started_at?: string | null
          content_brief?: Json | null
          created_at?: string
          created_by?: string | null
          current_function_key?: string | null
          daily_completed_dates?: Json
          daily_completed_occurrences?: number
          daily_end_date?: string | null
          daily_exclude_holidays?: boolean
          daily_exclude_weekends?: boolean
          daily_next_date?: string | null
          daily_start_date?: string | null
          daily_time?: string | null
          daily_total_occurrences?: number | null
          delivery_date?: string | null
          delivery_time?: string | null
          demand_type?: string | null
          demand_type_key?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          image_aspect_ratio?: string | null
          instructions?: string | null
          is_daily_card?: boolean
          is_draft?: boolean
          objective?: string | null
          observations?: string | null
          origin?: string
          origin_note?: string | null
          period_plan_id?: string | null
          pipeline_id?: string
          post_caption?: string | null
          publish_date?: string | null
          publish_time?: string | null
          reference_attachments?: Json
          rejected_attachments?: Json
          released_at?: string | null
          released_by?: string | null
          reorder_meta?: Json | null
          source?: string
          status_id?: string
          subclient_id?: string | null
          subclient_ids?: string[]
          template_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
          work_area?: Database["public"]["Enums"]["work_area"]
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
            foreignKeyName: "demands_subclient_id_fkey"
            columns: ["subclient_id"]
            isOneToOne: false
            referencedRelation: "systems_clients"
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
      employee_anamnesis: {
        Row: {
          answers: Json
          created_at: string
          employee_id: string
          id: string
          interview_date: string
          interviewer_id: string
          observer_notes: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          employee_id: string
          id?: string
          interview_date?: string
          interviewer_id: string
          observer_notes?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          answers?: Json
          created_at?: string
          employee_id?: string
          id?: string
          interview_date?: string
          interviewer_id?: string
          observer_notes?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_anamnesis_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_progress_history: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string
          event_data: Json | null
          event_title: string
          event_type: string
          id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id: string
          event_data?: Json | null
          event_title: string
          event_type: string
          id?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string
          event_data?: Json | null
          event_title?: string
          event_type?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_progress_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_items: {
        Row: {
          active: boolean
          amount_mode: string
          bank_name: string | null
          card_item_id: string | null
          card_last4: string | null
          card_limit_brl: number | null
          card_limit_brl_enc: string | null
          category: string | null
          charge_day: number | null
          cost_center: string
          created_at: string
          created_by: string | null
          currency: string
          default_amount_brl: number | null
          default_amount_brl_enc: string | null
          default_amount_original: number | null
          default_amount_original_enc: string | null
          default_exchange_rate: number | null
          default_exchange_rate_enc: string | null
          due_day: number | null
          id: string
          installment_count: number | null
          installment_start_date: string | null
          kind: string
          link: string | null
          name: string
          notes: string | null
          parent_item_id: string | null
          payment_method: string | null
          purpose: string | null
          recurrence_interval_months: number
          recurrence_start_date: string | null
          recurrence_type: string
          statement_closing_day: number | null
          statement_due_day: number | null
          subscription_date: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount_mode?: string
          bank_name?: string | null
          card_item_id?: string | null
          card_last4?: string | null
          card_limit_brl?: number | null
          card_limit_brl_enc?: string | null
          category?: string | null
          charge_day?: number | null
          cost_center?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          default_amount_brl?: number | null
          default_amount_brl_enc?: string | null
          default_amount_original?: number | null
          default_amount_original_enc?: string | null
          default_exchange_rate?: number | null
          default_exchange_rate_enc?: string | null
          due_day?: number | null
          id?: string
          installment_count?: number | null
          installment_start_date?: string | null
          kind: string
          link?: string | null
          name: string
          notes?: string | null
          parent_item_id?: string | null
          payment_method?: string | null
          purpose?: string | null
          recurrence_interval_months?: number
          recurrence_start_date?: string | null
          recurrence_type?: string
          statement_closing_day?: number | null
          statement_due_day?: number | null
          subscription_date?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount_mode?: string
          bank_name?: string | null
          card_item_id?: string | null
          card_last4?: string | null
          card_limit_brl?: number | null
          card_limit_brl_enc?: string | null
          category?: string | null
          charge_day?: number | null
          cost_center?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          default_amount_brl?: number | null
          default_amount_brl_enc?: string | null
          default_amount_original?: number | null
          default_amount_original_enc?: string | null
          default_exchange_rate?: number | null
          default_exchange_rate_enc?: string | null
          due_day?: number | null
          id?: string
          installment_count?: number | null
          installment_start_date?: string | null
          kind?: string
          link?: string | null
          name?: string
          notes?: string | null
          parent_item_id?: string | null
          payment_method?: string | null
          purpose?: string | null
          recurrence_interval_months?: number
          recurrence_start_date?: string | null
          recurrence_type?: string
          statement_closing_day?: number | null
          statement_due_day?: number | null
          subscription_date?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_items_card_item_id_fkey"
            columns: ["card_item_id"]
            isOneToOne: false
            referencedRelation: "finance_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "finance_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_occurrences: {
        Row: {
          amount_brl: number | null
          amount_brl_enc: string | null
          amount_original: number | null
          amount_original_enc: string | null
          attachment_name: string | null
          attachment_url: string | null
          card_item_id_snapshot: string | null
          charge_date: string | null
          competence_month: string
          created_at: string
          created_by: string | null
          currency: string
          due_date: string | null
          exchange_rate: number | null
          exchange_rate_enc: string | null
          id: string
          is_estimated: boolean
          item_id: string
          legacy_bill_id: string | null
          observations: string | null
          paid_amount_brl: number | null
          paid_amount_brl_enc: string | null
          paid_at: string | null
          payment_method_snapshot: string | null
          statement_competence_snapshot: string | null
          statement_occurrence_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_brl?: number | null
          amount_brl_enc?: string | null
          amount_original?: number | null
          amount_original_enc?: string | null
          attachment_name?: string | null
          attachment_url?: string | null
          card_item_id_snapshot?: string | null
          charge_date?: string | null
          competence_month: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          exchange_rate?: number | null
          exchange_rate_enc?: string | null
          id?: string
          is_estimated?: boolean
          item_id: string
          legacy_bill_id?: string | null
          observations?: string | null
          paid_amount_brl?: number | null
          paid_amount_brl_enc?: string | null
          paid_at?: string | null
          payment_method_snapshot?: string | null
          statement_competence_snapshot?: string | null
          statement_occurrence_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_brl?: number | null
          amount_brl_enc?: string | null
          amount_original?: number | null
          amount_original_enc?: string | null
          attachment_name?: string | null
          attachment_url?: string | null
          card_item_id_snapshot?: string | null
          charge_date?: string | null
          competence_month?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          exchange_rate?: number | null
          exchange_rate_enc?: string | null
          id?: string
          is_estimated?: boolean
          item_id?: string
          legacy_bill_id?: string | null
          observations?: string | null
          paid_amount_brl?: number | null
          paid_amount_brl_enc?: string | null
          paid_at?: string | null
          payment_method_snapshot?: string | null
          statement_competence_snapshot?: string | null
          statement_occurrence_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_occurrences_card_item_snapshot_fkey"
            columns: ["card_item_id_snapshot"]
            isOneToOne: false
            referencedRelation: "finance_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_occurrences_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "finance_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_occurrences_statement_occurrence_id_fkey"
            columns: ["statement_occurrence_id"]
            isOneToOne: false
            referencedRelation: "finance_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_occurrences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_functions: {
        Row: {
          active: boolean
          config: Json
          created_at: string
          function_key: string
          id: string
          name: string
          position: number
          requires_client_origin: boolean
          tenant_id: string
          updated_at: string
          work_area: Database["public"]["Enums"]["work_area"]
        }
        Insert: {
          active?: boolean
          config?: Json
          created_at?: string
          function_key: string
          id?: string
          name: string
          position?: number
          requires_client_origin?: boolean
          tenant_id: string
          updated_at?: string
          work_area?: Database["public"]["Enums"]["work_area"]
        }
        Update: {
          active?: boolean
          config?: Json
          created_at?: string
          function_key?: string
          id?: string
          name?: string
          position?: number
          requires_client_origin?: boolean
          tenant_id?: string
          updated_at?: string
          work_area?: Database["public"]["Enums"]["work_area"]
        }
        Relationships: [
          {
            foreignKeyName: "flow_functions_tenant_id_fkey"
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
          manager_work_area: Database["public"]["Enums"]["work_area"] | null
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
          manager_work_area?: Database["public"]["Enums"]["work_area"] | null
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
          manager_work_area?: Database["public"]["Enums"]["work_area"] | null
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
      office_desk_preferences: {
        Row: {
          created_at: string
          id: string
          objects: Json
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          objects?: Json
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          objects?: Json
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_desk_preferences_tenant_id_fkey"
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
          form_draft: Json | null
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
          form_draft?: Json | null
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
          form_draft?: Json | null
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
      planned_demand_history: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          demanda: Json
          id: string
          perguntas: Json
          respostas: Json
          solicitacao: string | null
          tenant_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          demanda?: Json
          id?: string
          perguntas?: Json
          respostas?: Json
          solicitacao?: string | null
          tenant_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          demanda?: Json
          id?: string
          perguntas?: Json
          respostas?: Json
          solicitacao?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_demand_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_logins: {
        Row: {
          access_info: string
          created_at: string
          id: string
          name: string
          observations: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_info: string
          created_at?: string
          id?: string
          name: string
          observations?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_info?: string
          created_at?: string
          id?: string
          name?: string
          observations?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_logins_tenant_id_fkey"
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
          default_work_area: string
          full_name: string
          id: string
          settings: Json | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          default_work_area?: string
          full_name: string
          id: string
          settings?: Json | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          default_work_area?: string
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
      scheduled_publication_dispatches: {
        Row: {
          attempt_count: number
          caption: string | null
          card_id: string
          client_id: string
          content_type: string
          cover_file: Json | null
          created_at: string
          created_by: string | null
          dispatched_at: string | null
          error_message: string | null
          external_post_ids: Json | null
          id: string
          media_files: Json
          published_at: string | null
          scheduled_at: string
          social_accounts: Json
          status: string
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          caption?: string | null
          card_id: string
          client_id: string
          content_type: string
          cover_file?: Json | null
          created_at?: string
          created_by?: string | null
          dispatched_at?: string | null
          error_message?: string | null
          external_post_ids?: Json | null
          id?: string
          media_files?: Json
          published_at?: string | null
          scheduled_at: string
          social_accounts?: Json
          status?: string
          tenant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          caption?: string | null
          card_id?: string
          client_id?: string
          content_type?: string
          cover_file?: Json | null
          created_at?: string
          created_by?: string | null
          dispatched_at?: string | null
          error_message?: string | null
          external_post_ids?: Json | null
          id?: string
          media_files?: Json
          published_at?: string | null
          scheduled_at?: string
          social_accounts?: Json
          status?: string
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_publication_dispatches_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "demands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_publication_dispatches_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "v_demand_stage_misalignment"
            referencedColumns: ["demand_id"]
          },
        ]
      }
      seedance_pricing: {
        Row: {
          created_at: string
          id: string
          model_key: string
          notes: string | null
          price_brl_per_credit: number | null
          price_credits_per_second: number
          resolution: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          model_key: string
          notes?: string | null
          price_brl_per_credit?: number | null
          price_credits_per_second: number
          resolution: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          model_key?: string
          notes?: string | null
          price_brl_per_credit?: number | null
          price_credits_per_second?: number
          resolution?: string
          updated_at?: string
          updated_by?: string | null
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
      systems_clients: {
        Row: {
          address: string | null
          city: string | null
          commercial_owner_id: string | null
          commercial_stage: string | null
          contact_cadence_days: number
          contact_name: string | null
          created_at: string
          created_by: string | null
          current_system: string | null
          email: string | null
          id: string
          last_contact_result: string | null
          lead_source: string | null
          lifecycle: string
          loss_reason: string | null
          name: string
          next_action: string | null
          next_action_at: string | null
          notes: string | null
          onboarded_at: string | null
          parent_company_id: string
          phone: string | null
          plan: string | null
          segment: string | null
          state: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          commercial_owner_id?: string | null
          commercial_stage?: string | null
          contact_cadence_days?: number
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          current_system?: string | null
          email?: string | null
          id?: string
          last_contact_result?: string | null
          lead_source?: string | null
          lifecycle?: string
          loss_reason?: string | null
          name: string
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          onboarded_at?: string | null
          parent_company_id: string
          phone?: string | null
          plan?: string | null
          segment?: string | null
          state?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          commercial_owner_id?: string | null
          commercial_stage?: string | null
          contact_cadence_days?: number
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          current_system?: string | null
          email?: string | null
          id?: string
          last_contact_result?: string | null
          lead_source?: string | null
          lifecycle?: string
          loss_reason?: string | null
          name?: string
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          onboarded_at?: string | null
          parent_company_id?: string
          phone?: string | null
          plan?: string | null
          segment?: string | null
          state?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "systems_clients_commercial_owner_id_fkey"
            columns: ["commercial_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "systems_clients_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "tenant_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_companies: {
        Row: {
          brand_auxiliary_color: string | null
          brand_font: string | null
          brand_highlight_color: string | null
          brand_primary_color: string | null
          brand_secondary_color: string | null
          brand_secondary_font: string | null
          brand_text_color: string | null
          cep: string | null
          city: string | null
          cnpj_cpf: string | null
          commercial_phone: string | null
          complement: string | null
          contact_cadence_days: number
          content_requirements: string | null
          corporate_email: string | null
          created_at: string | null
          default_work_area: Database["public"]["Enums"]["work_area"] | null
          email: string | null
          fantasy_name: string | null
          has_mascot: boolean
          id: string
          logo_position: string | null
          logo_size: string | null
          logo_url: string | null
          mascot_description: string | null
          mascot_url: string | null
          name: string
          neighborhood: string | null
          number: string | null
          phone: string | null
          products_services: string | null
          responsible_cpf: string | null
          sector: string | null
          size: string | null
          state: string | null
          street: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          brand_auxiliary_color?: string | null
          brand_font?: string | null
          brand_highlight_color?: string | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          brand_secondary_font?: string | null
          brand_text_color?: string | null
          cep?: string | null
          city?: string | null
          cnpj_cpf?: string | null
          commercial_phone?: string | null
          complement?: string | null
          contact_cadence_days?: number
          content_requirements?: string | null
          corporate_email?: string | null
          created_at?: string | null
          default_work_area?: Database["public"]["Enums"]["work_area"] | null
          email?: string | null
          fantasy_name?: string | null
          has_mascot?: boolean
          id?: string
          logo_position?: string | null
          logo_size?: string | null
          logo_url?: string | null
          mascot_description?: string | null
          mascot_url?: string | null
          name: string
          neighborhood?: string | null
          number?: string | null
          phone?: string | null
          products_services?: string | null
          responsible_cpf?: string | null
          sector?: string | null
          size?: string | null
          state?: string | null
          street?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          brand_auxiliary_color?: string | null
          brand_font?: string | null
          brand_highlight_color?: string | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          brand_secondary_font?: string | null
          brand_text_color?: string | null
          cep?: string | null
          city?: string | null
          cnpj_cpf?: string | null
          commercial_phone?: string | null
          complement?: string | null
          contact_cadence_days?: number
          content_requirements?: string | null
          corporate_email?: string | null
          created_at?: string | null
          default_work_area?: Database["public"]["Enums"]["work_area"] | null
          email?: string | null
          fantasy_name?: string | null
          has_mascot?: boolean
          id?: string
          logo_position?: string | null
          logo_size?: string | null
          logo_url?: string | null
          mascot_description?: string | null
          mascot_url?: string | null
          name?: string
          neighborhood?: string | null
          number?: string | null
          phone?: string | null
          products_services?: string | null
          responsible_cpf?: string | null
          sector?: string | null
          size?: string | null
          state?: string | null
          street?: string | null
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
          finance_access_password_hash: string | null
          finance_default_usd_rate: number | null
          finance_default_usd_rate_enc: string | null
          finance_monthly_budget_brl: number | null
          finance_monthly_budget_brl_enc: string | null
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
          finance_access_password_hash?: string | null
          finance_default_usd_rate?: number | null
          finance_default_usd_rate_enc?: string | null
          finance_monthly_budget_brl?: number | null
          finance_monthly_budget_brl_enc?: string | null
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
          finance_access_password_hash?: string | null
          finance_default_usd_rate?: number | null
          finance_default_usd_rate_enc?: string | null
          finance_monthly_budget_brl?: number | null
          finance_monthly_budget_brl_enc?: string | null
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
      user_area_schedules: {
        Row: {
          created_at: string
          end_time: string
          id: string
          start_time: string
          tenant_id: string
          updated_at: string
          user_id: string
          weekday: number
          work_area: Database["public"]["Enums"]["work_area"]
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          start_time: string
          tenant_id: string
          updated_at?: string
          user_id: string
          weekday: number
          work_area: Database["public"]["Enums"]["work_area"]
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          start_time?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
          weekday?: number
          work_area?: Database["public"]["Enums"]["work_area"]
        }
        Relationships: []
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
          finance_access: boolean
          finance_tools_access: boolean
          id: string
          manager_work_area: Database["public"]["Enums"]["work_area"] | null
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          finance_access?: boolean
          finance_tools_access?: boolean
          id?: string
          manager_work_area?: Database["public"]["Enums"]["work_area"] | null
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          finance_access?: boolean
          finance_tools_access?: boolean
          id?: string
          manager_work_area?: Database["public"]["Enums"]["work_area"] | null
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
      video_references: {
        Row: {
          attributes: Json
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          extra_image_urls: string[]
          id: string
          kind: string
          logo_variant: string | null
          name: string
          primary_image_url: string | null
          restrictions: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          extra_image_urls?: string[]
          id?: string
          kind: string
          logo_variant?: string | null
          name: string
          primary_image_url?: string | null
          restrictions?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          extra_image_urls?: string[]
          id?: string
          kind?: string
          logo_variant?: string | null
          name?: string
          primary_image_url?: string | null
          restrictions?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_references_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "tenant_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_references_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      visual_identity_presets: {
        Row: {
          auxiliary_color: string | null
          company_id: string
          created_at: string
          font_name: string | null
          highlight_color: string | null
          id: string
          is_active: boolean
          name: string
          primary_color: string | null
          secondary_color: string | null
          secondary_font: string | null
          tenant_id: string
          text_color: string | null
          updated_at: string
        }
        Insert: {
          auxiliary_color?: string | null
          company_id: string
          created_at?: string
          font_name?: string | null
          highlight_color?: string | null
          id?: string
          is_active?: boolean
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          secondary_font?: string | null
          tenant_id: string
          text_color?: string | null
          updated_at?: string
        }
        Update: {
          auxiliary_color?: string | null
          company_id?: string
          created_at?: string
          font_name?: string | null
          highlight_color?: string | null
          id?: string
          is_active?: boolean
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          secondary_font?: string | null
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
      v_demand_stage_misalignment: {
        Row: {
          archived_at: string | null
          assigned_to: string | null
          client_id: string | null
          current_function_key: string | null
          demand_id: string | null
          demand_type_key: string | null
          tenant_id: string | null
          title: string | null
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          client_id?: string | null
          current_function_key?: string | null
          demand_id?: string | null
          demand_type_key?: string | null
          tenant_id?: string | null
          title?: string | null
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          client_id?: string | null
          current_function_key?: string | null
          demand_id?: string | null
          demand_type_key?: string | null
          tenant_id?: string | null
          title?: string | null
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
            foreignKeyName: "demands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_bulk_allocation_atomic_v1: {
        Args: { p_payload: Json }
        Returns: Json
      }
      auto_release_next_for_user: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: number
      }
      bulk_admin_stage_allowed: {
        Args: {
          _current_key: string
          _demand_type_key: string
          _next_key: string
          _origin: string
          _tenant_id: string
          _work_area: Database["public"]["Enums"]["work_area"]
        }
        Returns: boolean
      }
      can_create_demands: { Args: { _tenant_id: string }; Returns: boolean }
      can_create_tenant: { Args: { _user_id: string }; Returns: boolean }
      can_manage_release_queue: {
        Args: { _tenant_id: string }
        Returns: boolean
      }
      change_demand_type_and_stage: {
        Args: {
          p_demand_id: string
          p_expected_assigned_to: string
          p_expected_function_key: string
          p_expected_type_key: string
          p_next_assigned_to: string
          p_next_function_key: string
          p_next_type_key: string
          p_next_type_label?: string
        }
        Returns: Json
      }
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
      create_manual_demand_atomic: { Args: { p_payload: Json }; Returns: Json }
      debug_tenant_creation: { Args: { _user_id: string }; Returns: Json }
      finance_access_scope: { Args: { _tenant_id: string }; Returns: string }
      finance_encryption_health: { Args: never; Returns: Json }
      finance_password_status: { Args: { _tenant_id: string }; Returns: Json }
      finance_read_item_values: {
        Args: { _tenant_id: string }
        Returns: {
          card_limit_brl: number
          default_amount_brl: number
          default_amount_original: number
          default_exchange_rate: number
          id: string
        }[]
      }
      finance_read_occurrence_values: {
        Args: { _from?: string; _tenant_id: string; _to?: string }
        Returns: {
          amount_brl: number
          amount_original: number
          exchange_rate: number
          id: string
          paid_amount_brl: number
        }[]
      }
      finance_read_tenant_values: {
        Args: { _tenant_id: string }
        Returns: {
          finance_default_usd_rate: number
          finance_monthly_budget_brl: number
        }[]
      }
      finance_tools_item_allowed: {
        Args: { _item_id: string; _tenant_id: string }
        Returns: boolean
      }
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
      get_user_tenant_ids: { Args: { _user_id: string }; Returns: string[] }
      has_finance_access: { Args: { _tenant_id: string }; Returns: boolean }
      has_finance_tools_access: {
        Args: { _tenant_id: string }
        Returns: boolean
      }
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
      is_client_facing_function: { Args: { _key: string }; Returns: boolean }
      is_release_queue_enabled: {
        Args: { _tenant_id: string }
        Returns: boolean
      }
      is_review_function: { Args: { _key: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      list_finance_safe_card_statement_status: {
        Args: { _competence_month: string; _tenant_id: string }
        Returns: {
          card_id: string
          competence_month: string
          due_date: string
          paid: boolean
          paid_at: string
        }[]
      }
      list_finance_safe_cards: {
        Args: { _tenant_id: string }
        Returns: {
          bank_name: string
          card_last4: string
          id: string
          statement_closing_day: number
          statement_due_day: number
        }[]
      }
      pay_finance_statement: {
        Args: {
          _occurrence_id: string
          _paid_amount_brl?: number
          _paid_at?: string
        }
        Returns: Json
      }
      record_demand_feedback: {
        Args: {
          p_demand_id: string
          p_event_type: Database["public"]["Enums"]["demand_feedback_event_type"]
        }
        Returns: Json
      }
      refresh_client_templates: { Args: { p_client_id: string }; Returns: Json }
      resolve_function_for_assignee:
        | {
            Args: {
              _current_key: string
              _demand_type_key: string
              _tenant_id: string
              _user_id: string
            }
            Returns: string
          }
        | {
            Args: {
              _current_key: string
              _demand_type_key: string
              _tenant_id: string
              _user_id: string
              _work_area?: Database["public"]["Enums"]["work_area"]
            }
            Returns: string
          }
        | {
            Args: {
              _current_key: string
              _demand_type_key: string
              _origin: string
              _tenant_id: string
              _user_id: string
              _work_area: Database["public"]["Enums"]["work_area"]
            }
            Returns: string
          }
      resolve_function_for_assignee_admin: {
        Args: {
          _current_key: string
          _demand_id?: string
          _demand_type_key: string
          _origin: string
          _tenant_id: string
          _user_id: string
          _work_area: Database["public"]["Enums"]["work_area"]
        }
        Returns: string
      }
      resolve_initial_function: {
        Args: {
          _demand_type_key: string
          _origin?: string
          _tenant_id: string
          _work_area?: Database["public"]["Enums"]["work_area"]
        }
        Returns: string
      }
      set_finance_password: {
        Args: { _password: string; _tenant_id: string }
        Returns: Json
      }
      set_finance_settings: {
        Args: {
          _default_usd_rate: number
          _monthly_budget_brl: number
          _tenant_id: string
        }
        Returns: Json
      }
      set_release_queue_config: {
        Args: { _enabled: boolean; _limit: number; _tenant_id: string }
        Returns: Json
      }
      set_team_member_avatar: {
        Args: { _avatar_url: string; _target_user_id: string }
        Returns: undefined
      }
      storage_path_access_allowed: {
        Args: { _object_name: string }
        Returns: boolean
      }
      use_invitation: {
        Args: { _code: string; _user_id: string }
        Returns: Json
      }
      user_can_hold_function: {
        Args: {
          _function_key: string
          _tenant_id: string
          _user_id: string
          _work_area?: Database["public"]["Enums"]["work_area"]
        }
        Returns: boolean
      }
      user_has_tenant_access: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      verify_finance_password: {
        Args: { _password: string; _tenant_id: string }
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
      work_area: "midia" | "sistemas"
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
      work_area: ["midia", "sistemas"],
    },
  },
} as const
