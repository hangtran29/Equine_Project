// Flow 4 – Chăm sóc và dinh dưỡng. Tên trường JSON giữ nguyên như backend (xem backend/docs/API.md mục 7).
import { apiDelete, apiGet, apiGetNullable, apiPatch, apiPost, apiPut } from './apiClient.ts';
import { getCompleteVetList } from './vetApi.ts';

type Row = Record<string, any>;

function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value !== false) search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

// ---------- Ngựa, Groom ----------
export async function getApprovedHorses(): Promise<Row[]> {
  return getCompleteVetList('/horses?RegistrationStatus=Approved');
}

export async function getGrooms(): Promise<Row[]> {
  return getCompleteVetList('/users?RoleCode=GROOM&Status=Active');
}

export const getHorseGroom = (horseId: number | string) => apiGetNullable<Row>(`/horses/${horseId}/groom`);
export const setHorseGroom = (horseId: number | string, groomId: number | string) =>
  apiPut<Row>(`/horses/${horseId}/groom`, { GroomID: Number(groomId) });
export const clearHorseGroom = (horseId: number | string) => apiDelete<void>(`/horses/${horseId}/groom`);

// ---------- Khẩu phần ----------
export async function getDietPlans(params: { Status?: string; HorseID?: number | string } = {}): Promise<Row[]> {
  return getCompleteVetList(`/diet-plans${query(params)}`);
}
export async function getHorseDietPlans(horseId: number | string): Promise<Row[]> {
  return getCompleteVetList(`/horses/${horseId}/diet-plans`);
}
export const getCurrentDiet = (horseId: number | string) => apiGetNullable<Row>(`/horses/${horseId}/current-diet`);
export const getDietContext = (horseId: number | string) => apiGet<Row>(`/horses/${horseId}/diet-context`);
export const createDietPlan = (horseId: number | string, body: Row) => apiPost<Row>(`/horses/${horseId}/diet-plans`, body);
export const updateDietPlan = (planId: number | string, body: Row) => apiPatch<Row>(`/diet-plans/${planId}`, body);
export const approveDietPlan = (planId: number | string, vetNote: string) =>
  apiPost<Row>(`/diet-plans/${planId}/approve`, vetNote ? { VetNote: vetNote } : {});
export const rejectDietPlan = (planId: number | string, vetNote: string) =>
  apiPost<Row>(`/diet-plans/${planId}/reject`, { VetNote: vetNote });
export const adjustDietPlan = (planId: number | string, body: Row) => apiPost<Row>(`/diet-plans/${planId}/adjust`, body);

// ---------- Việc chăm sóc ----------
export async function getCareTasks(params: {
  Date?: string; From?: string; To?: string; HorseID?: number | string; GroomID?: number | string;
  Status?: string; mine?: boolean; TaskType?: string; Unassigned?: boolean;
} = {}): Promise<Row[]> {
  return getCompleteVetList(`/care-tasks${query({ ...params, mine: params.mine ? 1 : undefined })}`);
}
export const completeCareTask = (taskId: number | string, note: string, feedingOutcome?: string) =>
  apiPost<Row>(`/care-tasks/${taskId}/complete`, { Note: note, ...(feedingOutcome ? { FeedingOutcome: feedingOutcome } : {}) });
export const skipCareTask = (taskId: number | string, reason: string) =>
  apiPost<Row>(`/care-tasks/${taskId}/skip`, { Reason: reason });
export const createCareTask = (body: Row) => apiPost<Row>('/care-tasks', body);
export const generateCareTasks = (date: string, days = 1) =>
  apiPost<Row[]>('/care-tasks/generate', { Date: date, Days: days });

// ---------- Chỉ tiêu chăm sóc ----------
export async function getCareRules(): Promise<Row[]> {
  return getCompleteVetList('/care-rules');
}
export const updateCareRule = (ruleCode: string, body: Row) =>
  apiPatch<Row>(`/care-rules/${encodeURIComponent(ruleCode)}`, body);

// ---------- Vật tư ----------
export async function getInventoryItems(): Promise<Row[]> {
  return getCompleteVetList('/inventory-items');
}
export async function getMyInventoryRequests(): Promise<Row[]> {
  return getCompleteVetList('/inventory-requests?mine=1');
}
export const createInventoryRequest = (body: Row) => apiPost<Row>('/inventory-requests', body);
export const cancelInventoryRequest = (requestId: number | string) =>
  apiPost<Row>(`/inventory-requests/${requestId}/cancel`, {});
