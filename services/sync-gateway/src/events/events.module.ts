import { Global, Module } from "@nestjs/common";
import { EventAppender } from "./event-appender.service";

@Global()
@Module({
  providers: [EventAppender],
  exports: [EventAppender],
})
export class EventsModule {}
