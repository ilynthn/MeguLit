if (window === window.top) {
  window.megulitYuiStage = stage => window.__TAURI_INTERNALS__?.invoke('yui_stage', {stage}).catch(() => {})
  /* 2026-11-26 (#1090) the kind of a rejection is sent (a service error code, a cancelled animation or fetch, anything else);
     its first script location stays in this PC's Yui log (yui_detail), never in the automatic report */
  const detail = (stage, reason) => {
    try {
      let kind = typeof reason, text = ''
      if (reason instanceof Error || reason && typeof reason === 'object' && 'message' in reason) {
        kind = String(reason.name || 'Error')
        text = String(reason.message || '').slice(0, 100)
        const at = /(?:https?:\/\/[^/\s)]+)?\/([\w./-]+\.m?js):(\d+):(\d+)/.exec(String(reason.stack || ''))
        if (at) text += ' @' + at[1].split('/').slice(-2).join('/') + ':' + at[2] + ':' + at[3]
      } else if (typeof reason === 'string') text = /^[A-Z][A-Z0-9_]{2,60}$/.test(reason) ? reason : 'text(' + reason.length + ')'
      text = text.replace(/[A-Za-z]:[\\/][^\s'"]*/g, '<path>').replace(/\b(?:Users|home)[\\/][^\s'"]*/g, '<path>')
      window.__TAURI_INTERNALS__?.invoke('yui_detail', {stage, detail: kind + ' ' + text}).catch(() => {})
    } catch {}
  }
  const rejectionStage = reason => {
    if (reason && typeof reason === 'object' && reason.name === 'AbortError') return 'frontend-rejection-abort'
    const code = typeof reason === 'string' ? reason : reason instanceof Error ? reason.message : ''
    if (/^(SERVICE_[A-Z_]+|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)$/.test(String(code || ''))) return 'frontend-rejection-service'
    return 'frontend-rejection'
  }
  window.addEventListener('error', event => {window.megulitYuiStage('frontend-error'); detail('frontend-error', event.error || {name: 'Error', message: event.message, stack: (event.filename || '') + ':' + event.lineno + ':' + event.colno})})
  window.addEventListener('unhandledrejection', event => {const stage = rejectionStage(event.reason); window.megulitYuiStage(stage); detail(stage, event.reason)})
  window.addEventListener('DOMContentLoaded', () => window.megulitYuiStage('document'), {once:true})
}
