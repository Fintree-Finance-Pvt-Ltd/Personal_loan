import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeEmail } from '../../../common/utils/security.utils';

export class AdminLoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(/[A-Z]/, { message: 'password must contain an uppercase letter' })
  @Matches(/[a-z]/, { message: 'password must contain a lowercase letter' })
  @Matches(/\d/, { message: 'password must contain a number' })
  @Matches(/[^A-Za-z0-9]/, { message: 'password must contain a special character' })
  password!: string;
}
