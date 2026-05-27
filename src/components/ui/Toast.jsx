import { useUIStore } from '../../store/useUIStore.js'
import './Toast.css'

export function Toast() {
  const toast = useUIStore(s => s.toast)
  return <div className={`toast${toast ? ' show' : ''}`}>{toast}</div>
}
