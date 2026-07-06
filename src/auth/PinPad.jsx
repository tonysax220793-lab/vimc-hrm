import React from 'react'

export default function PinPad({ onDigit, onBackspace }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace']

  const press = (k) => {
    if (navigator.vibrate) navigator.vibrate(10) // haptic feedback
    if (k === 'backspace') {
      onBackspace()
    } else if (k !== '') {
      onDigit(k)
    }
  }

  return (
    <div className="grid grid-cols-3 gap-x-6 gap-y-4 pt-4">
      {keys.map((k, i) => {
        if (k === '') {
          return <div key={i} />
        }
        if (k === 'backspace') {
          return (
            <button
              key={i}
              className="w-14 h-14 mx-auto flex items-center justify-center text-outline hover:text-alert-fire transition-colors"
              onClick={() => press(k)}
              type="button"
            >
              <span className="material-symbols-outlined">backspace</span>
            </button>
          )
        }
        return (
          <button
            key={i}
            className="pin-btn w-14 h-14 mx-auto rounded-full bg-surface-container-low text-charcoal-ink font-headline-md text-headline-md flex items-center justify-center transition-all duration-150"
            onClick={() => press(k)}
            type="button"
          >
            {k}
          </button>
        )
      })}
    </div>
  )
}

