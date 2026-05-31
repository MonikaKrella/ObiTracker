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
  const [mounted, setMounted] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

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

  // SSR pass: render only the trigger button — identical appearance, no Radix
  // hooks → no crash. Replaced by the full dialog on the first client render.
  if (!mounted) {
    return <Button variant="destructive">Delete dog</Button>;
  }

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
