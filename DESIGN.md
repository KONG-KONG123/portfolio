# 空空Studio Portfolio DESIGN.md

## Visual Theme & Atmosphere

Premium 3C product portfolio with a dark gallery-first canvas. The UI should feel calm, technical, and editorial: product visuals lead, interface chrome stays quiet, and motion/hover states are precise instead of decorative.

## Color Palette & Roles

- `#050505` / Studio Black: primary background.
- `#f7f7f2` / Gallery White: primary text and high-priority actions.
- `#9aa4b2` / Soft Graphite: secondary copy.
- `#2f7cff` / Electric Blue: active navigation, focus rings, signature accent.
- `#d8dde6` / Cool Silver: borders and low-contrast dividers.

## Typography Rules

- Use a neutral sans stack: Inter, system UI, PingFang SC, Microsoft YaHei.
- Keep letter spacing at `0`; rely on font weight, spacing, and scale for hierarchy.
- Hero titles are monumental but restrained. Section titles should be readable before expressive.
- Chinese and English text should remain compact, with line heights around `1.55` to `1.85` depending on size.

## Component Styling

- Buttons: compact, icon-aligned, high-contrast hover, minimum touch height `44px`.
- Cards: 8px radius, thin borders, image-first composition, no nested card surfaces.
- Navigation: quiet fixed header, active state shown by color and subtle underline.
- Modals: dark focused surface, strong media area, readable metadata, scrollable content.

## Layout Principles

- Use a wide editorial grid, max visual content around `1740px`.
- Keep section rhythm generous on desktop and compact on mobile.
- Let images and videos carry the portfolio; labels and stats should support scanning.
- Avoid large decorative blobs. Use only restrained gradients and technical lines.

## Responsive Behavior

- Mobile header becomes a simple sticky bar.
- Work cards use a two-column compact grid on small screens, with featured work full-width.
- Carousels stay horizontally scrollable with stable snap sizing.
- Text must not overlap media or controls; use fixed breakpoints rather than viewport-scaled type where possible.
