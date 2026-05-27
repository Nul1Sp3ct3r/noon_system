import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private orgs: OrganizationsService) {}

  @Get('me')
  @ApiOperation({ summary: "Get current user's organization" })
  getMyOrg(@CurrentUser() user: JwtPayload) {
    return this.orgs.findOne(user.orgId);
  }
}
