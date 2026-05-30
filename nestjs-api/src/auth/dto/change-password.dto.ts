import { IsOptional, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  newPassword: string;

  @IsString()
  @MinLength(8)
  confirmPassword: string;

  // Required when the user is NOT in a forced-change state
  @IsOptional()
  @IsString()
  currentPassword?: string;
}
