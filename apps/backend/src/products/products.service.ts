import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);
    return this.prisma.product.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(workspaceId: string, id: string) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const product = await this.prisma.product.findFirst({
      where: { id, workspaceId },
    });
    if (!product) throw new NotFoundException(`Product ${id} not found`);
    return product;
  }

  async create(workspaceId: string, dto: CreateProductDto) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Product name is required');

    return this.prisma.product.create({
      data: {
        workspaceId,
        name,
        description: dto.description?.trim() || null,
        valueProps: dto.valueProps ?? [],
        audienceHints: dto.audienceHints ?? [],
        pricingNotes: dto.pricingNotes?.trim() || null,
        qualificationRules: (dto.qualificationRules ??
          undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async update(workspaceId: string, id: string, dto: UpdateProductDto) {
    await this.findOne(workspaceId, id);
    const data: Prisma.ProductUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }
    if (dto.valueProps !== undefined) data.valueProps = dto.valueProps;
    if (dto.audienceHints !== undefined) data.audienceHints = dto.audienceHints;
    if (dto.pricingNotes !== undefined) {
      data.pricingNotes = dto.pricingNotes?.trim() || null;
    }
    if (dto.qualificationRules !== undefined) {
      data.qualificationRules =
        dto.qualificationRules as Prisma.InputJsonValue;
    }
    return this.prisma.product.update({ where: { id }, data });
  }

  async remove(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    await this.prisma.product.delete({ where: { id } });
    return { ok: true };
  }
}
