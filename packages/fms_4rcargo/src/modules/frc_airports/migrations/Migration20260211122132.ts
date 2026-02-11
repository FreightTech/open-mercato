import { Migration } from '@mikro-orm/migrations';

export class Migration20260211122132 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "rule_execution_logs" drop constraint "rule_execution_logs_rule_id_foreign";`);

    this.addSql(`alter table "rule_set_members" drop constraint "rule_set_members_rule_id_foreign";`);

    this.addSql(`alter table "catalog_product_variant_prices" drop constraint "catalog_product_variant_prices_price_kind_id_foreign";`);

    this.addSql(`alter table "catalog_product_category_assignments" drop constraint "catalog_product_category_assignments_category_id_foreign";`);

    this.addSql(`alter table "catalog_product_variant_prices" drop constraint "catalog_product_variant_prices_offer_id_foreign";`);

    this.addSql(`alter table "catalog_products" drop constraint "catalog_products_option_schema_id_foreign";`);

    this.addSql(`alter table "catalog_product_tag_assignments" drop constraint "catalog_product_tag_assignments_tag_id_foreign";`);

    this.addSql(`alter table "catalog_product_variant_option_values" drop constraint "catalog_product_variant_option_values_variant_id_foreign";`);

    this.addSql(`alter table "catalog_product_variant_prices" drop constraint "catalog_product_variant_prices_variant_id_foreign";`);

    this.addSql(`alter table "catalog_product_variant_relations" drop constraint "catalog_product_variant_relations_child_variant_id_foreign";`);

    this.addSql(`alter table "catalog_product_variant_relations" drop constraint "catalog_product_variant_relations_parent_variant_id_foreign";`);

    this.addSql(`alter table "catalog_product_category_assignments" drop constraint "catalog_product_category_assignments_product_id_foreign";`);

    this.addSql(`alter table "catalog_product_offers" drop constraint "catalog_product_offers_product_id_foreign";`);

    this.addSql(`alter table "catalog_product_options" drop constraint "catalog_product_options_product_id_foreign";`);

    this.addSql(`alter table "catalog_product_relations" drop constraint "catalog_product_relations_child_product_id_foreign";`);

    this.addSql(`alter table "catalog_product_relations" drop constraint "catalog_product_relations_parent_product_id_foreign";`);

    this.addSql(`alter table "catalog_product_tag_assignments" drop constraint "catalog_product_tag_assignments_product_id_foreign";`);

    this.addSql(`alter table "catalog_product_variant_prices" drop constraint "catalog_product_variant_prices_product_id_foreign";`);

    this.addSql(`alter table "catalog_product_variants" drop constraint "catalog_product_variants_product_id_foreign";`);

    this.addSql(`alter table "contractor_addresses" drop constraint "contractor_addresses_contractor_id_foreign";`);

    this.addSql(`alter table "contractor_bank_accounts" drop constraint "contractor_bank_accounts_contractor_id_foreign";`);

    this.addSql(`alter table "contractor_contacts" drop constraint "contractor_contacts_contractor_id_foreign";`);

    this.addSql(`alter table "contractor_credit_limits" drop constraint "contractor_credit_limits_contractor_id_foreign";`);

    this.addSql(`alter table "contractor_payment_terms" drop constraint "contractor_payment_terms_contractor_id_foreign";`);

    this.addSql(`alter table "contractor_sop_comments" drop constraint "contractor_sop_comments_contractor_id_foreign";`);

    this.addSql(`alter table "fms_project_legs" drop constraint "fms_project_legs_carrier_id_foreign";`);

    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_client_id_foreign";`);

    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_consignee_id_foreign";`);

    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_controlling_agent_id_foreign";`);

    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_controlling_customer_id_foreign";`);

    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_creditor_id_foreign";`);

    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_notify_party_id_foreign";`);

    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_receiving_agent_id_foreign";`);

    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_sending_agent_id_foreign";`);

    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_shipper_id_foreign";`);

    this.addSql(`alter table "customer_activities" drop constraint "customer_activities_deal_id_foreign";`);

    this.addSql(`alter table "customer_comments" drop constraint "customer_comments_deal_id_foreign";`);

    this.addSql(`alter table "customer_deal_companies" drop constraint "customer_deal_companies_deal_id_foreign";`);

    this.addSql(`alter table "customer_deal_people" drop constraint "customer_deal_people_deal_id_foreign";`);

    this.addSql(`alter table "customer_activities" drop constraint "customer_activities_entity_id_foreign";`);

    this.addSql(`alter table "customer_addresses" drop constraint "customer_addresses_entity_id_foreign";`);

    this.addSql(`alter table "customer_comments" drop constraint "customer_comments_entity_id_foreign";`);

    this.addSql(`alter table "customer_companies" drop constraint "customer_companies_entity_id_foreign";`);

    this.addSql(`alter table "customer_deal_companies" drop constraint "customer_deal_companies_company_entity_id_foreign";`);

    this.addSql(`alter table "customer_deal_people" drop constraint "customer_deal_people_person_entity_id_foreign";`);

    this.addSql(`alter table "customer_people" drop constraint "customer_people_company_entity_id_foreign";`);

    this.addSql(`alter table "customer_people" drop constraint "customer_people_entity_id_foreign";`);

    this.addSql(`alter table "customer_tag_assignments" drop constraint "customer_tag_assignments_entity_id_foreign";`);

    this.addSql(`alter table "customer_todo_links" drop constraint "customer_todo_links_entity_id_foreign";`);

    this.addSql(`alter table "customer_tag_assignments" drop constraint "customer_tag_assignments_tag_id_foreign";`);

    this.addSql(`alter table "dictionary_entries" drop constraint "dictionary_entries_dictionary_id_foreign";`);

    this.addSql(`alter table "feature_toggle_audit_logs" drop constraint "feature_toggle_audit_logs_toggle_id_foreign";`);

    this.addSql(`alter table "feature_toggle_overrides" drop constraint "feature_toggle_overrides_toggle_id_foreign";`);

    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_carrier_id_foreign";`);

    this.addSql(`alter table "fms_invoice_line_items" drop constraint "fms_invoice_line_items_invoice_id_foreign";`);

    this.addSql(`alter table "fms_invoice_pages" drop constraint "fms_invoice_pages_invoice_id_foreign";`);

    this.addSql(`alter table "fms_project_legs" drop constraint "fms_project_legs_destination_location_id_foreign";`);

    this.addSql(`alter table "fms_project_legs" drop constraint "fms_project_legs_origin_location_id_foreign";`);

    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_destination_location_id_foreign";`);

    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_origin_location_id_foreign";`);

    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_place_of_discharge_id_foreign";`);

    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_place_of_loading_id_foreign";`);

    this.addSql(`alter table "fms_offer_lines" drop constraint "fms_offer_lines_calculation_id_foreign";`);

    this.addSql(`alter table "fms_offer_calculations" drop constraint "fms_offer_calculations_offer_id_foreign";`);

    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_offer_id_foreign";`);

    this.addSql(`alter table "fms_invoice_line_items" drop constraint "fms_invoice_line_items_product_id_foreign";`);

    this.addSql(`alter table "fms_air_units" drop constraint "fms_air_units_project_id_foreign";`);

    this.addSql(`alter table "fms_project_cargo" drop constraint "fms_project_cargo_project_id_foreign";`);

    this.addSql(`alter table "fms_project_invoices" drop constraint "fms_project_invoices_project_id_foreign";`);

    this.addSql(`alter table "fms_project_legs" drop constraint "fms_project_legs_project_id_foreign";`);

    this.addSql(`alter table "fms_project_lines" drop constraint "fms_project_lines_project_id_foreign";`);

    this.addSql(`alter table "fms_project_notes" drop constraint "fms_project_notes_project_id_foreign";`);

    this.addSql(`alter table "fms_road_units" drop constraint "fms_road_units_project_id_foreign";`);

    this.addSql(`alter table "fms_sea_containers" drop constraint "fms_sea_containers_project_id_foreign";`);

    this.addSql(`alter table "fms_offers" drop constraint "fms_offers_rfq_id_foreign";`);

    this.addSql(`alter table "fms_projects" drop constraint "fms_projects_rfq_id_foreign";`);

    this.addSql(`alter table "resources_resource_tag_assignments" drop constraint "resources_resource_tag_assignments_tag_id_foreign";`);

    this.addSql(`alter table "resources_resource_activities" drop constraint "resources_resource_activities_resource_id_foreign";`);

    this.addSql(`alter table "resources_resource_comments" drop constraint "resources_resource_comments_resource_id_foreign";`);

    this.addSql(`alter table "resources_resource_tag_assignments" drop constraint "resources_resource_tag_assignments_resource_id_foreign";`);

    this.addSql(`alter table "role_acls" drop constraint "role_acls_role_id_foreign";`);

    this.addSql(`alter table "role_sidebar_preferences" drop constraint "role_sidebar_preferences_role_id_foreign";`);

    this.addSql(`alter table "user_roles" drop constraint "user_roles_role_id_foreign";`);

    this.addSql(`alter table "rule_set_members" drop constraint "rule_set_members_rule_set_id_foreign";`);

    this.addSql(`alter table "sales_orders" drop constraint "sales_orders_channel_ref_id_foreign";`);

    this.addSql(`alter table "sales_quotes" drop constraint "sales_quotes_channel_ref_id_foreign";`);

    this.addSql(`alter table "sales_credit_memo_lines" drop constraint "sales_credit_memo_lines_credit_memo_id_foreign";`);

    this.addSql(`alter table "sales_orders" drop constraint "sales_orders_delivery_window_ref_id_foreign";`);

    this.addSql(`alter table "sales_quotes" drop constraint "sales_quotes_delivery_window_ref_id_foreign";`);

    this.addSql(`alter table "sales_document_tag_assignments" drop constraint "sales_document_tag_assignments_tag_id_foreign";`);

    this.addSql(`alter table "sales_credit_memos" drop constraint "sales_credit_memos_invoice_id_foreign";`);

    this.addSql(`alter table "sales_invoice_lines" drop constraint "sales_invoice_lines_invoice_id_foreign";`);

    this.addSql(`alter table "sales_payment_allocations" drop constraint "sales_payment_allocations_invoice_id_foreign";`);

    this.addSql(`alter table "sales_credit_memo_lines" drop constraint "sales_credit_memo_lines_order_line_id_foreign";`);

    this.addSql(`alter table "sales_invoice_lines" drop constraint "sales_invoice_lines_order_line_id_foreign";`);

    this.addSql(`alter table "sales_order_adjustments" drop constraint "sales_order_adjustments_order_line_id_foreign";`);

    this.addSql(`alter table "sales_shipment_items" drop constraint "sales_shipment_items_order_line_id_foreign";`);

    this.addSql(`alter table "sales_credit_memos" drop constraint "sales_credit_memos_order_id_foreign";`);

    this.addSql(`alter table "sales_document_addresses" drop constraint "sales_document_addresses_order_id_foreign";`);

    this.addSql(`alter table "sales_document_tag_assignments" drop constraint "sales_document_tag_assignments_order_id_foreign";`);

    this.addSql(`alter table "sales_invoices" drop constraint "sales_invoices_order_id_foreign";`);

    this.addSql(`alter table "sales_notes" drop constraint "sales_notes_order_id_foreign";`);

    this.addSql(`alter table "sales_order_adjustments" drop constraint "sales_order_adjustments_order_id_foreign";`);

    this.addSql(`alter table "sales_order_lines" drop constraint "sales_order_lines_order_id_foreign";`);

    this.addSql(`alter table "sales_payment_allocations" drop constraint "sales_payment_allocations_order_id_foreign";`);

    this.addSql(`alter table "sales_payments" drop constraint "sales_payments_order_id_foreign";`);

    this.addSql(`alter table "sales_shipments" drop constraint "sales_shipments_order_id_foreign";`);

    this.addSql(`alter table "sales_orders" drop constraint "sales_orders_payment_method_ref_id_foreign";`);

    this.addSql(`alter table "sales_payments" drop constraint "sales_payments_payment_method_id_foreign";`);

    this.addSql(`alter table "sales_quotes" drop constraint "sales_quotes_payment_method_ref_id_foreign";`);

    this.addSql(`alter table "sales_payment_allocations" drop constraint "sales_payment_allocations_payment_id_foreign";`);

    this.addSql(`alter table "sales_quote_adjustments" drop constraint "sales_quote_adjustments_quote_line_id_foreign";`);

    this.addSql(`alter table "sales_document_addresses" drop constraint "sales_document_addresses_quote_id_foreign";`);

    this.addSql(`alter table "sales_document_tag_assignments" drop constraint "sales_document_tag_assignments_quote_id_foreign";`);

    this.addSql(`alter table "sales_notes" drop constraint "sales_notes_quote_id_foreign";`);

    this.addSql(`alter table "sales_quote_adjustments" drop constraint "sales_quote_adjustments_quote_id_foreign";`);

    this.addSql(`alter table "sales_quote_lines" drop constraint "sales_quote_lines_quote_id_foreign";`);

    this.addSql(`alter table "sales_shipment_items" drop constraint "sales_shipment_items_shipment_id_foreign";`);

    this.addSql(`alter table "sales_orders" drop constraint "sales_orders_shipping_method_ref_id_foreign";`);

    this.addSql(`alter table "sales_quotes" drop constraint "sales_quotes_shipping_method_ref_id_foreign";`);

    this.addSql(`alter table "staff_leave_requests" drop constraint "staff_leave_requests_member_id_foreign";`);

    this.addSql(`alter table "staff_team_member_activities" drop constraint "staff_team_member_activities_member_id_foreign";`);

    this.addSql(`alter table "staff_team_member_addresses" drop constraint "staff_team_member_addresses_member_id_foreign";`);

    this.addSql(`alter table "staff_team_member_comments" drop constraint "staff_team_member_comments_member_id_foreign";`);

    this.addSql(`alter table "staff_team_member_job_histories" drop constraint "staff_team_member_job_histories_member_id_foreign";`);

    this.addSql(`alter table "organizations" drop constraint "organizations_tenant_id_foreign";`);

    this.addSql(`alter table "password_resets" drop constraint "password_resets_user_id_foreign";`);

    this.addSql(`alter table "sessions" drop constraint "sessions_user_id_foreign";`);

    this.addSql(`alter table "user_acls" drop constraint "user_acls_user_id_foreign";`);

    this.addSql(`alter table "user_roles" drop constraint "user_roles_user_id_foreign";`);

    this.addSql(`alter table "user_sidebar_preferences" drop constraint "user_sidebar_preferences_user_id_foreign";`);

    this.addSql(`create table "frc_airports" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "long_code" text not null, "city" text null, "country" text null, "is_active" boolean not null default true, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, constraint "frc_airports_pkey" primary key ("id"));`);
    this.addSql(`create index "frc_airports_code_idx" on "frc_airports" ("organization_id", "tenant_id", "code");`);
    this.addSql(`create index "frc_airports_org_tenant_idx" on "frc_airports" ("organization_id", "tenant_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`create table "access_logs" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid null, "organization_id" uuid null, "actor_user_id" uuid null, "resource_kind" text not null, "resource_id" text not null, "access_type" text not null, "fields_json" jsonb null, "context_json" jsonb null, "created_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "access_logs_pkey" primary key ("id"));`);
    this.addSql(`create index "access_logs_actor_idx" on "access_logs" ("actor_user_id", "created_at");`);
    this.addSql(`create index "access_logs_tenant_idx" on "access_logs" ("tenant_id", "created_at");`);

    this.addSql(`create table "action_logs" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid null, "organization_id" uuid null, "actor_user_id" uuid null, "command_id" text not null, "action_label" text null, "resource_kind" text null, "resource_id" text null, "execution_state" text not null default 'done', "undo_token" text null, "command_payload" jsonb null, "snapshot_before" jsonb null, "snapshot_after" jsonb null, "changes_json" jsonb null, "context_json" jsonb null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "parent_resource_kind" text null, "parent_resource_id" text null, constraint "action_logs_pkey" primary key ("id"));`);
    this.addSql(`create index "action_logs_actor_idx" on "action_logs" ("actor_user_id", "created_at");`);
    this.addSql(`create index "action_logs_parent_resource_idx" on "action_logs" ("tenant_id", "parent_resource_kind", "parent_resource_id", "created_at");`);
    this.addSql(`create index "action_logs_resource_idx" on "action_logs" ("tenant_id", "resource_kind", "resource_id", "created_at");`);
    this.addSql(`create index "action_logs_tenant_idx" on "action_logs" ("tenant_id", "created_at");`);

    this.addSql(`create table "api_keys" ("id" uuid not null default gen_random_uuid(), "name" text not null, "description" text null, "tenant_id" uuid null, "organization_id" uuid null, "key_hash" text not null, "key_prefix" text not null, "roles_json" jsonb null, "created_by" uuid null, "last_used_at" timestamptz(6) null, "expires_at" timestamptz(6) null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) null, "deleted_at" timestamptz(6) null, "session_token" text null, "session_user_id" uuid null, "session_secret_encrypted" text null, constraint "api_keys_pkey" primary key ("id"));`);
    this.addSql(`alter table "api_keys" add constraint "api_keys_key_prefix_unique" unique ("key_prefix");`);

    this.addSql(`create table "attachment_partitions" ("id" uuid not null default gen_random_uuid(), "code" text not null, "title" text not null, "description" text null, "storage_driver" text not null default 'local', "config_json" jsonb null, "is_public" bool not null default false, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "requires_ocr" bool not null default true, "ocr_model" text null, constraint "attachment_partitions_pkey" primary key ("id"));`);
    this.addSql(`alter table "attachment_partitions" add constraint "attachment_partitions_code_unique" unique ("code");`);

    this.addSql(`create table "attachments" ("id" uuid not null default gen_random_uuid(), "entity_id" text not null, "record_id" text not null, "organization_id" uuid null, "tenant_id" uuid null, "file_name" text not null, "mime_type" text not null, "file_size" int4 not null, "url" text not null, "created_at" timestamptz(6) not null, "partition_code" text not null, "storage_driver" text not null default 'local', "storage_path" text not null, "storage_metadata" jsonb null, "content" text null, constraint "attachments_pkey" primary key ("id"));`);
    this.addSql(`create index "attachments_entity_record_idx" on "attachments" ("record_id");`);
    this.addSql(`create index "attachments_partition_code_idx" on "attachments" ("partition_code");`);

    this.addSql(`create table "business_rules" ("id" uuid not null default gen_random_uuid(), "rule_id" varchar(50) not null, "rule_name" varchar(200) not null, "description" text null, "rule_type" varchar(20) not null, "rule_category" varchar(50) null, "entity_type" varchar(50) not null, "event_type" varchar(50) null, "condition_expression" jsonb not null, "success_actions" jsonb null, "failure_actions" jsonb null, "enabled" bool not null default true, "priority" int4 not null default 100, "version" int4 not null default 1, "effective_from" timestamptz(6) null, "effective_to" timestamptz(6) null, "tenant_id" uuid not null, "organization_id" uuid not null, "created_by" varchar(50) null, "updated_by" varchar(50) null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "business_rules_pkey" primary key ("id"));`);
    this.addSql(`create index "business_rules_entity_event_idx" on "business_rules" ("entity_type", "event_type", "enabled");`);
    this.addSql(`alter table "business_rules" add constraint "business_rules_rule_id_tenant_id_unique" unique ("rule_id", "tenant_id");`);
    this.addSql(`create index "business_rules_tenant_org_idx" on "business_rules" ("tenant_id", "organization_id");`);
    this.addSql(`create index "business_rules_type_enabled_idx" on "business_rules" ("rule_type", "enabled", "priority");`);

    this.addSql(`create table "catalog_price_kinds" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid null, "tenant_id" uuid not null, "code" text not null, "title" text not null, "display_mode" text not null default 'excluding-tax', "currency_code" text null, "is_promotion" bool not null default false, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "catalog_price_kinds_pkey" primary key ("id"));`);
    this.addSql(`alter table "catalog_price_kinds" add constraint "catalog_price_kinds_code_tenant_unique" unique ("tenant_id", "code");`);
    this.addSql(`create index "catalog_price_kinds_tenant_idx" on "catalog_price_kinds" ("tenant_id");`);

    this.addSql(`create table "catalog_product_categories" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "slug" text null, "description" text null, "parent_id" uuid null, "root_id" uuid null, "tree_path" text null, "depth" int4 not null default 0, "ancestor_ids" jsonb not null default '[]', "child_ids" jsonb not null default '[]', "descendant_ids" jsonb not null default '[]', "metadata" jsonb null, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "catalog_product_categories_pkey" primary key ("id"));`);
    this.addSql(`create index "catalog_product_categories_scope_idx" on "catalog_product_categories" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "catalog_product_categories" add constraint "catalog_product_categories_slug_unique" unique ("organization_id", "tenant_id", "slug");`);

    this.addSql(`create table "catalog_product_category_assignments" ("id" uuid not null default gen_random_uuid(), "product_id" uuid not null, "category_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "position" int4 not null default 0, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "catalog_product_category_assignments_pkey" primary key ("id"));`);
    this.addSql(`create index "catalog_product_category_assignments_scope_idx" on "catalog_product_category_assignments" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "catalog_product_category_assignments" add constraint "catalog_product_category_assignments_unique" unique ("product_id", "category_id");`);

    this.addSql(`create table "catalog_product_offers" ("id" uuid not null default gen_random_uuid(), "product_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "channel_id" uuid not null, "title" text not null, "description" text null, "localized_content" jsonb null, "metadata" jsonb null, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "default_media_id" uuid null, "default_media_url" text null, constraint "catalog_product_offers_pkey" primary key ("id"));`);
    this.addSql(`alter table "catalog_product_offers" add constraint "catalog_product_offers_product_channel_unique" unique ("product_id", "organization_id", "tenant_id", "channel_id");`);
    this.addSql(`create index "catalog_product_offers_scope_idx" on "catalog_product_offers" ("organization_id", "tenant_id");`);

    this.addSql(`create table "catalog_product_option_schemas" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "code" text not null, "description" text null, "schema" jsonb not null, "metadata" jsonb null, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "catalog_product_option_schemas_pkey" primary key ("id"));`);
    this.addSql(`alter table "catalog_product_option_schemas" add constraint "catalog_product_option_schemas_code_unique" unique ("organization_id", "tenant_id", "code");`);
    this.addSql(`create index "catalog_product_option_schemas_scope_idx" on "catalog_product_option_schemas" ("organization_id", "tenant_id");`);

    this.addSql(`create table "catalog_product_option_values" ("id" uuid not null default gen_random_uuid(), "option_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "label" text not null, "description" text null, "position" int4 not null default 0, "metadata" jsonb null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "catalog_product_option_values_pkey" primary key ("id"));`);
    this.addSql(`alter table "catalog_product_option_values" add constraint "catalog_product_option_values_code_unique" unique ("organization_id", "tenant_id", "option_id", "code");`);
    this.addSql(`create index "catalog_product_option_values_scope_idx" on "catalog_product_option_values" ("option_id", "organization_id", "tenant_id");`);

    this.addSql(`create table "catalog_product_options" ("id" uuid not null default gen_random_uuid(), "product_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "label" text not null, "description" text null, "position" int4 not null default 0, "is_required" bool not null default false, "is_multiple" bool not null default false, "metadata" jsonb null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "input_type" text not null default 'select', "input_config" jsonb null, constraint "catalog_product_options_pkey" primary key ("id"));`);
    this.addSql(`create index "catalog_product_options_scope_idx" on "catalog_product_options" ("product_id", "organization_id", "tenant_id");`);

    this.addSql(`create table "catalog_product_relations" ("id" uuid not null default gen_random_uuid(), "parent_product_id" uuid not null, "child_product_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "relation_type" text not null default 'grouped', "is_required" bool not null default false, "min_quantity" int4 null, "max_quantity" int4 null, "position" int4 not null default 0, "metadata" jsonb null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "catalog_product_relations_pkey" primary key ("id"));`);
    this.addSql(`create index "catalog_product_relations_child_idx" on "catalog_product_relations" ("child_product_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "catalog_product_relations_parent_idx" on "catalog_product_relations" ("parent_product_id", "organization_id", "tenant_id");`);
    this.addSql(`alter table "catalog_product_relations" add constraint "catalog_product_relations_unique" unique ("parent_product_id", "child_product_id", "relation_type");`);

    this.addSql(`create table "catalog_product_tag_assignments" ("id" uuid not null default gen_random_uuid(), "product_id" uuid not null, "tag_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "catalog_product_tag_assignments_pkey" primary key ("id"));`);
    this.addSql(`create index "catalog_product_tag_assignments_scope_idx" on "catalog_product_tag_assignments" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "catalog_product_tag_assignments" add constraint "catalog_product_tag_assignments_unique" unique ("product_id", "tag_id");`);

    this.addSql(`create table "catalog_product_tags" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "label" text not null, "slug" text not null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "catalog_product_tags_pkey" primary key ("id"));`);
    this.addSql(`create index "catalog_product_tags_scope_idx" on "catalog_product_tags" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "catalog_product_tags" add constraint "catalog_product_tags_slug_unique" unique ("organization_id", "tenant_id", "slug");`);

    this.addSql(`create table "catalog_product_variant_option_values" ("id" uuid not null default gen_random_uuid(), "variant_id" uuid not null, "option_value_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "metadata" jsonb null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "catalog_product_variant_option_values_pkey" primary key ("id"));`);
    this.addSql(`alter table "catalog_product_variant_option_values" add constraint "catalog_product_variant_option_values_unique" unique ("variant_id", "option_value_id");`);

    this.addSql(`create table "catalog_product_variant_prices" ("id" uuid not null default gen_random_uuid(), "variant_id" uuid null, "organization_id" uuid not null, "tenant_id" uuid not null, "currency_code" text not null, "kind" text not null default 'regular', "min_quantity" int4 not null default 1, "max_quantity" int4 null, "unit_price_net" numeric(16,4) null, "unit_price_gross" numeric(16,4) null, "tax_rate" numeric(7,4) null, "metadata" jsonb null, "starts_at" timestamptz(6) null, "ends_at" timestamptz(6) null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "product_id" uuid null, "offer_id" uuid null, "channel_id" uuid null, "user_id" uuid null, "user_group_id" uuid null, "customer_id" uuid null, "customer_group_id" uuid null, "price_kind_id" uuid not null, "tax_amount" numeric(16,4) null, constraint "catalog_product_variant_prices_pkey" primary key ("id"));`);
    this.addSql(`create index "catalog_product_variant_prices_product_scope_idx" on "catalog_product_variant_prices" ("product_id", "organization_id", "tenant_id");`);
    this.addSql(`alter table "catalog_product_variant_prices" add constraint "catalog_product_variant_prices_unique" unique ("variant_id", "organization_id", "tenant_id", "currency_code", "price_kind_id", "min_quantity");`);
    this.addSql(`create index "catalog_product_variant_prices_variant_scope_idx" on "catalog_product_variant_prices" ("variant_id", "organization_id", "tenant_id");`);

    this.addSql(`create table "catalog_product_variant_relations" ("id" uuid not null default gen_random_uuid(), "parent_variant_id" uuid not null, "child_variant_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "relation_type" text not null default 'grouped', "is_required" bool not null default false, "min_quantity" int4 null, "max_quantity" int4 null, "position" int4 not null default 0, "metadata" jsonb null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "catalog_product_variant_relations_pkey" primary key ("id"));`);
    this.addSql(`create index "catalog_product_variant_relations_child_idx" on "catalog_product_variant_relations" ("child_variant_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "catalog_product_variant_relations_parent_idx" on "catalog_product_variant_relations" ("parent_variant_id", "organization_id", "tenant_id");`);
    this.addSql(`alter table "catalog_product_variant_relations" add constraint "catalog_product_variant_relations_unique" unique ("parent_variant_id", "child_variant_id", "relation_type");`);

    this.addSql(`create table "catalog_product_variants" ("id" uuid not null default gen_random_uuid(), "product_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "name" text null, "sku" text null, "barcode" text null, "status_entry_id" text null, "is_default" bool not null default false, "is_active" bool not null default true, "weight_value" numeric(16,4) null, "weight_unit" text null, "dimensions" jsonb null, "metadata" jsonb null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "custom_fieldset_code" text null, "default_media_id" uuid null, "default_media_url" text null, "tax_rate_id" uuid null, "tax_rate" numeric(7,4) null, "option_values" jsonb null, constraint "catalog_product_variants_pkey" primary key ("id"));`);
    this.addSql(`create index "catalog_product_variants_scope_idx" on "catalog_product_variants" ("product_id", "organization_id", "tenant_id");`);
    this.addSql(`alter table "catalog_product_variants" add constraint "catalog_product_variants_sku_unique" unique ("organization_id", "tenant_id", "sku");`);

    this.addSql(`create table "catalog_products" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "title" text not null, "description" text null, "subtitle" text null, "status_entry_id" uuid null, "primary_currency_code" text null, "default_unit" text null, "metadata" jsonb null, "is_configurable" bool not null default false, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "product_type" text not null default 'simple', "sku" text null, "handle" text null, "option_schema_id" uuid null, "custom_fieldset_code" text null, "default_media_id" uuid null, "default_media_url" text null, "weight_value" numeric(16,4) null, "weight_unit" text null, "dimensions" jsonb null, "tax_rate_id" uuid null, "tax_rate" numeric(7,4) null, constraint "catalog_products_pkey" primary key ("id"));`);
    this.addSql(`alter table "catalog_products" add constraint "catalog_products_handle_scope_unique" unique ("organization_id", "tenant_id", "handle");`);
    this.addSql(`create index "catalog_products_org_tenant_idx" on "catalog_products" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "catalog_products" add constraint "catalog_products_sku_scope_unique" unique ("organization_id", "tenant_id", "sku");`);

    this.addSql(`create table "contractor_addresses" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "purpose" text not null, "address_line" text null, "city" text null, "state" text null, "postal_code" text null, "country" text null, "is_primary" bool not null default false, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "contractor_id" uuid not null, constraint "contractor_addresses_pkey" primary key ("id"));`);
    this.addSql(`create index "contractor_addresses_contractor_idx" on "contractor_addresses" ("contractor_id");`);

    this.addSql(`create table "contractor_bank_accounts" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "bank_name" text null, "iban" text null, "swift_bic" text null, "currency_code" text not null default 'USD', "is_primary" bool not null default false, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "contractor_id" uuid not null, constraint "contractor_bank_accounts_pkey" primary key ("id"));`);
    this.addSql(`create index "contractor_bank_accounts_contractor_idx" on "contractor_bank_accounts" ("contractor_id");`);

    this.addSql(`create table "contractor_contacts" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "first_name" text null, "last_name" text null, "email" text null, "phone" text null, "is_primary" bool not null default false, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "contractor_id" uuid not null, constraint "contractor_contacts_pkey" primary key ("id"));`);
    this.addSql(`create index "contractor_contacts_contractor_idx" on "contractor_contacts" ("contractor_id");`);

    this.addSql(`create table "contractor_credit_limits" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "credit_limit" numeric(18,2) not null, "currency_code" text not null default 'USD', "is_unlimited" bool not null default false, "payment_days" int4 not null default 30, "current_exposure" numeric(18,2) not null default '0', "last_calculated_at" timestamptz(6) null, "notes" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "contractor_id" uuid not null, constraint "contractor_credit_limits_pkey" primary key ("id"));`);
    this.addSql(`alter table "contractor_credit_limits" add constraint "contractor_credit_limits_contractor_id_unique" unique ("contractor_id");`);
    this.addSql(`create index "contractor_credit_limits_contractor_idx" on "contractor_credit_limits" ("contractor_id");`);
    this.addSql(`alter table "contractor_credit_limits" add constraint "contractor_credit_limits_contractor_unique" unique ("contractor_id");`);

    this.addSql(`create table "contractor_payment_terms" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "payment_days" int4 not null default 30, "payment_method" text null, "currency_code" text not null default 'USD', "bank_name" text null, "bank_account_number" text null, "bank_routing_number" text null, "iban" text null, "swift_bic" text null, "notes" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "contractor_id" uuid not null, constraint "contractor_payment_terms_pkey" primary key ("id"));`);
    this.addSql(`alter table "contractor_payment_terms" add constraint "contractor_payment_terms_contractor_id_unique" unique ("contractor_id");`);
    this.addSql(`create index "contractor_payment_terms_contractor_idx" on "contractor_payment_terms" ("contractor_id");`);
    this.addSql(`alter table "contractor_payment_terms" add constraint "contractor_payment_terms_contractor_unique" unique ("contractor_id");`);

    this.addSql(`create table "contractor_role_types" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "name" text not null, "category" text not null, "description" text null, "color" text null, "icon" text null, "has_custom_fields" bool not null default false, "sort_order" int4 not null default 0, "is_system" bool not null default false, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "contractor_role_types_pkey" primary key ("id"));`);
    this.addSql(`alter table "contractor_role_types" add constraint "contractor_role_types_code_unique" unique ("organization_id", "tenant_id", "code");`);
    this.addSql(`create index "contractor_role_types_org_tenant_idx" on "contractor_role_types" ("organization_id", "tenant_id");`);
    this.addSql(`CREATE INDEX idx_contractor_role_types_category ON public.contractor_role_types USING btree (tenant_id, organization_id, category) WHERE (is_active = true);`);

    this.addSql(`create table "contractor_sop_comments" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "category" text not null, "body" text not null, "author_user_id" uuid null, "author_name" text null, "is_pinned" bool not null default false, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "contractor_id" uuid not null, constraint "contractor_sop_comments_pkey" primary key ("id"));`);
    this.addSql(`create index "contractor_sop_comments_contractor_idx" on "contractor_sop_comments" ("contractor_id");`);
    this.addSql(`create index "contractor_sop_comments_org_tenant_idx" on "contractor_sop_comments" ("organization_id", "tenant_id");`);

    this.addSql(`create table "contractors" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "short_name" text null, "official_name" text null, "parent_id" uuid null, "tax_id" text null, "regon" text null, "krs" text null, "registration_date" text null, "pkd_main_code" text null, "pkd_main_description" text null, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "role_type_ids" jsonb null, constraint "contractors_pkey" primary key ("id"));`);
    this.addSql(`create index "contractors_org_tenant_idx" on "contractors" ("organization_id", "tenant_id");`);
    this.addSql(`create index "contractors_parent_idx" on "contractors" ("parent_id");`);
    this.addSql(`CREATE INDEX idx_contractors_tenant_org_id ON public.contractors USING btree (tenant_id, organization_id, id) WHERE (deleted_at IS NULL);`);

    this.addSql(`create table "currencies" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "name" text not null, "symbol" text null, "decimal_places" int4 not null default 2, "thousands_separator" text null, "decimal_separator" text null, "is_base" bool not null default false, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "currencies_pkey" primary key ("id"));`);
    this.addSql(`alter table "currencies" add constraint "currencies_code_scope_unique" unique ("organization_id", "tenant_id", "code");`);
    this.addSql(`create index "currencies_scope_idx" on "currencies" ("organization_id", "tenant_id");`);

    this.addSql(`create table "currency_fetch_configs" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "provider" text not null, "is_enabled" bool not null default false, "sync_time" text null, "last_sync_at" timestamptz(6) null, "last_sync_status" text null, "last_sync_message" text null, "last_sync_count" int4 null, "config" jsonb null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "timezone" text null default 'UTC', constraint "currency_fetch_configs_pkey" primary key ("id"));`);
    this.addSql(`create index "currency_fetch_configs_enabled_idx" on "currency_fetch_configs" ("is_enabled", "sync_time");`);
    this.addSql(`alter table "currency_fetch_configs" add constraint "currency_fetch_configs_provider_scope_unique" unique ("organization_id", "tenant_id", "provider");`);
    this.addSql(`create index "currency_fetch_configs_scope_idx" on "currency_fetch_configs" ("organization_id", "tenant_id");`);

    this.addSql(`create table "custom_entities" ("id" uuid not null default gen_random_uuid(), "entity_id" text not null, "label" text not null, "description" text null, "label_field" text null, "default_editor" text null, "show_in_sidebar" bool not null default false, "organization_id" uuid null, "tenant_id" uuid null, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "custom_entities_pkey" primary key ("id"));`);
    this.addSql(`create index "custom_entities_unique_idx" on "custom_entities" ("entity_id", "organization_id", "tenant_id");`);

    this.addSql(`create table "custom_entities_storage" ("id" uuid not null default gen_random_uuid(), "entity_type" text not null, "entity_id" text not null, "organization_id" uuid null, "tenant_id" uuid null, "doc" jsonb not null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "custom_entities_storage_pkey" primary key ("id"));`);
    this.addSql(`create index "custom_entities_storage_unique_idx" on "custom_entities_storage" ("entity_type", "entity_id", "organization_id");`);

    this.addSql(`create table "custom_field_defs" ("id" uuid not null default gen_random_uuid(), "entity_id" text not null, "organization_id" uuid null, "tenant_id" uuid null, "key" text not null, "kind" text not null, "config_json" jsonb null, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "custom_field_defs_pkey" primary key ("id"));`);
    this.addSql(`create index "cf_defs_active_entity_global_idx" on "custom_field_defs" ("entity_id");`);
    this.addSql(`create index "cf_defs_active_entity_key_scope_idx" on "custom_field_defs" ("entity_id", "key", "tenant_id", "organization_id");`);
    this.addSql(`create index "cf_defs_active_entity_org_idx" on "custom_field_defs" ("entity_id", "organization_id");`);
    this.addSql(`create index "cf_defs_active_entity_tenant_idx" on "custom_field_defs" ("entity_id", "tenant_id");`);
    this.addSql(`create index "cf_defs_active_entity_tenant_org_idx" on "custom_field_defs" ("entity_id", "tenant_id", "organization_id");`);
    this.addSql(`create index "cf_defs_entity_key_idx" on "custom_field_defs" ("key");`);

    this.addSql(`create table "custom_field_entity_configs" ("id" uuid not null default gen_random_uuid(), "entity_id" text not null, "organization_id" uuid null, "tenant_id" uuid null, "config_json" jsonb null, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "custom_field_entity_configs_pkey" primary key ("id"));`);
    this.addSql(`create index "cf_entity_cfgs_entity_org_idx" on "custom_field_entity_configs" ("entity_id", "organization_id");`);
    this.addSql(`create index "cf_entity_cfgs_entity_scope_idx" on "custom_field_entity_configs" ("entity_id", "tenant_id", "organization_id");`);
    this.addSql(`create index "cf_entity_cfgs_entity_tenant_idx" on "custom_field_entity_configs" ("entity_id", "tenant_id");`);

    this.addSql(`create table "custom_field_values" ("id" uuid not null default gen_random_uuid(), "entity_id" text not null, "record_id" text not null, "organization_id" uuid null, "tenant_id" uuid null, "field_key" text not null, "value_text" text null, "value_multiline" text null, "value_int" int4 null, "value_float" float4 null, "value_bool" bool null, "created_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "custom_field_values_pkey" primary key ("id"));`);
    this.addSql(`create index "cf_values_entity_record_field_idx" on "custom_field_values" ("field_key");`);
    this.addSql(`create index "cf_values_entity_record_tenant_idx" on "custom_field_values" ("entity_id", "record_id", "tenant_id");`);

    this.addSql(`create table "customer_activities" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "activity_type" text not null, "subject" text null, "body" text null, "occurred_at" timestamptz(6) null, "author_user_id" uuid null, "appearance_icon" text null, "appearance_color" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "entity_id" uuid not null, "deal_id" uuid null, constraint "customer_activities_pkey" primary key ("id"));`);
    this.addSql(`create index "customer_activities_entity_idx" on "customer_activities" ("entity_id");`);
    this.addSql(`create index "customer_activities_entity_occurred_created_idx" on "customer_activities" ("entity_id", "occurred_at", "created_at");`);
    this.addSql(`create index "customer_activities_org_tenant_idx" on "customer_activities" ("organization_id", "tenant_id");`);

    this.addSql(`create table "customer_addresses" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text null, "purpose" text null, "address_line1" text not null, "address_line2" text null, "city" text null, "region" text null, "postal_code" text null, "country" text null, "building_number" text null, "flat_number" text null, "latitude" float4 null, "longitude" float4 null, "is_primary" bool not null default false, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "entity_id" uuid not null, "company_name" text null, constraint "customer_addresses_pkey" primary key ("id"));`);
    this.addSql(`create index "customer_addresses_entity_idx" on "customer_addresses" ("entity_id");`);

    this.addSql(`create table "customer_comments" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "body" text not null, "author_user_id" uuid null, "appearance_icon" text null, "appearance_color" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "entity_id" uuid not null, "deal_id" uuid null, constraint "customer_comments_pkey" primary key ("id"));`);
    this.addSql(`create index "customer_comments_entity_created_idx" on "customer_comments" ("entity_id", "created_at");`);
    this.addSql(`create index "customer_comments_entity_idx" on "customer_comments" ("entity_id");`);

    this.addSql(`create table "customer_companies" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "legal_name" text null, "brand_name" text null, "domain" text null, "website_url" text null, "industry" text null, "size_bucket" text null, "annual_revenue" numeric(16,2) null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "entity_id" uuid not null, constraint "customer_companies_pkey" primary key ("id"));`);
    this.addSql(`alter table "customer_companies" add constraint "customer_companies_entity_id_unique" unique ("entity_id");`);
    this.addSql(`create index "customer_companies_org_tenant_idx" on "customer_companies" ("organization_id", "tenant_id");`);
    this.addSql(`create index "idx_customer_companies_entity_id" on "customer_companies" ("entity_id");`);

    this.addSql(`create table "customer_deal_companies" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz(6) not null, "deal_id" uuid not null, "company_entity_id" uuid not null, constraint "customer_deal_companies_pkey" primary key ("id"));`);
    this.addSql(`create index "customer_deal_companies_company_idx" on "customer_deal_companies" ("company_entity_id");`);
    this.addSql(`create index "customer_deal_companies_deal_idx" on "customer_deal_companies" ("deal_id");`);
    this.addSql(`alter table "customer_deal_companies" add constraint "customer_deal_companies_unique" unique ("deal_id", "company_entity_id");`);

    this.addSql(`create table "customer_deal_people" ("id" uuid not null default gen_random_uuid(), "role" text null, "created_at" timestamptz(6) not null, "deal_id" uuid not null, "person_entity_id" uuid not null, constraint "customer_deal_people_pkey" primary key ("id"));`);
    this.addSql(`create index "customer_deal_people_deal_idx" on "customer_deal_people" ("deal_id");`);
    this.addSql(`create index "customer_deal_people_person_idx" on "customer_deal_people" ("person_entity_id");`);
    this.addSql(`alter table "customer_deal_people" add constraint "customer_deal_people_unique" unique ("deal_id", "person_entity_id");`);

    this.addSql(`create table "customer_deals" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "title" text not null, "description" text null, "status" text not null default 'open', "pipeline_stage" text null, "value_amount" numeric(14,2) null, "value_currency" text null, "probability" int4 null, "expected_close_at" timestamptz(6) null, "owner_user_id" uuid null, "source" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "customer_deals_pkey" primary key ("id"));`);
    this.addSql(`create index "customer_deals_org_tenant_idx" on "customer_deals" ("organization_id", "tenant_id");`);

    this.addSql(`create table "customer_dictionary_entries" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "kind" text not null, "value" text not null, "normalized_value" text not null, "label" text not null, "color" text null, "icon" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "customer_dictionary_entries_pkey" primary key ("id"));`);
    this.addSql(`create index "customer_dictionary_entries_scope_idx" on "customer_dictionary_entries" ("organization_id", "tenant_id", "kind");`);
    this.addSql(`alter table "customer_dictionary_entries" add constraint "customer_dictionary_entries_unique" unique ("organization_id", "tenant_id", "kind", "normalized_value");`);

    this.addSql(`create table "customer_entities" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "kind" text not null, "display_name" text not null, "description" text null, "owner_user_id" uuid null, "primary_email" text null, "primary_phone" text null, "status" text null, "lifecycle_stage" text null, "source" text null, "next_interaction_at" timestamptz(6) null, "next_interaction_name" text null, "next_interaction_ref_id" text null, "next_interaction_icon" text null, "next_interaction_color" text null, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "customer_entities_pkey" primary key ("id"));`);
    this.addSql(`create index "customer_entities_org_tenant_kind_idx" on "customer_entities" ("organization_id", "tenant_id", "kind");`);
    this.addSql(`create index "idx_ce_tenant_company_id" on "customer_entities" ("tenant_id", "id");`);
    this.addSql(`create index "idx_ce_tenant_org_company_id" on "customer_entities" ("tenant_id", "organization_id", "id");`);
    this.addSql(`create index "idx_ce_tenant_org_person_id" on "customer_entities" ("tenant_id", "organization_id", "id");`);
    this.addSql(`create index "idx_ce_tenant_person_id" on "customer_entities" ("tenant_id", "id");`);

    this.addSql(`create table "customer_people" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "first_name" text null, "last_name" text null, "preferred_name" text null, "job_title" text null, "department" text null, "seniority" text null, "timezone" text null, "linked_in_url" text null, "twitter_url" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "entity_id" uuid not null, "company_entity_id" uuid null, constraint "customer_people_pkey" primary key ("id"));`);
    this.addSql(`alter table "customer_people" add constraint "customer_people_entity_id_unique" unique ("entity_id");`);
    this.addSql(`create index "customer_people_org_tenant_idx" on "customer_people" ("organization_id", "tenant_id");`);
    this.addSql(`create index "idx_customer_people_entity_id" on "customer_people" ("entity_id");`);

    this.addSql(`create table "customer_settings" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "address_format" text not null default 'line_first', "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "customer_settings_pkey" primary key ("id"));`);
    this.addSql(`alter table "customer_settings" add constraint "customer_settings_scope_unique" unique ("organization_id", "tenant_id");`);

    this.addSql(`create table "customer_tag_assignments" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz(6) not null, "tag_id" uuid not null, "entity_id" uuid not null, constraint "customer_tag_assignments_pkey" primary key ("id"));`);
    this.addSql(`create index "customer_tag_assignments_entity_idx" on "customer_tag_assignments" ("entity_id");`);
    this.addSql(`alter table "customer_tag_assignments" add constraint "customer_tag_assignments_unique" unique ("tag_id", "entity_id");`);

    this.addSql(`create table "customer_tags" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "slug" text not null, "label" text not null, "color" text null, "description" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "customer_tags_pkey" primary key ("id"));`);
    this.addSql(`alter table "customer_tags" add constraint "customer_tags_org_slug_unique" unique ("organization_id", "tenant_id", "slug");`);
    this.addSql(`create index "customer_tags_org_tenant_idx" on "customer_tags" ("organization_id", "tenant_id");`);

    this.addSql(`create table "customer_todo_links" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "todo_id" uuid not null, "todo_source" text not null default 'example:todo', "created_at" timestamptz(6) not null, "created_by_user_id" uuid null, "entity_id" uuid not null, constraint "customer_todo_links_pkey" primary key ("id"));`);
    this.addSql(`create index "customer_todo_links_entity_created_idx" on "customer_todo_links" ("entity_id", "created_at");`);
    this.addSql(`create index "customer_todo_links_entity_idx" on "customer_todo_links" ("entity_id");`);
    this.addSql(`alter table "customer_todo_links" add constraint "customer_todo_links_unique" unique ("entity_id", "todo_id", "todo_source");`);

    this.addSql(`create table "dashboard_layouts" ("id" uuid not null default gen_random_uuid(), "user_id" uuid not null, "tenant_id" uuid null, "organization_id" uuid null, "layout_json" jsonb not null default '[]', "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) null, "deleted_at" timestamptz(6) null, constraint "dashboard_layouts_pkey" primary key ("id"));`);
    this.addSql(`alter table "dashboard_layouts" add constraint "dashboard_layouts_user_id_tenant_id_organization_id_unique" unique ("user_id", "tenant_id", "organization_id");`);

    this.addSql(`create table "dashboard_role_widgets" ("id" uuid not null default gen_random_uuid(), "role_id" uuid not null, "tenant_id" uuid null, "organization_id" uuid null, "widget_ids_json" jsonb not null default '[]', "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) null, "deleted_at" timestamptz(6) null, constraint "dashboard_role_widgets_pkey" primary key ("id"));`);
    this.addSql(`alter table "dashboard_role_widgets" add constraint "dashboard_role_widgets_role_id_tenant_id_organization_id_unique" unique ("role_id", "tenant_id", "organization_id");`);

    this.addSql(`create table "dashboard_user_widgets" ("id" uuid not null default gen_random_uuid(), "user_id" uuid not null, "tenant_id" uuid null, "organization_id" uuid null, "mode" text not null default 'inherit', "widget_ids_json" jsonb not null default '[]', "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) null, "deleted_at" timestamptz(6) null, constraint "dashboard_user_widgets_pkey" primary key ("id"));`);
    this.addSql(`alter table "dashboard_user_widgets" add constraint "dashboard_user_widgets_user_id_tenant_id_organization_id_unique" unique ("user_id", "tenant_id", "organization_id");`);

    this.addSql(`create table "dictionaries" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "key" text not null, "name" text not null, "description" text null, "is_system" bool not null default false, "is_active" bool not null default true, "manager_visibility" text not null default 'default', "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "dictionaries_pkey" primary key ("id"));`);
    this.addSql(`alter table "dictionaries" add constraint "dictionaries_scope_key_unique" unique ("organization_id", "tenant_id", "key");`);

    this.addSql(`create table "dictionary_entries" ("id" uuid not null default gen_random_uuid(), "dictionary_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "value" text not null, "normalized_value" text not null, "label" text not null, "color" text null, "icon" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "dictionary_entries_pkey" primary key ("id"));`);
    this.addSql(`create index "dictionary_entries_scope_idx" on "dictionary_entries" ("dictionary_id", "organization_id", "tenant_id");`);
    this.addSql(`alter table "dictionary_entries" add constraint "dictionary_entries_unique" unique ("dictionary_id", "organization_id", "tenant_id", "normalized_value");`);

    this.addSql(`create table "encryption_maps" ("id" uuid not null default gen_random_uuid(), "entity_id" text not null, "tenant_id" uuid null, "organization_id" uuid null, "fields_json" jsonb null, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "encryption_maps_pkey" primary key ("id"));`);
    this.addSql(`create index "encryption_maps_entity_scope_idx" on "encryption_maps" ("entity_id", "tenant_id", "organization_id");`);

    this.addSql(`create table "entity_index_coverage" ("id" uuid not null default gen_random_uuid(), "entity_type" text not null, "tenant_id" uuid null, "organization_id" uuid null, "with_deleted" bool not null default false, "base_count" int4 not null default 0, "indexed_count" int4 not null default 0, "vector_indexed_count" int4 not null default 0, "refreshed_at" timestamptz(6) not null, constraint "entity_index_coverage_pkey" primary key ("id"));`);
    this.addSql(`alter table "entity_index_coverage" add constraint "entity_index_coverage_scope_idx" unique ("entity_type", "tenant_id", "organization_id", "with_deleted");`);

    this.addSql(`create table "entity_index_jobs" ("id" uuid not null default gen_random_uuid(), "entity_type" text not null, "organization_id" uuid null, "tenant_id" uuid null, "partition_index" int4 null, "partition_count" int4 null, "processed_count" int4 null, "total_count" int4 null, "heartbeat_at" timestamptz(6) null, "status" text not null, "started_at" timestamptz(6) not null, "finished_at" timestamptz(6) null, constraint "entity_index_jobs_pkey" primary key ("id"));`);
    this.addSql(`create index "entity_index_jobs_org_idx" on "entity_index_jobs" ("organization_id");`);
    this.addSql(`create index "entity_index_jobs_type_idx" on "entity_index_jobs" ("entity_type");`);

    this.addSql(`create table "entity_indexes" ("id" uuid not null default gen_random_uuid(), "entity_type" text not null, "entity_id" text not null, "organization_id" uuid null, "tenant_id" uuid null, "doc" jsonb not null, "embedding" jsonb null, "index_version" int4 not null default 1, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "organization_id_coalesced" uuid generated always as COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid) stored null, constraint "entity_indexes_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX entity_indexes_customer_company_profile_doc_idx ON public.entity_indexes USING btree (entity_id, organization_id, tenant_id) INCLUDE (doc) WHERE ((deleted_at IS NULL) AND (entity_type = 'customers:customer_company_profile'::text) AND (organization_id IS NOT NULL) AND (tenant_id IS NOT NULL));`);
    this.addSql(`CREATE INDEX entity_indexes_customer_company_profile_tenant_doc_idx ON public.entity_indexes USING btree (tenant_id, entity_id) INCLUDE (doc) WHERE ((deleted_at IS NULL) AND (entity_type = 'customers:customer_company_profile'::text) AND (organization_id IS NULL) AND (tenant_id IS NOT NULL));`);
    this.addSql(`CREATE INDEX entity_indexes_customer_entity_doc_idx ON public.entity_indexes USING btree (entity_id, organization_id, tenant_id) INCLUDE (doc) WHERE ((deleted_at IS NULL) AND (entity_type = 'customers:customer_entity'::text) AND (organization_id IS NOT NULL) AND (tenant_id IS NOT NULL));`);
    this.addSql(`CREATE INDEX entity_indexes_customer_entity_tenant_doc_idx ON public.entity_indexes USING btree (tenant_id, entity_id) INCLUDE (doc) WHERE ((deleted_at IS NULL) AND (entity_type = 'customers:customer_entity'::text) AND (organization_id IS NULL) AND (tenant_id IS NOT NULL));`);
    this.addSql(`CREATE INDEX entity_indexes_customer_person_profile_doc_idx ON public.entity_indexes USING btree (entity_id, organization_id, tenant_id) INCLUDE (doc) WHERE ((deleted_at IS NULL) AND (entity_type = 'customers:customer_person_profile'::text) AND (organization_id IS NOT NULL) AND (tenant_id IS NOT NULL));`);
    this.addSql(`CREATE INDEX entity_indexes_customer_person_profile_tenant_doc_idx ON public.entity_indexes USING btree (tenant_id, entity_id) INCLUDE (doc) WHERE ((deleted_at IS NULL) AND (entity_type = 'customers:customer_person_profile'::text) AND (organization_id IS NULL) AND (tenant_id IS NOT NULL));`);
    this.addSql(`create index "entity_indexes_entity_idx" on "entity_indexes" ("entity_id");`);
    this.addSql(`create index "entity_indexes_org_idx" on "entity_indexes" ("organization_id");`);
    this.addSql(`create index "entity_indexes_type_idx" on "entity_indexes" ("entity_type");`);
    this.addSql(`create index "entity_indexes_type_tenant_idx" on "entity_indexes" ("entity_type", "tenant_id");`);
    this.addSql(`alter table "entity_indexes" add constraint "entity_indexes_upsert_idx" unique ("entity_type", "entity_id", "organization_id_coalesced");`);

    this.addSql(`create table "example_items" ("id" uuid not null default gen_random_uuid(), "title" text not null, "created_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "example_items_pkey" primary key ("id"));`);

    this.addSql(`create table "exchange_rates" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "from_currency_code" text not null, "to_currency_code" text not null, "rate" numeric(18,8) not null, "date" timestamptz(6) not null, "source" text not null, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "type" text null, constraint "exchange_rates_pkey" primary key ("id"));`);
    this.addSql(`alter table "exchange_rates" add constraint "exchange_rates_pair_datetime_source_unique" unique ("organization_id", "tenant_id", "from_currency_code", "to_currency_code", "date", "source");`);
    this.addSql(`create index "exchange_rates_pair_idx" on "exchange_rates" ("from_currency_code", "to_currency_code", "date");`);
    this.addSql(`create index "exchange_rates_scope_idx" on "exchange_rates" ("organization_id", "tenant_id");`);

    this.addSql(`create table "feature_toggle_audit_logs" ("id" uuid not null default gen_random_uuid(), "toggle_id" uuid not null, "organization_id" uuid null, "actor_user_id" uuid null, "action" text not null, "previous_value" jsonb null, "new_value" jsonb null, "changed_fields" jsonb null, "created_at" timestamptz(6) not null, constraint "feature_toggle_audit_logs_pkey" primary key ("id"));`);
    this.addSql(`create index "feature_toggle_audit_action_idx" on "feature_toggle_audit_logs" ("action", "created_at");`);
    this.addSql(`create index "feature_toggle_audit_actor_idx" on "feature_toggle_audit_logs" ("actor_user_id", "created_at");`);
    this.addSql(`create index "feature_toggle_audit_org_idx" on "feature_toggle_audit_logs" ("organization_id", "created_at");`);
    this.addSql(`create index "feature_toggle_audit_toggle_idx" on "feature_toggle_audit_logs" ("toggle_id", "created_at");`);

    this.addSql(`create table "feature_toggle_overrides" ("id" uuid not null default gen_random_uuid(), "toggle_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "value" jsonb not null, constraint "feature_toggle_overrides_pkey" primary key ("id"));`);
    this.addSql(`create index "feature_toggle_overrides_tenant_idx" on "feature_toggle_overrides" ("tenant_id");`);
    this.addSql(`create index "feature_toggle_overrides_toggle_idx" on "feature_toggle_overrides" ("toggle_id");`);
    this.addSql(`alter table "feature_toggle_overrides" add constraint "feature_toggle_overrides_toggle_tenant_unique" unique ("toggle_id", "tenant_id");`);

    this.addSql(`create table "feature_toggles" ("id" uuid not null default gen_random_uuid(), "identifier" text not null, "name" text not null, "description" text null, "category" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "default_value" jsonb not null, "type" text not null, constraint "feature_toggles_pkey" primary key ("id"));`);
    this.addSql(`create index "feature_toggles_category_idx" on "feature_toggles" ("category");`);
    this.addSql(`alter table "feature_toggles" add constraint "feature_toggles_identifier_unique" unique ("identifier");`);
    this.addSql(`create index "feature_toggles_name_idx" on "feature_toggles" ("name");`);

    this.addSql(`create table "fms_air_units" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "project_id" uuid not null, "delivery_status" text not null default 'awaiting', "is_loose" bool not null default true, "is_stackable" bool not null default true, "is_dgr" bool not null default false, "dgr_un_number" text null, "dgr_class" text null, "pieces" int4 null, "gross_weight" numeric(18,4) null, "chargeable_weight" numeric(18,4) null, "volume" numeric(18,4) null, "loading_meters" numeric(18,4) null, "commodity" text null, "description" text null, "target_rate" numeric(18,4) null, "unit_type" text null, "unit_number" text null, "origin_type" text not null default 'airport', "origin_airport" text null, "destination_airport" text null, "shipment_ready_date" timestamptz(6) null, "required_at_destination" timestamptz(6) null, "etd" timestamptz(6) null, "eta" timestamptz(6) null, "atd" timestamptz(6) null, "ata" timestamptz(6) null, "mawb_number" text null, "hawb_number" text null, "booking_number" text null, "flight_number" text null, "carrier_code" text null, "aircraft_type" text null, "notes" text null, "customs_clearance_status" text null, "customs_clearance_location" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "fms_air_units_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_air_units_mawb_idx" on "fms_air_units" ("mawb_number");`);
    this.addSql(`create index "fms_air_units_org_tenant_idx" on "fms_air_units" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_air_units_project_idx" on "fms_air_units" ("project_id");`);

    this.addSql(`create table "fms_carriers" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "name" text not null, "carrier_type" text not null, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "created_by" uuid null, "updated_at" timestamptz(6) not null, "updated_by" uuid null, "deleted_at" timestamptz(6) null, constraint "fms_carriers_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_carriers_scope_idx" on "fms_carriers" ("organization_id", "tenant_id");`);

    this.addSql(`create table "fms_documents" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "category" text not null default 'other', "description" text null, "attachment_id" uuid not null, "related_entity_id" uuid null, "related_entity_type" text null, "extracted_data" jsonb null, "processed_at" timestamptz(6) null, "created_at" timestamptz(6) not null, "created_by" uuid null, "updated_at" timestamptz(6) not null, "updated_by" uuid null, "deleted_at" timestamptz(6) null, constraint "fms_documents_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_documents_attachment_idx" on "fms_documents" ("attachment_id");`);
    this.addSql(`create index "fms_documents_category_idx" on "fms_documents" ("category");`);
    this.addSql(`create index "fms_documents_related_entity_idx" on "fms_documents" ("related_entity_id", "related_entity_type");`);
    this.addSql(`create index "fms_documents_scope_idx" on "fms_documents" ("organization_id", "tenant_id");`);

    this.addSql(`create table "fms_email_settings" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "company_name" text null, "company_logo_url" text null, "primary_color" text not null default '#1a365d', "accent_color" text not null default '#f7fafc', "contact_email" text null, "contact_phone" text null, "website_url" text null, "footer_text" text null, "footer_disclaimer" text null, "from_name" text null, "from_email" text null, "reply_to_email" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "fms_email_settings_pkey" primary key ("id"));`);
    this.addSql(`alter table "fms_email_settings" add constraint "fms_email_settings_scope_unique" unique ("organization_id", "tenant_id");`);

    this.addSql(`create table "fms_email_templates" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "template_type" text not null, "subject_template" text not null, "html_template" text not null, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "fms_email_templates_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_email_templates_org_tenant_idx" on "fms_email_templates" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "fms_email_templates" add constraint "fms_email_templates_scope_type_unique" unique ("organization_id", "tenant_id", "template_type");`);

    this.addSql(`create table "fms_invoice_line_items" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "invoice_id" uuid not null, "line_number" int4 not null, "description" text not null, "quantity" numeric(18,4) not null default '1', "unit" text null, "unit_price_net" numeric(18,4) not null default '0', "vat_rate" numeric(5,2) not null default '0', "net_amount" numeric(18,2) not null default '0', "vat_amount" numeric(18,2) not null default '0', "gross_amount" numeric(18,2) not null default '0', "product_id" uuid null, "charge_code_match_confidence" int4 null, "raw_description" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "fms_invoice_line_items_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_invoice_line_items_invoice_idx" on "fms_invoice_line_items" ("invoice_id");`);
    this.addSql(`create index "fms_invoice_line_items_product_idx" on "fms_invoice_line_items" ("product_id");`);
    this.addSql(`create index "fms_invoice_line_items_scope_idx" on "fms_invoice_line_items" ("organization_id", "tenant_id");`);

    this.addSql(`create table "fms_invoice_pages" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "invoice_id" uuid not null, "page_number" int4 not null, "storage_path" text not null, "storage_driver" text not null default 'local', "width" int4 null, "height" int4 null, "file_size" int4 null, "extracted_text" text null, "created_at" timestamptz(6) not null, constraint "fms_invoice_pages_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_invoice_pages_invoice_idx" on "fms_invoice_pages" ("invoice_id");`);
    this.addSql(`create index "fms_invoice_pages_scope_idx" on "fms_invoice_pages" ("organization_id", "tenant_id");`);

    this.addSql(`create table "fms_invoices" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "invoice_number" text null, "invoice_date" date null, "due_date" date null, "service_date" date null, "seller_name" text null, "seller_tax_id" text null, "seller_address" text null, "buyer_name" text null, "buyer_tax_id" text null, "buyer_address" text null, "net_amount" numeric(18,2) not null default '0', "vat_amount" numeric(18,2) not null default '0', "gross_amount" numeric(18,2) not null default '0', "currency_code" text not null default 'PLN', "attachment_id" uuid null, "original_filename" text null, "extracted_data" jsonb null, "extraction_confidence" text null, "processed_at" timestamptz(6) null, "document_type" text not null default 'invoice', "document_type_confidence" int4 null, "transportation_metadata" jsonb null, "bl_number" text null, "container_numbers" jsonb null, "vessel_name" text null, "voyage_number" text null, "custom_reference" text null, "status" text not null default 'pending_review', "reviewed_by" uuid null, "reviewed_at" timestamptz(6) null, "review_notes" text null, "created_at" timestamptz(6) not null, "created_by" uuid null, "updated_at" timestamptz(6) not null, "updated_by" uuid null, "deleted_at" timestamptz(6) null, constraint "fms_invoices_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_invoices_bl_number_idx" on "fms_invoices" ("bl_number");`);
    this.addSql(`create index "fms_invoices_date_idx" on "fms_invoices" ("organization_id", "tenant_id", "invoice_date");`);
    this.addSql(`create index "fms_invoices_scope_idx" on "fms_invoices" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_invoices_seller_idx" on "fms_invoices" ("organization_id", "tenant_id", "seller_name");`);
    this.addSql(`create index "fms_invoices_status_idx" on "fms_invoices" ("organization_id", "tenant_id", "status");`);

    this.addSql(`create table "fms_locations" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "name" text not null, "product_type" text not null, "locode" text null, "port_id" uuid null, "lat" float8 null, "lng" float8 null, "city" text null, "country" text null, "contractor_id" uuid null, "address_line1" text null, "address_line2" text null, "state" text null, "postal_code" text null, "is_primary" bool not null default false, "is_active" bool not null default true, "google_place_id" text null, "created_at" timestamptz(6) not null, "created_by" uuid null, "updated_at" timestamptz(6) not null, "updated_by" uuid null, "deleted_at" timestamptz(6) null, constraint "fms_locations_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_locations_contractor_idx" on "fms_locations" ("contractor_id");`);
    this.addSql(`create index "fms_locations_scope_idx" on "fms_locations" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_locations_type_idx" on "fms_locations" ("product_type");`);

    this.addSql(`create table "fms_offer_calculations" ("id" uuid not null default gen_random_uuid(), "offer_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "calculation_number" int4 not null default 1, "label" text null, "containers" jsonb null, "origin_location_id" uuid null, "destination_location_id" uuid null, "place_of_loading_id" uuid null, "place_of_delivery_id" uuid null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "fms_offer_calculations_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_offer_calcs_offer_idx" on "fms_offer_calculations" ("offer_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "fms_offer_calcs_org_tenant_idx" on "fms_offer_calculations" ("organization_id", "tenant_id");`);

    this.addSql(`create table "fms_offer_lines" ("id" uuid not null default gen_random_uuid(), "calculation_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "line_number" int4 not null default 0, "product_id" uuid null, "product_name" text null, "charge_code" text null, "charge_basis" text null, "currency_code" text not null default 'USD', "rate" numeric(18,4) not null default '0', "buy_price" numeric(18,4) not null default '0', "sell_price" numeric(18,4) not null default '0', "container_type" text null, "is_enabled" bool not null default false, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "fms_offer_lines_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_offer_lines_calc_idx" on "fms_offer_lines" ("calculation_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "fms_offer_lines_org_tenant_idx" on "fms_offer_lines" ("organization_id", "tenant_id");`);

    this.addSql(`create table "fms_offers" ("id" uuid not null default gen_random_uuid(), "rfq_id" uuid null, "organization_id" uuid not null, "tenant_id" uuid not null, "offer_number" text not null, "version" int4 not null default 1, "status" text not null default 'draft', "direction" text null, "transport_mode" text null, "cargo_type" text null, "valid_until" timestamptz(6) null, "payment_terms" text null, "special_terms" text null, "customer_notes" text null, "notes" text null, "superseded_by_id" uuid null, "assigned_to_id" uuid null, "operational_guardian_id" uuid null, "business_guardian_id" uuid null, "document_id" uuid null, "sent_at" timestamptz(6) null, "sent_to_email" text null, "exchange_rates" jsonb null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "fms_offers_pkey" primary key ("id"));`);
    this.addSql(`alter table "fms_offers" add constraint "fms_offers_number_unique" unique ("organization_id", "tenant_id", "offer_number");`);
    this.addSql(`create index "fms_offers_org_tenant_idx" on "fms_offers" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_offers_rfq_idx" on "fms_offers" ("rfq_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "fms_offers_status_idx" on "fms_offers" ("organization_id", "tenant_id", "status");`);

    this.addSql(`create table "fms_products" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "charge_code" text null, "charge_unit" text null, "transport_mode" text null, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "created_by" uuid null, "updated_at" timestamptz(6) not null, "updated_by" uuid null, "deleted_at" timestamptz(6) null, constraint "fms_products_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_products_active_idx" on "fms_products" ("organization_id", "tenant_id", "is_active");`);
    this.addSql(`create index "fms_products_charge_code_idx" on "fms_products" ("organization_id", "tenant_id", "charge_code");`);
    this.addSql(`create index "fms_products_scope_idx" on "fms_products" ("organization_id", "tenant_id");`);

    this.addSql(`create table "fms_project_cargo" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "project_id" uuid not null, "cargo_sequence" int4 null, "commodity_description" text not null, "hs_code" text null, "package_type" text not null, "package_count" int4 not null, "marks_and_numbers" text null, "length" numeric(18,4) null, "width" numeric(18,4) null, "height" numeric(18,4) null, "dimension_unit" text null, "gross_weight" numeric(18,4) not null, "net_weight" numeric(18,4) null, "weight_unit" text not null, "volume" numeric(18,4) null, "volume_unit" text null, "is_hazardous" bool not null default false, "hazmat_class" text null, "un_number" text null, "is_stackable" bool not null default true, "requires_refrigeration" bool not null default false, "temperature_min" numeric(18,4) null, "temperature_max" numeric(18,4) null, "temperature_unit" text null, "declared_value" numeric(18,4) null, "declared_value_currency" text null, "status" text not null default 'not_ready', "notes" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "fms_project_cargo_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_project_cargo_org_tenant_idx" on "fms_project_cargo" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_project_cargo_project_idx" on "fms_project_cargo" ("project_id");`);

    this.addSql(`create table "fms_project_invoices" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "project_id" uuid not null, "document_id" uuid not null, "invoice_number" text null, "seller_name" text null, "seller_nip" text null, "seller_details" jsonb null, "buyer_name" text null, "buyer_nip" text null, "buyer_details" jsonb null, "net_amount" numeric(18,4) null, "vat_amount" numeric(18,4) null, "gross_amount" numeric(18,4) null, "currency_code" text not null default 'PLN', "invoice_date" timestamptz(6) null, "payment_due_date" timestamptz(6) null, "service_date" timestamptz(6) null, "payment_method" text null, "line_items" jsonb null, "confidence" text not null default 'REVIEW', "extraction_strategies" jsonb null, "raw_extraction_data" jsonb null, "status" text not null default 'pending_review', "reviewed_by" uuid null, "reviewed_at" timestamptz(6) null, "review_notes" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "fms_project_invoices_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_project_invoices_document_idx" on "fms_project_invoices" ("document_id");`);
    this.addSql(`create index "fms_project_invoices_org_tenant_idx" on "fms_project_invoices" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_project_invoices_project_idx" on "fms_project_invoices" ("project_id");`);
    this.addSql(`create index "fms_project_invoices_status_idx" on "fms_project_invoices" ("status");`);

    this.addSql(`create table "fms_project_legs" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "project_id" uuid not null, "leg_sequence" int4 not null, "transport_mode" text not null, "origin_location_id" uuid null, "destination_location_id" uuid null, "origin_address" text null, "destination_address" text null, "carrier_id" uuid null, "carrier_name" text null, "vessel_name" text null, "voyage_number" text null, "flight_number" text null, "estimated_departure" timestamptz(6) null, "estimated_arrival" timestamptz(6) null, "actual_departure" timestamptz(6) null, "actual_arrival" timestamptz(6) null, "estimated_cost" numeric(18,4) null, "actual_cost" numeric(18,4) null, "notes" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "fms_project_legs_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_project_legs_org_tenant_idx" on "fms_project_legs" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_project_legs_project_idx" on "fms_project_legs" ("project_id", "leg_sequence");`);

    this.addSql(`create table "fms_project_lines" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "project_id" uuid not null, "line_number" int4 not null default 0, "source_offer_line_id" uuid null, "source_type" text not null default 'manual', "product_id" uuid null, "price_id" uuid null, "product_name" text not null, "charge_code" text null, "container_size" text null, "charge_category" text null, "charge_unit" text null, "container_type" text null, "quantity" numeric(18,4) not null default '1', "currency_code" text not null default 'USD', "sold_unit_price" numeric(18,4) not null default '0', "sold_amount" numeric(18,4) not null default '0', "actual_unit_cost" numeric(18,4) null, "actual_cost" numeric(18,4) null, "notes" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "fms_project_lines_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_project_lines_org_tenant_idx" on "fms_project_lines" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_project_lines_project_idx" on "fms_project_lines" ("project_id");`);

    this.addSql(`create table "fms_project_notes" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "project_id" uuid not null, "body" text not null, "author_user_id" uuid null, "author_name" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "fms_project_notes_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_project_notes_org_tenant_idx" on "fms_project_notes" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_project_notes_project_idx" on "fms_project_notes" ("project_id");`);

    this.addSql(`create table "fms_projects" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "project_number" text not null, "client_id" uuid null, "rfq_id" uuid null, "offer_id" uuid null, "shipment_id" uuid null, "workflow_instance_id" uuid null, "current_step" text null, "workflow_context" jsonb null, "shipment_type" text not null, "direction" text not null, "cargo_type" text not null, "incoterm" text null, "transport_modes" jsonb null, "origin_location_id" uuid null, "destination_location_id" uuid null, "place_of_loading_id" uuid null, "place_of_discharge_id" uuid null, "origin_address" text null, "destination_address" text null, "project_date" timestamptz(6) not null, "requested_pickup_date" timestamptz(6) null, "requested_delivery_date" timestamptz(6) null, "etd" timestamptz(6) null, "eta" timestamptz(6) null, "atd" timestamptz(6) null, "ata" timestamptz(6) null, "cargo_ready_date" timestamptz(6) null, "vgm_cutoff_date" timestamptz(6) null, "doc_cutoff_date" timestamptz(6) null, "gate_in_date" timestamptz(6) null, "gate_close_date" timestamptz(6) null, "carrier_id" uuid null, "client_reference" text null, "internal_reference" text null, "commodity_description" text null, "hs_code" text null, "container_count" int4 null, "transport_unit_count" int4 null, "total_gross_weight" numeric(18,4) null, "total_volume" numeric(18,4) null, "weight_unit" text null, "volume_unit" text null, "currency_code" text not null default 'USD', "estimated_cost" numeric(18,4) null, "requires_insurance" bool not null default false, "requires_customs_brokerage" bool not null default false, "is_hazardous" bool not null default false, "hazmat_details" text null, "special_instructions" text null, "internal_notes" text null, "container_mode" text null, "service_level" text null, "bl_number" text null, "bl_type" text null, "release_type" text null, "notify_party_id" uuid null, "controlling_agent_id" uuid null, "controlling_customer_id" uuid null, "sending_agent_id" uuid null, "receiving_agent_id" uuid null, "agents_reference" text null, "booking_number" text null, "operator_id" uuid null, "operator_name" text null, "sales_person_id" uuid null, "sales_person_name" text null, "shipper_id" uuid null, "consignee_id" uuid null, "goods_value" numeric(18,2) null, "goods_value_currency" text null, "insurance_value" numeric(18,2) null, "insurance_value_currency" text null, "is_domestic" bool not null default false, "additional_terms" text null, "creditor_id" uuid null, "payment_terms" text null, "invoicing_status" text null, "ct_status" text null, "e_freight_status" text null, "charges_apply" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "fms_projects_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_projects_client_idx" on "fms_projects" ("client_id", "organization_id", "tenant_id");`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_number_unique" unique ("organization_id", "project_number");`);
    this.addSql(`create index "fms_projects_org_tenant_idx" on "fms_projects" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_projects_status_idx" on "fms_projects" ("organization_id", "tenant_id", "current_step");`);
    this.addSql(`create index "fms_projects_workflow_idx" on "fms_projects" ("workflow_instance_id");`);

    this.addSql(`create table "fms_rfqs" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "title" text null, "description" text null, "origin" text null, "destination" text null, "origin_location_id" uuid null, "destination_location_id" uuid null, "place_of_loading" text null, "place_of_loading_id" uuid null, "place_of_delivery" text null, "place_of_delivery_id" uuid null, "container_count" int4 null, "direction" text null, "transport_mode" text null, "cargo_type" text null, "company_name" text null, "contact_person" text null, "context" text null, "status" text not null default 'incoming', "assigned_to_id" uuid null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "fms_rfqs_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_rfqs_org_tenant_idx" on "fms_rfqs" ("organization_id", "tenant_id");`);

    this.addSql(`create table "fms_road_units" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "project_id" uuid not null, "vehicle_type" text not null, "truck_number" text null, "trailer_number" text null, "driver_name" text null, "driver_phone" text null, "cmr_number" text null, "booking_number" text null, "carrier_name" text null, "carrier_contact" text null, "origin_address" text null, "destination_address" text null, "pickup_date" timestamptz(6) null, "delivery_date" timestamptz(6) null, "actual_pickup" timestamptz(6) null, "actual_delivery" timestamptz(6) null, "pieces" int4 null, "gross_weight" numeric(18,4) null, "pallet_spaces" int4 null, "loading_meters" numeric(18,4) null, "status" text not null default 'not_ready', "is_hazardous" bool not null default false, "notes" text null, "unloading_notes" text null, "weighing_status" text null, "rate" numeric(18,4) null, "rate_currency" text null default 'PLN', "customs_status" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "fms_road_units_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_road_units_cmr_idx" on "fms_road_units" ("cmr_number");`);
    this.addSql(`create index "fms_road_units_org_tenant_idx" on "fms_road_units" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_road_units_project_idx" on "fms_road_units" ("project_id");`);

    this.addSql(`create table "fms_sea_containers" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "project_id" uuid not null, "container_type" text not null, "container_number" text null, "seal_number" text null, "ownership_type" text not null default 'coc', "booking_number" text null, "bl_number" text null, "vessel_name" text null, "vessel_imo" text null, "voyage_number" text null, "origin_port" text null, "destination_port" text null, "etd" timestamptz(6) null, "eta" timestamptz(6) null, "atd" timestamptz(6) null, "ata" timestamptz(6) null, "status" text not null default 'not_ready', "is_hazardous" bool not null default false, "notes" text null, "vgm_status" text null, "vgm_weight" numeric(12,3) null, "vgm_cutoff_date" timestamptz(6) null, "customs_clearance_status" text null, "customs_clearance_location" text null, "pin_code" text null, "delivery_time" text null, "drop_off_location" text null, "cut_off_date" timestamptz(6) null, "packs_count" int4 null, "pack_type" text null, "inners_count" int4 null, "inner_type" text null, "loading_meters" numeric(12,3) null, "chargeable_weight" numeric(12,3) null, "wv_ratio" numeric(8,4) null, "marks_and_numbers" text null, "hs_code" text null, "on_board_status" text null, "on_board_date" timestamptz(6) null, "bl_issue_date" timestamptz(6) null, "originals_count" int4 null, "express_bills_count" int4 null, "carrier_scac" text null, "imo_number" text null, "cto_receival_date" timestamptz(6) null, "cto_cut_off_date" timestamptz(6) null, "docs_due_date" timestamptz(6) null, "co2_emissions" numeric(12,3) null, "pickup_required_from" timestamptz(6) null, "pickup_required_by" timestamptz(6) null, "estimated_pickup" timestamptz(6) null, "actual_pickup" timestamptz(6) null, "pickup_location_id" uuid null, "pickup_notes" text null, "delivery_required_by" timestamptz(6) null, "estimated_delivery" timestamptz(6) null, "actual_delivery" timestamptz(6) null, "delivery_location_id" uuid null, "delivery_notes" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "fms_sea_containers_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_sea_containers_number_idx" on "fms_sea_containers" ("container_number");`);
    this.addSql(`create index "fms_sea_containers_org_tenant_idx" on "fms_sea_containers" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_sea_containers_project_idx" on "fms_sea_containers" ("project_id");`);

    this.addSql(`create table "fms_team_contractor_assignments" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "team_id" uuid not null, "contractor_id" uuid not null, "created_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "fms_team_contractor_assignments_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_team_contractor_asgn_contractor_idx" on "fms_team_contractor_assignments" ("contractor_id");`);
    this.addSql(`create index "fms_team_contractor_asgn_org_tenant_idx" on "fms_team_contractor_assignments" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_team_contractor_asgn_team_idx" on "fms_team_contractor_assignments" ("team_id");`);
    this.addSql(`alter table "fms_team_contractor_assignments" add constraint "fms_team_contractor_asgn_unique" unique ("organization_id", "team_id", "contractor_id");`);

    this.addSql(`create table "fms_teams" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "fms_teams_pkey" primary key ("id"));`);
    this.addSql(`alter table "fms_teams" add constraint "fms_teams_name_unique" unique ("organization_id", "tenant_id", "name");`);
    this.addSql(`create index "fms_teams_org_tenant_idx" on "fms_teams" ("organization_id", "tenant_id");`);

    this.addSql(`create table "fms_user_contractor_assignments" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "user_id" uuid not null, "contractor_id" uuid not null, "created_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "fms_user_contractor_assignments_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_user_contractor_asgn_contractor_idx" on "fms_user_contractor_assignments" ("contractor_id");`);
    this.addSql(`create index "fms_user_contractor_asgn_org_tenant_idx" on "fms_user_contractor_assignments" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "fms_user_contractor_assignments" add constraint "fms_user_contractor_asgn_unique" unique ("organization_id", "user_id", "contractor_id");`);
    this.addSql(`create index "fms_user_contractor_asgn_user_idx" on "fms_user_contractor_assignments" ("user_id");`);

    this.addSql(`create table "fms_user_teams" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "team_id" uuid null, "user_id" uuid not null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "fms_user_teams_pkey" primary key ("id"));`);
    this.addSql(`create index "fms_user_teams_org_tenant_idx" on "fms_user_teams" ("organization_id", "tenant_id");`);
    this.addSql(`create index "fms_user_teams_team_idx" on "fms_user_teams" ("team_id");`);
    this.addSql(`create index "fms_user_teams_user_idx" on "fms_user_teams" ("user_id");`);
    this.addSql(`alter table "fms_user_teams" add constraint "fms_user_teams_user_org_unique" unique ("organization_id", "user_id");`);

    this.addSql(`create table "indexer_error_logs" ("id" uuid not null default gen_random_uuid(), "source" text not null, "handler" text not null, "entity_type" text null, "record_id" text null, "tenant_id" uuid null, "organization_id" uuid null, "payload" jsonb null, "message" text not null, "stack" text null, "occurred_at" timestamptz(6) not null, constraint "indexer_error_logs_pkey" primary key ("id"));`);
    this.addSql(`create index "indexer_error_logs_occurred_idx" on "indexer_error_logs" ("occurred_at");`);
    this.addSql(`create index "indexer_error_logs_source_idx" on "indexer_error_logs" ("source");`);

    this.addSql(`create table "indexer_status_logs" ("id" uuid not null default gen_random_uuid(), "source" text not null, "handler" text not null, "level" text not null default 'info', "entity_type" text null, "record_id" text null, "tenant_id" uuid null, "organization_id" uuid null, "message" text not null, "details" jsonb null, "occurred_at" timestamptz(6) not null default now(), constraint "indexer_status_logs_pkey" primary key ("id"));`);
    this.addSql(`create index "indexer_status_logs_occurred_idx" on "indexer_status_logs" ("occurred_at");`);
    this.addSql(`create index "indexer_status_logs_source_idx" on "indexer_status_logs" ("source");`);

    this.addSql(`create table "mikro_orm_migrations_api_keys" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_attachments" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_audit_logs" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_auth" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_business_rules" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_catalog" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_configs" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_contractors" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_currencies" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_customers" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_dashboards" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_dictionaries" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_directory" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_email_templates" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_entities" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_example" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_feature_toggles" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_fms_documents" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_fms_financials" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_fms_locations" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_fms_offers" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_fms_products" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_fms_projects" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_fms_teams" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_notifications" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_onboarding" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_perspectives" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_planner" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_query_index" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_resources" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_sales" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_staff" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "mikro_orm_migrations_workflows" ("id" serial primary key, "name" varchar(255) null, "executed_at" timestamptz(6) null default CURRENT_TIMESTAMP);`);

    this.addSql(`create table "module_configs" ("id" uuid not null default gen_random_uuid(), "module_id" text not null, "name" text not null, "value_json" jsonb null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "module_configs_pkey" primary key ("id"));`);
    this.addSql(`create index "module_configs_module_idx" on "module_configs" ("module_id");`);
    this.addSql(`alter table "module_configs" add constraint "module_configs_module_name_unique" unique ("module_id", "name");`);

    this.addSql(`create table "notifications" ("id" uuid not null default gen_random_uuid(), "recipient_user_id" uuid not null, "type" text not null, "title" text not null, "body" text null, "icon" text null, "severity" text not null default 'info', "status" text not null default 'unread', "action_data" jsonb null, "action_result" jsonb null, "action_taken" text null, "source_module" text null, "source_entity_type" text null, "source_entity_id" uuid null, "link_href" text null, "group_key" text null, "created_at" timestamptz(6) not null default now(), "read_at" timestamptz(6) null, "actioned_at" timestamptz(6) null, "dismissed_at" timestamptz(6) null, "expires_at" timestamptz(6) null, "tenant_id" uuid not null, "organization_id" uuid null, "title_key" text null, "body_key" text null, "title_variables" jsonb null, "body_variables" jsonb null, constraint "notifications_pkey" primary key ("id"));`);
    this.addSql(`comment on column "notifications"."title_key" is 'i18n key for notification title';`);
    this.addSql(`comment on column "notifications"."body_key" is 'i18n key for notification body';`);
    this.addSql(`comment on column "notifications"."title_variables" is 'Variables for i18n interpolation in title';`);
    this.addSql(`comment on column "notifications"."body_variables" is 'Variables for i18n interpolation in body';`);
    this.addSql(`CREATE INDEX notifications_expires_idx ON public.notifications USING btree (expires_at) WHERE ((expires_at IS NOT NULL) AND (status <> ALL (ARRAY['actioned'::text, 'dismissed'::text])));`);
    this.addSql(`CREATE INDEX notifications_group_idx ON public.notifications USING btree (group_key, recipient_user_id) WHERE (group_key IS NOT NULL);`);
    this.addSql(`create index "notifications_recipient_status_idx" on "notifications" ("recipient_user_id", "status", "created_at");`);
    this.addSql(`CREATE INDEX notifications_source_idx ON public.notifications USING btree (source_entity_type, source_entity_id) WHERE (source_entity_id IS NOT NULL);`);
    this.addSql(`create index "notifications_tenant_idx" on "notifications" ("tenant_id", "organization_id");`);

    this.addSql(`create table "onboarding_requests" ("id" uuid not null default gen_random_uuid(), "email" text not null, "token_hash" text not null, "status" text not null default 'pending', "first_name" text not null, "last_name" text not null, "organization_name" text not null, "locale" text null, "terms_accepted" bool not null default false, "password_hash" text null, "expires_at" timestamptz(6) not null, "completed_at" timestamptz(6) null, "tenant_id" uuid null, "organization_id" uuid null, "user_id" uuid null, "last_email_sent_at" timestamptz(6) null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) null, "deleted_at" timestamptz(6) null, "processing_started_at" timestamptz(6) null, constraint "onboarding_requests_pkey" primary key ("id"));`);
    this.addSql(`alter table "onboarding_requests" add constraint "onboarding_requests_email_unique" unique ("email");`);
    this.addSql(`alter table "onboarding_requests" add constraint "onboarding_requests_token_hash_unique" unique ("token_hash");`);

    this.addSql(`create table "organizations" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "name" text not null, "is_active" bool not null default true, "parent_id" uuid null, "root_id" uuid null, "tree_path" text null, "depth" int4 not null default 0, "ancestor_ids" jsonb not null default '[]', "child_ids" jsonb not null default '[]', "descendant_ids" jsonb not null default '[]', "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "organizations_pkey" primary key ("id"));`);

    this.addSql(`create table "password_resets" ("id" uuid not null default gen_random_uuid(), "user_id" uuid not null, "token" text not null, "expires_at" timestamptz(6) not null, "used_at" timestamptz(6) null, "created_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "password_resets_pkey" primary key ("id"));`);
    this.addSql(`alter table "password_resets" add constraint "password_resets_token_unique" unique ("token");`);

    this.addSql(`create table "perspectives" ("id" uuid not null default gen_random_uuid(), "user_id" uuid not null, "tenant_id" uuid null, "organization_id" uuid null, "table_id" text not null, "name" text not null, "settings_json" jsonb not null, "is_default" bool not null default false, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) null, "deleted_at" timestamptz(6) null, constraint "perspectives_pkey" primary key ("id"));`);
    this.addSql(`alter table "perspectives" add constraint "perspectives_user_id_tenant_id_organization_id_ta_2d725_unique" unique ("user_id", "tenant_id", "organization_id", "table_id", "name");`);
    this.addSql(`create index "perspectives_user_scope_idx" on "perspectives" ("user_id", "tenant_id", "organization_id", "table_id");`);

    this.addSql(`create table "planner_availability_rule_sets" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "name" text not null, "description" text null, "timezone" text not null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "planner_availability_rule_sets_pkey" primary key ("id"));`);
    this.addSql(`create index "planner_availability_rule_sets_tenant_org_idx" on "planner_availability_rule_sets" ("tenant_id", "organization_id");`);

    this.addSql(`create table "planner_availability_rules" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "subject_type" text check ("subject_type" in ('member', 'resource', 'ruleset')) not null, "subject_id" uuid not null, "timezone" text not null, "rrule" text not null, "exdates" jsonb not null default '[]', "kind" text check ("kind" in ('availability', 'unavailability')) not null default 'availability', "note" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "unavailability_reason_entry_id" uuid null, "unavailability_reason_value" text null, constraint "planner_availability_rules_pkey" primary key ("id"));`);
    this.addSql(`create index "planner_availability_rules_subject_idx" on "planner_availability_rules" ("subject_type", "subject_id", "tenant_id", "organization_id");`);
    this.addSql(`create index "planner_availability_rules_tenant_org_idx" on "planner_availability_rules" ("tenant_id", "organization_id");`);

    this.addSql(`create table "resources_resource_activities" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "activity_type" text not null, "subject" text null, "body" text null, "occurred_at" timestamptz(6) null, "author_user_id" uuid null, "appearance_icon" text null, "appearance_color" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "resource_id" uuid not null, constraint "resources_resource_activities_pkey" primary key ("id"));`);
    this.addSql(`create index "resources_resource_activities_resource_idx" on "resources_resource_activities" ("resource_id");`);
    this.addSql(`create index "resources_resource_activities_resource_occurred_created_idx" on "resources_resource_activities" ("resource_id", "occurred_at", "created_at");`);
    this.addSql(`create index "resources_resource_activities_tenant_org_idx" on "resources_resource_activities" ("tenant_id", "organization_id");`);

    this.addSql(`create table "resources_resource_comments" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "body" text not null, "author_user_id" uuid null, "appearance_icon" text null, "appearance_color" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "resource_id" uuid not null, constraint "resources_resource_comments_pkey" primary key ("id"));`);
    this.addSql(`create index "resources_resource_comments_resource_idx" on "resources_resource_comments" ("resource_id");`);
    this.addSql(`create index "resources_resource_comments_tenant_org_idx" on "resources_resource_comments" ("tenant_id", "organization_id");`);

    this.addSql(`create table "resources_resource_tag_assignments" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "tag_id" uuid not null, "resource_id" uuid not null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "resources_resource_tag_assignments_pkey" primary key ("id"));`);
    this.addSql(`create index "resources_resource_tag_assignments_scope_idx" on "resources_resource_tag_assignments" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "resources_resource_tag_assignments" add constraint "resources_resource_tag_assignments_unique" unique ("tag_id", "resource_id");`);

    this.addSql(`create table "resources_resource_tags" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "slug" text not null, "label" text not null, "color" text null, "description" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "resources_resource_tags_pkey" primary key ("id"));`);
    this.addSql(`create index "resources_resource_tags_scope_idx" on "resources_resource_tags" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "resources_resource_tags" add constraint "resources_resource_tags_slug_unique" unique ("organization_id", "tenant_id", "slug");`);

    this.addSql(`create table "resources_resource_types" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "name" text not null, "description" text null, "appearance_icon" text null, "appearance_color" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "resources_resource_types_pkey" primary key ("id"));`);
    this.addSql(`create index "resources_resource_types_tenant_org_idx" on "resources_resource_types" ("tenant_id", "organization_id");`);

    this.addSql(`create table "resources_resources" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "name" text not null, "description" text null, "resource_type_id" uuid null, "capacity" int4 null, "capacity_unit_value" text null, "capacity_unit_name" text null, "capacity_unit_color" text null, "capacity_unit_icon" text null, "appearance_icon" text null, "appearance_color" text null, "is_active" bool not null default true, "availability_rule_set_id" uuid null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "resources_resources_pkey" primary key ("id"));`);
    this.addSql(`create index "resources_resources_tenant_org_idx" on "resources_resources" ("tenant_id", "organization_id");`);

    this.addSql(`create table "role_acls" ("id" uuid not null default gen_random_uuid(), "role_id" uuid not null, "tenant_id" uuid not null, "features_json" jsonb null, "is_super_admin" bool not null default false, "organizations_json" jsonb null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) null, "deleted_at" timestamptz(6) null, constraint "role_acls_pkey" primary key ("id"));`);

    this.addSql(`create table "role_perspectives" ("id" uuid not null default gen_random_uuid(), "role_id" uuid not null, "tenant_id" uuid null, "organization_id" uuid null, "table_id" text not null, "name" text not null, "settings_json" jsonb not null, "is_default" bool not null default false, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) null, "deleted_at" timestamptz(6) null, constraint "role_perspectives_pkey" primary key ("id"));`);
    this.addSql(`alter table "role_perspectives" add constraint "role_perspectives_role_id_tenant_id_organization__c5467_unique" unique ("role_id", "tenant_id", "organization_id", "table_id", "name");`);
    this.addSql(`create index "role_perspectives_role_scope_idx" on "role_perspectives" ("role_id", "tenant_id", "organization_id", "table_id");`);

    this.addSql(`create table "role_sidebar_preferences" ("id" uuid not null default gen_random_uuid(), "role_id" uuid not null, "tenant_id" uuid null, "locale" text not null, "settings_json" jsonb null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) null, "deleted_at" timestamptz(6) null, constraint "role_sidebar_preferences_pkey" primary key ("id"));`);
    this.addSql(`alter table "role_sidebar_preferences" add constraint "role_sidebar_preferences_role_id_tenant_id_locale_unique" unique ("role_id", "tenant_id", "locale");`);

    this.addSql(`create table "roles" ("id" uuid not null default gen_random_uuid(), "name" text not null, "tenant_id" uuid null, "created_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "roles_pkey" primary key ("id"));`);
    this.addSql(`alter table "roles" add constraint "roles_tenant_id_name_unique" unique ("tenant_id", "name");`);

    this.addSql(`create table "rule_execution_logs" ("id" bigserial primary key, "rule_id" uuid not null, "entity_id" varchar(255) not null, "entity_type" varchar(50) not null, "execution_result" varchar(20) not null, "input_context" jsonb null, "output_context" jsonb null, "error_message" text null, "execution_time_ms" int4 not null, "executed_at" timestamptz(6) not null, "tenant_id" uuid not null, "organization_id" uuid null, "executed_by" varchar(50) null);`);
    this.addSql(`create index "rule_execution_logs_entity_idx" on "rule_execution_logs" ("entity_type", "entity_id");`);
    this.addSql(`create index "rule_execution_logs_result_idx" on "rule_execution_logs" ("execution_result", "executed_at");`);
    this.addSql(`create index "rule_execution_logs_rule_idx" on "rule_execution_logs" ("rule_id");`);
    this.addSql(`create index "rule_execution_logs_tenant_org_idx" on "rule_execution_logs" ("tenant_id", "organization_id");`);

    this.addSql(`create table "rule_set_members" ("id" uuid not null default gen_random_uuid(), "rule_set_id" uuid not null, "rule_id" uuid not null, "sequence" int4 not null default 0, "enabled" bool not null default true, "tenant_id" uuid not null, "organization_id" uuid not null, "created_at" timestamptz(6) not null, constraint "rule_set_members_pkey" primary key ("id"));`);
    this.addSql(`create index "rule_set_members_rule_idx" on "rule_set_members" ("rule_id");`);
    this.addSql(`alter table "rule_set_members" add constraint "rule_set_members_rule_set_id_rule_id_unique" unique ("rule_set_id", "rule_id");`);
    this.addSql(`create index "rule_set_members_set_idx" on "rule_set_members" ("rule_set_id", "sequence");`);
    this.addSql(`create index "rule_set_members_tenant_org_idx" on "rule_set_members" ("tenant_id", "organization_id");`);

    this.addSql(`create table "rule_sets" ("id" uuid not null default gen_random_uuid(), "set_id" varchar(50) not null, "set_name" varchar(200) not null, "description" text null, "enabled" bool not null default true, "tenant_id" uuid not null, "organization_id" uuid not null, "created_by" varchar(50) null, "updated_by" varchar(50) null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "rule_sets_pkey" primary key ("id"));`);
    this.addSql(`create index "rule_sets_enabled_idx" on "rule_sets" ("enabled");`);
    this.addSql(`alter table "rule_sets" add constraint "rule_sets_set_id_tenant_id_unique" unique ("set_id", "tenant_id");`);
    this.addSql(`create index "rule_sets_tenant_org_idx" on "rule_sets" ("tenant_id", "organization_id");`);

    this.addSql(`create table "sales_channels" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "code" text null, "description" text null, "status_entry_id" uuid null, "status" text null, "website_url" text null, "contact_email" text null, "contact_phone" text null, "address_line1" text null, "address_line2" text null, "city" text null, "region" text null, "postal_code" text null, "country" text null, "latitude" numeric(10,6) null, "longitude" numeric(10,6) null, "is_active" bool not null default true, "metadata" jsonb null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "sales_channels_pkey" primary key ("id"));`);
    this.addSql(`alter table "sales_channels" add constraint "sales_channels_code_unique" unique ("organization_id", "tenant_id", "code");`);
    this.addSql(`create index "sales_channels_org_tenant_idx" on "sales_channels" ("organization_id", "tenant_id");`);
    this.addSql(`create index "sales_channels_status_idx" on "sales_channels" ("organization_id", "tenant_id", "status");`);

    this.addSql(`create table "sales_credit_memo_lines" ("id" uuid not null default gen_random_uuid(), "credit_memo_id" uuid not null, "order_line_id" uuid null, "organization_id" uuid not null, "tenant_id" uuid not null, "line_number" int4 not null default 0, "description" text null, "quantity" numeric(18,4) not null default '0', "quantity_unit" text null, "currency_code" text not null, "unit_price_net" numeric(18,4) not null default '0', "unit_price_gross" numeric(18,4) not null default '0', "tax_rate" numeric(7,4) not null default '0', "tax_amount" numeric(18,4) not null default '0', "total_net_amount" numeric(18,4) not null default '0', "total_gross_amount" numeric(18,4) not null default '0', "metadata" jsonb null, constraint "sales_credit_memo_lines_pkey" primary key ("id"));`);
    this.addSql(`create index "sales_credit_memo_lines_scope_idx" on "sales_credit_memo_lines" ("credit_memo_id", "organization_id", "tenant_id");`);

    this.addSql(`create table "sales_credit_memos" ("id" uuid not null default gen_random_uuid(), "order_id" uuid null, "invoice_id" uuid null, "organization_id" uuid not null, "tenant_id" uuid not null, "credit_memo_number" text not null, "status_entry_id" uuid null, "status" text null, "issue_date" timestamptz(6) null, "currency_code" text not null, "subtotal_net_amount" numeric(18,4) not null default '0', "subtotal_gross_amount" numeric(18,4) not null default '0', "tax_total_amount" numeric(18,4) not null default '0', "grand_total_net_amount" numeric(18,4) not null default '0', "grand_total_gross_amount" numeric(18,4) not null default '0', "metadata" jsonb null, "custom_field_set_id" uuid null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "sales_credit_memos_pkey" primary key ("id"));`);
    this.addSql(`alter table "sales_credit_memos" add constraint "sales_credit_memos_number_unique" unique ("organization_id", "tenant_id", "credit_memo_number");`);
    this.addSql(`create index "sales_credit_memos_scope_idx" on "sales_credit_memos" ("order_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "sales_credit_memos_status_idx" on "sales_credit_memos" ("organization_id", "tenant_id", "status");`);

    this.addSql(`create table "sales_delivery_windows" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "code" text not null, "description" text null, "lead_time_days" int4 null, "cutoff_time" text null, "timezone" text null, "is_active" bool not null default true, "metadata" jsonb null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "sales_delivery_windows_pkey" primary key ("id"));`);
    this.addSql(`alter table "sales_delivery_windows" add constraint "sales_delivery_windows_code_unique" unique ("organization_id", "tenant_id", "code");`);
    this.addSql(`create index "sales_delivery_windows_scope_idx" on "sales_delivery_windows" ("organization_id", "tenant_id");`);

    this.addSql(`create table "sales_document_addresses" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "document_id" uuid not null, "document_kind" text not null, "order_id" uuid null, "quote_id" uuid null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "customer_address_id" uuid null, "name" text null, "purpose" text null, "company_name" text null, "address_line1" text not null, "address_line2" text null, "city" text null, "region" text null, "postal_code" text null, "country" text null, "building_number" text null, "flat_number" text null, "latitude" float4 null, "longitude" float4 null, "deleted_at" timestamptz(6) null, constraint "sales_document_addresses_pkey" primary key ("id"));`);
    this.addSql(`create index "sales_document_addresses_scope_idx" on "sales_document_addresses" ("organization_id", "tenant_id");`);

    this.addSql(`create table "sales_document_sequences" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "document_kind" text not null, "current_value" int4 not null default 0, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "sales_document_sequences_pkey" primary key ("id"));`);
    this.addSql(`alter table "sales_document_sequences" add constraint "sales_document_sequences_scope_unique" unique ("organization_id", "tenant_id", "document_kind");`);

    this.addSql(`create table "sales_document_tag_assignments" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "tag_id" uuid not null, "document_id" uuid not null, "document_kind" text not null, "order_id" uuid null, "quote_id" uuid null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "sales_document_tag_assignments_pkey" primary key ("id"));`);
    this.addSql(`create index "sales_document_tag_assignments_scope_idx" on "sales_document_tag_assignments" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "sales_document_tag_assignments" add constraint "sales_document_tag_assignments_unique" unique ("tag_id", "document_id", "document_kind");`);

    this.addSql(`create table "sales_document_tags" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "slug" text not null, "label" text not null, "color" text null, "description" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "sales_document_tags_pkey" primary key ("id"));`);
    this.addSql(`create index "sales_document_tags_scope_idx" on "sales_document_tags" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "sales_document_tags" add constraint "sales_document_tags_slug_unique" unique ("organization_id", "tenant_id", "slug");`);

    this.addSql(`create table "sales_invoice_lines" ("id" uuid not null default gen_random_uuid(), "invoice_id" uuid not null, "order_line_id" uuid null, "organization_id" uuid not null, "tenant_id" uuid not null, "line_number" int4 not null default 0, "kind" text not null default 'product', "description" text null, "quantity" numeric(18,4) not null default '0', "quantity_unit" text null, "currency_code" text not null, "unit_price_net" numeric(18,4) not null default '0', "unit_price_gross" numeric(18,4) not null default '0', "discount_amount" numeric(18,4) not null default '0', "discount_percent" numeric(7,4) not null default '0', "tax_rate" numeric(7,4) not null default '0', "tax_amount" numeric(18,4) not null default '0', "total_net_amount" numeric(18,4) not null default '0', "total_gross_amount" numeric(18,4) not null default '0', "metadata" jsonb null, constraint "sales_invoice_lines_pkey" primary key ("id"));`);
    this.addSql(`create index "sales_invoice_lines_scope_idx" on "sales_invoice_lines" ("invoice_id", "organization_id", "tenant_id");`);

    this.addSql(`create table "sales_invoices" ("id" uuid not null default gen_random_uuid(), "order_id" uuid null, "organization_id" uuid not null, "tenant_id" uuid not null, "invoice_number" text not null, "status_entry_id" uuid null, "status" text null, "issue_date" timestamptz(6) null, "due_date" timestamptz(6) null, "currency_code" text not null, "subtotal_net_amount" numeric(18,4) not null default '0', "subtotal_gross_amount" numeric(18,4) not null default '0', "discount_total_amount" numeric(18,4) not null default '0', "tax_total_amount" numeric(18,4) not null default '0', "grand_total_net_amount" numeric(18,4) not null default '0', "grand_total_gross_amount" numeric(18,4) not null default '0', "paid_total_amount" numeric(18,4) not null default '0', "outstanding_amount" numeric(18,4) not null default '0', "metadata" jsonb null, "custom_field_set_id" uuid null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "sales_invoices_pkey" primary key ("id"));`);
    this.addSql(`alter table "sales_invoices" add constraint "sales_invoices_number_unique" unique ("organization_id", "tenant_id", "invoice_number");`);
    this.addSql(`create index "sales_invoices_scope_idx" on "sales_invoices" ("order_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "sales_invoices_status_idx" on "sales_invoices" ("organization_id", "tenant_id", "status");`);

    this.addSql(`create table "sales_notes" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "context_type" text not null, "context_id" uuid not null, "order_id" uuid null, "quote_id" uuid null, "author_user_id" uuid null, "body" text not null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "appearance_icon" text null, "appearance_color" text null, "deleted_at" timestamptz(6) null, constraint "sales_notes_pkey" primary key ("id"));`);
    this.addSql(`create index "sales_notes_scope_idx" on "sales_notes" ("organization_id", "tenant_id");`);

    this.addSql(`create table "sales_order_adjustments" ("id" uuid not null default gen_random_uuid(), "order_id" uuid not null, "order_line_id" uuid null, "organization_id" uuid not null, "tenant_id" uuid not null, "scope" text not null default 'order', "kind" text not null default 'custom', "code" text null, "label" text null, "calculator_key" text null, "promotion_id" uuid null, "rate" numeric(7,4) not null default '0', "amount_net" numeric(18,4) not null default '0', "amount_gross" numeric(18,4) not null default '0', "currency_code" text null, "metadata" jsonb null, "position" int4 not null default 0, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "sales_order_adjustments_pkey" primary key ("id"));`);
    this.addSql(`create index "sales_order_adjustments_scope_idx" on "sales_order_adjustments" ("order_id", "organization_id", "tenant_id");`);

    this.addSql(`create table "sales_order_lines" ("id" uuid not null default gen_random_uuid(), "order_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "line_number" int4 not null default 0, "kind" text not null default 'product', "status_entry_id" uuid null, "status" text null, "product_id" uuid null, "product_variant_id" uuid null, "catalog_snapshot" jsonb null, "name" text null, "description" text null, "comment" text null, "quantity" numeric(18,4) not null default '0', "quantity_unit" text null, "reserved_quantity" numeric(18,4) not null default '0', "fulfilled_quantity" numeric(18,4) not null default '0', "invoiced_quantity" numeric(18,4) not null default '0', "returned_quantity" numeric(18,4) not null default '0', "currency_code" text not null, "unit_price_net" numeric(18,4) not null default '0', "unit_price_gross" numeric(18,4) not null default '0', "discount_amount" numeric(18,4) not null default '0', "discount_percent" numeric(7,4) not null default '0', "tax_rate" numeric(7,4) not null default '0', "tax_amount" numeric(18,4) not null default '0', "total_net_amount" numeric(18,4) not null default '0', "total_gross_amount" numeric(18,4) not null default '0', "configuration" jsonb null, "promotion_code" text null, "promotion_snapshot" jsonb null, "metadata" jsonb null, "custom_field_set_id" uuid null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "sales_order_lines_pkey" primary key ("id"));`);
    this.addSql(`create index "sales_order_lines_scope_idx" on "sales_order_lines" ("order_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "sales_order_lines_status_idx" on "sales_order_lines" ("organization_id", "tenant_id", "status");`);

    this.addSql(`create table "sales_orders" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "order_number" text not null, "external_reference" text null, "customer_reference" text null, "customer_entity_id" uuid null, "customer_contact_id" uuid null, "billing_address_id" uuid null, "shipping_address_id" uuid null, "currency_code" text not null, "exchange_rate" numeric(18,8) null, "status_entry_id" uuid null, "status" text null, "fulfillment_status_entry_id" uuid null, "fulfillment_status" text null, "payment_status_entry_id" uuid null, "payment_status" text null, "tax_strategy_key" text null, "discount_strategy_key" text null, "shipping_method_snapshot" jsonb null, "payment_method_snapshot" jsonb null, "placed_at" timestamptz(6) null, "expected_delivery_at" timestamptz(6) null, "due_at" timestamptz(6) null, "comments" text null, "internal_notes" text null, "subtotal_net_amount" numeric(18,4) not null default '0', "subtotal_gross_amount" numeric(18,4) not null default '0', "discount_total_amount" numeric(18,4) not null default '0', "tax_total_amount" numeric(18,4) not null default '0', "shipping_net_amount" numeric(18,4) not null default '0', "shipping_gross_amount" numeric(18,4) not null default '0', "surcharge_total_amount" numeric(18,4) not null default '0', "grand_total_net_amount" numeric(18,4) not null default '0', "grand_total_gross_amount" numeric(18,4) not null default '0', "paid_total_amount" numeric(18,4) not null default '0', "refunded_total_amount" numeric(18,4) not null default '0', "outstanding_amount" numeric(18,4) not null default '0', "line_item_count" int4 not null default 0, "metadata" jsonb null, "custom_field_set_id" uuid null, "channel_id" uuid null, "channel_ref_id" uuid null, "shipping_method_id" uuid null, "shipping_method_ref_id" uuid null, "delivery_window_id" uuid null, "delivery_window_ref_id" uuid null, "payment_method_id" uuid null, "payment_method_ref_id" uuid null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "customer_snapshot" jsonb null, "billing_address_snapshot" jsonb null, "shipping_address_snapshot" jsonb null, "tax_info" jsonb null, "delivery_window_snapshot" jsonb null, "shipping_method_code" text null, "delivery_window_code" text null, "payment_method_code" text null, "totals_snapshot" jsonb null, constraint "sales_orders_pkey" primary key ("id"));`);
    this.addSql(`create index "sales_orders_customer_idx" on "sales_orders" ("customer_entity_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "sales_orders_fulfillment_status_idx" on "sales_orders" ("organization_id", "tenant_id", "fulfillment_status");`);
    this.addSql(`alter table "sales_orders" add constraint "sales_orders_number_unique" unique ("organization_id", "tenant_id", "order_number");`);
    this.addSql(`create index "sales_orders_org_tenant_idx" on "sales_orders" ("organization_id", "tenant_id");`);
    this.addSql(`create index "sales_orders_payment_status_idx" on "sales_orders" ("organization_id", "tenant_id", "payment_status");`);
    this.addSql(`create index "sales_orders_status_idx" on "sales_orders" ("organization_id", "tenant_id", "status");`);

    this.addSql(`create table "sales_payment_allocations" ("id" uuid not null default gen_random_uuid(), "payment_id" uuid not null, "order_id" uuid null, "invoice_id" uuid null, "organization_id" uuid not null, "tenant_id" uuid not null, "amount" numeric(18,4) not null default '0', "currency_code" text not null, "metadata" jsonb null, constraint "sales_payment_allocations_pkey" primary key ("id"));`);
    this.addSql(`create index "sales_payment_allocations_scope_idx" on "sales_payment_allocations" ("payment_id", "organization_id", "tenant_id");`);

    this.addSql(`create table "sales_payment_methods" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "code" text not null, "description" text null, "provider_key" text null, "terms" text null, "is_active" bool not null default true, "metadata" jsonb null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "sales_payment_methods_pkey" primary key ("id"));`);
    this.addSql(`alter table "sales_payment_methods" add constraint "sales_payment_methods_code_unique" unique ("organization_id", "tenant_id", "code");`);
    this.addSql(`create index "sales_payment_methods_scope_idx" on "sales_payment_methods" ("organization_id", "tenant_id");`);

    this.addSql(`create table "sales_payments" ("id" uuid not null default gen_random_uuid(), "order_id" uuid null, "payment_method_id" uuid null, "organization_id" uuid not null, "tenant_id" uuid not null, "payment_reference" text null, "status_entry_id" uuid null, "status" text null, "amount" numeric(18,4) not null default '0', "currency_code" text not null, "captured_amount" numeric(18,4) not null default '0', "refunded_amount" numeric(18,4) not null default '0', "received_at" timestamptz(6) null, "captured_at" timestamptz(6) null, "metadata" jsonb null, "custom_field_set_id" uuid null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "sales_payments_pkey" primary key ("id"));`);
    this.addSql(`create index "sales_payments_scope_idx" on "sales_payments" ("order_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "sales_payments_status_idx" on "sales_payments" ("organization_id", "tenant_id", "status");`);

    this.addSql(`create table "sales_quote_adjustments" ("id" uuid not null default gen_random_uuid(), "quote_id" uuid not null, "quote_line_id" uuid null, "organization_id" uuid not null, "tenant_id" uuid not null, "scope" text not null default 'order', "kind" text not null default 'custom', "code" text null, "label" text null, "calculator_key" text null, "promotion_id" uuid null, "rate" numeric(7,4) not null default '0', "amount_net" numeric(18,4) not null default '0', "amount_gross" numeric(18,4) not null default '0', "currency_code" text null, "metadata" jsonb null, "position" int4 not null default 0, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "sales_quote_adjustments_pkey" primary key ("id"));`);
    this.addSql(`create index "sales_quote_adjustments_scope_idx" on "sales_quote_adjustments" ("quote_id", "organization_id", "tenant_id");`);

    this.addSql(`create table "sales_quote_lines" ("id" uuid not null default gen_random_uuid(), "quote_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "line_number" int4 not null default 0, "kind" text not null default 'product', "status_entry_id" uuid null, "status" text null, "product_id" uuid null, "product_variant_id" uuid null, "catalog_snapshot" jsonb null, "name" text null, "description" text null, "comment" text null, "quantity" numeric(18,4) not null default '0', "quantity_unit" text null, "currency_code" text not null, "unit_price_net" numeric(18,4) not null default '0', "unit_price_gross" numeric(18,4) not null default '0', "discount_amount" numeric(18,4) not null default '0', "discount_percent" numeric(7,4) not null default '0', "tax_rate" numeric(7,4) not null default '0', "tax_amount" numeric(18,4) not null default '0', "total_net_amount" numeric(18,4) not null default '0', "total_gross_amount" numeric(18,4) not null default '0', "configuration" jsonb null, "promotion_code" text null, "promotion_snapshot" jsonb null, "metadata" jsonb null, "custom_field_set_id" uuid null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "sales_quote_lines_pkey" primary key ("id"));`);
    this.addSql(`create index "sales_quote_lines_scope_idx" on "sales_quote_lines" ("quote_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "sales_quote_lines_status_idx" on "sales_quote_lines" ("organization_id", "tenant_id", "status");`);

    this.addSql(`create table "sales_quotes" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "quote_number" text not null, "status_entry_id" uuid null, "status" text null, "customer_entity_id" uuid null, "customer_contact_id" uuid null, "currency_code" text not null, "valid_from" timestamptz(6) null, "valid_until" timestamptz(6) null, "comments" text null, "subtotal_net_amount" numeric(18,4) not null default '0', "subtotal_gross_amount" numeric(18,4) not null default '0', "discount_total_amount" numeric(18,4) not null default '0', "tax_total_amount" numeric(18,4) not null default '0', "grand_total_net_amount" numeric(18,4) not null default '0', "grand_total_gross_amount" numeric(18,4) not null default '0', "line_item_count" int4 not null default 0, "metadata" jsonb null, "custom_field_set_id" uuid null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "converted_order_id" uuid null, "customer_snapshot" jsonb null, "billing_address_id" uuid null, "shipping_address_id" uuid null, "billing_address_snapshot" jsonb null, "shipping_address_snapshot" jsonb null, "tax_info" jsonb null, "shipping_method_id" uuid null, "shipping_method_code" text null, "shipping_method_ref_id" uuid null, "delivery_window_id" uuid null, "delivery_window_code" text null, "delivery_window_ref_id" uuid null, "payment_method_id" uuid null, "payment_method_code" text null, "payment_method_ref_id" uuid null, "shipping_method_snapshot" jsonb null, "delivery_window_snapshot" jsonb null, "payment_method_snapshot" jsonb null, "channel_id" uuid null, "channel_ref_id" uuid null, "external_reference" text null, "customer_reference" text null, "placed_at" timestamptz(6) null, "totals_snapshot" jsonb null, "acceptance_token" text null, "sent_at" timestamptz(6) null, constraint "sales_quotes_pkey" primary key ("id"));`);
    this.addSql(`alter table "sales_quotes" add constraint "sales_quotes_acceptance_token_unique" unique ("acceptance_token");`);
    this.addSql(`alter table "sales_quotes" add constraint "sales_quotes_number_unique" unique ("organization_id", "tenant_id", "quote_number");`);
    this.addSql(`create index "sales_quotes_scope_idx" on "sales_quotes" ("organization_id", "tenant_id");`);
    this.addSql(`create index "sales_quotes_status_idx" on "sales_quotes" ("organization_id", "tenant_id", "status");`);

    this.addSql(`create table "sales_settings" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "order_number_format" text not null default 'ORDER-{yyyy}{mm}{dd}-{seq:5}', "quote_number_format" text not null default 'QUOTE-{yyyy}{mm}{dd}-{seq:5}', "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "order_customer_editable_statuses" jsonb null, "order_address_editable_statuses" jsonb null, constraint "sales_settings_pkey" primary key ("id"));`);
    this.addSql(`alter table "sales_settings" add constraint "sales_settings_scope_unique" unique ("organization_id", "tenant_id");`);

    this.addSql(`create table "sales_shipment_items" ("id" uuid not null default gen_random_uuid(), "shipment_id" uuid not null, "order_line_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "quantity" numeric(18,4) not null default '0', "metadata" jsonb null, constraint "sales_shipment_items_pkey" primary key ("id"));`);
    this.addSql(`create index "sales_shipment_items_scope_idx" on "sales_shipment_items" ("shipment_id", "organization_id", "tenant_id");`);

    this.addSql(`create table "sales_shipments" ("id" uuid not null default gen_random_uuid(), "order_id" uuid not null, "organization_id" uuid not null, "tenant_id" uuid not null, "shipment_number" text null, "shipping_method_id" uuid null, "status_entry_id" uuid null, "status" text null, "carrier_name" text null, "tracking_numbers" jsonb null, "shipped_at" timestamptz(6) null, "delivered_at" timestamptz(6) null, "weight_value" numeric(16,4) null, "weight_unit" text null, "declared_value_net" numeric(18,4) null, "declared_value_gross" numeric(18,4) null, "currency_code" text null, "notes" text null, "metadata" jsonb null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "items_snapshot" jsonb null, constraint "sales_shipments_pkey" primary key ("id"));`);
    this.addSql(`create index "sales_shipments_scope_idx" on "sales_shipments" ("order_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "sales_shipments_status_idx" on "sales_shipments" ("organization_id", "tenant_id", "status");`);

    this.addSql(`create table "sales_shipping_methods" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "code" text not null, "description" text null, "carrier_code" text null, "service_level" text null, "estimated_transit_days" int4 null, "base_rate_net" numeric(16,4) not null default '0', "base_rate_gross" numeric(16,4) not null default '0', "currency_code" text null, "is_active" bool not null default true, "metadata" jsonb null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "provider_key" text null, constraint "sales_shipping_methods_pkey" primary key ("id"));`);
    this.addSql(`alter table "sales_shipping_methods" add constraint "sales_shipping_methods_code_unique" unique ("organization_id", "tenant_id", "code");`);
    this.addSql(`create index "sales_shipping_methods_scope_idx" on "sales_shipping_methods" ("organization_id", "tenant_id");`);

    this.addSql(`create table "sales_tax_rates" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "code" text not null, "rate" numeric(7,4) not null, "country_code" text null, "region_code" text null, "postal_code" text null, "city" text null, "customer_group_id" uuid null, "product_category_id" uuid null, "channel_id" uuid null, "priority" int4 not null default 0, "is_compound" bool not null default false, "metadata" jsonb null, "starts_at" timestamptz(6) null, "ends_at" timestamptz(6) null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "is_default" bool not null default false, constraint "sales_tax_rates_pkey" primary key ("id"));`);
    this.addSql(`alter table "sales_tax_rates" add constraint "sales_tax_rates_code_unique" unique ("organization_id", "tenant_id", "code");`);
    this.addSql(`create index "sales_tax_rates_scope_idx" on "sales_tax_rates" ("organization_id", "tenant_id");`);

    this.addSql(`create table "search_tokens" ("id" uuid not null default gen_random_uuid(), "entity_type" text not null, "entity_id" text not null, "organization_id" uuid null, "tenant_id" uuid null, "field" text not null, "token_hash" text not null, "token" text null, "created_at" timestamptz(6) not null, constraint "search_tokens_pkey" primary key ("id"));`);
    this.addSql(`create index "search_tokens_entity_idx" on "search_tokens" ("entity_type", "entity_id");`);
    this.addSql(`create index "search_tokens_lookup_idx" on "search_tokens" ("entity_type", "field", "token_hash", "tenant_id", "organization_id");`);

    this.addSql(`create table "sessions" ("id" uuid not null default gen_random_uuid(), "user_id" uuid not null, "token" text not null, "expires_at" timestamptz(6) not null, "created_at" timestamptz(6) not null, "last_used_at" timestamptz(6) null, "deleted_at" timestamptz(6) null, constraint "sessions_pkey" primary key ("id"));`);
    this.addSql(`alter table "sessions" add constraint "sessions_token_unique" unique ("token");`);

    this.addSql(`create table "staff_leave_requests" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "member_id" uuid not null, "start_date" timestamptz(6) not null, "end_date" timestamptz(6) not null, "timezone" text not null, "status" text check ("status" in ('pending', 'approved', 'rejected')) not null default 'pending', "unavailability_reason_entry_id" uuid null, "unavailability_reason_value" text null, "note" text null, "decision_comment" text null, "submitted_by_user_id" uuid null, "decided_by_user_id" uuid null, "decided_at" timestamptz(6) null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "staff_leave_requests_pkey" primary key ("id"));`);
    this.addSql(`create index "staff_leave_requests_member_idx" on "staff_leave_requests" ("member_id");`);
    this.addSql(`create index "staff_leave_requests_status_idx" on "staff_leave_requests" ("status", "tenant_id", "organization_id");`);
    this.addSql(`create index "staff_leave_requests_tenant_org_idx" on "staff_leave_requests" ("tenant_id", "organization_id");`);

    this.addSql(`create table "staff_team_member_activities" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "activity_type" text not null, "subject" text null, "body" text null, "occurred_at" timestamptz(6) null, "author_user_id" uuid null, "appearance_icon" text null, "appearance_color" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "member_id" uuid not null, constraint "staff_team_member_activities_pkey" primary key ("id"));`);
    this.addSql(`create index "staff_team_member_activities_member_idx" on "staff_team_member_activities" ("member_id");`);
    this.addSql(`create index "staff_team_member_activities_member_occurred_created_idx" on "staff_team_member_activities" ("member_id", "occurred_at", "created_at");`);
    this.addSql(`create index "staff_team_member_activities_tenant_org_idx" on "staff_team_member_activities" ("tenant_id", "organization_id");`);

    this.addSql(`create table "staff_team_member_addresses" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "name" text null, "purpose" text null, "company_name" text null, "address_line1" text not null, "address_line2" text null, "city" text null, "region" text null, "postal_code" text null, "country" text null, "building_number" text null, "flat_number" text null, "latitude" float4 null, "longitude" float4 null, "is_primary" bool not null default false, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "member_id" uuid not null, constraint "staff_team_member_addresses_pkey" primary key ("id"));`);
    this.addSql(`create index "staff_team_member_addresses_member_idx" on "staff_team_member_addresses" ("member_id");`);
    this.addSql(`create index "staff_team_member_addresses_tenant_org_idx" on "staff_team_member_addresses" ("tenant_id", "organization_id");`);

    this.addSql(`create table "staff_team_member_comments" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "body" text not null, "author_user_id" uuid null, "appearance_icon" text null, "appearance_color" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "member_id" uuid not null, constraint "staff_team_member_comments_pkey" primary key ("id"));`);
    this.addSql(`create index "staff_team_member_comments_member_idx" on "staff_team_member_comments" ("member_id");`);
    this.addSql(`create index "staff_team_member_comments_tenant_org_idx" on "staff_team_member_comments" ("tenant_id", "organization_id");`);

    this.addSql(`create table "staff_team_member_job_histories" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "name" text not null, "company_name" text null, "description" text null, "start_date" timestamptz(6) not null, "end_date" timestamptz(6) null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "member_id" uuid not null, constraint "staff_team_member_job_histories_pkey" primary key ("id"));`);
    this.addSql(`create index "staff_team_member_job_histories_member_idx" on "staff_team_member_job_histories" ("member_id");`);
    this.addSql(`create index "staff_team_member_job_histories_member_start_idx" on "staff_team_member_job_histories" ("member_id", "start_date");`);
    this.addSql(`create index "staff_team_member_job_histories_tenant_org_idx" on "staff_team_member_job_histories" ("tenant_id", "organization_id");`);

    this.addSql(`create table "staff_team_members" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "team_id" uuid null, "display_name" text not null, "description" text null, "user_id" uuid null, "role_ids" jsonb not null default '[]', "tags" jsonb not null default '[]', "availability_rule_set_id" uuid null, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "staff_team_members_pkey" primary key ("id"));`);
    this.addSql(`create index "staff_team_members_tenant_org_idx" on "staff_team_members" ("tenant_id", "organization_id");`);

    this.addSql(`create table "staff_team_roles" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "team_id" uuid null, "name" text not null, "description" text null, "appearance_icon" text null, "appearance_color" text null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "staff_team_roles_pkey" primary key ("id"));`);
    this.addSql(`create index "staff_team_roles_tenant_org_idx" on "staff_team_roles" ("tenant_id", "organization_id");`);

    this.addSql(`create table "staff_teams" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "name" text not null, "description" text null, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "staff_teams_pkey" primary key ("id"));`);
    this.addSql(`create index "staff_teams_tenant_org_idx" on "staff_teams" ("tenant_id", "organization_id");`);

    this.addSql(`create table "step_instances" ("id" uuid not null default gen_random_uuid(), "workflow_instance_id" uuid not null, "step_id" varchar(100) not null, "step_name" varchar(255) not null, "step_type" varchar(50) not null, "status" varchar(20) not null, "input_data" jsonb null, "output_data" jsonb null, "error_data" jsonb null, "entered_at" timestamptz(6) null, "exited_at" timestamptz(6) null, "execution_time_ms" int4 null, "retry_count" int4 not null default 0, "tenant_id" uuid not null, "organization_id" uuid not null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "step_instances_pkey" primary key ("id"));`);
    this.addSql(`create index "step_instances_step_id_idx" on "step_instances" ("step_id", "status");`);
    this.addSql(`create index "step_instances_tenant_org_idx" on "step_instances" ("tenant_id", "organization_id");`);
    this.addSql(`create index "step_instances_workflow_instance_idx" on "step_instances" ("workflow_instance_id", "status");`);

    this.addSql(`create table "tenants" ("id" uuid not null default gen_random_uuid(), "name" text not null, "is_active" bool not null default true, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "tenants_pkey" primary key ("id"));`);

    this.addSql(`create table "todos" ("id" uuid not null default gen_random_uuid(), "title" text not null, "tenant_id" uuid null, "organization_id" uuid null, "is_done" bool not null default false, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "todos_pkey" primary key ("id"));`);

    this.addSql(`create table "upgrade_action_runs" ("id" uuid not null default gen_random_uuid(), "version" text not null, "action_id" text not null, "organization_id" uuid not null, "tenant_id" uuid not null, "completed_at" timestamptz(6) not null, "created_at" timestamptz(6) not null, constraint "upgrade_action_runs_pkey" primary key ("id"));`);
    this.addSql(`alter table "upgrade_action_runs" add constraint "upgrade_action_runs_action_scope_unique" unique ("version", "action_id", "organization_id", "tenant_id");`);
    this.addSql(`create index "upgrade_action_runs_scope_idx" on "upgrade_action_runs" ("organization_id", "tenant_id");`);

    this.addSql(`create table "user_acls" ("id" uuid not null default gen_random_uuid(), "user_id" uuid not null, "tenant_id" uuid not null, "features_json" jsonb null, "is_super_admin" bool not null default false, "organizations_json" jsonb null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) null, "deleted_at" timestamptz(6) null, constraint "user_acls_pkey" primary key ("id"));`);

    this.addSql(`create table "user_roles" ("id" uuid not null default gen_random_uuid(), "user_id" uuid not null, "role_id" uuid not null, "created_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "user_roles_pkey" primary key ("id"));`);

    this.addSql(`create table "user_sidebar_preferences" ("id" uuid not null default gen_random_uuid(), "user_id" uuid not null, "tenant_id" uuid null, "organization_id" uuid null, "locale" text not null, "settings_json" jsonb null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) null, "deleted_at" timestamptz(6) null, constraint "user_sidebar_preferences_pkey" primary key ("id"));`);
    this.addSql(`alter table "user_sidebar_preferences" add constraint "user_sidebar_preferences_user_id_tenant_id_organi_f3f2f_unique" unique ("user_id", "tenant_id", "organization_id", "locale");`);

    this.addSql(`create table "user_tasks" ("id" uuid not null default gen_random_uuid(), "workflow_instance_id" uuid not null, "step_instance_id" uuid not null, "task_name" varchar(255) not null, "description" text null, "status" varchar(20) not null, "form_schema" jsonb null, "form_data" jsonb null, "assigned_to" varchar(255) null, "assigned_to_roles" text[] null, "claimed_by" varchar(255) null, "claimed_at" timestamptz(6) null, "due_date" timestamptz(6) null, "escalated_at" timestamptz(6) null, "escalated_to" varchar(255) null, "completed_by" varchar(255) null, "completed_at" timestamptz(6) null, "comments" text null, "tenant_id" uuid not null, "organization_id" uuid not null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, constraint "user_tasks_pkey" primary key ("id"));`);
    this.addSql(`create index "user_tasks_status_assigned_idx" on "user_tasks" ("status", "assigned_to");`);
    this.addSql(`create index "user_tasks_status_due_date_idx" on "user_tasks" ("status", "due_date");`);
    this.addSql(`create index "user_tasks_tenant_org_idx" on "user_tasks" ("tenant_id", "organization_id");`);
    this.addSql(`create index "user_tasks_workflow_instance_idx" on "user_tasks" ("workflow_instance_id");`);

    this.addSql(`create table "users" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid null, "organization_id" uuid null, "email" text not null, "name" text null, "password_hash" text null, "is_confirmed" bool not null default true, "last_login_at" timestamptz(6) null, "created_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "email_hash" text null, constraint "users_pkey" primary key ("id"));`);
    this.addSql(`create index "users_email_hash_idx" on "users" ("email_hash");`);
    this.addSql(`alter table "users" add constraint "users_email_unique" unique ("email");`);

    this.addSql(`create table "workflow_definitions" ("id" uuid not null default gen_random_uuid(), "workflow_id" varchar(100) not null, "workflow_name" varchar(255) not null, "description" text null, "version" int4 not null default 1, "definition" jsonb not null, "metadata" jsonb null, "enabled" bool not null default true, "effective_from" timestamptz(6) null, "effective_to" timestamptz(6) null, "tenant_id" uuid not null, "organization_id" uuid not null, "created_by" varchar(255) null, "updated_by" varchar(255) null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "workflow_definitions_pkey" primary key ("id"));`);
    this.addSql(`create index "workflow_definitions_enabled_idx" on "workflow_definitions" ("enabled");`);
    this.addSql(`create index "workflow_definitions_tenant_org_idx" on "workflow_definitions" ("tenant_id", "organization_id");`);
    this.addSql(`create index "workflow_definitions_workflow_id_idx" on "workflow_definitions" ("workflow_id");`);
    this.addSql(`alter table "workflow_definitions" add constraint "workflow_definitions_workflow_id_tenant_id_unique" unique ("workflow_id", "tenant_id");`);

    this.addSql(`create table "workflow_event_triggers" ("id" uuid not null default gen_random_uuid(), "name" varchar(255) not null, "description" text null, "workflow_definition_id" uuid not null, "event_pattern" varchar(255) not null, "config" jsonb null, "enabled" bool not null default true, "priority" int4 not null default 0, "tenant_id" uuid not null, "organization_id" uuid not null, "created_by" varchar(255) null, "updated_by" varchar(255) null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, constraint "workflow_event_triggers_pkey" primary key ("id"));`);
    this.addSql(`create index "workflow_event_triggers_definition_idx" on "workflow_event_triggers" ("workflow_definition_id");`);
    this.addSql(`create index "workflow_event_triggers_enabled_priority_idx" on "workflow_event_triggers" ("enabled", "priority");`);
    this.addSql(`create index "workflow_event_triggers_event_pattern_idx" on "workflow_event_triggers" ("event_pattern", "enabled");`);
    this.addSql(`create index "workflow_event_triggers_tenant_org_idx" on "workflow_event_triggers" ("tenant_id", "organization_id");`);

    this.addSql(`create table "workflow_events" ("id" bigserial primary key, "workflow_instance_id" uuid not null, "step_instance_id" uuid null, "event_type" varchar(50) not null, "event_data" jsonb not null, "occurred_at" timestamptz(6) not null, "user_id" varchar(255) null, "tenant_id" uuid not null, "organization_id" uuid not null);`);
    this.addSql(`create index "workflow_events_event_type_idx" on "workflow_events" ("event_type", "occurred_at");`);
    this.addSql(`create index "workflow_events_instance_occurred_idx" on "workflow_events" ("workflow_instance_id", "occurred_at");`);
    this.addSql(`create index "workflow_events_tenant_org_idx" on "workflow_events" ("tenant_id", "organization_id");`);

    this.addSql(`create table "workflow_instances" ("id" uuid not null default gen_random_uuid(), "definition_id" uuid not null, "workflow_id" varchar(100) not null, "version" int4 not null, "status" varchar(30) not null, "current_step_id" varchar(100) not null, "context" jsonb not null, "correlation_key" varchar(255) null, "metadata" jsonb null, "started_at" timestamptz(6) not null, "completed_at" timestamptz(6) null, "paused_at" timestamptz(6) null, "cancelled_at" timestamptz(6) null, "error_message" text null, "error_details" jsonb null, "retry_count" int4 not null default 0, "tenant_id" uuid not null, "organization_id" uuid not null, "created_at" timestamptz(6) not null, "updated_at" timestamptz(6) not null, "deleted_at" timestamptz(6) null, "pending_transition" jsonb null, constraint "workflow_instances_pkey" primary key ("id"));`);
    this.addSql(`create index "workflow_instances_correlation_key_idx" on "workflow_instances" ("correlation_key");`);
    this.addSql(`create index "workflow_instances_current_step_idx" on "workflow_instances" ("current_step_id", "status");`);
    this.addSql(`create index "workflow_instances_definition_status_idx" on "workflow_instances" ("definition_id", "status");`);
    this.addSql(`create index "workflow_instances_status_tenant_idx" on "workflow_instances" ("status", "tenant_id");`);
    this.addSql(`create index "workflow_instances_tenant_org_idx" on "workflow_instances" ("tenant_id", "organization_id");`);

    this.addSql(`alter table "catalog_product_category_assignments" add constraint "catalog_product_category_assignments_category_id_foreign" foreign key ("category_id") references "catalog_product_categories" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "catalog_product_category_assignments" add constraint "catalog_product_category_assignments_product_id_foreign" foreign key ("product_id") references "catalog_products" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "catalog_product_offers" add constraint "catalog_product_offers_product_id_foreign" foreign key ("product_id") references "catalog_products" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "catalog_product_options" add constraint "catalog_product_options_product_id_foreign" foreign key ("product_id") references "catalog_products" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "catalog_product_relations" add constraint "catalog_product_relations_child_product_id_foreign" foreign key ("child_product_id") references "catalog_products" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "catalog_product_relations" add constraint "catalog_product_relations_parent_product_id_foreign" foreign key ("parent_product_id") references "catalog_products" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "catalog_product_tag_assignments" add constraint "catalog_product_tag_assignments_product_id_foreign" foreign key ("product_id") references "catalog_products" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "catalog_product_tag_assignments" add constraint "catalog_product_tag_assignments_tag_id_foreign" foreign key ("tag_id") references "catalog_product_tags" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "catalog_product_variant_option_values" add constraint "catalog_product_variant_option_values_variant_id_foreign" foreign key ("variant_id") references "catalog_product_variants" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "catalog_product_variant_prices" add constraint "catalog_product_variant_prices_offer_id_foreign" foreign key ("offer_id") references "catalog_product_offers" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "catalog_product_variant_prices" add constraint "catalog_product_variant_prices_price_kind_id_foreign" foreign key ("price_kind_id") references "catalog_price_kinds" ("id") on update cascade on delete no action;`);
    this.addSql(`alter table "catalog_product_variant_prices" add constraint "catalog_product_variant_prices_product_id_foreign" foreign key ("product_id") references "catalog_products" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "catalog_product_variant_prices" add constraint "catalog_product_variant_prices_variant_id_foreign" foreign key ("variant_id") references "catalog_product_variants" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "catalog_product_variant_relations" add constraint "catalog_product_variant_relations_child_variant_id_foreign" foreign key ("child_variant_id") references "catalog_product_variants" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "catalog_product_variant_relations" add constraint "catalog_product_variant_relations_parent_variant_id_foreign" foreign key ("parent_variant_id") references "catalog_product_variants" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "catalog_product_variants" add constraint "catalog_product_variants_product_id_foreign" foreign key ("product_id") references "catalog_products" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "catalog_products" add constraint "catalog_products_option_schema_id_foreign" foreign key ("option_schema_id") references "catalog_product_option_schemas" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "contractor_addresses" add constraint "contractor_addresses_contractor_id_foreign" foreign key ("contractor_id") references "contractors" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "contractor_bank_accounts" add constraint "contractor_bank_accounts_contractor_id_foreign" foreign key ("contractor_id") references "contractors" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "contractor_contacts" add constraint "contractor_contacts_contractor_id_foreign" foreign key ("contractor_id") references "contractors" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "contractor_credit_limits" add constraint "contractor_credit_limits_contractor_id_foreign" foreign key ("contractor_id") references "contractors" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "contractor_payment_terms" add constraint "contractor_payment_terms_contractor_id_foreign" foreign key ("contractor_id") references "contractors" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "contractor_sop_comments" add constraint "contractor_sop_comments_contractor_id_foreign" foreign key ("contractor_id") references "contractors" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "customer_activities" add constraint "customer_activities_deal_id_foreign" foreign key ("deal_id") references "customer_deals" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "customer_activities" add constraint "customer_activities_entity_id_foreign" foreign key ("entity_id") references "customer_entities" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "customer_addresses" add constraint "customer_addresses_entity_id_foreign" foreign key ("entity_id") references "customer_entities" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "customer_comments" add constraint "customer_comments_deal_id_foreign" foreign key ("deal_id") references "customer_deals" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "customer_comments" add constraint "customer_comments_entity_id_foreign" foreign key ("entity_id") references "customer_entities" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "customer_companies" add constraint "customer_companies_entity_id_foreign" foreign key ("entity_id") references "customer_entities" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "customer_deal_companies" add constraint "customer_deal_companies_company_entity_id_foreign" foreign key ("company_entity_id") references "customer_entities" ("id") on update cascade on delete no action;`);
    this.addSql(`alter table "customer_deal_companies" add constraint "customer_deal_companies_deal_id_foreign" foreign key ("deal_id") references "customer_deals" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "customer_deal_people" add constraint "customer_deal_people_deal_id_foreign" foreign key ("deal_id") references "customer_deals" ("id") on update cascade on delete no action;`);
    this.addSql(`alter table "customer_deal_people" add constraint "customer_deal_people_person_entity_id_foreign" foreign key ("person_entity_id") references "customer_entities" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "customer_people" add constraint "customer_people_company_entity_id_foreign" foreign key ("company_entity_id") references "customer_entities" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "customer_people" add constraint "customer_people_entity_id_foreign" foreign key ("entity_id") references "customer_entities" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "customer_tag_assignments" add constraint "customer_tag_assignments_entity_id_foreign" foreign key ("entity_id") references "customer_entities" ("id") on update cascade on delete no action;`);
    this.addSql(`alter table "customer_tag_assignments" add constraint "customer_tag_assignments_tag_id_foreign" foreign key ("tag_id") references "customer_tags" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "customer_todo_links" add constraint "customer_todo_links_entity_id_foreign" foreign key ("entity_id") references "customer_entities" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "dictionary_entries" add constraint "dictionary_entries_dictionary_id_foreign" foreign key ("dictionary_id") references "dictionaries" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "feature_toggle_audit_logs" add constraint "feature_toggle_audit_logs_toggle_id_foreign" foreign key ("toggle_id") references "feature_toggles" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "feature_toggle_overrides" add constraint "feature_toggle_overrides_toggle_id_foreign" foreign key ("toggle_id") references "feature_toggles" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "fms_air_units" add constraint "fms_air_units_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "fms_invoice_line_items" add constraint "fms_invoice_line_items_invoice_id_foreign" foreign key ("invoice_id") references "fms_invoices" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "fms_invoice_line_items" add constraint "fms_invoice_line_items_product_id_foreign" foreign key ("product_id") references "fms_products" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "fms_invoice_pages" add constraint "fms_invoice_pages_invoice_id_foreign" foreign key ("invoice_id") references "fms_invoices" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "fms_offer_calculations" add constraint "fms_offer_calculations_offer_id_foreign" foreign key ("offer_id") references "fms_offers" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "fms_offer_lines" add constraint "fms_offer_lines_calculation_id_foreign" foreign key ("calculation_id") references "fms_offer_calculations" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "fms_offers" add constraint "fms_offers_rfq_id_foreign" foreign key ("rfq_id") references "fms_rfqs" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "fms_project_cargo" add constraint "fms_project_cargo_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "fms_project_invoices" add constraint "fms_project_invoices_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "fms_project_legs" add constraint "fms_project_legs_carrier_id_foreign" foreign key ("carrier_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_project_legs" add constraint "fms_project_legs_destination_location_id_foreign" foreign key ("destination_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_project_legs" add constraint "fms_project_legs_origin_location_id_foreign" foreign key ("origin_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_project_legs" add constraint "fms_project_legs_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "fms_project_lines" add constraint "fms_project_lines_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "fms_project_notes" add constraint "fms_project_notes_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "fms_projects" add constraint "fms_projects_carrier_id_foreign" foreign key ("carrier_id") references "fms_carriers" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_client_id_foreign" foreign key ("client_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_consignee_id_foreign" foreign key ("consignee_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_controlling_agent_id_foreign" foreign key ("controlling_agent_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_controlling_customer_id_foreign" foreign key ("controlling_customer_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_creditor_id_foreign" foreign key ("creditor_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_destination_location_id_foreign" foreign key ("destination_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_notify_party_id_foreign" foreign key ("notify_party_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_offer_id_foreign" foreign key ("offer_id") references "fms_offers" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_origin_location_id_foreign" foreign key ("origin_location_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_place_of_discharge_id_foreign" foreign key ("place_of_discharge_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_place_of_loading_id_foreign" foreign key ("place_of_loading_id") references "fms_locations" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_receiving_agent_id_foreign" foreign key ("receiving_agent_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_rfq_id_foreign" foreign key ("rfq_id") references "fms_rfqs" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_sending_agent_id_foreign" foreign key ("sending_agent_id") references "contractors" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "fms_projects" add constraint "fms_projects_shipper_id_foreign" foreign key ("shipper_id") references "contractors" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "fms_road_units" add constraint "fms_road_units_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "fms_sea_containers" add constraint "fms_sea_containers_project_id_foreign" foreign key ("project_id") references "fms_projects" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "organizations" add constraint "organizations_tenant_id_foreign" foreign key ("tenant_id") references "tenants" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "password_resets" add constraint "password_resets_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "resources_resource_activities" add constraint "resources_resource_activities_resource_id_foreign" foreign key ("resource_id") references "resources_resources" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "resources_resource_comments" add constraint "resources_resource_comments_resource_id_foreign" foreign key ("resource_id") references "resources_resources" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "resources_resource_tag_assignments" add constraint "resources_resource_tag_assignments_resource_id_foreign" foreign key ("resource_id") references "resources_resources" ("id") on update cascade on delete no action;`);
    this.addSql(`alter table "resources_resource_tag_assignments" add constraint "resources_resource_tag_assignments_tag_id_foreign" foreign key ("tag_id") references "resources_resource_tags" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "role_acls" add constraint "role_acls_role_id_foreign" foreign key ("role_id") references "roles" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "role_sidebar_preferences" add constraint "role_sidebar_preferences_role_id_foreign" foreign key ("role_id") references "roles" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "rule_execution_logs" add constraint "rule_execution_logs_rule_id_foreign" foreign key ("rule_id") references "business_rules" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "rule_set_members" add constraint "rule_set_members_rule_id_foreign" foreign key ("rule_id") references "business_rules" ("id") on update cascade on delete no action;`);
    this.addSql(`alter table "rule_set_members" add constraint "rule_set_members_rule_set_id_foreign" foreign key ("rule_set_id") references "rule_sets" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "sales_credit_memo_lines" add constraint "sales_credit_memo_lines_credit_memo_id_foreign" foreign key ("credit_memo_id") references "sales_credit_memos" ("id") on update cascade on delete no action;`);
    this.addSql(`alter table "sales_credit_memo_lines" add constraint "sales_credit_memo_lines_order_line_id_foreign" foreign key ("order_line_id") references "sales_order_lines" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "sales_credit_memos" add constraint "sales_credit_memos_invoice_id_foreign" foreign key ("invoice_id") references "sales_invoices" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "sales_credit_memos" add constraint "sales_credit_memos_order_id_foreign" foreign key ("order_id") references "sales_orders" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "sales_document_addresses" add constraint "sales_document_addresses_order_id_foreign" foreign key ("order_id") references "sales_orders" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "sales_document_addresses" add constraint "sales_document_addresses_quote_id_foreign" foreign key ("quote_id") references "sales_quotes" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "sales_document_tag_assignments" add constraint "sales_document_tag_assignments_order_id_foreign" foreign key ("order_id") references "sales_orders" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "sales_document_tag_assignments" add constraint "sales_document_tag_assignments_quote_id_foreign" foreign key ("quote_id") references "sales_quotes" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "sales_document_tag_assignments" add constraint "sales_document_tag_assignments_tag_id_foreign" foreign key ("tag_id") references "sales_document_tags" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "sales_invoice_lines" add constraint "sales_invoice_lines_invoice_id_foreign" foreign key ("invoice_id") references "sales_invoices" ("id") on update cascade on delete no action;`);
    this.addSql(`alter table "sales_invoice_lines" add constraint "sales_invoice_lines_order_line_id_foreign" foreign key ("order_line_id") references "sales_order_lines" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "sales_invoices" add constraint "sales_invoices_order_id_foreign" foreign key ("order_id") references "sales_orders" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "sales_notes" add constraint "sales_notes_order_id_foreign" foreign key ("order_id") references "sales_orders" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "sales_notes" add constraint "sales_notes_quote_id_foreign" foreign key ("quote_id") references "sales_quotes" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "sales_order_adjustments" add constraint "sales_order_adjustments_order_id_foreign" foreign key ("order_id") references "sales_orders" ("id") on update cascade on delete no action;`);
    this.addSql(`alter table "sales_order_adjustments" add constraint "sales_order_adjustments_order_line_id_foreign" foreign key ("order_line_id") references "sales_order_lines" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "sales_order_lines" add constraint "sales_order_lines_order_id_foreign" foreign key ("order_id") references "sales_orders" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "sales_orders" add constraint "sales_orders_channel_ref_id_foreign" foreign key ("channel_ref_id") references "sales_channels" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "sales_orders" add constraint "sales_orders_delivery_window_ref_id_foreign" foreign key ("delivery_window_ref_id") references "sales_delivery_windows" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "sales_orders" add constraint "sales_orders_payment_method_ref_id_foreign" foreign key ("payment_method_ref_id") references "sales_payment_methods" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "sales_orders" add constraint "sales_orders_shipping_method_ref_id_foreign" foreign key ("shipping_method_ref_id") references "sales_shipping_methods" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "sales_payment_allocations" add constraint "sales_payment_allocations_invoice_id_foreign" foreign key ("invoice_id") references "sales_invoices" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "sales_payment_allocations" add constraint "sales_payment_allocations_order_id_foreign" foreign key ("order_id") references "sales_orders" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "sales_payment_allocations" add constraint "sales_payment_allocations_payment_id_foreign" foreign key ("payment_id") references "sales_payments" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "sales_payments" add constraint "sales_payments_order_id_foreign" foreign key ("order_id") references "sales_orders" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "sales_payments" add constraint "sales_payments_payment_method_id_foreign" foreign key ("payment_method_id") references "sales_payment_methods" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "sales_quote_adjustments" add constraint "sales_quote_adjustments_quote_id_foreign" foreign key ("quote_id") references "sales_quotes" ("id") on update cascade on delete no action;`);
    this.addSql(`alter table "sales_quote_adjustments" add constraint "sales_quote_adjustments_quote_line_id_foreign" foreign key ("quote_line_id") references "sales_quote_lines" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "sales_quote_lines" add constraint "sales_quote_lines_quote_id_foreign" foreign key ("quote_id") references "sales_quotes" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "sales_quotes" add constraint "sales_quotes_channel_ref_id_foreign" foreign key ("channel_ref_id") references "sales_channels" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "sales_quotes" add constraint "sales_quotes_delivery_window_ref_id_foreign" foreign key ("delivery_window_ref_id") references "sales_delivery_windows" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "sales_quotes" add constraint "sales_quotes_payment_method_ref_id_foreign" foreign key ("payment_method_ref_id") references "sales_payment_methods" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "sales_quotes" add constraint "sales_quotes_shipping_method_ref_id_foreign" foreign key ("shipping_method_ref_id") references "sales_shipping_methods" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "sales_shipment_items" add constraint "sales_shipment_items_order_line_id_foreign" foreign key ("order_line_id") references "sales_order_lines" ("id") on update cascade on delete no action;`);
    this.addSql(`alter table "sales_shipment_items" add constraint "sales_shipment_items_shipment_id_foreign" foreign key ("shipment_id") references "sales_shipments" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "sales_shipments" add constraint "sales_shipments_order_id_foreign" foreign key ("order_id") references "sales_orders" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "sessions" add constraint "sessions_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "staff_leave_requests" add constraint "staff_leave_requests_member_id_foreign" foreign key ("member_id") references "staff_team_members" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "staff_team_member_activities" add constraint "staff_team_member_activities_member_id_foreign" foreign key ("member_id") references "staff_team_members" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "staff_team_member_addresses" add constraint "staff_team_member_addresses_member_id_foreign" foreign key ("member_id") references "staff_team_members" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "staff_team_member_comments" add constraint "staff_team_member_comments_member_id_foreign" foreign key ("member_id") references "staff_team_members" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "staff_team_member_job_histories" add constraint "staff_team_member_job_histories_member_id_foreign" foreign key ("member_id") references "staff_team_members" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "user_acls" add constraint "user_acls_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "user_roles" add constraint "user_roles_role_id_foreign" foreign key ("role_id") references "roles" ("id") on update cascade on delete no action;`);
    this.addSql(`alter table "user_roles" add constraint "user_roles_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "user_sidebar_preferences" add constraint "user_sidebar_preferences_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete no action;`);
  }

}
