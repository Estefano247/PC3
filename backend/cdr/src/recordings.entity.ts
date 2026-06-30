import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('recordings')
export class Recordings {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 255, nullable: false })
  filename: string;

  @Column({ length: 32, nullable: false })
  uniqueid: string;

  @Column({ length: 10, default: '' })
  caller: string;

  @Column({ length: 10, default: '' })
  callee: string;

  @Column({ default: 0 })
  duration: number;

  @Column({ type: 'bigint', default: 0 })
  filesize: number;

  @Column({ length: 512, nullable: false })
  minio_url: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
