import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminLoginDto } from '../src/modules/auth/dto/admin-login.dto';
import { ValidationPipe } from '@nestjs/common';

describe('admin login validation', () => {
  it('rejects an invalid email format', async () => {
    const errors = await validate(
      plainToInstance(AdminLoginDto, { email: 'not-an-email', password: 'V3ry-Str0ng-Phrase!' }),
    );
    expect(errors.some(({ property }) => property === 'email')).toBe(true);
  });

  it('rejects unknown request properties', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    await expect(
      pipe.transform(
        { email: 'admin@example.com', password: 'V3ry-Str0ng-Phrase!', isAdmin: true },
        { type: 'body', metatype: AdminLoginDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('does not trim submitted passwords', () => {
    const dto = plainToInstance(AdminLoginDto, {
      email: ' ADMIN@example.com ',
      password: ' V3ry-Str0ng-Phrase! ',
    });
    expect(dto.email).toBe('admin@example.com');
    expect(dto.password).toBe(' V3ry-Str0ng-Phrase! ');
  });
});
