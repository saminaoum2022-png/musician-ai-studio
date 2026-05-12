-- Optional: Search v2 "People" strip queries `profiles` as anon (username/bio ilike).
-- Only run when `public.profiles` already has RLS enabled and owners can still
-- `SELECT` their own row via a separate policy (typical Supabase setup).
--
-- This adds a permissive read path for public directory cards. Multiple SELECT
-- policies combine with OR, so keep your existing "read own profile" policy.

drop policy if exists "profiles_select_public_directory" on public.profiles;

create policy "profiles_select_public_directory"
  on public.profiles for select
  to anon, authenticated
  using (coalesce(is_public, true) = true);
