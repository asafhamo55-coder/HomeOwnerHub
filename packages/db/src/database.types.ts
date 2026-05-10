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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_feedback: {
        Row: {
          ai_run_id: string
          comment: string | null
          created_at: string | null
          edited_output: Json | null
          id: string
          organization_id: string
          signal: string
          user_id: string
        }
        Insert: {
          ai_run_id: string
          comment?: string | null
          created_at?: string | null
          edited_output?: Json | null
          id?: string
          organization_id: string
          signal: string
          user_id: string
        }
        Update: {
          ai_run_id?: string
          comment?: string | null
          created_at?: string | null
          edited_output?: Json | null
          id?: string
          organization_id?: string
          signal?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_runs: {
        Row: {
          approved_at: string | null
          citations: Json | null
          confidence: number | null
          created_at: string | null
          error_code: string | null
          human_approved: boolean | null
          human_approver: string | null
          human_edited_output: Json | null
          human_feedback: string | null
          id: string
          input: Json
          input_hash: string
          latency_ms: number | null
          model: string
          organization_id: string
          output: Json
          prompt_version: string
          reasoning_trace: string | null
          status: string
          tokens_in: number | null
          tokens_out: number | null
          workflow_id: string
          workflow_version: string
        }
        Insert: {
          approved_at?: string | null
          citations?: Json | null
          confidence?: number | null
          created_at?: string | null
          error_code?: string | null
          human_approved?: boolean | null
          human_approver?: string | null
          human_edited_output?: Json | null
          human_feedback?: string | null
          id?: string
          input: Json
          input_hash: string
          latency_ms?: number | null
          model: string
          organization_id: string
          output: Json
          prompt_version: string
          reasoning_trace?: string | null
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          workflow_id: string
          workflow_version: string
        }
        Update: {
          approved_at?: string | null
          citations?: Json | null
          confidence?: number | null
          created_at?: string | null
          error_code?: string | null
          human_approved?: boolean | null
          human_approver?: string | null
          human_edited_output?: Json | null
          human_feedback?: string | null
          id?: string
          input?: Json
          input_hash?: string
          latency_ms?: number | null
          model?: string
          organization_id?: string
          output?: Json
          prompt_version?: string
          reasoning_trace?: string | null
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          workflow_id?: string
          workflow_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_human_approver_fkey"
            columns: ["human_approver"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      associations: {
        Row: {
          ai_generated: boolean | null
          ai_workflow_id: string | null
          created_at: string | null
          created_by: string | null
          fiscal_year_start: string | null
          governing_law_state: string | null
          id: string
          name: string
          organization_id: string
          state: string
          total_units: number | null
          type: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          ai_workflow_id?: string | null
          created_at?: string | null
          created_by?: string | null
          fiscal_year_start?: string | null
          governing_law_state?: string | null
          id?: string
          name: string
          organization_id: string
          state: string
          total_units?: number | null
          type?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          ai_workflow_id?: string | null
          created_at?: string | null
          created_by?: string | null
          fiscal_year_start?: string | null
          governing_law_state?: string | null
          id?: string
          name?: string
          organization_id?: string
          state?: string
          total_units?: number | null
          type?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "associations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "associations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "associations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          org_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      eviction_cases: {
        Row: {
          balance_owed: number | null
          case_notes: string | null
          compliance_flags: Json | null
          county: string
          court_case_number: string | null
          created_at: string | null
          days_unpaid: number | null
          filing_eligible_date: string | null
          hearing_date: string | null
          id: string
          monthly_rent: number | null
          notice_approved: boolean | null
          notice_approved_at: string | null
          notice_approved_by: string | null
          notice_draft: string | null
          notice_sent_at: string | null
          notice_served_method: string | null
          notice_type: string | null
          org_id: string
          outcome: string | null
          property_address: string
          state: string
          status: string | null
          stripe_payment_id: string | null
          tenant_email: string | null
          tenant_name: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance_owed?: number | null
          case_notes?: string | null
          compliance_flags?: Json | null
          county: string
          court_case_number?: string | null
          created_at?: string | null
          days_unpaid?: number | null
          filing_eligible_date?: string | null
          hearing_date?: string | null
          id?: string
          monthly_rent?: number | null
          notice_approved?: boolean | null
          notice_approved_at?: string | null
          notice_approved_by?: string | null
          notice_draft?: string | null
          notice_sent_at?: string | null
          notice_served_method?: string | null
          notice_type?: string | null
          org_id: string
          outcome?: string | null
          property_address: string
          state: string
          status?: string | null
          stripe_payment_id?: string | null
          tenant_email?: string | null
          tenant_name?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance_owed?: number | null
          case_notes?: string | null
          compliance_flags?: Json | null
          county?: string
          court_case_number?: string | null
          created_at?: string | null
          days_unpaid?: number | null
          filing_eligible_date?: string | null
          hearing_date?: string | null
          id?: string
          monthly_rent?: number | null
          notice_approved?: boolean | null
          notice_approved_at?: string | null
          notice_approved_by?: string | null
          notice_draft?: string | null
          notice_sent_at?: string | null
          notice_served_method?: string | null
          notice_type?: string | null
          org_id?: string
          outcome?: string | null
          property_address?: string
          state?: string
          status?: string | null
          stripe_payment_id?: string | null
          tenant_email?: string | null
          tenant_name?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eviction_cases_notice_approved_by_fkey"
            columns: ["notice_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eviction_cases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eviction_cases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      governing_document_chunks: {
        Row: {
          created_at: string | null
          document_id: string
          embedding: string | null
          id: string
          metadata: Json | null
          ordinal: number
          organization_id: string
          page_number: number | null
          section: string | null
          text: string
        }
        Insert: {
          created_at?: string | null
          document_id: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          ordinal: number
          organization_id: string
          page_number?: number | null
          section?: string | null
          text: string
        }
        Update: {
          created_at?: string | null
          document_id?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          ordinal?: number
          organization_id?: string
          page_number?: number | null
          section?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "governing_document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "governing_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governing_document_chunks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      governing_documents: {
        Row: {
          ai_generated: boolean | null
          ai_workflow_id: string | null
          association_id: string | null
          created_at: string | null
          created_by: string | null
          effective_date: string | null
          file_size: number | null
          id: string
          organization_id: string
          parsed_at: string | null
          parsed_text: string | null
          parser_version: string | null
          storage_path: string | null
          superseded_at: string | null
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          ai_workflow_id?: string | null
          association_id?: string | null
          created_at?: string | null
          created_by?: string | null
          effective_date?: string | null
          file_size?: number | null
          id?: string
          organization_id: string
          parsed_at?: string | null
          parsed_text?: string | null
          parser_version?: string | null
          storage_path?: string | null
          superseded_at?: string | null
          title: string
          type: string
          updated_at?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          ai_workflow_id?: string | null
          association_id?: string | null
          created_at?: string | null
          created_by?: string | null
          effective_date?: string | null
          file_size?: number | null
          id?: string
          organization_id?: string
          parsed_at?: string | null
          parsed_text?: string | null
          parser_version?: string | null
          storage_path?: string | null
          superseded_at?: string | null
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "governing_documents_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governing_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governing_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      hoa_digests: {
        Row: {
          content: string
          generated_at: string | null
          org_id: string
        }
        Insert: {
          content: string
          generated_at?: string | null
          org_id: string
        }
        Update: {
          content?: string
          generated_at?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hoa_digests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      hoa_documents: {
        Row: {
          created_at: string | null
          file_size: number | null
          id: string
          name: string
          org_id: string
          parsed_at: string | null
          parsed_text: string | null
          storage_path: string
          type: string
        }
        Insert: {
          created_at?: string | null
          file_size?: number | null
          id?: string
          name: string
          org_id: string
          parsed_at?: string | null
          parsed_text?: string | null
          storage_path: string
          type: string
        }
        Update: {
          created_at?: string | null
          file_size?: number | null
          id?: string
          name?: string
          org_id?: string
          parsed_at?: string | null
          parsed_text?: string | null
          storage_path?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "hoa_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      hoa_dues: {
        Row: {
          amount_due: number
          amount_paid: number | null
          created_at: string | null
          due_date: string
          id: string
          late_fee: number | null
          org_id: string
          paid_date: string | null
          period: string
          property_id: string | null
          status: string | null
          stripe_payment_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount_due: number
          amount_paid?: number | null
          created_at?: string | null
          due_date: string
          id?: string
          late_fee?: number | null
          org_id: string
          paid_date?: string | null
          period: string
          property_id?: string | null
          status?: string | null
          stripe_payment_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount_due?: number
          amount_paid?: number | null
          created_at?: string | null
          due_date?: string
          id?: string
          late_fee?: number | null
          org_id?: string
          paid_date?: string | null
          period?: string
          property_id?: string | null
          status?: string | null
          stripe_payment_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hoa_dues_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hoa_dues_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "hoa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      hoa_meeting_minutes: {
        Row: {
          action_items: Json | null
          ai_summary: string | null
          approved_at: string | null
          approved_by: string | null
          attendees: string[] | null
          created_at: string | null
          created_by: string | null
          id: string
          meeting_date: string
          meeting_type: string | null
          motions: Json | null
          org_id: string
          raw_transcript: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          action_items?: Json | null
          ai_summary?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attendees?: string[] | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          meeting_date: string
          meeting_type?: string | null
          motions?: Json | null
          org_id: string
          raw_transcript?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          action_items?: Json | null
          ai_summary?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attendees?: string[] | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          meeting_date?: string
          meeting_type?: string | null
          motions?: Json | null
          org_id?: string
          raw_transcript?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hoa_meeting_minutes_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hoa_meeting_minutes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hoa_meeting_minutes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      hoa_properties: {
        Row: {
          address: string
          created_at: string | null
          id: string
          notes: string | null
          org_id: string
          owner_email: string | null
          owner_name: string | null
          owner_phone: string | null
          unit_number: string | null
          updated_at: string | null
        }
        Insert: {
          address: string
          created_at?: string | null
          id?: string
          notes?: string | null
          org_id: string
          owner_email?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          unit_number?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          owner_email?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          unit_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hoa_properties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      hoa_violations: {
        Row: {
          ai_draft_letter: string | null
          approved_at: string | null
          approved_by: string | null
          approved_letter: string | null
          ccr_section: string | null
          created_at: string | null
          created_by: string | null
          cure_period_days: number | null
          description: string
          fine_amount: number | null
          fine_start_date: string | null
          id: string
          notice_sent_at: string | null
          org_id: string
          photo_urls: string[] | null
          property_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          severity: string | null
          status: string
          updated_at: string | null
          violation_type: string
        }
        Insert: {
          ai_draft_letter?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_letter?: string | null
          ccr_section?: string | null
          created_at?: string | null
          created_by?: string | null
          cure_period_days?: number | null
          description: string
          fine_amount?: number | null
          fine_start_date?: string | null
          id?: string
          notice_sent_at?: string | null
          org_id: string
          photo_urls?: string[] | null
          property_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          severity?: string | null
          status?: string
          updated_at?: string | null
          violation_type: string
        }
        Update: {
          ai_draft_letter?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_letter?: string | null
          ccr_section?: string | null
          created_at?: string | null
          created_by?: string | null
          cure_period_days?: number | null
          description?: string
          fine_amount?: number | null
          fine_start_date?: string | null
          id?: string
          notice_sent_at?: string | null
          org_id?: string
          photo_urls?: string[] | null
          property_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          severity?: string | null
          status?: string
          updated_at?: string | null
          violation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "hoa_violations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hoa_violations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hoa_violations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hoa_violations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "hoa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          invited_at: string | null
          joined_at: string | null
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          invited_at?: string | null
          joined_at?: string | null
          org_id: string
          role: string
          user_id: string
        }
        Update: {
          invited_at?: string | null
          joined_at?: string | null
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string | null
          doors_count: number | null
          hub_type: string
          id: string
          name: string
          organization_type: string
          plan: string
          stripe_customer_id: string | null
          stripe_sub_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          doors_count?: number | null
          hub_type: string
          id?: string
          name: string
          organization_type?: string
          plan?: string
          stripe_customer_id?: string | null
          stripe_sub_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          doors_count?: number | null
          hub_type?: string
          id?: string
          name?: string
          organization_type?: string
          plan?: string
          stripe_customer_id?: string | null
          stripe_sub_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ownerships: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          organization_id: string
          owner_email: string | null
          owner_name: string | null
          owner_phone: string | null
          owner_user_id: string | null
          ownership_pct: number | null
          source: string | null
          unit_id: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          organization_id: string
          owner_email?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          owner_user_id?: string | null
          ownership_pct?: number | null
          source?: string | null
          unit_id: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          organization_id?: string
          owner_email?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          owner_user_id?: string | null
          ownership_pct?: number | null
          source?: string | null
          unit_id?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ownerships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ownerships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ownerships_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ownerships_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_properties: {
        Row: {
          address: string
          bathrooms: number | null
          bedrooms: number | null
          created_at: string | null
          deposit: number | null
          id: string
          lease_end: string | null
          lease_start: string | null
          monthly_rent: number | null
          notes: string | null
          org_id: string
          sq_ft: number | null
          status: string | null
          tenant_email: string | null
          tenant_name: string | null
          tenant_phone: string | null
          unit_type: string | null
          updated_at: string | null
        }
        Insert: {
          address: string
          bathrooms?: number | null
          bedrooms?: number | null
          created_at?: string | null
          deposit?: number | null
          id?: string
          lease_end?: string | null
          lease_start?: string | null
          monthly_rent?: number | null
          notes?: string | null
          org_id: string
          sq_ft?: number | null
          status?: string | null
          tenant_email?: string | null
          tenant_name?: string | null
          tenant_phone?: string | null
          unit_type?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string
          bathrooms?: number | null
          bedrooms?: number | null
          created_at?: string | null
          deposit?: number | null
          id?: string
          lease_end?: string | null
          lease_start?: string | null
          monthly_rent?: number | null
          notes?: string | null
          org_id?: string
          sq_ft?: number | null
          status?: string | null
          tenant_email?: string | null
          tenant_name?: string | null
          tenant_phone?: string | null
          unit_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_properties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_rent_ledger: {
        Row: {
          amount_due: number
          amount_paid: number | null
          created_at: string | null
          due_date: string
          id: string
          late_fee: number | null
          late_fee_rate: number | null
          notes: string | null
          org_id: string
          paid_date: string | null
          period: string
          property_id: string
          status: string | null
          stripe_payment_id: string | null
        }
        Insert: {
          amount_due: number
          amount_paid?: number | null
          created_at?: string | null
          due_date: string
          id?: string
          late_fee?: number | null
          late_fee_rate?: number | null
          notes?: string | null
          org_id: string
          paid_date?: string | null
          period: string
          property_id: string
          status?: string | null
          stripe_payment_id?: string | null
        }
        Update: {
          amount_due?: number
          amount_paid?: number | null
          created_at?: string | null
          due_date?: string
          id?: string
          late_fee?: number | null
          late_fee_rate?: number | null
          notes?: string | null
          org_id?: string
          paid_date?: string | null
          period?: string
          property_id?: string
          status?: string | null
          stripe_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_rent_ledger_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_rent_ledger_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "pm_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      tenancies: {
        Row: {
          created_at: string | null
          deposit: number | null
          id: string
          lease_end: string | null
          lease_start: string
          monthly_rent: number | null
          organization_id: string
          status: string
          tenant_email: string | null
          tenant_name: string | null
          tenant_phone: string | null
          tenant_user_id: string | null
          unit_id: string
        }
        Insert: {
          created_at?: string | null
          deposit?: number | null
          id?: string
          lease_end?: string | null
          lease_start: string
          monthly_rent?: number | null
          organization_id: string
          status?: string
          tenant_email?: string | null
          tenant_name?: string | null
          tenant_phone?: string | null
          tenant_user_id?: string | null
          unit_id: string
        }
        Update: {
          created_at?: string | null
          deposit?: number | null
          id?: string
          lease_end?: string | null
          lease_start?: string
          monthly_rent?: number | null
          organization_id?: string
          status?: string
          tenant_email?: string | null
          tenant_name?: string | null
          tenant_phone?: string | null
          tenant_user_id?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenancies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenancies_tenant_user_id_fkey"
            columns: ["tenant_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenancies_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          address_line1: string
          address_line2: string | null
          ai_generated: boolean | null
          ai_workflow_id: string | null
          association_id: string | null
          bathrooms: number | null
          bedrooms: number | null
          city: string | null
          created_at: string | null
          created_by: string | null
          id: string
          lot_number: string | null
          notes: string | null
          organization_id: string
          postal_code: string | null
          square_feet: number | null
          state: string | null
          unit_number: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          ai_generated?: boolean | null
          ai_workflow_id?: string | null
          association_id?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          lot_number?: string | null
          notes?: string | null
          organization_id: string
          postal_code?: string | null
          square_feet?: number | null
          state?: string | null
          unit_number?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          ai_generated?: boolean | null
          ai_workflow_id?: string | null
          association_id?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          lot_number?: string | null
          notes?: string | null
          organization_id?: string
          postal_code?: string | null
          square_feet?: number | null
          state?: string | null
          unit_number?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "units_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wizard_drafts: {
        Row: {
          completed: boolean
          created_at: string
          current_step: string
          id: string
          kind: string
          notified_at: string | null
          org_id: string
          payload: Json
          step_index: number
          total_steps: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          current_step?: string
          id?: string
          kind: string
          notified_at?: string | null
          org_id: string
          payload?: Json
          step_index?: number
          total_steps?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          current_step?: string
          id?: string
          kind?: string
          notified_at?: string | null
          org_id?: string
          payload?: Json
          step_index?: number
          total_steps?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wizard_drafts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wizard_drafts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_org_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
