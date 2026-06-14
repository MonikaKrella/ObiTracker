import { RenameElementDialog } from "@/components/training-elements/RenameElementDialog";
import { DeleteElementDialog } from "@/components/training-elements/DeleteElementDialog";
import type { TrainingElement } from "@/types";

interface Props {
  dogId: string;
  element: TrainingElement;
  onRenamed: (element: TrainingElement) => void;
  onDeleted: (elementId: string) => void;
}

export function ElementRow({ dogId, element, onRenamed, onDeleted }: Props) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
      <span className="truncate">{element.name}</span>
      <div className="flex shrink-0 items-center gap-1">
        <RenameElementDialog dogId={dogId} element={element} onRenamed={onRenamed} />
        <DeleteElementDialog dogId={dogId} element={element} onDeleted={onDeleted} />
      </div>
    </li>
  );
}
