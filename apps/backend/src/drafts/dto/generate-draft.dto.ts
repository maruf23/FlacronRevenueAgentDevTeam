import { IsOptional, IsUUID } from 'class-validator';

export class GenerateDraftDto {
  @IsUUID()
  leadId!: string;

  /** Optional — defaults to the workspace's most recent product */
  @IsOptional()
  @IsUUID()
  productId?: string;
}
