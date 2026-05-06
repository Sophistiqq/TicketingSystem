// ============================================================
// Reference data store — cached dropdown data
// Fetched once on app init, used by forms and filters
// ============================================================
import { api } from '../lib/api';
import type { Department, AffectedSystem, RequestType, HardwareItem } from '../lib/types';

let departments: Department[] = $state([]);
let affectedSystems: AffectedSystem[] = $state([]);
let requestTypes: RequestType[] = $state([]);
let hardwareItems: HardwareItem[] = $state([]);
let loaded = $state(false);

export function getDepartments() { return departments; }
export function getAffectedSystems() { return affectedSystems; }
export function getRequestTypes() { return requestTypes; }
export function getHardwareItems() { return hardwareItems; }
export function isLoaded() { return loaded; }

export async function fetchReferenceData() {
  if (loaded) return;
  try {
    const [depts, systems, types, hItems] = await Promise.all([
      api.get<Department[]>('/reference/departments'),
      api.get<AffectedSystem[]>('/reference/affected-systems'),
      api.get<RequestType[]>('/reference/request-types'),
      api.get<HardwareItem[]>('/reference/hardware-items'),
    ]);
    departments = depts ?? [];
    affectedSystems = systems ?? [];
    requestTypes = types ?? [];
    hardwareItems = hItems ?? [];
    loaded = true;
  } catch {
    // fail silently — forms will show empty dropdowns
  }
}

/** Force refetch (used after admin edits reference data) */
export async function refreshReferenceData() {
  loaded = false;
  await fetchReferenceData();
}
