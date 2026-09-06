import type { ScreenRect } from './framing';

export interface DebugState {
  progress: number;
  rect: ScreenRect;
  viewportWidth: number;
  viewportHeight: number;
}

export interface DebugOverlay {
  setSummary(lines: string[]): void;
  update(state: DebugState): void;
  destroy(): void;
}

/**
 * Development instrumentation, enabled with `?debug=1`. Reports the live
 * framing percentages and outlines the drawer's projected rectangle, and warns
 * once if the drawer ever leaves the viewport after it has started opening.
 */
export function createDebugOverlay(host: HTMLElement): DebugOverlay {
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:absolute',
    'left:12px',
    'top:12px',
    'z-index:10',
    'padding:10px 12px',
    'font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace',
    'color:#f4ede4',
    'background:rgba(0,0,0,.62)',
    'border:1px solid rgba(244,237,228,.22)',
    'border-radius:4px',
    'white-space:pre',
    'pointer-events:none',
  ].join(';');

  const outline = document.createElement('div');
  outline.style.cssText = [
    'position:absolute',
    'z-index:9',
    'border:1px dashed rgba(120,220,255,.85)',
    'pointer-events:none',
  ].join(';');

  host.appendChild(panel);
  host.appendChild(outline);

  let summary: string[] = [];
  let warned = false;

  return {
    setSummary(lines) {
      summary = lines;
    },
    update({ progress, rect, viewportWidth, viewportHeight }) {
      const w = (rect.width / viewportWidth) * 100;
      const h = (rect.height / viewportHeight) * 100;

      outline.style.left = `${rect.left}px`;
      outline.style.top = `${rect.top}px`;
      outline.style.width = `${rect.width}px`;
      outline.style.height = `${rect.height}px`;

      const offscreen =
        rect.left < 0 ||
        rect.top < 0 ||
        rect.left + rect.width > viewportWidth ||
        rect.top + rect.height > viewportHeight;

      // The drawer must stay in view from the moment it starts opening.
      if (!warned && offscreen && progress >= 0.4) {
        warned = true;
        // eslint-disable-next-line no-console
        console.warn(
          `[desk] drawer left the viewport at progress ${progress.toFixed(3)}`,
          rect,
        );
      }

      panel.textContent = [
        ...summary,
        `progress   ${progress.toFixed(3)}`,
        `drawer now ${w.toFixed(1)}% x ${h.toFixed(1)}%`,
        offscreen ? 'drawer     OFF SCREEN' : 'drawer     in view',
      ].join('\n');
    },
    destroy() {
      panel.remove();
      outline.remove();
    },
  };
}
