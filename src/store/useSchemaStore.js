import { create } from 'zustand'

export const useSchemaStore = create((set) => ({
  tables: {},
  relationships: [],

  // Base schema for migration diff (step 6)
  baseSchema: null,  // null = not loaded; { tables, relationships } when loaded

  setSchema({ tables, relationships }) {
    set({ tables, relationships })
  },

  setBaseSchema({ tables, relationships }) {
    set({ baseSchema: { tables, relationships } })
  },

  clearBaseSchema() {
    set({ baseSchema: null })
  },

  reset() {
    set({ tables: {}, relationships: [], baseSchema: null })
  },
}))
