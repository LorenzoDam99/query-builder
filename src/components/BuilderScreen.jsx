import { Sidebar } from './ui/Sidebar.jsx'
import { ERDCanvas } from './erd/ERDCanvas.jsx'
import { ConfigPanel } from './config/ConfigPanel.jsx'
import { SQLPanel } from './sql/SQLPanel.jsx'
import { StatusBar } from './layout/StatusBar.jsx'
import { ResizeHandle } from './layout/ResizeHandle.jsx'
import { useUIStore } from '../store/useUIStore.js'
import './BuilderScreen.css'

export function BuilderScreen() {
  const {
    sidebarWidth, setSidebarWidth,
    sqlPanelWidth, setSqlPanelWidth,
    configHeight, setConfigHeight,
    sqlDock,
  } = useUIStore()

  const isDocked = sqlDock === 'docked'

  return (
    <div className="builder">
      <div className="blayout">

        <Sidebar style={{ width: sidebarWidth, minWidth: sidebarWidth }} />

        <ResizeHandle
          direction="h"
          size={sidebarWidth}
          setSize={setSidebarWidth}
          min={150} max={420}
          sign={1}
        />

        <div className="center">
          <ERDCanvas />
          <ResizeHandle
            direction="v"
            size={configHeight}
            setSize={setConfigHeight}
            min={120} max={460}
            sign={-1}
          />
          <ConfigPanel style={{ height: configHeight, minHeight: configHeight }} />
        </div>

        {isDocked && (
          <>
            <ResizeHandle
              direction="h"
              size={sqlPanelWidth}
              setSize={setSqlPanelWidth}
              min={220} max={640}
              sign={-1}
            />
            <SQLPanel style={{ width: sqlPanelWidth, minWidth: sqlPanelWidth }} />
          </>
        )}

        {/* Floating panel renders via portal — no space taken in flex layout */}
        {!isDocked && <SQLPanel />}

      </div>
      <StatusBar />
    </div>
  )
}
