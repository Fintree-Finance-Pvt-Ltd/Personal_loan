import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class VerifyPanDto {
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim().toUpperCase()
      : value,
  )
  @IsString({
    message: 'PAN number must be a string.',
  })
  @IsNotEmpty({
    message: 'PAN number is required.',
  })
  @Length(10, 10, {
    message: 'PAN number must contain exactly 10 characters.',
  })
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/, {
    message: 'Enter a valid PAN number.',
  })
  panNumber: string;
}