-- Pin search_path on every function the schema defines.
--
-- A plpgsql or SQL function body looks up tables, sequences and other functions by
-- name each time it runs, through the caller's session search_path. Through the
-- Neon pooler, sessions can carry an unexpected search_path. On 2026-09-30 some
-- pooled connections had it empty; pg_dump through the pooler is a suspected
-- source, not a conclusively identified cause. On such a
-- session the sale trigger cannot see "Branch", and next_document_reference cannot
-- resolve its sequence, so inserting a sale or a numbered document fails.
-- Pinning the setting on the function makes these calls independent of the session.
BEGIN;
ALTER FUNCTION public.next_warehouse_order_number() SET search_path = public, pg_temp;
ALTER FUNCTION public.next_warehouse_credit_note() SET search_path = public, pg_temp;
ALTER FUNCTION public.assign_warehouse_credit_note() SET search_path = public, pg_temp;
ALTER FUNCTION public.next_document_reference(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_sale_invoice_scope() SET search_path = public, pg_temp;
ALTER FUNCTION public.refresh_branch_invoice_scope() SET search_path = public, pg_temp;
COMMIT;
