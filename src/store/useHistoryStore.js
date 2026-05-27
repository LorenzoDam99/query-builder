import { create } from 'zustand'

const HISTORY_KEY = 'qb_history_v1'
const MAX = 20

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
}

function saveHistory(entries) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(entries)) } catch {}
}

export const useHistoryStore = create((set, get) => ({
  entries: loadHistory(), // [{ id, ts, dialectId, queryType, code, label }]

  push(entry) {
    const entries = [entry, ...get().entries].slice(0, MAX)
    saveHistory(entries)
    set({ entries })
  },

  remove(id) {
    const entries = get().entries.filter(e => e.id !== id)
    saveHistory(entries)
    set({ entries })
  },

  clear() {
    saveHistory([])
    set({ entries: [] })
  },
}))
