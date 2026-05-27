import axios from "axios";
import type { Activity, ChatMessage, PlannedWorkout, HealthDay, Conversation, MessageRecord, WorkoutDetail } from "../types";

const api = axios.create({ baseURL: "/api" });

export const activitiesApi = {
  list: () => api.get<Activity[]>("/activities/").then((r) => r.data),
  get: (id: number) => api.get<Activity>(`/activities/${id}`).then((r) => r.data),
  analyse: (id: number) =>
    api.post<{ analysis: string }>(`/activities/${id}/analyse`).then((r) => r.data),
};

export const agentApi = {
  chat: (message: string, conversationId?: number) =>
    api
      .post<{ reply: string; conversation_id: number }>("/agent/chat", {
        message,
        conversation_id: conversationId,
      })
      .then((r) => r.data),

  createConversation: () =>
    api.post<Conversation>("/agent/conversations").then((r) => r.data),

  getMessages: (conversationId: number) =>
    api
      .get<MessageRecord[]>(`/agent/conversations/${conversationId}/messages`)
      .then((r) => r.data),
};

export const syncApi = {
  trigger: () => api.post("/sync/trigger").then((r) => r.data),
  status: () => api.get("/sync/status").then((r) => r.data),
  calendar: (weeksAhead: number) =>
    api.get<{ planned_workouts: PlannedWorkout[] }>("/sync/calendar", { params: { weeks_ahead: weeksAhead } })
      .then((r) => r.data.planned_workouts),
  workout: (workoutId: string) =>
    api.get<WorkoutDetail>(`/sync/workout/${workoutId}`).then((r) => r.data),
};

export const healthApi = {
  list: (days = 365) =>
    api.get<HealthDay[]>(`/health/?limit=${days}`).then((r) => r.data),
};

export { ChatMessage };
