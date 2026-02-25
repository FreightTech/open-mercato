import { Migration } from '@mikro-orm/migrations'

export class Migration20260225120000_add_project_air_routing extends Migration {
  override async up(): Promise<void> {
    // Create frc_project_air_routing table
    this.addSql(`
      CREATE TABLE frc_project_air_routing (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        tenant_id UUID NOT NULL,
        project_id UUID NOT NULL,
        source_air_routing_id UUID NULL,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL DEFAULT 'direct_flight',
        flight_number VARCHAR(50) NULL,
        origin_airport_id UUID NULL,
        destination_airport_id UUID NULL,
        departure_date DATE NULL,
        departure_time VARCHAR(5) NULL,
        arrival_date DATE NULL,
        arrival_time VARCHAR(5) NULL,
        carrier_id UUID NULL,
        carrier_type VARCHAR(50) NULL,
        connection_rate_total NUMERIC(18,4) NULL,
        currency_code VARCHAR(3) NOT NULL DEFAULT 'EUR',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP NULL
      );
    `)

    // Create indexes
    this.addSql(
      `CREATE INDEX frc_project_air_routing_org_tenant_idx ON frc_project_air_routing (organization_id, tenant_id);`
    )
    this.addSql(`CREATE INDEX frc_project_air_routing_project_idx ON frc_project_air_routing (project_id);`)

    // Rename airRoutingId to projectAirRoutingId in frc_consoles
    this.addSql(`ALTER TABLE frc_consoles RENAME COLUMN air_routing_id TO project_air_routing_id;`)
  }

  override async down(): Promise<void> {
    // Rename back
    this.addSql(`ALTER TABLE frc_consoles RENAME COLUMN project_air_routing_id TO air_routing_id;`)

    // Drop table
    this.addSql(`DROP TABLE IF EXISTS frc_project_air_routing;`)
  }
}
