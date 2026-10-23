export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_data: Json | null
          old_data: Json | null
          profile_id: string | null
          record_id: string | null
          table_name: string
          user_agent: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          profile_id?: string | null
          record_id?: string | null
          table_name: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          profile_id?: string | null
          record_id?: string | null
          table_name?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      booking_history: {
        Row: {
          booking_id: string
          changed_by: string | null
          created_at: string
          id: string
          new_status: string
          previous_status: string | null
          remarks: string | null
        }
        Insert: {
          booking_id: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status: string
          previous_status?: string | null
          remarks?: string | null
        }
        Update: {
          booking_id?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status?: string
          previous_status?: string | null
          remarks?: string | null
        }
        Relationships: []
      }
      booking_notes: {
        Row: {
          author_id: string
          booking_id: string
          created_at: string
          id: string
          is_private: boolean
          note: string
        }
        Insert: {
          author_id: string
          booking_id: string
          created_at?: string
          id?: string
          is_private?: boolean
          note: string
        }
        Update: {
          author_id?: string
          booking_id?: string
          created_at?: string
          id?: string
          is_private?: boolean
          note?: string
        }
        Relationships: []
      }
      business_settings: {
        Row: {
          business_name: string | null
          created_at: string
          google_maps_reviews_url: string | null
          google_reviews_api_key: string | null
          id: string
          updated_at: string
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          google_maps_reviews_url?: string | null
          google_reviews_api_key?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          business_name?: string | null
          created_at?: string
          google_maps_reviews_url?: string | null
          google_reviews_api_key?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          booking_date: string
          booking_number: string
          cancellation_reason: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          end_time: string
          guests: number
          id: string
          internal_notes: string | null
          service_id: string
          special_requests: string | null
          staff_id: string
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          booking_date: string
          booking_number: string
          cancellation_reason?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          end_time: string
          guests?: number
          id?: string
          internal_notes?: string | null
          service_id: string
          special_requests?: string | null
          staff_id: string
          start_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          booking_date?: string
          booking_number?: string
          cancellation_reason?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          end_time?: string
          guests?: number
          id?: string
          internal_notes?: string | null
          service_id?: string
          special_requests?: string | null
          staff_id?: string
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          date_of_birth: string | null
          email: string | null
          full_name: string
          gender: string | null
          id: string
          is_active: boolean
          marketing_opt_in: boolean | null
          notes: string | null
          phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name: string
          gender?: string | null
          id?: string
          is_active?: boolean
          marketing_opt_in?: boolean | null
          notes?: string | null
          phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          is_active?: boolean
          marketing_opt_in?: boolean | null
          notes?: string | null
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          profile_id: string | null
          read_at: string | null
          title: string
          type: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          profile_id?: string | null
          read_at?: string | null
          title: string
          type: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          profile_id?: string | null
          read_at?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          phone?: string | null
          role_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          approved: boolean
          author_photo_url: string | null
          comment: string
          created_at: string
          customer_name: string
          external_id: string
          external_url: string | null
          id: string
          is_featured: boolean
          last_synced_at: string | null
          rating: number
          reviewed_at: string | null
          source: string
          updated_at: string
        }
        Insert: {
          approved?: boolean
          author_photo_url?: string | null
          comment: string
          created_at?: string
          customer_name: string
          external_id: string
          external_url?: string | null
          id?: string
          is_featured?: boolean
          last_synced_at?: string | null
          rating: number
          reviewed_at?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          approved?: boolean
          author_photo_url?: string | null
          comment?: string
          created_at?: string
          customer_name?: string
          external_id?: string
          external_url?: string | null
          id?: string
          is_featured?: boolean
          last_synced_at?: string | null
          rating?: number
          reviewed_at?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
