// Shared application state + tiny helpers used by every module.
export const state = {
  user: null,          // Firebase Auth user
  profile: null,       // users/{uid} document data
  isAdmin: false,       // true for any staff role
  adminRole: null,      // 'super_admin' | 'admin' | 'moderator' | null
  site: {},             // settings/global (maintenance flag, etc.)
  announcements: [],    // active site announcements
  friends: new Set(),  // uids of friends
  following: new Set(),// uids I follow
  saved: new Set(),    // post ids I saved
  incomingRequests: [],// friendRequests addressed to me
  chats: [],           // my chats (newest first), live
  unreadNotifs: 0,
  unreadChats: 0,
  cleanups: [],        // listeners of the current page
  globalUnsubs: []     // listeners that live as long as the session
};

export function onCleanup(fn) {
  state.cleanups.push(fn);
}

export function runCleanups() {
  for (const fn of state.cleanups.splice(0)) {
    try { fn(); } catch (e) { console.warn(e); }
  }
}

export function navigate(path) {
  location.hash = '#' + path;
}

// Tiny pub/sub so the shell can refresh badges when state changes.
const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit() { for (const fn of listeners) try { fn(); } catch (e) { console.warn(e); } }
