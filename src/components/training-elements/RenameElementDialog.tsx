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
import type { TrainingElement } from "@/types";

interface Props {
  dogId: string;
  element: TrainingElement;
  onRenamed: (element: TrainingElement) => void;
}

export function RenameElementDialog({ dogId, element, onRenamed }: Props) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(element.name);
  const [loading, setLoading] = React.useState(false);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      // Re-sync to the current name every time the dialog opens, so a
      // previously-cancelled edit doesn't linger.
      setName(element.name);
    }
    setOpen(next);
  };

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/dog/${dogId}/elements/${element.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.status === 401) {
        window.location.href = "/auth/signin";
        return; // stay loading — navigating away
      }
      const data = (await res.json()) as { success?: boolean; element?: TrainingElement; error?: string };
      if (data.success && data.element) {
        onRenamed(data.element);
        setOpen(false);
        setLoading(false);
        return;
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
        <Button variant="ghost" size="icon" aria-label={`Rename ${element.name}`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename element</DialogTitle>
            <DialogDescription>
              Choose a new name for &ldquo;
              <span className="inline-block max-w-40 truncate align-bottom">{element.name}</span>
              &rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label htmlFor={`rename-element-name-${element.id}`} className="sr-only">
              Element name
            </label>
            <Input
              id={`rename-element-name-${element.id}`}
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
