import * as React from "react";
import { useMounted } from "@/components/hooks/useMounted";
import { AddElementDialog } from "@/components/training-elements/AddElementDialog";
import { ElementRow } from "@/components/training-elements/ElementRow";
import type { TrainingElement } from "@/types";

interface Props {
  dogId: string;
  initialElements: TrainingElement[];
}

/**
 * Main island for `/dogs/[id]/elements`. Before hydration (and during SSR)
 * renders the same static list as the server-rendered shell so there is no
 * layout shift, then swaps to the interactive list (with Add/Rename/Delete
 * controls) once mounted. Reorder UI is added in Phase 4.
 */
export function TrainingElementsManager({ dogId, initialElements }: Props) {
  const [elements, setElements] = React.useState(initialElements);
  const mounted = useMounted();

  const handleAdded = (element: TrainingElement) => {
    setElements((prev) => [...prev, element]);
  };

  const handleRenamed = (element: TrainingElement) => {
    setElements((prev) => prev.map((e) => (e.id === element.id ? element : e)));
  };

  const handleDeleted = (elementId: string) => {
    setElements((prev) => prev.filter((e) => e.id !== elementId));
  };

  if (!mounted) {
    return elements.length === 0 ? (
      <p className="text-sm text-blue-100/40">No training elements yet.</p>
    ) : (
      <ul className="space-y-2">
        {elements.map((element) => (
          <li key={element.id} className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
            {element.name}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-4">
      {elements.length === 0 ? (
        <p className="text-sm text-blue-100/40">No training elements yet.</p>
      ) : (
        <ul className="space-y-2">
          {elements.map((element) => (
            <ElementRow
              key={element.id}
              dogId={dogId}
              element={element}
              onRenamed={handleRenamed}
              onDeleted={handleDeleted}
            />
          ))}
        </ul>
      )}
      <AddElementDialog dogId={dogId} onAdded={handleAdded} />
    </div>
  );
}
