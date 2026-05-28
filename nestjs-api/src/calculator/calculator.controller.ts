import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

const VAT_RATE   = 0.15;
const VAT_FACTOR = 15 / 115;

class CalculateDto {
  @ApiProperty({ example: 50 })
  @Type(() => Number)
  @IsNumber()
  cost: number;

  @ApiProperty({ example: false })
  @IsBoolean()
  @IsOptional()
  costIncludesVat?: boolean;

  @ApiProperty({ example: 8.0, description: 'Commission rate as percentage (e.g. 8 = 8%)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  commissionRate: number;

  @ApiProperty({ example: 0, description: 'Shipping fee excl. VAT' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  shippingFee?: number;

  @ApiProperty({ example: 0, description: 'Storage fee excl. VAT' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  storageFee?: number;

  @ApiProperty({ example: 0, description: 'Ads fee excl. VAT' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  adsFee?: number;

  @ApiProperty({ example: 0, description: 'Other fixed fees excl. VAT' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  otherFees?: number;

  @ApiProperty({ example: 20, description: 'Target margin as percentage (e.g. 20 = 20%)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  targetMargin: number;
}

@ApiTags('calculator')
@ApiBearerAuth()
@Controller('calculator')
export class CalculatorController {
  @Post('calculate')
  @ApiOperation({ summary: 'Pricing calculator — returns suggested selling price' })
  calculate(@Body() dto: CalculateDto) {
    const cost             = dto.cost ?? 0;
    const costIncludesVat  = dto.costIncludesVat ?? false;
    const commissionRate   = (dto.commissionRate ?? 0) / 100;
    const shippingFee      = dto.shippingFee  ?? 0;
    const storageFee       = dto.storageFee   ?? 0;
    const adsFee           = dto.adsFee       ?? 0;
    const otherFees        = dto.otherFees    ?? 0;
    const targetMargin     = (dto.targetMargin ?? 0) / 100;

    if (commissionRate + targetMargin >= 1) {
      throw new BadRequestException(
        'مجموع نسبة العمولة والهامش يجب أن يكون أقل من 100%',
      );
    }

    // Costs — all fixed fees are entered excl. VAT (noon fees structure)
    const costExcl       = costIncludesVat ? cost / 1.15 : cost;
    const fixedFeesExcl  = shippingFee + storageFee + adsFee + otherFees;

    // Solve: selling_excl × (1 - commission_rate - target_margin) = cost_excl + fixed_fees_excl
    const denominator  = 1 - commissionRate - targetMargin;
    const sellingExcl  = (costExcl + fixedFeesExcl) / denominator;
    const sellingIncl  = sellingExcl * 1.15;

    const commissionAmount = Math.round(sellingExcl * commissionRate * 100) / 100;
    const feesTotalExcl    = Math.round((commissionAmount + fixedFeesExcl) * 100) / 100;
    const inputVatNoon     = Math.round(feesTotalExcl * VAT_RATE * 100) / 100;
    const outputVat        = Math.round(sellingIncl * VAT_FACTOR * 100) / 100;
    const netProfit        = Math.round((sellingExcl - costExcl - feesTotalExcl) * 100) / 100;
    const actualMargin     = sellingExcl > 0
      ? Math.round((netProfit / sellingExcl) * 10000) / 100
      : 0;

    return {
      costExclVat:     Math.round(costExcl * 100) / 100,
      fixedFeesExcl:   Math.round(fixedFeesExcl * 100) / 100,
      commissionAmount,
      feesTotalExcl,
      inputVatNoon,
      sellingExclVat:  Math.round(sellingExcl * 100) / 100,
      sellingInclVat:  Math.round(sellingIncl * 100) / 100,
      outputVat,
      netProfit,
      actualMarginPct: actualMargin,
    };
  }
}
