import { create } from 'zustand'

const FAV_KEY = 'qb_favorites_v1'
const MAX = 50

function load() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]') } catch { return [] }
}
function save(entries) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(entries)) } catch {}
}

export const useFavoritesStore = create((set, get) => ({
  entries: load(), // [{ id, ts, name, code, dialectId, queryType }]

  add(name, code, dialectId, queryType) {
    const entry = {
      id: Date.now(),
      ts: new Date().toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      name: name.trim() || code.split('\n')[0].slice(0, 50),
      code,
      dialectId,
      queryType,
    }
    const next = [entry, ...get().entries].slice(0, MAX)
    save(next)
    set({ entries: next })
  },

  remove(id) {
    const next = get().entries.filter(e => e.id !== id)
    save(next)
    set({ entries: next })
  },

  rename(id, name) {
    const next = get().entries.map(e => e.id === id ? { ...e, name: name.trim() || e.name } : e)
    save(next)
    set({ entries: next })
  },

  clear() {
    save([])
    set({ entries: [] })
  },
}))
