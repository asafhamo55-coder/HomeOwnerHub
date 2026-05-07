// PLACEHOLDER — replace by running `pnpm --filter @homeownerhub/db gen:types`
// after running `supabase login` (or setting SUPABASE_ACCESS_TOKEN).
// This permissive stub lets the rest of the monorepo typecheck without
// knowing the exact column shapes of the live Supabase project.
//
// Once regenerated, the real Database type will give full column-level
// type safety for from('table').select(...) calls everywhere.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type Row = Record<string, unknown>

export interface Database {
  public: {
    Tables: Record<
      string,
      {
        Row: Row
        Insert: Row
        Update: Row
        Relationships: []
      }
    >
    Views: Record<string, { Row: Row; Relationships: [] }>
    Functions: Record<
      string,
      {
        Args: Record<string, unknown>
        Returns: unknown
      }
    >
    Enums: Record<string, string>
    CompositeTypes: Record<string, Row>
  }
}
