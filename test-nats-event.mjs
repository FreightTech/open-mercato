// Test script to publish a NATS event with tenant prefix
import { connect, StringCodec } from 'nats.ws';

async function publishTestEvent() {
  console.log('Connecting to NATS...');
  const nc = await connect({ servers: 'ws://localhost:4222' });
  const sc = StringCodec();

  const tenantId = 'test-tenant-123';
  const payload = {
    id: 'test-location-id',
    tenantId: tenantId,
    organizationId: 'test-org-456',
    name: 'Test Location',
    code: 'TESTLOC',
  };

  // Publish with tenant prefix (mimicking how the app publishes events)
  const subject = `${tenantId}.fms_locations.fms_location.test`;
  
  console.log(`Publishing to: ${subject}`);
  console.log('Payload:', JSON.stringify(payload, null, 2));
  
  nc.publish(subject, sc.encode(JSON.stringify(payload)));
  
  await nc.flush();
  await nc.close();
  
  console.log('\n✅ Event published successfully!');
  console.log('\nNow check the dev server console for:');
  console.log('[fms_locations:location-logger] log output');
}

publishTestEvent().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
