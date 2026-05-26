export interface Activity {
  id: number;
  external_id: string;
  source: "garmin" | "strava" | "trainingpeaks";
  name: string;
  sport_type: string;
  start_date: string;
  duration_seconds: number;
  distance_meters: number;
  avg_hr: number | null;
  avg_power: number | null;
  tss: number | null;
  description: string;
  norm_power: number | null;
  elevation_gain: number | null;
  elevation_loss: number | null;
  calories: number | null;
  avg_cadence: number | null;
  avg_speed: number | null;
  max_hr: number | null;
}

export interface HealthDay {
  id: number;
  date: string;
  resting_hr: number | null;
  max_hr: number | null;
  avg_hrv: number | null;
  hrv_status: string | null;
  sleep_score: number | null;
  sleep_duration_seconds: number | null;
  deep_sleep_seconds: number | null;
  rem_sleep_seconds: number | null;
  weight_grams: number | null;
  body_fat_pct: number | null;
  bmi: number | null;
  total_steps: number | null;
  active_calories: number | null;
  body_battery_high: number | null;
  body_battery_low: number | null;
  avg_stress: number | null;
  avg_spo2: number | null;
  vo2_max: number | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PlannedWorkout {
  date: string;
  title: string;
  sport: string;
  description: string;
  workout_id: string | null;
  item_type: "workout" | "event";
}
