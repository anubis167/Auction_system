# pop-0.1 'Beat it! Look' tokens, fonts and base styles

Source: LOT-POP-Brand-Guidelines.md sections 4-7, 10-12. The site keeps its name Beat'em (user, 2026-11-19).

| File | Change |
|---|---|
| fe/src/styles.css | First `:root` holds exactly the guideline tokens (colour + `-dot` partners, fonts, space-1..8, radius, stroke, shadow); light only (`color-scheme: light`). Every old dark-theme variable reference was rewritten onto a brand token (`--surface` -> `--panel`, `--navy` -> `--ink`, `--primary` -> `--pow-red`, `--steel` -> `--bam-blue`, ...), every `border-radius` except 50% became 0, soft shadows became `--shadow-md`, Mulish/Stardom stacks became `--font-body` / `--font-display`. A 'pop-0.1 base' block at the end sets body (paper, ink, Archivo 17px/1.6/600), Bangers h1-h3, square 3px-outlined buttons/inputs with hard shadows (hover lift, press push), 4px-outlined panels, square badges, toasts, the 3px bam-blue focus ring on every control, and `prefers-reduced-motion` (no transitions/animations). Chart grid/axis/tick greys switched to paper-friendly values. |
| fe/index.html | Loads `Bangers` + `Archivo:wght@400;600;800` from Google Fonts; Mulish and the Fontshare Stardom link removed. Title unchanged. |
| fe/public/logo.svg | Same monkey stamp, pixels remapped to pow-red #D62828 on paper #FFF8E7. |
| e2e/unit/pop-0-1-tokens.test.ts | New: token values, no old tokens/fonts left, WCAG contrast of the text-on-colour pairs. |
| e2e/pop-0-1-base-styles.spec.ts | New: computed paper/ink/Archivo/Bangers, Tab focus ring 3px rgb(29,78,216) offset 3px, square 3px ink button, reduced motion 0s. |

Notes:
- Links are ink with no underline; hover turns them bam-blue and underlined (guideline: bam-blue 'links on hover').
- The old class names stay, so every page keeps working; later pop-* features restyle each area in detail.
