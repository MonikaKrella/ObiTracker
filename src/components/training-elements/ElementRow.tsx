import type * as React from "react";
import { GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { RenameElementDialog } from "@/components/training-elements/RenameElementDialog";
import { DeleteElementDialog } from "@/components/training-elements/DeleteElementDialog";
import { cn } from "@/lib/utils";
import type { TrainingElement } from "@/types";

interface Props {
  dogId: string;
  element: TrainingElement;
  onRenamed: (element: TrainingElement) => void;
  onDeleted: (elementId: string) => void;
}

export function ElementRow({ dogId, element, onRenamed, onDeleted }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: element.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white",
        isDragging && "z-10 opacity-50",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${element.name}`}
          className="cursor-grab touch-none text-blue-100/40 hover:text-white active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <span className="truncate">{element.name}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <RenameElementDialog dogId={dogId} element={element} onRenamed={onRenamed} />
        <DeleteElementDialog dogId={dogId} element={element} onDeleted={onDeleted} />
      </div>
    </li>
  );
}
