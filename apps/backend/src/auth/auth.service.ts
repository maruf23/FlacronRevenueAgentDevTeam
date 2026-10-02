import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AccessTokenPayload } from './types/jwt-payload.type';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const { user, workspace } = await this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: { name: dto.workspaceName.trim() },
      });

      // Activate RLS for the remainder of this transaction
      await tx.$executeRaw`
        SELECT set_config('app.current_workspace_id', ${workspace.id}, true)
      `;

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: dto.firstName?.trim(),
          lastName: dto.lastName?.trim(),
          role: Role.OWNER,
          workspaceId: workspace.id,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          workspaceId: true,
          createdAt: true,
        },
      });

      return { user, workspace };
    });

    const access_token = await this.signToken({
      sub: user.id,
      workspaceId: user.workspaceId,
      role: user.role,
      email: user.email,
    });

    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        workspaceId: user.workspaceId,
        workspaceName: workspace.name,
        createdAt: user.createdAt,
      },
    };
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        workspaceId: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const access_token = await this.signToken({
      sub: user.id,
      workspaceId: user.workspaceId,
      role: user.role,
      email: user.email,
    });

    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        workspaceId: user.workspaceId,
      },
    };
  }

  private signToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload);
  }
}
