import * as React from "react";
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

interface Props {
  dogId: string;
  dogName: string;
}

export function DeleteDogModal({ dogId, dogName }: Props) {
  // Swap the server-rendered placeholder for the live dialog trigger before
  // the first browser paint. The island wrapper starts hidden so it takes no
  // space — no double-button flash is possible.
  React.useLayoutEffect(() => {
    document.getElementById("delete-dog-placeholder")?.remove();
    document.getElementById("delete-dog-island")?.removeAttribute("hidden");
  }, []);

  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const handleConfirm = async (e: React.MouseEvent) => {
    // Prevent AlertDialog from closing immediately while fetch is in flight
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/dog/${dogId}`, { method: "DELETE" });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (data.success) {
        sessionStorage.setItem("flash", JSON.stringify({ type: "success", message: "Dog deleted successfully" }));
        window.location.href = "/dashboard";
      } else {
        setOpen(false);
        setLoading(false);
        toast.error(data.error ?? "Failed to delete dog");
      }
    } catch {
      setOpen(false);
      setLoading(false);
      toast.error("Failed to delete dog");
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete dog</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {dogName}?</AlertDialogTitle>
          <AlertDialogDescription>Are you sure you want to delete {dogName}?</AlertDialogDescription>
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
