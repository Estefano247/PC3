import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('cdr')
export class Cdr {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  calldate: Date;

  @Column({ length: 80, default: '' })
  clid: string;

  @Column({ length: 80, default: '' })
  src: string;

  @Column({ length: 80, default: '' })
  dst: string;

  @Column({ length: 80, default: '' })
  dcontext: string;

  @Column({ length: 80, default: '' })
  channel: string;

  @Column({ length: 80, default: '' })
  dstchannel: string;

  @Column({ length: 80, default: '' })
  lastapp: string;

  @Column({ length: 80, default: '' })
  lastdata: string;

  @Column({ default: 0 })
  duration: number;

  @Column({ default: 0 })
  billsec: number;

  @Column({ length: 45, default: '' })
  disposition: string;

  @Column({ default: 0 })
  amaflags: number;

  @Column({ length: 20, default: '' })
  accountcode: string;

  @Column({ length: 32, default: '' })
  uniqueid: string;

  @Column({ length: 255, default: '' })
  userfield: string;

  @Column({ length: 512, default: '', name: 'recording_url' })
  recordingUrl: string;
}
