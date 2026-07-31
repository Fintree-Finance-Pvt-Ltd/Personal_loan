import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { CustomerJwtStrategy } from './strategies/customer-jwt.strategy';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [PassportModule, JwtModule.register({}), SessionsModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, CustomerJwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
