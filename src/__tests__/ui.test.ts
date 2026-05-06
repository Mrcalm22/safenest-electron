import { describe, it, expect, vi, beforeEach } from 'vitest'
import { escapeHtml, escapeJs, formatDateTime, showToast } from '../renderer/modules/ui'

describe('escapeHtml', () => {
  it('returns empty string for falsy input', () => {
    expect(escapeHtml('')).toBe('')
    expect(escapeHtml(undefined as unknown as string)).toBe('')
  })

  it('escapes special characters', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;')
    expect(escapeHtml("It's a test")).toBe('It&#39;s a test')
    expect(escapeHtml('a & b')).toBe('a &amp; b')
  })

  it('returns plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world')
    expect(escapeHtml('123')).toBe('123')
  })
})

describe('escapeJs', () => {
  it('returns empty string for falsy input', () => {
    expect(escapeJs('')).toBe('')
    expect(escapeJs(undefined as unknown as string)).toBe('')
  })

  it('escapes single and double quotes', () => {
    expect(escapeJs("it's")).toBe("it\\'s")
    expect(escapeJs('say "hello"')).toBe('say \\"hello\\"')
  })
})

describe('formatDateTime', () => {
  it('formats timestamp correctly', () => {
    const timestamp = new Date(2024, 0, 15, 9, 5).getTime()
    expect(formatDateTime(timestamp)).toBe('2024-01-15 09:05')
  })

  it('pads single digit values', () => {
    const timestamp = new Date(2024, 10, 3, 4, 7).getTime()
    expect(formatDateTime(timestamp)).toBe('2024-11-03 04:07')
  })
})

describe('showToast', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="toast"></div>'
    vi.useFakeTimers()
  })

  it('shows and hides toast after 2 seconds', () => {
    showToast('test message')
    const toast = document.getElementById('toast') as HTMLDivElement
    expect(toast.textContent).toBe('test message')
    expect(toast.classList.contains('show')).toBe(true)

    vi.advanceTimersByTime(2000)
    expect(toast.classList.contains('show')).toBe(false)
  })
})
