-- Row-Level Security for all tenant tables.
--
-- Auth model: Clerk issues the JWT (Supabase third-party auth integration),
-- so the JWT 'sub' claim is the Clerk user id. requesting_user_id() maps that
-- to our internal users.id. Server-side Drizzle queries run as the postgres
-- role and are additionally scoped by user_id in application code; RLS is the
-- backstop for any access through Supabase's API roles (anon/authenticated).

CREATE OR REPLACE FUNCTION public.requesting_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.users
  WHERE clerk_user_id = COALESCE(
    current_setting('request.jwt.claims', true)::json->>'sub',
    ''
  );
$$;
--> statement-breakpoint

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.product_feedback ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- users: a user may read/update only their own row (row keyed by clerk sub)
CREATE POLICY users_select_own ON public.users
  FOR SELECT TO authenticated
  USING (clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub');
--> statement-breakpoint
CREATE POLICY users_update_own ON public.users
  FOR UPDATE TO authenticated
  USING (clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub')
  WITH CHECK (clerk_user_id = current_setting('request.jwt.claims', true)::json->>'sub');
--> statement-breakpoint

-- bank_connections
CREATE POLICY bank_connections_all_own ON public.bank_connections
  FOR ALL TO authenticated
  USING (user_id = public.requesting_user_id())
  WITH CHECK (user_id = public.requesting_user_id());
--> statement-breakpoint

-- bank_accounts
CREATE POLICY bank_accounts_all_own ON public.bank_accounts
  FOR ALL TO authenticated
  USING (user_id = public.requesting_user_id())
  WITH CHECK (user_id = public.requesting_user_id());
--> statement-breakpoint

-- transactions
CREATE POLICY transactions_all_own ON public.transactions
  FOR ALL TO authenticated
  USING (user_id = public.requesting_user_id())
  WITH CHECK (user_id = public.requesting_user_id());
--> statement-breakpoint

-- rules: own rows fully; global/industry rows (user_id IS NULL) readable by
-- any authenticated user but never writable through the API roles
CREATE POLICY rules_select_own_or_global ON public.rules
  FOR SELECT TO authenticated
  USING (user_id = public.requesting_user_id() OR user_id IS NULL);
--> statement-breakpoint
CREATE POLICY rules_insert_own ON public.rules
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.requesting_user_id());
--> statement-breakpoint
CREATE POLICY rules_update_own ON public.rules
  FOR UPDATE TO authenticated
  USING (user_id = public.requesting_user_id())
  WITH CHECK (user_id = public.requesting_user_id());
--> statement-breakpoint
CREATE POLICY rules_delete_own ON public.rules
  FOR DELETE TO authenticated
  USING (user_id = public.requesting_user_id());
--> statement-breakpoint

-- audit_log: readable by owner, append-only via server (no client writes)
CREATE POLICY audit_log_select_own ON public.audit_log
  FOR SELECT TO authenticated
  USING (user_id = public.requesting_user_id());
--> statement-breakpoint

-- product_feedback: owner can read and insert their own feedback
CREATE POLICY product_feedback_select_own ON public.product_feedback
  FOR SELECT TO authenticated
  USING (user_id = public.requesting_user_id());
--> statement-breakpoint
CREATE POLICY product_feedback_insert_own ON public.product_feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.requesting_user_id());
