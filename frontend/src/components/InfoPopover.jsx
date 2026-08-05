// The ⓘ next to a feature name, and the short plain-language panel it opens.
//
// Extracted from the AI Safety Score card so every "what is this?" on the
// employee side looks and behaves identically: same 24px ring, same 44px touch
// target, same white panel, and the same three ways out (×, Escape, a click
// outside). Nothing about the visual language is new — this is the safety-score
// popover, reused rather than re-drawn.
//
// `side` follows the card the icon sits in: 'left' opens rightwards from the
// icon (a full-width card), 'right' opens leftwards (a right-hand rail, where
// opening rightwards would run off the window). Below sm it is always a centred
// sheet over a dimmed page, because a 380px panel cannot be anchored usefully
// to a 24px icon on a phone.
import { useEffect, useRef, useState } from 'react'

// Hovering is only offered to devices that actually hover. On a touch screen
// a tap synthesises mouseenter, which would open the panel and then leave it
// with no way to close it by "moving away" — so there, tap-to-toggle stays the
// only interaction.
const canHover = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches === true

export default function InfoPopover({ label, title, children, side = 'left', tone = 'dark' }) {
  // Two independent reasons to be open, so a pointer leaving cannot dismiss a
  // panel the user deliberately clicked open, and a click cannot leave one
  // stuck open after the pointer has gone.
  const [hovering, setHovering] = useState(false)
  const [pinned, setPinned] = useState(false)
  const wrap = useRef(null)
  const open = hovering || pinned

  const close = () => { setHovering(false); setPinned(false) }

  useEffect(() => {
    if (!open) return undefined
    const onKey = e => { if (e.key === 'Escape') close() }
    const onDown = e => { if (!wrap.current?.contains(e.target)) close() }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  // The panel is a DOM child of this wrapper, so mouseleave does not fire while
  // the pointer is over the panel itself — the explanation stays put while it is
  // being read, and closes once the pointer leaves icon and panel together.
  const hoverProps = canHover()
    ? { onMouseEnter: () => setHovering(true), onMouseLeave: () => setHovering(false) }
    : {}

  // On navy cards the ring is light; on cream/white ones it needs the ink colours.
  const ring = tone === 'dark'
    ? 'border-[#4a6bb0] text-[#cdd7ee] hover:bg-[#173976] hover:text-white'
    : 'border-[#a9b0bf] text-[#667085] hover:bg-chip hover:text-navy-header'

  const anchor = side === 'right' ? 'sm:left-auto sm:right-0' : 'sm:left-0 sm:right-auto'

  return (
    <span className="relative inline-flex" ref={wrap} {...hoverProps}>
      {/* The ring stays 24px; the padding (cancelled by the matching negative
          margin, so nothing moves) gives it a 44px touch target. */}
      <button
        onClick={() => setPinned(p => !p)}
        aria-expanded={open}
        aria-label={label}
        className="p-2.5 -m-2.5 rounded-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-brand"
      >
        <span className={`w-6 h-6 rounded-full border text-[11px] font-bold flex items-center justify-center ${ring}`}>i</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-navy-dark/50 z-40 sm:hidden" aria-hidden="true" />
          <div
            role="dialog"
            aria-label={label}
            className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] max-w-[380px] max-h-[80vh] overflow-y-auto z-50
                        sm:absolute sm:top-8 sm:translate-x-0 sm:translate-y-0 sm:w-[380px] sm:max-w-none sm:max-h-[70vh] ${anchor}
                        bg-white border-[1.5px] border-navy-header rounded-[16px] shadow-[0px_10px_30px_rgba(0,0,0,0.22)] p-5`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-navy-header font-bold text-[15px]">{title}</p>
              <button
                onClick={close}
                aria-label="Close"
                className="w-11 h-11 sm:w-8 sm:h-8 -mt-2.5 -mr-2.5 sm:-mt-1 sm:-mr-1 rounded-full text-[#667085] text-lg leading-none cursor-pointer hover:bg-chip shrink-0 flex items-center justify-center"
              >
                ×
              </button>
            </div>
            {children}
          </div>
        </>
      )}
    </span>
  )
}

/** A "term — meaning" bullet list, the shape every explanation panel uses. */
export function InfoList({ heading, items }) {
  return (
    <div className="mt-4">
      {heading && <p className="text-[#8a7d56] font-semibold text-[11px] tracking-wide">{heading.toUpperCase()}</p>}
      <ul className="mt-2 flex flex-col gap-2">
        {items.map(([term, rest]) => (
          <li key={term} className="text-[#667085] text-[12.5px] leading-relaxed flex gap-2">
            <span className="text-gold-brand shrink-0" aria-hidden="true">·</span>
            <span><span className="text-navy-header font-semibold">{term}</span>{rest ? <> — {rest}</> : null}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The pale blue "what to do" footer used at the end of a panel. */
export function InfoNote({ title, children }) {
  return (
    <div className="bg-[#eef2ff] rounded-[10px] px-3.5 py-3 mt-4">
      <p className="text-navy-header font-semibold text-[12.5px]">{title}</p>
      <p className="text-[#667085] text-[12.5px] mt-1 leading-relaxed">{children}</p>
    </div>
  )
}
