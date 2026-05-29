import { Global, Module } from '@nestjs/common';
import { RefSeqService } from './services/ref-seq.service';

@Global()
@Module({
  providers: [RefSeqService],
  exports:   [RefSeqService],
})
export class RefSeqModule {}
