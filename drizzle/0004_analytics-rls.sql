-- RLS for product_analytics: server-only writes, owner-only reads through
-- the API roles. Same model as audit_log.
ALTER TABLE public.product_analytics ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY product_analytics_select_own ON public.product_analytics
  FOR SELECT TO authenticated
  USING (user_id = public.requesting_user_id());
