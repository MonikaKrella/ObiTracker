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
import type { Competition } from "@/types";

interface Props {
  dogId: string;
  classNumber: number;
  onAdded: (competition: Competition) => void;
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Mirrors `AddElementDialog.tsx`'s dialog/form/loading/toast structure
 * exactly (user-confirmed preference over an inline column-add interaction).
 *
 * No 401 → /auth/signin redirect here: this is a modal only reachable from
 * within an already-loaded, already-protected page, not a standalone route
 * — the documented exception to the 401-redirect lesson applies (see
 * context/foundation/lessons.md). A 401 falls through to the generic toast.
 */
export function AddCompetitionDialog({ dogId, classNumber, onAdded }: Props) {
  const [open, setOpen] = React.useState(false);
  const [competedOn, setCompetedOn] = React.useState(todayUtcDate);
  const [loading, setLoading] = React.useState(false);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setCompetedOn(todayUtcDate());
    }
    setOpen(next);
  };

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/dog/${dogId}/competitions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classNumber, competedOn }),
      });
      if (res.status === 409) {
        toast.error("A competition already exists on this date for this class");
        setLoading(false);
        return;
      }
      const data = (await res.json()) as { success?: boolean; competition?: Competition; error?: string };
      if (data.success && data.competition) {
        onAdded(data.competition);
        setCompetedOn(todayUtcDate());
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
        <Button>Add competition</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add competition</DialogTitle>
            <DialogDescription>Pick the date this competition was held.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label htmlFor="add-competition-date" className="sr-only">
              Competition date
            </label>
            <Input
              id="add-competition-date"
              type="date"
              value={competedOn}
              onChange={(e) => {
                setCompetedOn(e.target.value);
              }}
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
