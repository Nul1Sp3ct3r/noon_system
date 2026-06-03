import { Controller, Get, Patch, Body } from '@nestjs/common';
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

  @Get('settings')
  @ApiOperation({ summary: 'Get organization VAT & profit settings' })
  getSettings(@CurrentUser() user: JwtPayload) {
    return this.orgs.getSettings(user.orgId);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update organization VAT & profit settings' })
  updateSettings(
    @CurrentUser() user: JwtPayload,
    @Body() body: { vatRegistered?: boolean; vatNumber?: string | null; profitMode?: string },
  ) {
    return this.orgs.updateSettings(user.orgId, body);
  }
}
