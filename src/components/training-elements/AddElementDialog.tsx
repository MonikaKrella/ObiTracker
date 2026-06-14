import * as React from "react";
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
  onAdded: (element: TrainingElement) => void;
}

export function AddElementDialog({ dogId, onAdded }: Props) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setName("");
    }
    setOpen(next);
  };

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/dog/${dogId}/elements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.status === 401) {
        window.location.href = "/auth/signin";
        return; // stay loading — navigating away
      }
      const data = (await res.json()) as { success?: boolean; element?: TrainingElement; error?: string };
      if (data.success && data.element) {
        onAdded(data.element);
        setName("");
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
        <Button>Add element</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add training element</DialogTitle>
            <DialogDescription>Give the new element a name. It will be added to the end of the list.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label htmlFor="add-element-name" className="sr-only">
              Element name
            </label>
            <Input
              id="add-element-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              maxLength={100}
              placeholder="e.g. Heelwork"
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
