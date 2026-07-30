import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { backendEnvPath, validateEnvironment } from './config/environment';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { LoggingModule } from './infrastructure/logging/logging.module';
import { AuthModule } from './modules/auth/auth.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { SecurityEventsModule } from './modules/security-events/security-events.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { AdminDashboardModule } from './modules/admin-dashboard/admin-dashboard.module';
import { ExternalApiModule } from './modules/external-api/external-api.module';
import { LoanModule } from './modules/loan/loan.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LendersModule } from './modules/lenders/lenders.module';
import { ProductsModule } from './modules/products/products.module';
import { PlatformPoliciesModule } from './modules/platform-policies/platform-policies.module';

import { OtpModule } from './modules/otp/otp.module';
import { CustomerModule } from './modules/customer/customer.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { MlmModule } from './modules/mlm/mlm.module';
import { PlatformProductsModule } from './modules/platform-products/platform-products.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { ElectronicSignModule } from './modules/electronic-sign/electronic-sign.module';
import { LoanAgreementModule } from './modules/loan-agreement/loan-agreement.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: backendEnvPath(),
      validate: validateEnvironment,
      cache: true,
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    PrismaModule,
    LoggingModule,
    AuditLogsModule,
    SecurityEventsModule,
    SessionsModule,
    AuthModule,
    HealthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    LendersModule,
    ProductsModule,
    PlatformPoliciesModule,
    AdminDashboardModule,
    ExternalApiModule,
    LoanModule,
    OtpModule,
    CustomerModule,
    DocumentsModule,
    MlmModule,
    PlatformProductsModule,
    WebhooksModule,
    ElectronicSignModule,
    LoanAgreementModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
