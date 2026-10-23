-- ZT Lounge — Phase 3C surgical service constraint repairs
-- Target project: jczwilrysvnhcjzjztbi (zt lounge, West EU (Ireland))
-- Applied explicitly via: supabase db query --linked --project-ref jczwilrysvnhcjzjztbi --file <this>
-- NOT applied via supabase db push. Migration history is NOT repaired or reconciled.
--
-- Scope is strictly D1 and D4 from PHASE3C_SERVICE_WORKFLOW_AUDIT.md.
-- D5 / D6 / D7 were proven to require no DDL and are deliberately absent.
--
-- D1  services.page_id contradiction
--     Live state : services.page_id is NOT NULL, yet its FK promised ON DELETE SET NULL.
--     Contract   : services.page_id is MANDATORY in the application. Evidence:
--                    - src/lib/repository.ts guards require a page_id on service create/update
--                    - every live services row has a non-null page_id
--                    - no live service row is orphaned with respect to website_pages
--     Resolution : preserve the NOT NULL invariant and correct the FK delete action
--                  to RESTRICT. The column is NOT made nullable: the application
--                  invariant makes mandatory, so the FK action was the incorrect promise.
--
-- D4  Duplicate FKs on services.category_id
--     Live state : two byte-identical constraints exist:
--                    fk_services_category  FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE RESTRICT
--                    fk_service_category   FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE RESTRICT
--                  Both non-deferrable, semantically identical, same referenced table/actions.
--     Resolution : drop only the redundant constraint. fk_services_category is retained
--                  because it is the name referenced by the live constraint catalog
--                  convention for this table; behaviour is unchanged either way.

BEGIN;

-- D1: correct the delete action to match the mandatory page_id invariant.
ALTER TABLE public.services
  DROP CONSTRAINT services_page_id_fkey;

ALTER TABLE public.services
  ADD CONSTRAINT services_page_id_fkey
  FOREIGN KEY (page_id) REFERENCES public.website_pages(id)
  ON DELETE RESTRICT;

-- D4: remove the redundant duplicate category FK.
ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS fk_service_category;

COMMIT;