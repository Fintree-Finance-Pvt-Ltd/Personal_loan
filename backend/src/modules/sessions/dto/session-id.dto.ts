import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SessionIdDto {
  @IsString()
  @MinLength(20)
  @MaxLength(40)
  @Matches(/^[a-z0-9]+$/)
  sessionId!: string;
}
