import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import type { RefreshPayload } from './strategies/jwt-refresh.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create organization + first admin user' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with username/password' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    return this.auth.login(dto, ip);
  }

  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@CurrentUser() user: RefreshPayload) {
    return this.auth.refresh(user.sub, user.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke refresh token and logout' })
  logout(@CurrentUser() user: JwtPayload, @Body('refreshToken') rawToken?: string) {
    return this.auth.logout(user.sub, rawToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password — forced or voluntary. Returns fresh tokens.' })
  changePassword(@CurrentUser() user: JwtPayload, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.sub, dto);
  }
}
