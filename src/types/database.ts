export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'super_admin' | 'district_manager' | 'location_manager'
export type ScreenType = 'promo_board' | 'menu_board' | 'employee_board'
export type DeviceStatus = 'online' | 'offline' | 'error' | 'maintenance'
export type Orientation = 'landscape' | 'portrait'
export type LogLevel = 'info' | 'warning' | 'error' | 'debug'
export type MediaType = 'image' | 'video' | 'youtube'
export type LoopMode = 'loop' | 'once' | 'shuffle'
export type TransitionType = 'fade' | 'slide' | 'cut' | 'dissolve'

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          description: string | null
          logo_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          logo_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          logo_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      districts: {
        Row: {
          id: string
          organization_id: string
          name: string
          description: string | null
          manager_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          description?: string | null
          manager_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          description?: string | null
          manager_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      locations: {
        Row: {
          id: string
          district_id: string
          name: string
          address: string | null
          phone: string | null
          manager_id: string | null
          timezone: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          district_id: string
          name: string
          address?: string | null
          phone?: string | null
          manager_id?: string | null
          timezone?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          district_id?: string
          name?: string
          address?: string | null
          phone?: string | null
          manager_id?: string | null
          timezone?: string
          created_at?: string
          updated_at?: string
        }
      }
      user_profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          role: UserRole
          organization_id: string | null
          district_id: string | null
          location_id: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          role?: UserRole
          organization_id?: string | null
          district_id?: string | null
          location_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          role?: UserRole
          organization_id?: string | null
          district_id?: string | null
          location_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      screens: {
        Row: {
          id: string
          location_id: string
          name: string
          screen_type: ScreenType
          device_id: string | null
          device_status: DeviceStatus
          resolution: string
          orientation: Orientation
          is_active: boolean
          last_seen: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          location_id: string
          name: string
          screen_type: ScreenType
          device_id?: string | null
          device_status?: DeviceStatus
          resolution?: string
          orientation?: Orientation
          is_active?: boolean
          last_seen?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          location_id?: string
          name?: string
          screen_type?: ScreenType
          device_id?: string | null
          device_status?: DeviceStatus
          resolution?: string
          orientation?: Orientation
          is_active?: boolean
          last_seen?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      media_assets: {
        Row: {
          id: string
          organization_id: string
          name: string
          description: string | null
          file_name: string | null
          file_path: string | null
          file_url: string | null
          file_size: number | null
          mime_type: string
          media_type: MediaType | null
          duration: number | null
          width: number | null
          height: number | null
          resolution: string | null
          tags: string[] | null
          folder_id: string | null
          youtube_url: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          description?: string | null
          file_name?: string | null
          file_path?: string | null
          file_url?: string | null
          file_size?: number | null
          mime_type: string
          media_type?: MediaType | null
          duration?: number | null
          width?: number | null
          height?: number | null
          resolution?: string | null
          tags?: string[] | null
          folder_id?: string | null
          youtube_url?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          description?: string | null
          file_name?: string | null
          file_path?: string | null
          file_url?: string | null
          file_size?: number | null
          mime_type?: string
          media_type?: MediaType | null
          duration?: number | null
          width?: number | null
          height?: number | null
          resolution?: string | null
          tags?: string[] | null
          folder_id?: string | null
          youtube_url?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      media_folders: {
        Row: {
          id: string
          organization_id: string
          name: string
          parent_folder_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          parent_folder_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          parent_folder_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      playlists: {
        Row: {
          id: string
          organization_id: string
          name: string
          description: string | null
          total_duration: number
          loop_mode: LoopMode
          created_by: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          description?: string | null
          total_duration?: number
          loop_mode?: LoopMode
          created_by?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          description?: string | null
          total_duration?: number
          loop_mode?: LoopMode
          created_by?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      playlist_items: {
        Row: {
          id: string
          playlist_id: string
          media_asset_id: string
          order_index: number
          duration_override: number | null
          transition_type: TransitionType
          created_at: string
        }
        Insert: {
          id?: string
          playlist_id: string
          media_asset_id: string
          order_index: number
          duration_override?: number | null
          transition_type?: TransitionType
          created_at?: string
        }
        Update: {
          id?: string
          playlist_id?: string
          media_asset_id?: string
          order_index?: number
          duration_override?: number | null
          transition_type?: TransitionType
          created_at?: string
        }
      }
      schedules: {
        Row: {
          id: string
          organization_id: string
          name: string
          playlist_id: string
          screen_id: string | null
          target_screen_types: ScreenType[] | null
          target_locations: string[] | null
          start_date: string
          end_date: string | null
          start_time: string
          end_time: string
          days_of_week: number[]
          timezone: string
          priority: number
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          playlist_id: string
          screen_id?: string | null
          target_screen_types?: ScreenType[] | null
          target_locations?: string[] | null
          start_date: string
          end_date?: string | null
          start_time: string
          end_time: string
          days_of_week?: number[]
          timezone?: string
          priority?: number
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          playlist_id?: string
          screen_id?: string | null
          target_screen_types?: ScreenType[] | null
          target_locations?: string[] | null
          start_date?: string
          end_date?: string | null
          start_time?: string
          end_time?: string
          days_of_week?: number[]
          timezone?: string
          priority?: number
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      screen_schedules: {
        Row: {
          id: string
          schedule_id: string
          screen_id: string
          created_at: string
        }
        Insert: {
          id?: string
          schedule_id: string
          screen_id: string
          created_at?: string
        }
        Update: {
          id?: string
          schedule_id?: string
          screen_id?: string
          created_at?: string
        }
      }
      device_logs: {
        Row: {
          id: string
          screen_id: string
          log_level: LogLevel
          message: string
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          screen_id: string
          log_level: LogLevel
          message: string
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          screen_id?: string
          log_level?: LogLevel
          message?: string
          metadata?: Json | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_organization_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_user_role: {
        Args: Record<PropertyKey, never>
        Returns: UserRole
      }
      can_access_district: {
        Args: {
          district_uuid: string
        }
        Returns: boolean
      }
      can_access_location: {
        Args: {
          location_uuid: string
        }
        Returns: boolean
      }
    }
    Enums: {
      user_role: UserRole
      screen_type: ScreenType
      device_status: DeviceStatus
      orientation: Orientation
      media_type: MediaType
      loop_mode: LoopMode
      transition_type: TransitionType
    }
  }
}