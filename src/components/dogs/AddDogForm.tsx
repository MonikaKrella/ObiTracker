import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function AddDogForm() {
  const [loading, setLoading] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!formRef.current) return;
    setLoading(true);
    try {
      const res = await fetch("/api/dog", {
        method: "POST",
        body: new FormData(formRef.current),
      });
      if (res.status === 401) {
        window.location.href = "/auth/signin";
        return; // stay loading — navigating away
      }
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (data.success) {
        window.location.href = "/dashboard";
        return; // stay loading — navigating away
      }
      toast.error(data.error ?? "Something went wrong — please try again");
      setLoading(false);
    } catch {
      toast.error("Something went wrong — please try again");
      setLoading(false);
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="name" className="block text-sm font-medium text-blue-100/80">
          Dog name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={100}
          placeholder="e.g. Rex"
          className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-blue-100/30 focus:border-purple-400/60 focus:ring-1 focus:ring-purple-400/60 focus:outline-none"
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Adding…" : "Add dog"}
      </Button>
    </form>
  );
}
