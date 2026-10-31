import type { Fault } from "../../lib/engine/faults";

/** The `dev` overlay on a frame: the step, the selector and the fix. Production builds render none. */
export function DevFault({ fault }: { fault: Fault }) {
  return (
    <aside className="dev-fault" role="alert">
      <p className="dev-fault__title">{fault.title}</p>
      <p className="dev-fault__detail">{fault.detail}</p>
      <p className="dev-fault__fix">{fault.fix}</p>
    </aside>
  );
}
