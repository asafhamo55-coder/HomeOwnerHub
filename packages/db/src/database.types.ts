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
      adjusting_entries: {
        Row: {
          flagged_at: string
          flagged_by: string | null
          id: string
          journal_entry_id: string
          reason: string
        }
        Insert: {
          flagged_at?: string
          flagged_by?: string | null
          id?: string
          journal_entry_id: string
          reason: string
        }
        Update: {
          flagged_at?: string
          flagged_by?: string | null
          id?: string
          journal_entry_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "adjusting_entries_flagged_by_fkey"
            columns: ["flagged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adjusting_entries_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
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
      arc_request_messages: {
        Row: {
          arc_request_id: string
          author_id: string
          author_role: string
          body: string
          created_at: string
          id: string
          internal: boolean
        }
        Insert: {
          arc_request_id: string
          author_id: string
          author_role: string
          body: string
          created_at?: string
          id?: string
          internal?: boolean
        }
        Update: {
          arc_request_id?: string
          author_id?: string
          author_role?: string
          body?: string
          created_at?: string
          id?: string
          internal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "arc_request_messages_arc_request_id_fkey"
            columns: ["arc_request_id"]
            isOneToOne: false
            referencedRelation: "arc_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arc_request_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      arc_requests: {
        Row: {
          association_id: string | null
          board_response: string | null
          board_response_at: string | null
          board_response_by: string | null
          category: string
          contractor_license: string | null
          contractor_name: string | null
          deleted_at: string | null
          id: string
          organization_id: string
          proposed_completion: string | null
          proposed_start: string | null
          scope_description: string
          status: string
          submitted_at: string
          submitted_by: string
          summary: string
          unit_id: string | null
        }
        Insert: {
          association_id?: string | null
          board_response?: string | null
          board_response_at?: string | null
          board_response_by?: string | null
          category: string
          contractor_license?: string | null
          contractor_name?: string | null
          deleted_at?: string | null
          id?: string
          organization_id: string
          proposed_completion?: string | null
          proposed_start?: string | null
          scope_description: string
          status?: string
          submitted_at?: string
          submitted_by: string
          summary: string
          unit_id?: string | null
        }
        Update: {
          association_id?: string | null
          board_response?: string | null
          board_response_at?: string | null
          board_response_by?: string | null
          category?: string
          contractor_license?: string | null
          contractor_name?: string | null
          deleted_at?: string | null
          id?: string
          organization_id?: string
          proposed_completion?: string | null
          proposed_start?: string | null
          scope_description?: string
          status?: string
          submitted_at?: string
          submitted_by?: string
          summary?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arc_requests_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arc_requests_board_response_by_fkey"
            columns: ["board_response_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arc_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arc_requests_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arc_requests_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          amount: number
          assessment_type: string
          association_id: string
          created_at: string
          deleted_at: string | null
          due_date: string
          fiscal_period_id: string
          id: string
          memo_code: string | null
          organization_id: string
          status: string
          unit_id: string
        }
        Insert: {
          amount: number
          assessment_type: string
          association_id: string
          created_at?: string
          deleted_at?: string | null
          due_date: string
          fiscal_period_id: string
          id?: string
          memo_code?: string | null
          organization_id: string
          status?: string
          unit_id: string
        }
        Update: {
          amount?: number
          assessment_type?: string
          association_id?: string
          created_at?: string
          deleted_at?: string | null
          due_date?: string
          fiscal_period_id?: string
          id?: string
          memo_code?: string | null
          organization_id?: string
          status?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_fiscal_period_id_fkey"
            columns: ["fiscal_period_id"]
            isOneToOne: false
            referencedRelation: "fiscal_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      associations: {
        Row: {
          ai_generated: boolean | null
          ai_workflow_id: string | null
          compliance_settings: Json
          created_at: string | null
          created_by: string | null
          fiscal_year_start: string | null
          governing_law_state: string | null
          id: string
          lease_cap_ai_source: string | null
          lease_cap_ai_suggested_pct: number | null
          lease_cap_pct: number | null
          lease_cap_set_at: string | null
          lease_cap_set_by: string | null
          name: string
          organization_id: string
          slug: string
          state: string
          total_units: number | null
          type: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          ai_workflow_id?: string | null
          compliance_settings?: Json
          created_at?: string | null
          created_by?: string | null
          fiscal_year_start?: string | null
          governing_law_state?: string | null
          id?: string
          lease_cap_ai_source?: string | null
          lease_cap_ai_suggested_pct?: number | null
          lease_cap_pct?: number | null
          lease_cap_set_at?: string | null
          lease_cap_set_by?: string | null
          name: string
          organization_id: string
          slug: string
          state: string
          total_units?: number | null
          type?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          ai_workflow_id?: string | null
          compliance_settings?: Json
          created_at?: string | null
          created_by?: string | null
          fiscal_year_start?: string | null
          governing_law_state?: string | null
          id?: string
          lease_cap_ai_source?: string | null
          lease_cap_ai_suggested_pct?: number | null
          lease_cap_pct?: number | null
          lease_cap_set_at?: string | null
          lease_cap_set_by?: string | null
          name?: string
          organization_id?: string
          slug?: string
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
      bank_accounts: {
        Row: {
          account_name: string
          association_id: string
          bank_name: string | null
          created_at: string
          current_balance: number | null
          fund_id: string
          id: string
          is_active: boolean
          last_synced_at: string | null
          last4: string | null
          organization_id: string
          plaid_account_id: string | null
          plaid_item_id: string | null
        }
        Insert: {
          account_name: string
          association_id: string
          bank_name?: string | null
          created_at?: string
          current_balance?: number | null
          fund_id: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          last4?: string | null
          organization_id: string
          plaid_account_id?: string | null
          plaid_item_id?: string | null
        }
        Update: {
          account_name?: string
          association_id?: string
          bank_name?: string | null
          created_at?: string
          current_balance?: number | null
          fund_id?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          last4?: string | null
          organization_id?: string
          plaid_account_id?: string | null
          plaid_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_reconciliations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bank_account_id: string
          id: string
          organization_id: string
          reconciled_at: string | null
          reconciled_balance: number | null
          reconciled_by: string | null
          statement_balance: number | null
          statement_date: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id: string
          id?: string
          organization_id: string
          reconciled_at?: string | null
          reconciled_balance?: number | null
          reconciled_by?: string | null
          statement_balance?: number | null
          statement_date: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id?: string
          id?: string
          organization_id?: string
          reconciled_at?: string | null
          reconciled_balance?: number | null
          reconciled_by?: string | null
          statement_balance?: number | null
          statement_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string
          created_at: string
          id: string
          match_confidence: number | null
          match_method: string | null
          matched_journal_entry_id: string | null
          memo: string | null
          merchant: string | null
          organization_id: string
          plaid_transaction_id: string | null
          posted_date: string
        }
        Insert: {
          amount: number
          bank_account_id: string
          created_at?: string
          id?: string
          match_confidence?: number | null
          match_method?: string | null
          matched_journal_entry_id?: string | null
          memo?: string | null
          merchant?: string | null
          organization_id: string
          plaid_transaction_id?: string | null
          posted_date: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          created_at?: string
          id?: string
          match_confidence?: number | null
          match_method?: string | null
          matched_journal_entry_id?: string | null
          memo?: string | null
          merchant?: string | null
          organization_id?: string
          plaid_transaction_id?: string | null
          posted_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_journal_entry_id_fkey"
            columns: ["matched_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_comparisons: {
        Row: {
          ai_workflow_id: string | null
          comparison_table: Json
          flagged_additions: Json | null
          flagged_exclusions: Json | null
          generated_at: string
          id: string
          organization_id: string
          payment_term_diffs: Json | null
          recommendation_memo: string | null
          rfp_id: string
          warranty_diffs: Json | null
        }
        Insert: {
          ai_workflow_id?: string | null
          comparison_table: Json
          flagged_additions?: Json | null
          flagged_exclusions?: Json | null
          generated_at?: string
          id?: string
          organization_id: string
          payment_term_diffs?: Json | null
          recommendation_memo?: string | null
          rfp_id: string
          warranty_diffs?: Json | null
        }
        Update: {
          ai_workflow_id?: string | null
          comparison_table?: Json
          flagged_additions?: Json | null
          flagged_exclusions?: Json | null
          generated_at?: string
          id?: string
          organization_id?: string
          payment_term_diffs?: Json | null
          recommendation_memo?: string | null
          rfp_id?: string
          warranty_diffs?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "bid_comparisons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_comparisons_rfp_id_fkey"
            columns: ["rfp_id"]
            isOneToOne: false
            referencedRelation: "rfps"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_line_items: {
        Row: {
          bid_id: string
          description: string
          id: string
          is_addition: boolean
          is_excluded: boolean
          line_total: number | null
          notes: string | null
          quantity: number | null
          rfp_line_item_id: string | null
          unit_price: number | null
        }
        Insert: {
          bid_id: string
          description: string
          id?: string
          is_addition?: boolean
          is_excluded?: boolean
          line_total?: number | null
          notes?: string | null
          quantity?: number | null
          rfp_line_item_id?: string | null
          unit_price?: number | null
        }
        Update: {
          bid_id?: string
          description?: string
          id?: string
          is_addition?: boolean
          is_excluded?: boolean
          line_total?: number | null
          notes?: string | null
          quantity?: number | null
          rfp_line_item_id?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bid_line_items_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: false
            referencedRelation: "bids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_line_items_rfp_line_item_id_fkey"
            columns: ["rfp_line_item_id"]
            isOneToOne: false
            referencedRelation: "rfp_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      bids: {
        Row: {
          completion_date: string | null
          id: string
          organization_id: string
          parsed_at: string | null
          parsed_by_workflow_id: string | null
          parsed_pdf_at: string | null
          parsed_pdf_text: string | null
          payment_terms: string | null
          raw_document_path: string | null
          rfp_id: string
          start_date: string | null
          status: string
          submitted_at: string | null
          total_amount: number
          vendor_id: string
          warranty: string | null
        }
        Insert: {
          completion_date?: string | null
          id?: string
          organization_id: string
          parsed_at?: string | null
          parsed_by_workflow_id?: string | null
          parsed_pdf_at?: string | null
          parsed_pdf_text?: string | null
          payment_terms?: string | null
          raw_document_path?: string | null
          rfp_id: string
          start_date?: string | null
          status?: string
          submitted_at?: string | null
          total_amount: number
          vendor_id: string
          warranty?: string | null
        }
        Update: {
          completion_date?: string | null
          id?: string
          organization_id?: string
          parsed_at?: string | null
          parsed_by_workflow_id?: string | null
          parsed_pdf_at?: string | null
          parsed_pdf_text?: string | null
          payment_terms?: string | null
          raw_document_path?: string | null
          rfp_id?: string
          start_date?: string | null
          status?: string
          submitted_at?: string | null
          total_amount?: number
          vendor_id?: string
          warranty?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bids_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_rfp_id_fkey"
            columns: ["rfp_id"]
            isOneToOne: false
            referencedRelation: "rfps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_line_items: {
        Row: {
          account_id: string
          amount: number
          budget_id: string
          id: string
          notes: string | null
        }
        Insert: {
          account_id: string
          amount: number
          budget_id: string
          id?: string
          notes?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          budget_id?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_line_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_line_items_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          association_id: string
          created_at: string
          deleted_at: string | null
          fiscal_period_id: string
          fund_id: string
          id: string
          organization_id: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          association_id: string
          created_at?: string
          deleted_at?: string | null
          fiscal_period_id: string
          fund_id: string
          id?: string
          organization_id: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          association_id?: string
          created_at?: string
          deleted_at?: string | null
          fiscal_period_id?: string
          fund_id?: string
          id?: string
          organization_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_fiscal_period_id_fkey"
            columns: ["fiscal_period_id"]
            isOneToOne: false
            referencedRelation: "fiscal_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          account_name: string
          account_number: string
          account_type: string
          association_id: string
          created_at: string
          description: string | null
          fund_id: string | null
          id: string
          is_active: boolean
          organization_id: string
          parent_account_id: string | null
        }
        Insert: {
          account_name: string
          account_number: string
          account_type: string
          association_id: string
          created_at?: string
          description?: string | null
          fund_id?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          parent_account_id?: string | null
        }
        Update: {
          account_name?: string
          account_number?: string
          account_type?: string
          association_id?: string
          created_at?: string
          description?: string | null
          fund_id?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          parent_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      closing_entries: {
        Row: {
          closing_type: string
          fiscal_period_id: string
          id: string
          journal_entry_id: string
        }
        Insert: {
          closing_type: string
          fiscal_period_id: string
          id?: string
          journal_entry_id: string
        }
        Update: {
          closing_type?: string
          fiscal_period_id?: string
          id?: string
          journal_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "closing_entries_fiscal_period_id_fkey"
            columns: ["fiscal_period_id"]
            isOneToOne: false
            referencedRelation: "fiscal_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closing_entries_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_recipients: {
        Row: {
          channel: string
          clicked_at: string | null
          communication_id: string
          delivered_at: string | null
          delivery_status: string
          email: string | null
          error_message: string | null
          external_id: string | null
          failed_at: string | null
          id: string
          opened_at: string | null
          organization_id: string
          phone: string | null
          queued_at: string
          recipient_name: string | null
          replied_at: string | null
          sent_at: string | null
          unit_id: string | null
          user_id: string | null
        }
        Insert: {
          channel: string
          clicked_at?: string | null
          communication_id: string
          delivered_at?: string | null
          delivery_status?: string
          email?: string | null
          error_message?: string | null
          external_id?: string | null
          failed_at?: string | null
          id?: string
          opened_at?: string | null
          organization_id: string
          phone?: string | null
          queued_at?: string
          recipient_name?: string | null
          replied_at?: string | null
          sent_at?: string | null
          unit_id?: string | null
          user_id?: string | null
        }
        Update: {
          channel?: string
          clicked_at?: string | null
          communication_id?: string
          delivered_at?: string | null
          delivery_status?: string
          email?: string | null
          error_message?: string | null
          external_id?: string | null
          failed_at?: string | null
          id?: string
          opened_at?: string | null
          organization_id?: string
          phone?: string | null
          queued_at?: string
          recipient_name?: string | null
          replied_at?: string | null
          sent_at?: string | null
          unit_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_recipients_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_recipients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_recipients_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_replies: {
        Row: {
          ai_category: string | null
          ai_summary: string | null
          body: string
          channel: string
          communication_id: string
          external_id: string | null
          from_email: string | null
          from_phone: string | null
          id: string
          organization_id: string
          read_at: string | null
          read_by: string | null
          received_at: string
          recipient_id: string | null
          subject: string | null
        }
        Insert: {
          ai_category?: string | null
          ai_summary?: string | null
          body: string
          channel: string
          communication_id: string
          external_id?: string | null
          from_email?: string | null
          from_phone?: string | null
          id?: string
          organization_id: string
          read_at?: string | null
          read_by?: string | null
          received_at?: string
          recipient_id?: string | null
          subject?: string | null
        }
        Update: {
          ai_category?: string | null
          ai_summary?: string | null
          body?: string
          channel?: string
          communication_id?: string
          external_id?: string | null
          from_email?: string | null
          from_phone?: string | null
          id?: string
          organization_id?: string
          read_at?: string | null
          read_by?: string | null
          received_at?: string
          recipient_id?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_replies_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_replies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_replies_read_by_fkey"
            columns: ["read_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_replies_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "communication_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_templates: {
        Row: {
          ai_generated: boolean
          ai_workflow_id: string | null
          association_id: string | null
          body_html: string
          body_sms: string | null
          body_text: string | null
          category: string
          channels: string[]
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          language: string
          name: string
          organization_id: string
          subject: string
          updated_at: string
          variables: Json
        }
        Insert: {
          ai_generated?: boolean
          ai_workflow_id?: string | null
          association_id?: string | null
          body_html: string
          body_sms?: string | null
          body_text?: string | null
          category: string
          channels?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          language?: string
          name: string
          organization_id: string
          subject: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          ai_generated?: boolean
          ai_workflow_id?: string | null
          association_id?: string | null
          body_html?: string
          body_sms?: string | null
          body_text?: string | null
          category?: string
          channels?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          language?: string
          name?: string
          organization_id?: string
          subject?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "communication_templates_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_threads: {
        Row: {
          association_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          organization_id: string
          related_resource: Json | null
          root_communication_id: string | null
          status: string
          topic_category: string
          topic_label: string | null
          unit_id: string | null
        }
        Insert: {
          association_id: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          organization_id: string
          related_resource?: Json | null
          root_communication_id?: string | null
          status?: string
          topic_category: string
          topic_label?: string | null
          unit_id?: string | null
        }
        Update: {
          association_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          related_resource?: Json | null
          root_communication_id?: string | null
          status?: string
          topic_category?: string
          topic_label?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_threads_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_threads_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_threads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_threads_root_communication_id_fkey"
            columns: ["root_communication_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_threads_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          ai_generated: boolean
          ai_workflow_id: string | null
          association_id: string
          audience_definition: Json
          audience_summary: string | null
          body_html: string
          body_text: string | null
          category: string
          channels: string[]
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          organization_id: string
          related_resource: Json | null
          scheduled_for: string | null
          sent_at: string | null
          sent_by: string | null
          source: string
          status: string
          subject: string
          template_id: string | null
          thread_id: string | null
        }
        Insert: {
          ai_generated?: boolean
          ai_workflow_id?: string | null
          association_id: string
          audience_definition: Json
          audience_summary?: string | null
          body_html: string
          body_text?: string | null
          category: string
          channels?: string[]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          organization_id: string
          related_resource?: Json | null
          scheduled_for?: string | null
          sent_at?: string | null
          sent_by?: string | null
          source?: string
          status?: string
          subject: string
          template_id?: string | null
          thread_id?: string | null
        }
        Update: {
          ai_generated?: boolean
          ai_workflow_id?: string | null
          association_id?: string
          audience_definition?: Json
          audience_summary?: string | null
          body_html?: string
          body_text?: string | null
          category?: string
          channels?: string[]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          organization_id?: string
          related_resource?: Json | null
          scheduled_for?: string | null
          sent_at?: string | null
          sent_by?: string | null
          source?: string
          status?: string
          subject?: string
          template_id?: string | null
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communications_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "communication_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "communication_threads"
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
      fiscal_periods: {
        Row: {
          association_id: string
          closed_at: string | null
          closed_by: string | null
          end_date: string
          id: string
          organization_id: string
          start_date: string
          status: string
        }
        Insert: {
          association_id: string
          closed_at?: string | null
          closed_by?: string | null
          end_date: string
          id?: string
          organization_id: string
          start_date: string
          status?: string
        }
        Update: {
          association_id?: string
          closed_at?: string | null
          closed_by?: string | null
          end_date?: string
          id?: string
          organization_id?: string
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_periods_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_periods_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      funds: {
        Row: {
          association_id: string
          code: string
          created_at: string
          fund_type: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
        }
        Insert: {
          association_id: string
          code: string
          created_at?: string
          fund_type: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
        }
        Update: {
          association_id?: string
          code?: string
          created_at?: string
          fund_type?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funds_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funds_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
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
      hoa_document_versions: {
        Row: {
          created_at: string
          created_by: string | null
          document_id: string
          file_size: number | null
          id: string
          name: string
          org_id: string
          parsed_at: string | null
          parsed_text: string | null
          reason: string | null
          storage_path: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_id: string
          file_size?: number | null
          id?: string
          name: string
          org_id: string
          parsed_at?: string | null
          parsed_text?: string | null
          reason?: string | null
          storage_path: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_id?: string
          file_size?: number | null
          id?: string
          name?: string
          org_id?: string
          parsed_at?: string | null
          parsed_text?: string | null
          reason?: string | null
          storage_path?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "hoa_document_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hoa_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "hoa_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hoa_document_versions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
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
          deleted_at: string | null
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
          deleted_at?: string | null
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
          deleted_at?: string | null
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
          deleted_at: string | null
          id: string
          notes: string | null
          org_id: string
          owner_email: string | null
          owner_name: string | null
          owner_phone: string | null
          tenure: Database["public"]["Enums"]["property_tenure"]
          tenure_updated_at: string | null
          tenure_updated_by: string | null
          unit_number: string | null
          updated_at: string | null
        }
        Insert: {
          address: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          org_id: string
          owner_email?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          tenure?: Database["public"]["Enums"]["property_tenure"]
          tenure_updated_at?: string | null
          tenure_updated_by?: string | null
          unit_number?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          owner_email?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          tenure?: Database["public"]["Enums"]["property_tenure"]
          tenure_updated_at?: string | null
          tenure_updated_by?: string | null
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
      hoa_recurring_events: {
        Row: {
          alert_days_before: number
          association_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          event_date: string
          id: string
          is_active: boolean
          last_alert_sent_at: string | null
          last_alert_sent_for: string | null
          notify_audience: Json
          notify_channels: string[]
          organization_id: string
          recurrence: string
          title: string
          updated_at: string
        }
        Insert: {
          alert_days_before?: number
          association_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date: string
          id?: string
          is_active?: boolean
          last_alert_sent_at?: string | null
          last_alert_sent_for?: string | null
          notify_audience?: Json
          notify_channels?: string[]
          organization_id: string
          recurrence?: string
          title: string
          updated_at?: string
        }
        Update: {
          alert_days_before?: number
          association_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string
          id?: string
          is_active?: boolean
          last_alert_sent_at?: string | null
          last_alert_sent_for?: string | null
          notify_audience?: Json
          notify_channels?: string[]
          organization_id?: string
          recurrence?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hoa_recurring_events_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hoa_recurring_events_organization_id_fkey"
            columns: ["organization_id"]
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
          deleted_at: string | null
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
          deleted_at?: string | null
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
          deleted_at?: string | null
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
      inbox_attachments: {
        Row: {
          content_type: string | null
          created_at: string
          fetch_attempts: number
          fetch_error: string | null
          fetch_status: string
          file_name: string
          gmail_attachment_id: string | null
          gmail_attachment_key: string | null
          id: string
          is_inline: boolean
          message_id: string
          organization_id: string
          sha256: string | null
          size_bytes: number | null
          storage_path: string | null
          thread_id: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          fetch_attempts?: number
          fetch_error?: string | null
          fetch_status?: string
          file_name: string
          gmail_attachment_id?: string | null
          gmail_attachment_key?: string | null
          id?: string
          is_inline?: boolean
          message_id: string
          organization_id: string
          sha256?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          thread_id: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          fetch_attempts?: number
          fetch_error?: string | null
          fetch_status?: string
          file_name?: string
          gmail_attachment_id?: string | null
          gmail_attachment_key?: string | null
          id?: string
          is_inline?: boolean
          message_id?: string
          organization_id?: string
          sha256?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "inbox_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_attachments_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "inbox_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_drafts: {
        Row: {
          ai_run_id: string | null
          approved_at: string | null
          approved_by: string | null
          blanks: Json
          body_text: string
          citations: Json
          created_at: string
          created_by: string | null
          error: string | null
          gmail_message_id: string | null
          grounded: boolean
          grounding_note: string | null
          id: string
          model: string | null
          organization_id: string
          prompt_version: string | null
          send_after: string | null
          sent_at: string | null
          status: string
          subject: string
          thread_id: string
        }
        Insert: {
          ai_run_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          blanks?: Json
          body_text: string
          citations?: Json
          created_at?: string
          created_by?: string | null
          error?: string | null
          gmail_message_id?: string | null
          grounded?: boolean
          grounding_note?: string | null
          id?: string
          model?: string | null
          organization_id: string
          prompt_version?: string | null
          send_after?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          thread_id: string
        }
        Update: {
          ai_run_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          blanks?: Json
          body_text?: string
          citations?: Json
          created_at?: string
          created_by?: string | null
          error?: string | null
          gmail_message_id?: string | null
          grounded?: boolean
          grounding_note?: string | null
          id?: string
          model?: string | null
          organization_id?: string
          prompt_version?: string | null
          send_after?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_drafts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_drafts_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "inbox_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_messages: {
        Row: {
          body_html: string | null
          body_text: string | null
          cc_emails: string[]
          communication_id: string | null
          direction: string
          from_email: string | null
          from_name: string | null
          gmail_message_id: string
          id: string
          in_reply_to: string | null
          ingested_at: string
          mailbox_account_id: string
          organization_id: string
          references_ids: string[] | null
          rfc822_message_id: string | null
          sent_at: string | null
          stripped_text: string | null
          subject: string | null
          thread_id: string
          to_emails: string[]
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[]
          communication_id?: string | null
          direction: string
          from_email?: string | null
          from_name?: string | null
          gmail_message_id: string
          id?: string
          in_reply_to?: string | null
          ingested_at?: string
          mailbox_account_id: string
          organization_id: string
          references_ids?: string[] | null
          rfc822_message_id?: string | null
          sent_at?: string | null
          stripped_text?: string | null
          subject?: string | null
          thread_id: string
          to_emails?: string[]
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[]
          communication_id?: string | null
          direction?: string
          from_email?: string | null
          from_name?: string | null
          gmail_message_id?: string
          id?: string
          in_reply_to?: string | null
          ingested_at?: string
          mailbox_account_id?: string
          organization_id?: string
          references_ids?: string[] | null
          rfc822_message_id?: string | null
          sent_at?: string | null
          stripped_text?: string | null
          subject?: string | null
          thread_id?: string
          to_emails?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "inbox_messages_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_messages_mailbox_account_id_fkey"
            columns: ["mailbox_account_id"]
            isOneToOne: false
            referencedRelation: "mailbox_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "inbox_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_reply_embeddings: {
        Row: {
          created_at: string
          embedding: string | null
          id: string
          message_id: string
          organization_id: string
          skip_reason: string | null
          text_sha256: string
        }
        Insert: {
          created_at?: string
          embedding?: string | null
          id?: string
          message_id: string
          organization_id: string
          skip_reason?: string | null
          text_sha256: string
        }
        Update: {
          created_at?: string
          embedding?: string | null
          id?: string
          message_id?: string
          organization_id?: string
          skip_reason?: string | null
          text_sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_reply_embeddings_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "inbox_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_reply_embeddings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_sender_aliases: {
        Row: {
          created_at: string
          created_by: string | null
          email_address: string
          email_address_lower: string | null
          id: string
          organization_id: string
          resident_id: string | null
          source: string
          unit_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email_address: string
          email_address_lower?: string | null
          id?: string
          organization_id: string
          resident_id?: string | null
          source?: string
          unit_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email_address?: string
          email_address_lower?: string | null
          id?: string
          organization_id?: string
          resident_id?: string | null
          source?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbox_sender_aliases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_sender_aliases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_sender_aliases_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "property_residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_sender_aliases_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_thread_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          resource_id: string
          resource_type: string
          thread_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          resource_id: string
          resource_type: string
          thread_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          resource_id?: string
          resource_type?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_thread_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_thread_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_thread_links_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "inbox_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_threads: {
        Row: {
          assigned_to: string | null
          created_at: string
          gmail_thread_id: string
          id: string
          last_direction: string | null
          last_message_at: string | null
          mailbox_account_id: string
          match_confidence: string
          match_reason: Json | null
          match_source: string
          organization_id: string
          participants: Json
          resident_id: string | null
          status: string
          subject: string | null
          unit_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          gmail_thread_id: string
          id?: string
          last_direction?: string | null
          last_message_at?: string | null
          mailbox_account_id: string
          match_confidence?: string
          match_reason?: Json | null
          match_source?: string
          organization_id: string
          participants?: Json
          resident_id?: string | null
          status?: string
          subject?: string | null
          unit_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          gmail_thread_id?: string
          id?: string
          last_direction?: string | null
          last_message_at?: string | null
          mailbox_account_id?: string
          match_confidence?: string
          match_reason?: Json | null
          match_source?: string
          organization_id?: string
          participants?: Json
          resident_id?: string | null
          status?: string
          subject?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbox_threads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_threads_mailbox_account_id_fkey"
            columns: ["mailbox_account_id"]
            isOneToOne: false
            referencedRelation: "mailbox_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_threads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_threads_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "property_residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_threads_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          ai_generated: boolean
          ai_workflow_id: string | null
          amount: number
          association_id: string
          created_at: string
          deleted_at: string | null
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          organization_id: string
          raw_document_path: string | null
          status: string
          vendor_id: string | null
        }
        Insert: {
          ai_generated?: boolean
          ai_workflow_id?: string | null
          amount: number
          association_id: string
          created_at?: string
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          invoice_date: string
          invoice_number: string
          organization_id: string
          raw_document_path?: string | null
          status?: string
          vendor_id?: string | null
        }
        Update: {
          ai_generated?: boolean
          ai_workflow_id?: string | null
          amount?: number
          association_id?: string
          created_at?: string
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          organization_id?: string
          raw_document_path?: string | null
          status?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          ai_generated: boolean
          ai_workflow_id: string | null
          association_id: string
          created_at: string
          created_by: string | null
          entry_date: string
          entry_number: string
          fiscal_period_id: string
          id: string
          memo: string
          organization_id: string
          posted_at: string | null
          posted_by: string | null
          reversed_by_id: string | null
          reverses_id: string | null
          source: string
          source_id: string | null
          status: string
        }
        Insert: {
          ai_generated?: boolean
          ai_workflow_id?: string | null
          association_id: string
          created_at?: string
          created_by?: string | null
          entry_date: string
          entry_number: string
          fiscal_period_id: string
          id?: string
          memo: string
          organization_id: string
          posted_at?: string | null
          posted_by?: string | null
          reversed_by_id?: string | null
          reverses_id?: string | null
          source: string
          source_id?: string | null
          status?: string
        }
        Update: {
          ai_generated?: boolean
          ai_workflow_id?: string | null
          association_id?: string
          created_at?: string
          created_by?: string | null
          entry_date?: string
          entry_number?: string
          fiscal_period_id?: string
          id?: string
          memo?: string
          organization_id?: string
          posted_at?: string | null
          posted_by?: string | null
          reversed_by_id?: string | null
          reverses_id?: string | null
          source?: string
          source_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_fiscal_period_id_fkey"
            columns: ["fiscal_period_id"]
            isOneToOne: false
            referencedRelation: "fiscal_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reversed_by_id_fkey"
            columns: ["reversed_by_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      lease_waiting_list: {
        Row: {
          association_id: string
          created_by: string | null
          id: string
          notes: string | null
          organization_id: string
          property_id: string
          requested_at: string
          status: string
          status_updated_at: string | null
          status_updated_by: string | null
        }
        Insert: {
          association_id: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          property_id: string
          requested_at?: string
          status?: string
          status_updated_at?: string | null
          status_updated_by?: string | null
        }
        Update: {
          association_id?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          property_id?: string
          requested_at?: string
          status?: string
          status_updated_at?: string | null
          status_updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lease_waiting_list_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_waiting_list_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_waiting_list_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "hoa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          account_id: string
          credit_amount: number
          debit_amount: number
          fund_id: string
          id: string
          journal_entry_id: string
          memo: string | null
          organization_id: string
        }
        Insert: {
          account_id: string
          credit_amount?: number
          debit_amount?: number
          fund_id: string
          id?: string
          journal_entry_id: string
          memo?: string | null
          organization_id: string
        }
        Update: {
          account_id?: string
          credit_amount?: number
          debit_amount?: number
          fund_id?: string
          id?: string
          journal_entry_id?: string
          memo?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      mailbox_account_secrets: {
        Row: {
          access_token_enc: string | null
          key_version: number
          mailbox_account_id: string
          refresh_token_enc: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token_enc?: string | null
          key_version?: number
          mailbox_account_id: string
          refresh_token_enc: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token_enc?: string | null
          key_version?: number
          mailbox_account_id?: string
          refresh_token_enc?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailbox_account_secrets_mailbox_account_id_fkey"
            columns: ["mailbox_account_id"]
            isOneToOne: true
            referencedRelation: "mailbox_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      mailbox_accounts: {
        Row: {
          backfill_progress: Json
          backfill_status: string
          backfill_updated_at: string | null
          connected_at: string
          connected_by: string | null
          disconnected_at: string | null
          display_name: string | null
          email_address: string
          google_sub: string | null
          id: string
          last_synced_at: string | null
          organization_id: string
          provider: string
          scope_mode: string
          scope_value: string | null
          sync_cursor: string | null
          sync_error: string | null
          sync_status: string
        }
        Insert: {
          backfill_progress?: Json
          backfill_status?: string
          backfill_updated_at?: string | null
          connected_at?: string
          connected_by?: string | null
          disconnected_at?: string | null
          display_name?: string | null
          email_address: string
          google_sub?: string | null
          id?: string
          last_synced_at?: string | null
          organization_id: string
          provider?: string
          scope_mode?: string
          scope_value?: string | null
          sync_cursor?: string | null
          sync_error?: string | null
          sync_status?: string
        }
        Update: {
          backfill_progress?: Json
          backfill_status?: string
          backfill_updated_at?: string | null
          connected_at?: string
          connected_by?: string | null
          disconnected_at?: string | null
          display_name?: string | null
          email_address?: string
          google_sub?: string | null
          id?: string
          last_synced_at?: string | null
          organization_id?: string
          provider?: string
          scope_mode?: string
          scope_value?: string | null
          sync_cursor?: string | null
          sync_error?: string | null
          sync_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailbox_accounts_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailbox_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_action_items: {
        Row: {
          ai_generated: boolean
          assignee_name: string | null
          assignee_user_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          meeting_id: string | null
          org_id: string
          priority: Database["public"]["Enums"]["action_item_priority"]
          status: Database["public"]["Enums"]["action_item_status"]
          ticket_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          assignee_name?: string | null
          assignee_user_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          meeting_id?: string | null
          org_id: string
          priority?: Database["public"]["Enums"]["action_item_priority"]
          status?: Database["public"]["Enums"]["action_item_status"]
          ticket_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          assignee_name?: string | null
          assignee_user_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          meeting_id?: string | null
          org_id?: string
          priority?: Database["public"]["Enums"]["action_item_priority"]
          status?: Database["public"]["Enums"]["action_item_status"]
          ticket_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_action_items_assignee_user_id_fkey"
            columns: ["assignee_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_action_items_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_action_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_action_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "hoa_meeting_minutes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_action_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_action_items_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
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
          archived_at: string | null
          created_at: string | null
          doors_count: number | null
          hub_type: string
          id: string
          name: string
          organization_type: string
          plan: string
          stripe_customer_id: string | null
          stripe_sub_id: string | null
          suspended_at: string | null
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string | null
          doors_count?: number | null
          hub_type: string
          id?: string
          name: string
          organization_type?: string
          plan?: string
          stripe_customer_id?: string | null
          stripe_sub_id?: string | null
          suspended_at?: string | null
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string | null
          doors_count?: number | null
          hub_type?: string
          id?: string
          name?: string
          organization_type?: string
          plan?: string
          stripe_customer_id?: string | null
          stripe_sub_id?: string | null
          suspended_at?: string | null
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
      payment_methods: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          last4: string | null
          method_type: string
          organization_id: string
          stripe_payment_method_id: string | null
          unit_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          last4?: string | null
          method_type: string
          organization_id: string
          stripe_payment_method_id?: string | null
          unit_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          last4?: string | null
          method_type?: string
          organization_id?: string
          stripe_payment_method_id?: string | null
          unit_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_methods_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_plans: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          installment_amount: number
          installment_count: number
          organization_id: string
          start_date: string
          status: string
          total_amount: number
          unit_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          installment_amount: number
          installment_count: number
          organization_id: string
          start_date: string
          status?: string
          total_amount: number
          unit_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          installment_amount?: number
          installment_count?: number
          organization_id?: string
          start_date?: string
          status?: string
          total_amount?: number
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_plans_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          assessment_id: string | null
          created_at: string
          external_ref: string | null
          id: string
          invoice_id: string | null
          journal_entry_id: string | null
          organization_id: string
          paid_at: string
          payment_method: string
          unit_id: string | null
        }
        Insert: {
          amount: number
          assessment_id?: string | null
          created_at?: string
          external_ref?: string | null
          id?: string
          invoice_id?: string | null
          journal_entry_id?: string | null
          organization_id: string
          paid_at: string
          payment_method: string
          unit_id?: string | null
        }
        Update: {
          amount?: number
          assessment_id?: string | null
          created_at?: string
          external_ref?: string | null
          id?: string
          invoice_id?: string | null
          journal_entry_id?: string | null
          organization_id?: string
          paid_at?: string
          payment_method?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      plaid_items: {
        Row: {
          access_token: string
          association_id: string
          created_at: string
          created_by: string | null
          id: string
          institution_id: string | null
          institution_name: string | null
          is_active: boolean
          last_synced_at: string | null
          organization_id: string
          plaid_item_id: string
          sync_cursor: string | null
        }
        Insert: {
          access_token: string
          association_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          is_active?: boolean
          last_synced_at?: string | null
          organization_id: string
          plaid_item_id: string
          sync_cursor?: string | null
        }
        Update: {
          access_token?: string
          association_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          is_active?: boolean
          last_synced_at?: string | null
          organization_id?: string
          plaid_item_id?: string
          sync_cursor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plaid_items_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plaid_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plaid_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admin_audit: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          id: string
          payload: Json | null
          target_org_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          id?: string
          payload?: Json | null
          target_org_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          payload?: Json | null
          target_org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_admin_audit_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_admin_audit_target_org_id_fkey"
            columns: ["target_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          granted_at: string
          granted_by: string | null
          note: string | null
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
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
      property_events: {
        Row: {
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["property_event_kind"]
          notes: string | null
          occurred_at: string
          organization_id: string
          payload: Json
          property_id: string
        }
        Insert: {
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["property_event_kind"]
          notes?: string | null
          occurred_at?: string
          organization_id: string
          payload?: Json
          property_id: string
        }
        Update: {
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["property_event_kind"]
          notes?: string | null
          occurred_at?: string
          organization_id?: string
          payload?: Json
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "hoa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_residents: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          is_primary: boolean
          moved_in_at: string | null
          moved_out_at: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          property_id: string
          role: Database["public"]["Enums"]["property_resident_role"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_primary?: boolean
          moved_in_at?: string | null
          moved_out_at?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          property_id: string
          role: Database["public"]["Enums"]["property_resident_role"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean
          moved_in_at?: string | null
          moved_out_at?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          property_id?: string
          role?: Database["public"]["Enums"]["property_resident_role"]
        }
        Relationships: [
          {
            foreignKeyName: "property_residents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_residents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "hoa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_journal_entries: {
        Row: {
          association_id: string
          cadence: string
          created_at: string
          id: string
          is_active: boolean
          next_run_date: string
          organization_id: string
          template_je_id: string
        }
        Insert: {
          association_id: string
          cadence: string
          created_at?: string
          id?: string
          is_active?: boolean
          next_run_date: string
          organization_id: string
          template_je_id: string
        }
        Update: {
          association_id?: string
          cadence?: string
          created_at?: string
          id?: string
          is_active?: boolean
          next_run_date?: string
          organization_id?: string
          template_je_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_journal_entries_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_journal_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_journal_entries_template_je_id_fkey"
            columns: ["template_je_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      resident_communication_preferences: {
        Row: {
          email_opt_in: boolean
          id: string
          language: string
          mail_opt_in: boolean
          organization_id: string
          portal_opt_in: boolean
          quiet_hours: Json | null
          sms_opt_in: boolean
          unit_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          email_opt_in?: boolean
          id?: string
          language?: string
          mail_opt_in?: boolean
          organization_id: string
          portal_opt_in?: boolean
          quiet_hours?: Json | null
          sms_opt_in?: boolean
          unit_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          email_opt_in?: boolean
          id?: string
          language?: string
          mail_opt_in?: boolean
          organization_id?: string
          portal_opt_in?: boolean
          quiet_hours?: Json | null
          sms_opt_in?: boolean
          unit_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resident_communication_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_communication_preferences_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_communication_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resident_violation_report_messages: {
        Row: {
          author_id: string
          author_role: string
          body: string
          created_at: string
          id: string
          internal: boolean
          report_id: string
        }
        Insert: {
          author_id: string
          author_role: string
          body: string
          created_at?: string
          id?: string
          internal?: boolean
          report_id: string
        }
        Update: {
          author_id?: string
          author_role?: string
          body?: string
          created_at?: string
          id?: string
          internal?: boolean
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resident_violation_report_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_violation_report_messages_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "resident_violation_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      resident_violation_reports: {
        Row: {
          about_address: string | null
          about_unit_id: string | null
          association_id: string | null
          board_note: string | null
          category: string
          description: string
          evidence_photo_path: string | null
          hoa_violation_id: string | null
          id: string
          occurred_at: string | null
          organization_id: string
          reported_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
        }
        Insert: {
          about_address?: string | null
          about_unit_id?: string | null
          association_id?: string | null
          board_note?: string | null
          category: string
          description: string
          evidence_photo_path?: string | null
          hoa_violation_id?: string | null
          id?: string
          occurred_at?: string | null
          organization_id: string
          reported_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
        }
        Update: {
          about_address?: string | null
          about_unit_id?: string | null
          association_id?: string | null
          board_note?: string | null
          category?: string
          description?: string
          evidence_photo_path?: string | null
          hoa_violation_id?: string | null
          id?: string
          occurred_at?: string | null
          organization_id?: string
          reported_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resident_violation_reports_about_unit_id_fkey"
            columns: ["about_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_violation_reports_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_violation_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_violation_reports_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_violation_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rfp_invitations: {
        Row: {
          acknowledged_at: string | null
          id: string
          invited_at: string
          organization_id: string
          rfp_id: string
          unique_submission_token: string | null
          vendor_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          id?: string
          invited_at?: string
          organization_id: string
          rfp_id: string
          unique_submission_token?: string | null
          vendor_id: string
        }
        Update: {
          acknowledged_at?: string | null
          id?: string
          invited_at?: string
          organization_id?: string
          rfp_id?: string
          unique_submission_token?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfp_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfp_invitations_rfp_id_fkey"
            columns: ["rfp_id"]
            isOneToOne: false
            referencedRelation: "rfps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfp_invitations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      rfp_line_items: {
        Row: {
          description: string
          id: string
          notes: string | null
          quantity: number | null
          rfp_id: string
          unit: string | null
        }
        Insert: {
          description: string
          id?: string
          notes?: string | null
          quantity?: number | null
          rfp_id: string
          unit?: string | null
        }
        Update: {
          description?: string
          id?: string
          notes?: string | null
          quantity?: number | null
          rfp_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfp_line_items_rfp_id_fkey"
            columns: ["rfp_id"]
            isOneToOne: false
            referencedRelation: "rfps"
            referencedColumns: ["id"]
          },
        ]
      }
      rfps: {
        Row: {
          ai_generated: boolean
          ai_workflow_id: string | null
          association_id: string
          awarded_at: string | null
          awarded_to_vendor_id: string | null
          budget_max: number | null
          budget_min: number | null
          created_at: string
          created_by: string | null
          evaluation_criteria: Json | null
          id: string
          insurance_requirements: Json | null
          organization_id: string
          rfp_number: string
          scope: string
          status: string
          submission_deadline: string
          title: string
        }
        Insert: {
          ai_generated?: boolean
          ai_workflow_id?: string | null
          association_id: string
          awarded_at?: string | null
          awarded_to_vendor_id?: string | null
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          created_by?: string | null
          evaluation_criteria?: Json | null
          id?: string
          insurance_requirements?: Json | null
          organization_id: string
          rfp_number: string
          scope: string
          status?: string
          submission_deadline: string
          title: string
        }
        Update: {
          ai_generated?: boolean
          ai_workflow_id?: string | null
          association_id?: string
          awarded_at?: string | null
          awarded_to_vendor_id?: string | null
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          created_by?: string | null
          evaluation_criteria?: Json | null
          id?: string
          insurance_requirements?: Json | null
          organization_id?: string
          rfp_number?: string
          scope?: string
          status?: string
          submission_deadline?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfps_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfps_awarded_to_vendor_id_fkey"
            columns: ["awarded_to_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfps_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      state_law_updates: {
        Row: {
          action_items: string[] | null
          archived_at: string | null
          category: string | null
          deleted_at: string | null
          effective_date: string | null
          headline: string
          id: string
          posted_at: string
          posted_by: string | null
          related_statute_id: string | null
          source_url: string | null
          state: string
          summary: string
        }
        Insert: {
          action_items?: string[] | null
          archived_at?: string | null
          category?: string | null
          deleted_at?: string | null
          effective_date?: string | null
          headline: string
          id?: string
          posted_at?: string
          posted_by?: string | null
          related_statute_id?: string | null
          source_url?: string | null
          state: string
          summary: string
        }
        Update: {
          action_items?: string[] | null
          archived_at?: string | null
          category?: string | null
          deleted_at?: string | null
          effective_date?: string | null
          headline?: string
          id?: string
          posted_at?: string
          posted_by?: string | null
          related_statute_id?: string | null
          source_url?: string | null
          state?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "state_law_updates_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "state_law_updates_related_statute_id_fkey"
            columns: ["related_statute_id"]
            isOneToOne: false
            referencedRelation: "state_statutes"
            referencedColumns: ["id"]
          },
        ]
      }
      state_statute_chunks: {
        Row: {
          chunk_index: number
          content: string
          embedding: string | null
          id: string
          metadata: Json | null
          state: string
          statute_id: string
        }
        Insert: {
          chunk_index: number
          content: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          state: string
          statute_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          state?: string
          statute_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "state_statute_chunks_statute_id_fkey"
            columns: ["statute_id"]
            isOneToOne: false
            referencedRelation: "state_statutes"
            referencedColumns: ["id"]
          },
        ]
      }
      state_statutes: {
        Row: {
          body: string
          category: string | null
          code_citation: string
          effective_date: string | null
          fetched_at: string
          id: string
          source_url: string | null
          state: string
          superseded_at: string | null
          title: string
        }
        Insert: {
          body: string
          category?: string | null
          code_citation: string
          effective_date?: string | null
          fetched_at?: string
          id?: string
          source_url?: string | null
          state: string
          superseded_at?: string | null
          title: string
        }
        Update: {
          body?: string
          category?: string | null
          code_citation?: string
          effective_date?: string | null
          fetched_at?: string
          id?: string
          source_url?: string | null
          state?: string
          superseded_at?: string | null
          title?: string
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
      ticket_messages: {
        Row: {
          author_id: string
          author_role: string
          body: string
          created_at: string
          id: string
          internal: boolean
          ticket_id: string
        }
        Insert: {
          author_id: string
          author_role: string
          body: string
          created_at?: string
          id?: string
          internal?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string
          author_role?: string
          body?: string
          created_at?: string
          id?: string
          internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          association_id: string | null
          category: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          deleted_at: string | null
          description: string
          id: string
          organization_id: string
          priority: string
          status: string
          subject: string
          submitted_by: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          association_id?: string | null
          category: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          deleted_at?: string | null
          description: string
          id?: string
          organization_id: string
          priority?: string
          status?: string
          subject: string
          submitted_by: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          association_id?: string | null
          category?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string
          id?: string
          organization_id?: string
          priority?: string
          status?: string
          subject?: string
          submitted_by?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_unit_id_fkey"
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
          legacy_hoa_property_id: string | null
          legacy_pm_property_id: string | null
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
          legacy_hoa_property_id?: string | null
          legacy_pm_property_id?: string | null
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
          legacy_hoa_property_id?: string | null
          legacy_pm_property_id?: string | null
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
            foreignKeyName: "units_legacy_hoa_property_id_fkey"
            columns: ["legacy_hoa_property_id"]
            isOneToOne: false
            referencedRelation: "hoa_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_legacy_pm_property_id_fkey"
            columns: ["legacy_pm_property_id"]
            isOneToOne: false
            referencedRelation: "pm_properties"
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
      vendor_compliance: {
        Row: {
          ai_workflow_id: string | null
          association_id: string | null
          coi_additional_insured_present: boolean | null
          coi_auto_liability: number | null
          coi_carrier: string | null
          coi_effective_date: string | null
          coi_expiration_date: string | null
          coi_general_liability_aggregate: number | null
          coi_general_liability_per_occurrence: number | null
          coi_policy_number: string | null
          coi_status: string | null
          coi_umbrella: number | null
          coi_workers_comp: boolean | null
          deficiencies: Json | null
          id: string
          last_reviewed_at: string | null
          last_reviewed_by: string | null
          license_expiration: string | null
          license_number: string | null
          license_state: string | null
          license_status: string | null
          license_trade: string | null
          organization_id: string
          vendor_id: string
          w9_on_file: boolean
          w9_signed_date: string | null
        }
        Insert: {
          ai_workflow_id?: string | null
          association_id?: string | null
          coi_additional_insured_present?: boolean | null
          coi_auto_liability?: number | null
          coi_carrier?: string | null
          coi_effective_date?: string | null
          coi_expiration_date?: string | null
          coi_general_liability_aggregate?: number | null
          coi_general_liability_per_occurrence?: number | null
          coi_policy_number?: string | null
          coi_status?: string | null
          coi_umbrella?: number | null
          coi_workers_comp?: boolean | null
          deficiencies?: Json | null
          id?: string
          last_reviewed_at?: string | null
          last_reviewed_by?: string | null
          license_expiration?: string | null
          license_number?: string | null
          license_state?: string | null
          license_status?: string | null
          license_trade?: string | null
          organization_id: string
          vendor_id: string
          w9_on_file?: boolean
          w9_signed_date?: string | null
        }
        Update: {
          ai_workflow_id?: string | null
          association_id?: string | null
          coi_additional_insured_present?: boolean | null
          coi_auto_liability?: number | null
          coi_carrier?: string | null
          coi_effective_date?: string | null
          coi_expiration_date?: string | null
          coi_general_liability_aggregate?: number | null
          coi_general_liability_per_occurrence?: number | null
          coi_policy_number?: string | null
          coi_status?: string | null
          coi_umbrella?: number | null
          coi_workers_comp?: boolean | null
          deficiencies?: Json | null
          id?: string
          last_reviewed_at?: string | null
          last_reviewed_by?: string | null
          license_expiration?: string | null
          license_number?: string | null
          license_state?: string | null
          license_status?: string | null
          license_trade?: string | null
          organization_id?: string
          vendor_id?: string
          w9_on_file?: boolean
          w9_signed_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_compliance_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_compliance_last_reviewed_by_fkey"
            columns: ["last_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_compliance_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_compliance_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_documents: {
        Row: {
          doc_type: string
          expires_at: string | null
          id: string
          organization_id: string
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
          vendor_id: string
        }
        Insert: {
          doc_type: string
          expires_at?: string | null
          id?: string
          organization_id: string
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
          vendor_id: string
        }
        Update: {
          doc_type?: string
          expires_at?: string | null
          id?: string
          organization_id?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_documents_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_external_data: {
        Row: {
          fetched_at: string
          id: string
          rating: number | null
          raw_payload: Json | null
          review_count: number | null
          source: string
          source_ref: string | null
          vendor_id: string
        }
        Insert: {
          fetched_at?: string
          id?: string
          rating?: number | null
          raw_payload?: Json | null
          review_count?: number | null
          source: string
          source_ref?: string | null
          vendor_id: string
        }
        Update: {
          fetched_at?: string
          id?: string
          rating?: number | null
          raw_payload?: Json | null
          review_count?: number | null
          source?: string
          source_ref?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_external_data_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_internal_ratings: {
        Row: {
          association_id: string
          id: string
          notes: string | null
          on_budget: boolean | null
          on_time: boolean | null
          organization_id: string
          quality: number | null
          rated_at: string
          rated_by: string | null
          rating: number | null
          vendor_id: string
          work_order_id: string | null
        }
        Insert: {
          association_id: string
          id?: string
          notes?: string | null
          on_budget?: boolean | null
          on_time?: boolean | null
          organization_id: string
          quality?: number | null
          rated_at?: string
          rated_by?: string | null
          rating?: number | null
          vendor_id: string
          work_order_id?: string | null
        }
        Update: {
          association_id?: string
          id?: string
          notes?: string | null
          on_budget?: boolean | null
          on_time?: boolean | null
          organization_id?: string
          quality?: number | null
          rated_at?: string
          rated_by?: string | null
          rating?: number | null
          vendor_id?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_internal_ratings_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_internal_ratings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_internal_ratings_rated_by_fkey"
            columns: ["rated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_internal_ratings_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_onboarding_invitations: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          invitee_email: string
          invitee_name: string | null
          organization_id: string
          status: string
          submitted_at: string | null
          token: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          invitee_email: string
          invitee_name?: string | null
          organization_id: string
          status?: string
          submitted_at?: string | null
          token: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          invitee_email?: string
          invitee_name?: string | null
          organization_id?: string
          status?: string
          submitted_at?: string | null
          token?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_onboarding_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_onboarding_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_onboarding_invitations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: Json | null
          ai_generated: boolean
          created_at: string
          created_by: string | null
          dba: string | null
          deleted_at: string | null
          ein: string | null
          id: string
          legal_name: string
          notes: string | null
          organization_id: string
          primary_email: string | null
          primary_phone: string | null
          service_area_zips: string[] | null
          status: string
          trades: string[] | null
        }
        Insert: {
          address?: Json | null
          ai_generated?: boolean
          created_at?: string
          created_by?: string | null
          dba?: string | null
          deleted_at?: string | null
          ein?: string | null
          id?: string
          legal_name: string
          notes?: string | null
          organization_id: string
          primary_email?: string | null
          primary_phone?: string | null
          service_area_zips?: string[] | null
          status?: string
          trades?: string[] | null
        }
        Update: {
          address?: Json | null
          ai_generated?: boolean
          created_at?: string
          created_by?: string | null
          dba?: string | null
          deleted_at?: string | null
          ein?: string | null
          id?: string
          legal_name?: string
          notes?: string | null
          organization_id?: string
          primary_email?: string | null
          primary_phone?: string | null
          service_area_zips?: string[] | null
          status?: string
          trades?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
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
      zelle_inbound_matches: {
        Row: {
          ai_workflow_id: string | null
          bank_transaction_id: string
          created_at: string
          id: string
          matched_assessment_id: string | null
          matched_unit_id: string | null
          memo_code: string
          organization_id: string
          status: string
        }
        Insert: {
          ai_workflow_id?: string | null
          bank_transaction_id: string
          created_at?: string
          id?: string
          matched_assessment_id?: string | null
          matched_unit_id?: string | null
          memo_code: string
          organization_id: string
          status: string
        }
        Update: {
          ai_workflow_id?: string | null
          bank_transaction_id?: string
          created_at?: string
          id?: string
          matched_assessment_id?: string | null
          matched_unit_id?: string | null
          memo_code?: string
          organization_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "zelle_inbound_matches_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zelle_inbound_matches_matched_assessment_id_fkey"
            columns: ["matched_assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zelle_inbound_matches_matched_unit_id_fkey"
            columns: ["matched_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zelle_inbound_matches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      property_bridge_gaps: {
        Row: {
          address: string | null
          gap_kind: string | null
          organization_id: string | null
          record_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      auth_is_admin: { Args: { p_org_id: string }; Returns: boolean }
      auth_is_board_or_admin: { Args: { p_org_id: string }; Returns: boolean }
      auth_is_platform_admin: { Args: never; Returns: boolean }
      auth_org_ids: { Args: never; Returns: string[] }
      auth_owner_unit_ids: { Args: never; Returns: string[] }
      auth_role_in_org: { Args: { p_org_id: string }; Returns: string }
      normalize_address: { Args: { raw: string }; Returns: string }
      search_governing_chunks: {
        Args: {
          p_association_id?: string
          p_limit?: number
          p_organization_id: string
          p_query?: string
          p_query_embedding?: string
        }
        Returns: {
          doc_type: string
          document_id: string
          effective_date: string
          id: string
          metadata: Json
          page_number: number
          rank: number
          section: string
          text: string
        }[]
      }
      search_reply_embeddings: {
        Args: {
          p_exclude_thread_id: string
          p_limit?: number
          p_org_id: string
          p_query_embedding: string
        }
        Returns: {
          body: string
          message_id: string
          sent_at: string
          similarity: number
          subject: string
          thread_id: string
        }[]
      }
      search_state_statute_chunks: {
        Args: {
          p_limit?: number
          p_query?: string
          p_query_embedding?: string
          p_state: string
        }
        Returns: {
          category: string
          code_citation: string
          content: string
          effective_date: string
          id: string
          metadata: Json
          rank: number
          statute_id: string
          title: string
        }[]
      }
      seed_queued_recipients: {
        Args: { p_comm_id: string; p_count: number; p_org_id: string }
        Returns: undefined
      }
      seed_recipients: {
        Args: {
          p_comm_id: string
          p_count: number
          p_org_id: string
          p_sent_at: string
        }
        Returns: undefined
      }
      seed_replies: {
        Args: { p_comm_id: string; p_count: number; p_org_id: string }
        Returns: undefined
      }
    }
    Enums: {
      action_item_priority: "low" | "normal" | "high"
      action_item_status: "open" | "in_progress" | "done" | "cancelled"
      property_event_kind:
        | "tenure_changed"
        | "ownership_changed"
        | "resident_added"
        | "resident_removed"
        | "lease_started"
        | "lease_ended"
        | "waiting_list_added"
        | "waiting_list_resolved"
        | "note"
      property_resident_role: "owner" | "tenant" | "family_member" | "other"
      property_tenure: "owner_occupied" | "leased" | "unknown"
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
      action_item_priority: ["low", "normal", "high"],
      action_item_status: ["open", "in_progress", "done", "cancelled"],
      property_event_kind: [
        "tenure_changed",
        "ownership_changed",
        "resident_added",
        "resident_removed",
        "lease_started",
        "lease_ended",
        "waiting_list_added",
        "waiting_list_resolved",
        "note",
      ],
      property_resident_role: ["owner", "tenant", "family_member", "other"],
      property_tenure: ["owner_occupied", "leased", "unknown"],
    },
  },
} as const
