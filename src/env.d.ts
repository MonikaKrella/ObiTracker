declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    selectedDog: import("./types").Dog | null;
  }
}
