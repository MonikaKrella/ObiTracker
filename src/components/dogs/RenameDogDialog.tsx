import * as React from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
  dogId: string;
  dogName: string;
}

export function RenameDogDialog({ dogId, dogName }: Props) {
  // Swap the server-rendered placeholder for the live dialog trigger before
  // the first browser paint. The island wrapper starts hidden so it takes no
  // space — no double-button flash is possible.
  React.useLayoutEffect(() => {
    document.getElementById("rename-dog-placeholder")?.remove();
    document.getElementById("rename-dog-island")?.removeAttribute("hidden");
  }, []);

  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(dogName);
  const [loading, setLoading] = React.useState(false);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      // Re-sync to the current name every time the dialog opens, so a
      // previously-cancelled edit doesn't linger.
      setName(dogName);
    }
    setOpen(next);
  };

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/dog/${dogId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.status === 401) {
        window.location.href = "/auth/signin";
        return; // stay loading — navigating away
      }
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (data.success) {
        window.location.reload();
        return; // stay loading — reloading
      }
      toast.error(data.error ?? "Something went wrong — please try again");
      setLoading(false);
    } catch {
      toast.error("Something went wrong — please try again");
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Rename ${dogName}`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename dog</DialogTitle>
            <DialogDescription>
              Choose a new name for &ldquo;
              <span className="inline-block max-w-40 truncate align-bottom">{dogName}</span>
              &rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label htmlFor="rename-dog-name" className="sr-only">
              Dog name
            </label>
            <Input
              id="rename-dog-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              maxLength={100}
              required
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={loading}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
