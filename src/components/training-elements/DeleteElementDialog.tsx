import * as React from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { TrainingElement } from "@/types";

interface Props {
  dogId: string;
  element: TrainingElement;
  onDeleted: (elementId: string) => void;
}

export function DeleteElementDialog({ dogId, element, onDeleted }: Props) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const handleConfirm = async (e: React.MouseEvent) => {
    // Prevent AlertDialog from closing immediately while the fetch is in flight.
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/dog/${dogId}/elements/${element.id}`, { method: "DELETE" });
      if (res.status === 401) {
        window.location.href = "/auth/signin";
        return; // stay loading — navigating away
      }
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (data.success) {
        onDeleted(element.id);
        setOpen(false);
        setLoading(false);
        return;
      }
      setOpen(false);
      setLoading(false);
      toast.error(data.error ?? "Failed to delete element");
    } catch {
      setOpen(false);
      setLoading(false);
      toast.error("Failed to delete element");
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="icon" aria-label={`Delete ${element.name}`}>
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete &ldquo;
            <span className="inline-block max-w-40 truncate align-bottom">{element.name}</span>
            &rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription>
            All training history logged for this element will be permanently deleted. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
