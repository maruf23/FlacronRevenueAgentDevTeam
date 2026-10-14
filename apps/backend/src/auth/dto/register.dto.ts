import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;

  @IsString()
  @MinLength(8, {
    message: 'Password must be at least 8 characters.',
  })
  password!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  @IsString()
  @IsNotEmpty({ message: 'Workspace name is required.' })
  @MinLength(2, {
    message: 'Workspace name must be at least 2 characters.',
  })
  workspaceName!: string;
}
