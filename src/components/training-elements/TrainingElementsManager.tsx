import * as React from "react";
import { toast } from "sonner";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMounted } from "@/components/hooks/useMounted";
import { Button } from "@/components/ui/button";
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
 * controls and drag-to-reorder) once mounted.
 */
export function TrainingElementsManager({ dogId, initialElements }: Props) {
  const [elements, setElements] = React.useState(initialElements);
  const [saving, setSaving] = React.useState(false);
  const mounted = useMounted();

  // Last-persisted order, kept separate from `elements` (current displayed
  // state). A drag changes `elements` but not this state, so "Save order"
  // appears. Add/delete update both, so they never trigger a false-dirty
  // state. Rename never changes order, so it never touches either.
  const [originalOrder, setOriginalOrder] = React.useState(initialElements.map((e) => e.id));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleAdded = (element: TrainingElement) => {
    setElements((prev) => [...prev, element]);
    setOriginalOrder((prev) => [...prev, element.id]);
  };

  const handleRenamed = (element: TrainingElement) => {
    setElements((prev) => prev.map((e) => (e.id === element.id ? element : e)));
  };

  const handleDeleted = (elementId: string) => {
    setElements((prev) => prev.filter((e) => e.id !== elementId));
    setOriginalOrder((prev) => prev.filter((id) => id !== elementId));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setElements((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const isDirty = elements.map((e) => e.id).join(",") !== originalOrder.join(",");

  const handleSaveOrder = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/dog/${dogId}/elements/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elementIds: elements.map((e) => e.id) }),
      });
      if (res.status === 401) {
        window.location.href = "/auth/signin";
        return; // stay loading — navigating away
      }
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (data.success) {
        setOriginalOrder(elements.map((e) => e.id));
        toast.success("Order saved");
        setSaving(false);
        return;
      }
      toast.error(data.error ?? "Failed to save order");
      setSaving(false);
    } catch {
      toast.error("Failed to save order");
      setSaving(false);
    }
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={elements.map((e) => e.id)} strategy={verticalListSortingStrategy}>
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
          </SortableContext>
        </DndContext>
      )}
      <div className="flex items-center gap-3">
        <AddElementDialog dogId={dogId} onAdded={handleAdded} />
        {isDirty && (
          <Button onClick={handleSaveOrder} disabled={saving}>
            {saving ? "Saving…" : "Save order"}
          </Button>
        )}
      </div>
    </div>
  );
}
