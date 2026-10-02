import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class AssignCampaignLeadsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  leadIds!: string[];
}
