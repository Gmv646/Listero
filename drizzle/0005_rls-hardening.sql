-- Harden JWT claim parsing: an absent/empty request.jwt.claims GUC must mean
-- "no access" (NULL), never a JSON-cast error. Found by the isolation audit.

CREATE OR REPLACE FUNCTION public.jwt_sub()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub';
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.requesting_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.users
  WHERE clerk_user_id = public.jwt_sub() AND public.jwt_sub() IS NOT NULL;
$$;
--> statement-breakpoint

DROP POLICY users_select_own ON public.users;
--> statement-breakpoint
CREATE POLICY users_select_own ON public.users
  FOR SELECT TO authenticated
  USING (clerk_user_id = public.jwt_sub());
--> statement-breakpoint

DROP POLICY users_update_own ON public.users;
--> statement-breakpoint
CREATE POLICY users_update_own ON public.users
  FOR UPDATE TO authenticated
  USING (clerk_user_id = public.jwt_sub())
  WITH CHECK (clerk_user_id = public.jwt_sub());
