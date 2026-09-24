const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { CustomerService } = require('./dist/modules/customer/customer.service');
const { UnaportService } = require('./dist/modules/integrations/unaport/unaport.service');

async function test() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const customerService = app.get(CustomerService);
  const unaportService = app.get(UnaportService);

  const me = await customerService.getMe(53n);
  console.log('Customer 53 LAN:', me.latestLan || me.lan);
  console.log('nextPermittedStep:', me.journey?.nextPermittedStep);
  console.log('aaCompleted:', me.journey?.aaCompleted);
  console.log('aaStatus:', me.journey?.aaStatus);

  const lan = me.latestLan || me.lan || 'FTPL00000044';
  const aaStatus = await unaportService.getAccountAggregatorStatus(53n, lan);
  console.log('Account Aggregator Status API response:', aaStatus);

  await app.close();
}

test().catch(console.error);
