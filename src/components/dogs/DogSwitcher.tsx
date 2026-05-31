import * as React from "react";
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { Dog } from "@/types";

interface Props {
  dogs: Dog[];
  selectedDogId?: string;
}

const BUTTON_CLASS =
  "min-w-[140px] justify-between border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white";

export function DogSwitcher({ dogs, selectedDogId }: Props) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const selectedDog = dogs.find((d) => d.id === selectedDogId);
  const triggerLabel = selectedDog?.name ?? "Select dog";

  // SSR pass: plain button — identical appearance, no Radix hooks → no crash.
  // Replaced by the interactive dropdown on the first client-side render.
  if (!mounted) {
    return (
      <Button variant="outline" className={BUTTON_CLASS} disabled>
        <span className="truncate">{triggerLabel}</span>
        <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-60" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={BUTTON_CLASS}>
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {dogs.map((dog) => (
          <DropdownMenuItem key={dog.id} asChild>
            <a href={`/dogs/${dog.id}/dashboard`} className="flex items-center gap-2">
              {dog.id === selectedDogId ? (
                <CheckIcon className="size-4 shrink-0 text-purple-500" />
              ) : (
                <span className="size-4 shrink-0" />
              )}
              <span className={dog.id === selectedDogId ? "font-semibold" : ""}>{dog.name}</span>
            </a>
          </DropdownMenuItem>
        ))}
        {dogs.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem asChild>
          <a href="/dogs/new" className="flex items-center gap-2">
            <PlusIcon className="size-4 shrink-0 text-purple-400" />
            <span>Add dog</span>
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
