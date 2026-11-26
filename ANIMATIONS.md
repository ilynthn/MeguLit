# Animation contract

Values inventoried from the existing custom code and original host before replacement. Source evidence is in `preserved/`. No generic full-page fade was found, so none was invented.

| Scene | Contract |
|---|---|
| Startup island | 220ms fade; expansion after 90ms over 600ms; cubic ease-out; minimum 850ms; completion stages unchanged |
| First main-window display | Start 390ms after island readiness, alpha 420ms, restore temporary layered styles |
| Normal → reading mode | Main collapses toward bottom to 6% over 240ms; reader enters over 300ms; orchestration 260/320ms |
| Reading → normal | Reader scale .90 + fade 180ms; main grows from 6% over 340ms; orchestration 200/380ms |
| Alt+T / LOG | scaleY .03 → 1 over 300ms, cubic-bezier(.16,1,.3,1); exit 170ms; content appears after first 35% |
| Panel drag | scale 1.006 over 160ms; release 200ms |
| Custom lookup | translateY 6px, scale .985 → 1 over 140ms; child fade 110ms; WAAPI takes precedence over inactive CSS |
| Responsive wrapping | Position compensation over 220ms, cubic-bezier(.2,.8,.2,1), only for actual row changes on resize |
| Sidebar / tooltip | 150ms button colors; 120ms tooltip opacity and shift |
| General old-host modal | 150ms scrim; scale .94 + translateY 10px over 200ms |
| Existing delete dialog | 160ms, translateY 7px + scale .985 |
| Library scan dialog | 180ms scrim; scale .96 → 1 over 280ms |
| Toast / session / tooltip | 150ms y12 / 180ms y10 / 120ms y6 respectively |
| Toggle / details / dropdown | 180ms / 200ms / 140ms |
| Alt+T capsule (#1138) | One clip-path morph per style: open 420ms expo.out, close 280ms power3.out, idle 500ms power2.out; labels stagger 26ms in (3–6px), exit 100ms; drop snap 400ms expo.out; reposition is a 140ms fade out / in, never a slide over the text. Region grows before opening, shrinks after closing. Reduced motion: no tweens |
| Typewriter | Per-game saved speed; ruby synchronized with the associated characters, not after full text |

Native surface readiness is part of the contract: region acknowledgment, matching DPI viewport, two stable animation frames, 700ms fallback, 150ms poll. CSS timing alone is insufficient. Retain E148 glass alpha and complete-rectangle reporting during opening/closing; do not restore E145/E147 multiple-capture designs.
