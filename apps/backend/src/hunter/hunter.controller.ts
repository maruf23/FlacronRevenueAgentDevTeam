import { Body, Controller, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { HunterService } from './hunter.service';
import {
  HunterConfirmImportDto,
  HunterDomainSearchDto,
  HunterEmailFinderDto,
  HunterEmailVerifierDto,
  HunterEnrichDto,
} from './dto/hunter.dto';

@Controller('hunter')
@Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
export class HunterController {
  constructor(private readonly hunter: HunterService) {}

  /** Proxy to Hunter Discover — body is forwarded as company search filters. */
  @Post('discover')
  discover(@Body() body: Record<string, unknown>) {
    return this.hunter.discover(body ?? {});
  }

  @Post('domain-search')
  domainSearch(@Body() dto: HunterDomainSearchDto) {
    return this.hunter.domainSearch(dto);
  }

  @Post('email-finder')
  emailFinder(@Body() dto: HunterEmailFinderDto) {
    return this.hunter.emailFinder(dto);
  }

  @Post('email-verifier')
  emailVerifier(@Body() dto: HunterEmailVerifierDto) {
    return this.hunter.emailVerifier(dto);
  }

  @Post('enrich')
  enrich(@Body() dto: HunterEnrichDto) {
    return this.hunter.enrich(dto);
  }

  @Post('confirm-import')
  confirmImport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: HunterConfirmImportDto,
  ) {
    return this.hunter.confirmImport(user.workspaceId, dto);
  }
}
