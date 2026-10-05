import { Global, Module, OnApplicationShutdown } from '@nestjs/common';
import { DRIZZLE_DB, drizzleProvider, closeDatabaseConnection } from './drizzle.provider';

@Global()
@Module({
  providers: [drizzleProvider],
  exports: [DRIZZLE_DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  async onApplicationShutdown(signal?: string) {
    await closeDatabaseConnection();
  }
}
