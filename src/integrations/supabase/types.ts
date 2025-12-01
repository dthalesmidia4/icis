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
          column_name: string | null
          created_at: string
          description: string | null
          file_location: string | null
          id: string
          observations: string | null
          plan_id: string
          publication_date: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          column_name?: string | null
          created_at?: string
          description?: string | null
          file_location?: string | null
          id?: string
          observations?: string | null
          plan_id: string
          publication_date: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          column_name?: string | null
          created_at?: string
          description?: string | null
          file_location?: string | null
          id?: string
          observations?: string | null
          plan_id?: string
          publication_date?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
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
          company_id: string
          created_at: string
          default_plan: Json
          final_plan: Json | null
          id: string
          objective: string
          observations: string | null
          optional_package: Json | null
          package_accepted: boolean | null
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
          company_id: string
          created_at?: string
          default_plan?: Json
          final_plan?: Json | null
          id?: string
          objective: string
          observations?: string | null
          optional_package?: Json | null
          package_accepted?: boolean | null
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
          company_id?: string
          created_at?: string
          default_plan?: Json
          final_plan?: Json | null
          id?: string
          objective?: string
          observations?: string | null
          optional_package?: Json | null
          package_accepted?: boolean | null
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
      can_create_tenant: { Args: { _user_id: string }; Returns: boolean }
      debug_tenant_creation: { Args: { _user_id: string }; Returns: Json }
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
      get_user_tenant: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      ],
    },
  },
} as const
