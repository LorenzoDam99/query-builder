import { create } from 'zustand'

export const useUIStore = create((set, get) => ({
  // screens: 'import' | 'builder'
  screen: 'import',
  theme: 'dark',   // 'dark' | 'light'

  // active dialect id
  dialectId: 'sqlserver',

  // ERD state
  zoom: 1,
  panX: 0,
  panY: 0,
  tablePos: {}, // tableName -> {x, y}

  // active config tab: 'cols' | 'joins' | 'where' | 'groupby'
  activePanel: 'cols',

  // resizable panel sizes (px)
  sidebarWidth: 210,
  sqlPanelWidth: 300,
  configHeight: 210,

  // SQL panel dock state: 'docked' | 'floating'
  sqlDock: 'docked',
  floatPos: { x: 0, y: 60 }, // position when floating

  // ERD visibility — names in this set are hidden from canvas
  erdHidden: new Set(),
  // ERD selection — table clicked for relationship highlighting
  erdSelected: null,

  // ERD auto-fit flag — set true after schema load, cleared by ERDCanvas
  needsFit: false,

  // toast
  toast: null,
  _toastTimer: null,

  setScreen(screen) { set({ screen }) },
  setTheme(t) { set({ theme: t }) },

  clearNeedsFit() { set({ needsFit: false }) },

  setDialect(id) { set({ dialectId: id }) },

  setActivePanel(p) { set({ activePanel: p }) },

  setSidebarWidth(w) { set({ sidebarWidth: w }) },
  setSqlPanelWidth(w) { set({ sqlPanelWidth: w }) },
  setConfigHeight(h) { set({ configHeight: h }) },
  setSqlDock(dock) { set({ sqlDock: dock }) },
  setFloatPos(pos) { set({ floatPos: pos }) },

  toggleErdHidden(name) {
    const next = new Set(get().erdHidden)
    if (next.has(name)) next.delete(name); else next.add(name)
    set({ erdHidden: next })
  },
  showAllErd()         { set({ erdHidden: new Set() }) },
  hideAllErd(tables)   { set({ erdHidden: new Set(Object.keys(tables)) }) },

  setErdSelected(name) {
    set({ erdSelected: get().erdSelected === name ? null : name })
  },
  clearErdSelected()   { set({ erdSelected: null }) },

  setZoomPan(zoom, panX, panY) { set({ zoom, panX, panY }) },

  setTablePos(name, x, y) {
    set({ tablePos: { ...get().tablePos, [name]: { x, y } } })
  },

  initTablePositions(tables) {
    const existing = get().tablePos
    const names = Object.keys(tables)
    const cols = Math.ceil(Math.sqrt(names.length)) || 1
    const W = 220, H = 40
    const next = { ...existing }
    names.forEach((n, i) => {
      if (!next[n]) {
        const col = i % cols, row = Math.floor(i / cols)
        const colH = tables[n].cols.length
        next[n] = { x: 30 + col * (W + 40), y: 30 + row * (colH * 18 + H + 40) }
      }
    })
    set({ tablePos: next })
  },

  resetLayout(tables) {
    const names = Object.keys(tables)
    const cols = Math.ceil(Math.sqrt(names.length)) || 1
    const W = 220, H = 40
    const next = {}
    names.forEach((n, i) => {
      const col = i % cols, row = Math.floor(i / cols)
      const colH = tables[n].cols.length
      next[n] = { x: 30 + col * (W + 40), y: 30 + row * (colH * 18 + H + 40) }
    })
    set({ tablePos: next })
  },

  showToast(msg) {
    const timer = get()._toastTimer
    if (timer) clearTimeout(timer)
    const id = setTimeout(() => set({ toast: null, _toastTimer: null }), 2500)
    set({ toast: msg, _toastTimer: id })
  },
}))
