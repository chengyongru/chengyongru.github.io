export const TERMINAL_GEOMETRY_EVENT = "terminal:geometry";

export interface TerminalGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
  interacting: boolean;
}

export function emitTerminalGeometry(geometry: TerminalGeometry): void {
  window.dispatchEvent(
    new CustomEvent<TerminalGeometry>(TERMINAL_GEOMETRY_EVENT, {
      detail: geometry,
    }),
  );
}
