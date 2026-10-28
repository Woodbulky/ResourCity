// Generated from the Supabase schema (mcp generate_typescript_types). Do not edit by hand.
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      allowed_domains: {
        Row: {
          domain: string
        }
        Insert: {
          domain: string
        }
        Update: {
          domain?: string
        }
        Relationships: []
      }
      app_clock: {
        Row: {
          id: boolean
          offset_seconds: number
          updated_at: string
        }
        Insert: {
          id?: boolean
          offset_seconds?: number
          updated_at?: string
        }
        Update: {
          id?: boolean
          offset_seconds?: number
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          demo_mode: boolean
          id: boolean
        }
        Insert: {
          demo_mode?: boolean
          id?: boolean
        }
        Update: {
          demo_mode?: boolean
          id?: boolean
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string
          created_at: string
          entity_id: string
          entity_type: string
          from_state: string | null
          id: number
          metadata: Json
          org_id: string | null
          policy_version_id: string | null
          reason: string | null
          subject_user_id: string | null
          to_state: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role: string
          created_at?: string
          entity_id: string
          entity_type: string
          from_state?: string | null
          id?: never
          metadata?: Json
          org_id?: string | null
          policy_version_id?: string | null
          reason?: string | null
          subject_user_id?: string | null
          to_state?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          from_state?: string | null
          id?: never
          metadata?: Json
          org_id?: string | null
          policy_version_id?: string | null
          reason?: string | null
          subject_user_id?: string | null
          to_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_windows: {
        Row: {
          end_time: string
          id: string
          resource_id: string
          start_time: string
          weekday: number
        }
        Insert: {
          end_time: string
          id?: string
          resource_id: string
          start_time: string
          weekday: number
        }
        Update: {
          end_time?: string
          id?: string
          resource_id?: string
          start_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_windows_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      badge_types: {
        Row: {
          description: string | null
          id: string
          issuing_org_id: string
          name: string
          validity_days: number
        }
        Insert: {
          description?: string | null
          id?: string
          issuing_org_id: string
          name: string
          validity_days: number
        }
        Update: {
          description?: string | null
          id?: string
          issuing_org_id?: string
          name?: string
          validity_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "badge_types_issuing_org_id_fkey"
            columns: ["issuing_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      blackouts: {
        Row: {
          ends_at: string
          id: string
          reason: string
          resource_id: string
          starts_at: string
        }
        Insert: {
          ends_at: string
          id?: string
          reason: string
          resource_id: string
          starts_at: string
        }
        Update: {
          ends_at?: string
          id?: string
          reason?: string
          resource_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blackouts_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_transitions: {
        Row: {
          actors: string[]
          event: string
          from_status: string
          reason_required: boolean
          to_status: Database["public"]["Enums"]["booking_status"]
        }
        Insert: {
          actors: string[]
          event: string
          from_status: string
          reason_required?: boolean
          to_status: Database["public"]["Enums"]["booking_status"]
        }
        Update: {
          actors?: string[]
          event?: string
          from_status?: string
          reason_required?: boolean
          to_status?: Database["public"]["Enums"]["booking_status"]
        }
        Relationships: []
      }
      bookings: {
        Row: {
          allocation_rule: string | null
          approver_role: Database["public"]["Enums"]["approver_role"]
          attachments: string[]
          created_at: string
          credit_charged: number | null
          credit_hold: number
          cutoff_at: string | null
          decided_by: string | null
          eligibility_snapshot: Json | null
          end_at: string
          escalated_at: string | null
          escalation_level: number
          exception_reason: string | null
          grace_minutes: number | null
          id: string
          is_exception: boolean
          offer_expires_at: string | null
          picked_up_at: string | null
          policy_version_id: string
          priority_score: number | null
          purpose_category: Database["public"]["Enums"]["purpose_category"]
          purpose_text: string
          purpose_verified: boolean
          request_group_id: string | null
          resource_id: string
          returned_at: string | null
          score_breakdown: Json | null
          start_at: string
          status: Database["public"]["Enums"]["booking_status"]
          status_reason: string | null
          unit_id: string | null
          updated_at: string
          user_id: string
          waitlist_position: number | null
        }
        Insert: {
          allocation_rule?: string | null
          approver_role?: Database["public"]["Enums"]["approver_role"]
          attachments?: string[]
          created_at?: string
          credit_charged?: number | null
          credit_hold?: number
          cutoff_at?: string | null
          decided_by?: string | null
          eligibility_snapshot?: Json | null
          end_at: string
          escalated_at?: string | null
          escalation_level?: number
          exception_reason?: string | null
          grace_minutes?: number | null
          id?: string
          is_exception?: boolean
          offer_expires_at?: string | null
          picked_up_at?: string | null
          policy_version_id: string
          priority_score?: number | null
          purpose_category?: Database["public"]["Enums"]["purpose_category"]
          purpose_text?: string
          purpose_verified?: boolean
          request_group_id?: string | null
          resource_id: string
          returned_at?: string | null
          score_breakdown?: Json | null
          start_at: string
          status: Database["public"]["Enums"]["booking_status"]
          status_reason?: string | null
          unit_id?: string | null
          updated_at?: string
          user_id: string
          waitlist_position?: number | null
        }
        Update: {
          allocation_rule?: string | null
          approver_role?: Database["public"]["Enums"]["approver_role"]
          attachments?: string[]
          created_at?: string
          credit_charged?: number | null
          credit_hold?: number
          cutoff_at?: string | null
          decided_by?: string | null
          eligibility_snapshot?: Json | null
          end_at?: string
          escalated_at?: string | null
          escalation_level?: number
          exception_reason?: string | null
          grace_minutes?: number | null
          id?: string
          is_exception?: boolean
          offer_expires_at?: string | null
          picked_up_at?: string | null
          policy_version_id?: string
          priority_score?: number | null
          purpose_category?: Database["public"]["Enums"]["purpose_category"]
          purpose_text?: string
          purpose_verified?: boolean
          request_group_id?: string | null
          resource_id?: string
          returned_at?: string | null
          score_breakdown?: Json | null
          start_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          status_reason?: string | null
          unit_id?: string | null
          updated_at?: string
          user_id?: string
          waitlist_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_policy_version_id_fkey"
            columns: ["policy_version_id"]
            isOneToOne: false
            referencedRelation: "policy_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "resource_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      condition_reports: {
        Row: {
          ai_analysis: Json | null
          booking_id: string
          checklist_results: Json
          created_at: string
          id: string
          notes: string | null
          owner_signed_at: string | null
          owner_signed_by: string | null
          phase: Database["public"]["Enums"]["condition_phase"]
          photos: Json
          student_ack_at: string | null
          supervisor_name: string | null
        }
        Insert: {
          ai_analysis?: Json | null
          booking_id: string
          checklist_results?: Json
          created_at?: string
          id?: string
          notes?: string | null
          owner_signed_at?: string | null
          owner_signed_by?: string | null
          phase: Database["public"]["Enums"]["condition_phase"]
          photos?: Json
          student_ack_at?: string | null
          supervisor_name?: string | null
        }
        Update: {
          ai_analysis?: Json | null
          booking_id?: string
          checklist_results?: Json
          created_at?: string
          id?: string
          notes?: string | null
          owner_signed_at?: string | null
          owner_signed_by?: string | null
          phase?: Database["public"]["Enums"]["condition_phase"]
          photos?: Json
          student_ack_at?: string | null
          supervisor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "condition_reports_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "condition_reports_owner_signed_by_fkey"
            columns: ["owner_signed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          booking_id: string | null
          created_at: string
          delta: number
          id: number
          kind: Database["public"]["Enums"]["ledger_kind"]
          note: string | null
          user_id: string
          week_start: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          delta: number
          id?: never
          kind: Database["public"]["Enums"]["ledger_kind"]
          note?: string | null
          user_id: string
          week_start?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          delta?: number
          id?: never
          kind?: Database["public"]["Enums"]["ledger_kind"]
          note?: string | null
          user_id?: string
          week_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      damage_cases: {
        Row: {
          ai_flags: Json | null
          assigned_to: string | null
          booking_id: string
          created_at: string
          credits_deducted: number | null
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          description: string
          id: string
          outcome: Database["public"]["Enums"]["damage_outcome"] | null
          reported_by: string
          responded_at: string | null
          response_deadline: string
          restriction_until: string | null
          severity: Database["public"]["Enums"]["damage_severity"]
          status: Database["public"]["Enums"]["damage_status"]
          student_response: string | null
          student_response_photos: string[]
        }
        Insert: {
          ai_flags?: Json | null
          assigned_to?: string | null
          booking_id: string
          created_at?: string
          credits_deducted?: number | null
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          description: string
          id?: string
          outcome?: Database["public"]["Enums"]["damage_outcome"] | null
          reported_by: string
          responded_at?: string | null
          response_deadline: string
          restriction_until?: string | null
          severity: Database["public"]["Enums"]["damage_severity"]
          status?: Database["public"]["Enums"]["damage_status"]
          student_response?: string | null
          student_response_photos?: string[]
        }
        Update: {
          ai_flags?: Json | null
          assigned_to?: string | null
          booking_id?: string
          created_at?: string
          credits_deducted?: number | null
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          description?: string
          id?: string
          outcome?: Database["public"]["Enums"]["damage_outcome"] | null
          reported_by?: string
          responded_at?: string | null
          response_deadline?: string
          restriction_until?: string | null
          severity?: Database["public"]["Enums"]["damage_severity"]
          status?: Database["public"]["Enums"]["damage_status"]
          student_response?: string | null
          student_response_photos?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "damage_cases_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_cases_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_cases_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_cases_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_credit_requests: {
        Row: {
          academic_year: string
          amount: number
          booking_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          granted_amount: number | null
          id: string
          proof_path: string | null
          reason: string
          status: Database["public"]["Enums"]["decision_status"]
          urgency: string
          user_id: string
        }
        Insert: {
          academic_year: string
          amount: number
          booking_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          granted_amount?: number | null
          id?: string
          proof_path?: string | null
          reason: string
          status?: Database["public"]["Enums"]["decision_status"]
          urgency?: string
          user_id: string
        }
        Update: {
          academic_year?: string
          amount?: number
          booking_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          granted_amount?: number | null
          id?: string
          proof_path?: string | null
          reason?: string
          status?: Database["public"]["Enums"]["decision_status"]
          urgency?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_credit_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_credit_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_credit_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      extension_requests: {
        Row: {
          booking_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          new_end_at: string
          note: string | null
          reason: string
          status: Database["public"]["Enums"]["decision_status"]
        }
        Insert: {
          booking_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          new_end_at: string
          note?: string | null
          reason: string
          status?: Database["public"]["Enums"]["decision_status"]
        }
        Update: {
          booking_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          new_end_at?: string
          note?: string | null
          reason?: string
          status?: Database["public"]["Enums"]["decision_status"]
        }
        Relationships: [
          {
            foreignKeyName: "extension_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extension_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          actions: string | null
          booking_id: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          description: string
          evidence: string[]
          id: string
          location: string
          occurred_at: string
          reported_by: string
          resolution: string | null
          resource_id: string
          severity: Database["public"]["Enums"]["incident_severity"]
          status: Database["public"]["Enums"]["incident_status"]
        }
        Insert: {
          actions?: string | null
          booking_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          description: string
          evidence?: string[]
          id?: string
          location?: string
          occurred_at: string
          reported_by: string
          resolution?: string | null
          resource_id: string
          severity: Database["public"]["Enums"]["incident_severity"]
          status?: Database["public"]["Enums"]["incident_status"]
        }
        Update: {
          actions?: string | null
          booking_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          description?: string
          evidence?: string[]
          id?: string
          location?: string
          occurred_at?: string
          reported_by?: string
          resolution?: string | null
          resource_id?: string
          severity?: Database["public"]["Enums"]["incident_severity"]
          status?: Database["public"]["Enums"]["incident_status"]
        }
        Relationships: [
          {
            foreignKeyName: "incidents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          org_id: string
          reason: string
          role: Database["public"]["Enums"]["membership_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          org_id: string
          reason: string
          role: Database["public"]["Enums"]["membership_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          org_id?: string
          reason?: string
          role?: Database["public"]["Enums"]["membership_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          dedupe_key: string
          email_eligible: boolean
          email_status: string | null
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          urgent: boolean
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          dedupe_key: string
          email_eligible?: boolean
          email_status?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          urgent?: boolean
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          dedupe_key?: string
          email_eligible?: boolean
          email_status?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          urgent?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_restrictions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          reason: string
          until: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          reason: string
          until: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          reason?: string
          until?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_restrictions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_restrictions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_restrictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          type: Database["public"]["Enums"]["org_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          type: Database["public"]["Enums"]["org_type"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          type?: Database["public"]["Enums"]["org_type"]
        }
        Relationships: []
      }
      penalties: {
        Row: {
          appeal_text: string | null
          booking_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          final_amount: number | null
          id: string
          kind: Database["public"]["Enums"]["penalty_kind"]
          policy_version_id: string | null
          proposed_amount: number
          reason: string | null
          status: Database["public"]["Enums"]["penalty_status"]
          user_id: string
        }
        Insert: {
          appeal_text?: string | null
          booking_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          final_amount?: number | null
          id?: string
          kind: Database["public"]["Enums"]["penalty_kind"]
          policy_version_id?: string | null
          proposed_amount: number
          reason?: string | null
          status?: Database["public"]["Enums"]["penalty_status"]
          user_id: string
        }
        Update: {
          appeal_text?: string | null
          booking_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          final_amount?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["penalty_kind"]
          policy_version_id?: string | null
          proposed_amount?: number
          reason?: string | null
          status?: Database["public"]["Enums"]["penalty_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "penalties_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalties_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalties_policy_version_id_fkey"
            columns: ["policy_version_id"]
            isOneToOne: false
            referencedRelation: "policy_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalties_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          reason: string
          values: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          reason: string
          values: Json
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string
          values?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "policy_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department: string | null
          email: string
          full_name: string
          id: string
          id_proof_path: string | null
          is_admin: boolean
          onboarding_complete: boolean
          phone: string | null
          roll_number: string | null
          status: Database["public"]["Enums"]["account_status"]
          status_reason: string | null
          suspended_until: string | null
          verification_submitted_at: string | null
          year: number | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email: string
          full_name?: string
          id: string
          id_proof_path?: string | null
          is_admin?: boolean
          onboarding_complete?: boolean
          phone?: string | null
          roll_number?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          status_reason?: string | null
          suspended_until?: string | null
          verification_submitted_at?: string | null
          year?: number | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email?: string
          full_name?: string
          id?: string
          id_proof_path?: string | null
          is_admin?: boolean
          onboarding_complete?: boolean
          phone?: string | null
          roll_number?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          status_reason?: string | null
          suspended_until?: string | null
          verification_submitted_at?: string | null
          year?: number | null
        }
        Relationships: []
      }
      resource_units: {
        Row: {
          id: string
          label: string
          resource_id: string
          status: Database["public"]["Enums"]["resource_status"]
        }
        Insert: {
          id?: string
          label: string
          resource_id: string
          status?: Database["public"]["Enums"]["resource_status"]
        }
        Update: {
          id?: string
          label?: string
          resource_id?: string
          status?: Database["public"]["Enums"]["resource_status"]
        }
        Relationships: [
          {
            foreignKeyName: "resource_units_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          allocation_mode: Database["public"]["Enums"]["allocation_mode"]
          approval_mode: Database["public"]["Enums"]["approval_mode"]
          base_rate: number
          batch_cutoff_hours: number
          booking_rules: Json
          category: Database["public"]["Enums"]["resource_category"]
          category_fields: Json
          checklist: Json
          created_at: string
          description: string
          door_qr_token: string
          eligibility: Json
          estimated_current_usage: Database["public"]["Enums"]["usage_estimate"]
          form_template: Database["public"]["Enums"]["form_template"]
          id: string
          location: string
          name: string
          org_id: string
          peak_multiplier: number
          photos: string[]
          quantity: number
          rate_unit: Database["public"]["Enums"]["rate_unit"]
          replacement_value: number | null
          safety_rules: Json
          status: Database["public"]["Enums"]["resource_status"]
          updated_at: string
        }
        Insert: {
          allocation_mode?: Database["public"]["Enums"]["allocation_mode"]
          approval_mode?: Database["public"]["Enums"]["approval_mode"]
          base_rate?: number
          batch_cutoff_hours?: number
          booking_rules?: Json
          category: Database["public"]["Enums"]["resource_category"]
          category_fields?: Json
          checklist?: Json
          created_at?: string
          description?: string
          door_qr_token?: string
          eligibility?: Json
          estimated_current_usage?: Database["public"]["Enums"]["usage_estimate"]
          form_template: Database["public"]["Enums"]["form_template"]
          id?: string
          location?: string
          name: string
          org_id: string
          peak_multiplier?: number
          photos?: string[]
          quantity?: number
          rate_unit?: Database["public"]["Enums"]["rate_unit"]
          replacement_value?: number | null
          safety_rules?: Json
          status?: Database["public"]["Enums"]["resource_status"]
          updated_at?: string
        }
        Update: {
          allocation_mode?: Database["public"]["Enums"]["allocation_mode"]
          approval_mode?: Database["public"]["Enums"]["approval_mode"]
          base_rate?: number
          batch_cutoff_hours?: number
          booking_rules?: Json
          category?: Database["public"]["Enums"]["resource_category"]
          category_fields?: Json
          checklist?: Json
          created_at?: string
          description?: string
          door_qr_token?: string
          eligibility?: Json
          estimated_current_usage?: Database["public"]["Enums"]["usage_estimate"]
          form_template?: Database["public"]["Enums"]["form_template"]
          id?: string
          location?: string
          name?: string
          org_id?: string
          peak_multiplier?: number
          photos?: string[]
          quantity?: number
          rate_unit?: Database["public"]["Enums"]["rate_unit"]
          replacement_value?: number | null
          safety_rules?: Json
          status?: Database["public"]["Enums"]["resource_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          ai_extraction: Json | null
          badge_type_id: string
          certificate_path: string | null
          created_at: string
          decision_reason: string | null
          expires_at: string | null
          id: string
          issued_at: string | null
          status: Database["public"]["Enums"]["badge_status"]
          user_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          ai_extraction?: Json | null
          badge_type_id: string
          certificate_path?: string | null
          created_at?: string
          decision_reason?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          status?: Database["public"]["Enums"]["badge_status"]
          user_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          ai_extraction?: Json | null
          badge_type_id?: string
          certificate_path?: string | null
          created_at?: string
          decision_reason?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          status?: Database["public"]["Enums"]["badge_status"]
          user_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_type_id_fkey"
            columns: ["badge_type_id"]
            isOneToOne: false
            referencedRelation: "badge_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_verified_by_fkey"
            columns: ["verified_by"]
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
      acknowledge_condition: {
        Args: {
          p_booking: string
          p_phase: Database["public"]["Enums"]["condition_phase"]
          p_user: string
        }
        Returns: undefined
      }
      app_now: { Args: never; Returns: string }
      booking_holds_credits: {
        Args: { p_status: Database["public"]["Enums"]["booking_status"] }
        Returns: boolean
      }
      can_read_booking: { Args: { p_booking: string }; Returns: boolean }
      current_policy_version_id: { Args: never; Returns: string }
      decide_verification: {
        Args: {
          p_admin: string
          p_approve: boolean
          p_reason: string
          p_user: string
        }
        Returns: string
      }
      door_checkin: {
        Args: { p_token: string; p_user: string }
        Returns: {
          allocation_rule: string | null
          approver_role: Database["public"]["Enums"]["approver_role"]
          attachments: string[]
          created_at: string
          credit_charged: number | null
          credit_hold: number
          cutoff_at: string | null
          decided_by: string | null
          eligibility_snapshot: Json | null
          end_at: string
          escalated_at: string | null
          escalation_level: number
          exception_reason: string | null
          grace_minutes: number | null
          id: string
          is_exception: boolean
          offer_expires_at: string | null
          picked_up_at: string | null
          policy_version_id: string
          priority_score: number | null
          purpose_category: Database["public"]["Enums"]["purpose_category"]
          purpose_text: string
          purpose_verified: boolean
          request_group_id: string | null
          resource_id: string
          returned_at: string | null
          score_breakdown: Json | null
          start_at: string
          status: Database["public"]["Enums"]["booking_status"]
          status_reason: string | null
          unit_id: string | null
          updated_at: string
          user_id: string
          waitlist_position: number | null
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      free_unit: {
        Args: { p_end: string; p_resource: string; p_start: string }
        Returns: string
      }
      has_org_role: {
        Args: {
          p_org: string
          p_role: Database["public"]["Enums"]["membership_role"]
          p_user: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_manager_of: { Args: { p_org: string }; Returns: boolean }
      is_owner_of: { Args: { p_org: string }; Returns: boolean }
      is_requester_of_my_org: { Args: { p_profile: string }; Returns: boolean }
      is_staff_of: { Args: { p_org: string }; Returns: boolean }
      log_event: {
        Args: {
          p_action: string
          p_actor_id: string
          p_actor_role: string
          p_entity_id: string
          p_entity_type: string
          p_from_state?: string
          p_metadata?: Json
          p_org_id?: string
          p_policy_version_id?: string
          p_reason?: string
          p_subject_user_id?: string
          p_to_state?: string
        }
        Returns: number
      }
      owns_resource: { Args: { p_resource: string }; Returns: boolean }
      path_uuid: { Args: { p_name: string }; Returns: string }
      queue_notifications: { Args: { p_event_id: number }; Returns: undefined }
      record_condition: {
        Args: {
          p_actor: string
          p_actor_role: string
          p_booking: string
          p_checklist: Json
          p_notes: string
          p_phase: Database["public"]["Enums"]["condition_phase"]
          p_photos: Json
          p_supervisor: string
        }
        Returns: {
          allocation_rule: string | null
          approver_role: Database["public"]["Enums"]["approver_role"]
          attachments: string[]
          created_at: string
          credit_charged: number | null
          credit_hold: number
          cutoff_at: string | null
          decided_by: string | null
          eligibility_snapshot: Json | null
          end_at: string
          escalated_at: string | null
          escalation_level: number
          exception_reason: string | null
          grace_minutes: number | null
          id: string
          is_exception: boolean
          offer_expires_at: string | null
          picked_up_at: string | null
          policy_version_id: string
          priority_score: number | null
          purpose_category: Database["public"]["Enums"]["purpose_category"]
          purpose_text: string
          purpose_verified: boolean
          request_group_id: string | null
          resource_id: string
          returned_at: string | null
          score_breakdown: Json | null
          start_at: string
          status: Database["public"]["Enums"]["booking_status"]
          status_reason: string | null
          unit_id: string | null
          updated_at: string
          user_id: string
          waitlist_position: number | null
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      require_admin: { Args: { p_admin: string }; Returns: undefined }
      seed_demo: { Args: never; Returns: undefined }
      set_membership: {
        Args: {
          p_admin: string
          p_grant: boolean
          p_org: string
          p_reason: string
          p_replacement?: string
          p_role: Database["public"]["Enums"]["membership_role"]
          p_user: string
        }
        Returns: undefined
      }
      submit_booking: {
        Args: {
          p_end: string
          p_event: string
          p_fields: Json
          p_resource: string
          p_start: string
          p_user: string
        }
        Returns: {
          allocation_rule: string | null
          approver_role: Database["public"]["Enums"]["approver_role"]
          attachments: string[]
          created_at: string
          credit_charged: number | null
          credit_hold: number
          cutoff_at: string | null
          decided_by: string | null
          eligibility_snapshot: Json | null
          end_at: string
          escalated_at: string | null
          escalation_level: number
          exception_reason: string | null
          grace_minutes: number | null
          id: string
          is_exception: boolean
          offer_expires_at: string | null
          picked_up_at: string | null
          policy_version_id: string
          priority_score: number | null
          purpose_category: Database["public"]["Enums"]["purpose_category"]
          purpose_text: string
          purpose_verified: boolean
          request_group_id: string | null
          resource_id: string
          returned_at: string | null
          score_breakdown: Json | null
          start_at: string
          status: Database["public"]["Enums"]["booking_status"]
          status_reason: string | null
          unit_id: string | null
          updated_at: string
          user_id: string
          waitlist_position: number | null
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_verification: {
        Args: {
          p_department: string
          p_full_name: string
          p_id_path: string
          p_phone: string
          p_roll: string
          p_user: string
          p_year: number
        }
        Returns: undefined
      }
      transition_booking: {
        Args: {
          p_actor_id: string
          p_actor_role: string
          p_booking_id: string
          p_event: string
          p_payload?: Json
          p_reason?: string
        }
        Returns: {
          allocation_rule: string | null
          approver_role: Database["public"]["Enums"]["approver_role"]
          attachments: string[]
          created_at: string
          credit_charged: number | null
          credit_hold: number
          cutoff_at: string | null
          decided_by: string | null
          eligibility_snapshot: Json | null
          end_at: string
          escalated_at: string | null
          escalation_level: number
          exception_reason: string | null
          grace_minutes: number | null
          id: string
          is_exception: boolean
          offer_expires_at: string | null
          picked_up_at: string | null
          policy_version_id: string
          priority_score: number | null
          purpose_category: Database["public"]["Enums"]["purpose_category"]
          purpose_text: string
          purpose_verified: boolean
          request_group_id: string | null
          resource_id: string
          returned_at: string | null
          score_breakdown: Json | null
          start_at: string
          status: Database["public"]["Enums"]["booking_status"]
          status_reason: string | null
          unit_id: string | null
          updated_at: string
          user_id: string
          waitlist_position: number | null
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      account_status: "pending_verification" | "verified" | "suspended"
      allocation_mode: "instant" | "batch"
      approval_mode: "auto" | "owner" | "manager"
      approver_role: "owner" | "manager"
      badge_status: "pending" | "verified" | "rejected" | "expired" | "revoked"
      booking_status:
        | "pending_allocation"
        | "pending_approval"
        | "waitlisted"
        | "offered"
        | "approved"
        | "checked_out"
        | "overdue"
        | "returned"
        | "under_review"
        | "completed"
        | "rejected"
        | "cancelled"
        | "no_show"
        | "expired"
      condition_phase: "checkout" | "return"
      damage_outcome:
        | "dismissed"
        | "warning"
        | "credit_deduction"
        | "restriction"
        | "insufficient_evidence"
      damage_severity: "minor" | "major" | "unusable"
      damage_status:
        | "awaiting_response"
        | "ready_for_decision"
        | "more_evidence_requested"
        | "decided"
      decision_status:
        | "pending"
        | "approved"
        | "partial"
        | "rejected"
        | "cancelled"
      form_template: "space" | "lab" | "portable" | "machine"
      incident_severity: "low" | "medium" | "high"
      incident_status: "open" | "investigating" | "closed"
      ledger_kind:
        | "allowance"
        | "hold"
        | "release"
        | "charge"
        | "penalty"
        | "forfeit"
        | "emergency_grant"
        | "reset_expiry"
      membership_role: "owner" | "manager"
      org_type: "club" | "lab" | "department" | "facility" | "office"
      penalty_kind: "late" | "no_show" | "damage"
      penalty_status:
        | "proposed"
        | "confirmed"
        | "reduced"
        | "waived"
        | "auto_applied"
        | "appealed"
      purpose_category:
        | "academic_deadline"
        | "project_research"
        | "club_activity"
        | "personal"
      rate_unit: "hour" | "day"
      resource_category:
        | "classroom"
        | "seminar_hall"
        | "meeting_room"
        | "sports_ground"
        | "lab"
        | "electronics"
        | "media"
        | "sports_equipment"
        | "machine"
        | "other"
      resource_status: "active" | "paused" | "under_maintenance" | "unsafe"
      usage_estimate: "rarely" | "weekly" | "daily"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      account_status: ["pending_verification", "verified", "suspended"],
      allocation_mode: ["instant", "batch"],
      approval_mode: ["auto", "owner", "manager"],
      approver_role: ["owner", "manager"],
      badge_status: ["pending", "verified", "rejected", "expired", "revoked"],
      booking_status: [
        "pending_allocation",
        "pending_approval",
        "waitlisted",
        "offered",
        "approved",
        "checked_out",
        "overdue",
        "returned",
        "under_review",
        "completed",
        "rejected",
        "cancelled",
        "no_show",
        "expired",
      ],
      condition_phase: ["checkout", "return"],
      damage_outcome: [
        "dismissed",
        "warning",
        "credit_deduction",
        "restriction",
        "insufficient_evidence",
      ],
      damage_severity: ["minor", "major", "unusable"],
      damage_status: [
        "awaiting_response",
        "ready_for_decision",
        "more_evidence_requested",
        "decided",
      ],
      decision_status: [
        "pending",
        "approved",
        "partial",
        "rejected",
        "cancelled",
      ],
      form_template: ["space", "lab", "portable", "machine"],
      incident_severity: ["low", "medium", "high"],
      incident_status: ["open", "investigating", "closed"],
      ledger_kind: [
        "allowance",
        "hold",
        "release",
        "charge",
        "penalty",
        "forfeit",
        "emergency_grant",
        "reset_expiry",
      ],
      membership_role: ["owner", "manager"],
      org_type: ["club", "lab", "department", "facility", "office"],
      penalty_kind: ["late", "no_show", "damage"],
      penalty_status: [
        "proposed",
        "confirmed",
        "reduced",
        "waived",
        "auto_applied",
        "appealed",
      ],
      purpose_category: [
        "academic_deadline",
        "project_research",
        "club_activity",
        "personal",
      ],
      rate_unit: ["hour", "day"],
      resource_category: [
        "classroom",
        "seminar_hall",
        "meeting_room",
        "sports_ground",
        "lab",
        "electronics",
        "media",
        "sports_equipment",
        "machine",
        "other",
      ],
      resource_status: ["active", "paused", "under_maintenance", "unsafe"],
      usage_estimate: ["rarely", "weekly", "daily"],
    },
  },
} as const
