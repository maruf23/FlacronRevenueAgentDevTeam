import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserStatusDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  accountStatus?: 'ACTIVE' | 'SUSPENDED';

  @IsOptional()
  @IsIn(['PURCHASED', 'NOT_PURCHASED'])
  planStatus?: 'PURCHASED' | 'NOT_PURCHASED';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  planName?: string;
}
