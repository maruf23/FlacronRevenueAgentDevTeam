import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SuppressionReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSuppressionDto } from './dto/create-suppression.dto';

@Injectable()
export class SuppressionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);
    return this.prisma.suppressionEntry.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async create(workspaceId: string, dto: CreateSuppressionDto) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.suppressionEntry.findUnique({
      where: { workspaceId_email: { workspaceId, email } },
    });
    if (existing) {
      throw new ConflictException(`${email} is already suppressed`);
    }
    return this.prisma.suppressionEntry.create({
      data: {
        workspaceId,
        email,
        reason: dto.reason ?? SuppressionReason.MANUAL,
        source: dto.source?.trim() || 'manual',
      },
    });
  }

  async remove(workspaceId: string, id: string) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const entry = await this.prisma.suppressionEntry.findFirst({
      where: { id, workspaceId },
    });
    if (!entry) throw new NotFoundException(`Suppression ${id} not found`);
    await this.prisma.suppressionEntry.delete({ where: { id } });
    return { ok: true };
  }
}
