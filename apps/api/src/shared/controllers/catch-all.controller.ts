import { Controller, All, NotFoundException } from '@nestjs/common';

@Controller()
export class CatchAllController {
  @All('*')
  handleCatchAll() {
    throw new NotFoundException('Cannot find resource');
  }
}
