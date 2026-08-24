import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkIvrLogs() {
  try {
    const rows: any = await prisma.$queryRaw`
      SELECT 
        id, 
        customer_id as customerId, 
        application_id as applicationId, 
        lan, 
        customer_mobile as customerMobile, 
        provider_call_id as providerCallId,
        agent_id as agentId, 
        call_type as callType, 
        trigger_source as triggerSource,
        status, 
        duration, 
        start_time as startTime, 
        end_time as endTime, 
        call_summary as callSummary, 
        transcript, 
        recording_link as recordingLink, 
        created_at as createdAt, 
        updated_at as updatedAt
      FROM ivr_call_logs
      ORDER BY id DESC
      LIMIT 10;
    `;

    console.log(`Found ${rows.length} records in ivr_call_logs:`);
    console.log(JSON.stringify(rows, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
  } catch (error) {
    console.error('Error querying ivr_call_logs:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkIvrLogs();
