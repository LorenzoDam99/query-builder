import { useRef } from 'react'
import './ResizeHandle.css'

/**
 * direction: 'h' (horizontal — resizes width) | 'v' (vertical — resizes height)
 * size:      current panel size in px
 * setSize:   setter callback (receives new size)
 * min/max:   clamp range
 * sign:      +1 or -1 — positive delta grows the panel (+1 = drag right/down to grow, -1 = drag left/up to grow)
 */
export function ResizeHandle({ direction, size, setSize, min = 100, max = 800, sign = 1 }) {
  const isDragging = useRef(false)

  function handleMouseDown(e) {
    if (e.button !== 0) return
    e.preventDefault()
    isDragging.current = true
    const axis = direction === 'h' ? 'clientX' : 'clientY'
    const start = e[axis]
    const startSize = size
    const handle = e.currentTarget

    handle.classList.add('rh-active')
    document.body.style.cursor = direction === 'h' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'

    function onMouseMove(e) {
      const delta = (e[axis] - start) * sign
      setSize(Math.max(min, Math.min(max, startSize + delta)))
    }

    function onMouseUp() {
      isDragging.current = false
      handle.classList.remove('rh-active')
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div
      className={`rh rh-${direction}`}
      onMouseDown={handleMouseDown}
      title="Trascina per ridimensionare"
    />
  )
}
