// user.svelte.ts
import type { User } from "../types/User"

let currentUser: User | null = $state(null)

export function getCurrentUser() {
  return currentUser
}

export function setCurrentUser(user: User | null) {
  currentUser = user
}


export let sidebarOpen = false
