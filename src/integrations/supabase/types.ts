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
      collaborator_function_assignments: {
        Row: {
          allowed: boolean
          created_at: string
          function_key: string
          id: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          function_key: string
          id?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          function_key?: string
          id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
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
          additional_publish_dates: Json
          archived_at: string | null
          assigned_to: string | null
          attachments: Json
          channel: string | null
          client_id: string
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
          instructions: string | null
          is_daily_card: boolean
          is_draft: boolean
          objective: string | null
          observations: string | null
          period_plan_id: string | null
          pipeline_id: string
          post_caption: string | null
          publish_date: string | null
          publish_time: string | null
          rejected_attachments: Json
          source: string
          status_id: string
          template_id: string | null
          tenant_id: string
          title: string
          updated_at: string
          work_area: Database["public"]["Enums"]["work_area"]
        }
        Insert: {
          additional_publish_dates?: Json
          archived_at?: string | null
          assigned_to?: string | null
          attachments?: Json
          channel?: string | null
          client_id: string
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
          instructions?: string | null
          is_daily_card?: boolean
          is_draft?: boolean
          objective?: string | null
          observations?: string | null
          period_plan_id?: string | null
          pipeline_id: string
          post_caption?: string | null
          publish_date?: string | null
          publish_time?: string | null
          rejected_attachments?: Json
          source?: string
          status_id: string
          template_id?: string | null
          tenant_id: string
          title: string
          updated_at?: string
          work_area?: Database["public"]["Enums"]["work_area"]
        }
        Update: {
          additional_publish_dates?: Json
          archived_at?: string | null
          assigned_to?: string | null
          attachments?: Json
          channel?: string | null
          client_id?: string
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
          instructions?: string | null
          is_daily_card?: boolean
          is_draft?: boolean
          objective?: string | null
          observations?: string | null
          period_plan_id?: string | null
          pipeline_id?: string
          post_caption?: string | null
          publish_date?: string | null
          publish_time?: string | null
          rejected_attachments?: Json
          source?: string
          status_id?: string
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
      flow_functions: {
        Row: {
          active: boolean
          config: Json
          created_at: string
          function_key: string
          id: string
          name: string
          position: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          config?: Json
          created_at?: string
          function_key: string
          id?: string
          name: string
          position?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          config?: Json
          created_at?: string
          function_key?: string
          id?: string
          name?: string
          position?: number
          tenant_id?: string
          updated_at?: string
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
          cnpj_cpf: string
          commercial_phone: string | null
          complement: string | null
          content_requirements: string | null
          corporate_email: string | null
          created_at: string | null
          default_work_area: Database["public"]["Enums"]["work_area"] | null
          email: string
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
          phone: string
          products_services: string
          responsible_cpf: string | null
          sector: string
          size: string
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
          cnpj_cpf: string
          commercial_phone?: string | null
          complement?: string | null
          content_requirements?: string | null
          corporate_email?: string | null
          created_at?: string | null
          default_work_area?: Database["public"]["Enums"]["work_area"] | null
          email: string
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
          phone: string
          products_services: string
          responsible_cpf?: string | null
          sector: string
          size: string
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
          cnpj_cpf?: string
          commercial_phone?: string | null
          complement?: string | null
          content_requirements?: string | null
          corporate_email?: string | null
          created_at?: string | null
          default_work_area?: Database["public"]["Enums"]["work_area"] | null
          email?: string
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
          phone?: string
          products_services?: string
          responsible_cpf?: string | null
          sector?: string
          size?: string
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
      tool_expenses: {
        Row: {
          amount: number
          card_used: string | null
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          name: string
          observations: string | null
          subscription_date: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          card_used?: string | null
          created_at?: string
          created_by?: string | null
          due_date: string
          id?: string
          name: string
          observations?: string | null
          subscription_date?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          card_used?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          name?: string
          observations?: string | null
          subscription_date?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_expenses_tenant_id_fkey"
            columns: ["tenant_id"]
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
      get_user_tenant_ids: { Args: { _user_id: string }; Returns: string[] }
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
      resolve_function_for_assignee: {
        Args: {
          _current_key: string
          _demand_type_key: string
          _tenant_id: string
          _user_id: string
        }
        Returns: string
      }
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
