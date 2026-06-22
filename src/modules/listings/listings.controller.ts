import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { AdminListingsQueryDto } from './dto/admin-listings-query.dto';
import { ListingScoreQueryDto } from './dto/listing-score-query.dto';
import { ListingsService } from './listings.service';

@Controller('admin/listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get('scores')
  async getListingScores(@Query() query: ListingScoreQueryDto) {
    return this.listingsService.getListingScores(query);
  }

  @Get()
  async getAllListings(@Query() query: AdminListingsQueryDto) {
    return this.listingsService.findAllAdmin(query);
  }

  @Get(':id')
  async getListing(@Param('id') id: string) {
    return this.listingsService.findOneAdmin(id);
  }

  @Post()
  async createListing(@Body() body: unknown) {
    return this.listingsService.createAdmin(body);
  }

  @Patch(':id')
  async updateListing(@Param('id') id: string, @Body() body: unknown) {
    return this.listingsService.updateAdmin(id, body);
  }

  @Delete(':id')
  async deleteListing(@Param('id') id: string) {
    return this.listingsService.deleteAdmin(id);
  }
}
